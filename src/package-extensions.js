import toml from "@iarna/toml";
import assert from "node:assert";
import fs from "node:fs/promises";
import path from "node:path";
import { sortExtensionsToml } from "./lib/extensions-toml.js";
import {
  fileExists,
  readTomlFile,
  retrieveLicenseCandidates,
} from "./lib/fs.js";
import {
  checkoutGitSubmodule,
  readGitmodules,
  sortGitmodules,
} from "./lib/git.js";
import { exec } from "./lib/process.js";
import { generateStaticRegistry } from "./lib/static-registry.js";
import {
  assertVersionNotDecreased,
  validateExtensionIdsNotChanged,
  validateExtensionsToml,
  validateGitmodules,
  validateGitmodulesLocations,
  validateLicense,
  validateManifest,
} from "./lib/validation.js";

const { ETERM_EXTENSION_CLI_SHA, PACKAGE_ALL, PUBLISH_DIR, REF_NAME } =
  process.env;

const USAGE = `
package-extensions [extensionId]

Package Eterm extensions and publish them into the static registry tree.

* If an extension ID is provided, only package that extension.
* Otherwise, if PACKAGE_ALL is set to true, package all extensions.
* Otherwise, package any extensions that have been added or updated on this
  branch.

ENVIRONMENT VARIABLES
  PACKAGE_ALL       Whether to package every extension. Defaults to false.
  PUBLISH_DIR       Static Pages directory to update. Defaults to "public".
  REF_NAME          Name of the branch or tag being built.
`;

let selectedExtensionId;
for (const arg of process.argv.slice(2)) {
  if (arg === "-h" || arg === "--help") {
    console.log(USAGE);
    process.exit(0);
  }

  if (arg.startsWith("-")) {
    console.log("no such flag:", arg);
    process.exit(1);
  }

  selectedExtensionId = arg;
}

const packageAll = PACKAGE_ALL === "true";
const publishDir = PUBLISH_DIR || "public";
const extensionsToml = await readTomlFile("extensions.toml");

await fs.mkdir("build", { recursive: true });
try {
  const gitModules = await readGitmodules(".gitmodules");

  validateExtensionsToml(extensionsToml);
  validateGitmodules(gitModules);
  validateGitmodulesLocations(extensionsToml, gitModules);

  await sortExtensionsToml("extensions.toml");
  await sortGitmodules(".gitmodules");

  const extensionIds = selectedExtensionId
    ? [selectedExtensionId]
    : packageAll
      ? Object.keys(extensionsToml)
      : await changedExtensionIds(extensionsToml, REF_NAME !== "main");

  if (extensionIds.length === 0) {
    console.log("No extensions need packaging.");
  }

  for (const extensionId of extensionIds) {
    const extensionInfo = extensionsToml[extensionId];
    if (!extensionInfo) {
      throw new Error(`No extension found with ID "${extensionId}".`);
    }

    console.log(
      `Packaging '${extensionId}'. Version: ${extensionInfo.version}`,
    );

    const submodulePath = extensionInfo.submodule;
    assert(
      typeof submodulePath === "string",
      "`submodule` must exist and be a string.",
    );

    await checkoutGitSubmodule(submodulePath);

    const extensionPath = extensionInfo.path
      ? path.join(submodulePath, extensionInfo.path)
      : submodulePath;

    await packageExtension(
      extensionId,
      extensionPath,
      extensionInfo.version,
      publishDir,
    );
  }
} finally {
  await fs.rm("build", { recursive: true, force: true });
}

await generateStaticRegistry(publishDir);

/**
 * @param {string} extensionId
 * @param {string} extensionPath
 * @param {string} extensionVersion
 * @param {string} publishDir
 */
async function packageExtension(
  extensionId,
  extensionPath,
  extensionVersion,
  publishDir,
) {
  const outputDir = path.join("build", "output", extensionId);
  const scratchDir = path.join("build", "scratch");
  await fs.rm(outputDir, { recursive: true, force: true });
  await fs.mkdir(outputDir, { recursive: true });
  await fs.mkdir(scratchDir, { recursive: true });

  if (await fileExists(path.join(extensionPath, "extension.json"))) {
    throw new Error(
      "The `extension.json` manifest format has been superseded by `extension.toml`",
    );
  }

  const pathToExtensionToml = path.join(extensionPath, "extension.toml");
  if (await fileExists(pathToExtensionToml)) {
    const extensionToml = await readTomlFile(pathToExtensionToml);

    if (extensionToml.id !== extensionId) {
      throw new Error(
        [
          "IDs in `extensions.toml` and `extension.toml` do not match:",
          "",
          `extensions.toml: ${extensionId}`,
          ` extension.toml: ${extensionToml.id}`,
        ].join("\n"),
      );
    }
  }

  const licenseCandidates = await retrieveLicenseCandidates(extensionPath);
  validateLicense(licenseCandidates);

  await ensureExtensionCli();

  const extensionCliOutput = await exec(
    "./eterm-extension",
    [
      "--scratch-dir",
      scratchDir,
      "--source-dir",
      extensionPath,
      "--output-dir",
      outputDir,
    ],
    {
      env: {
        PATH: process.env["PATH"],
        RUST_LOG: "info",
        RUSTUP_TOOLCHAIN: process.env["RUSTUP_TOOLCHAIN"],
      },
    },
  );
  console.log(extensionCliOutput.stdout);

  const warnings = extensionCliOutput.stderr
    .split("\n")
    .filter((line) => line.includes("WARN"));
  for (const warning of warnings) {
    console.log(warning);
  }

  const manifestJson = await fs.readFile(
    path.join(outputDir, "manifest.json"),
    "utf-8",
  );
  const manifest = JSON.parse(manifestJson);

  if (manifest.version !== extensionVersion) {
    throw new Error(
      [
        `Incorrect version for extension ${extensionId} (${manifest.name})`,
        "",
        `Expected version: ${extensionVersion}`,
        `Actual version: ${manifest.version}`,
      ].join("\n"),
    );
  }

  validateManifest(manifest);

  const packageDir = path.join(
    publishDir,
    "api",
    "extensions",
    extensionId,
    extensionVersion,
  );
  await fs.rm(packageDir, { recursive: true, force: true });
  await fs.mkdir(packageDir, { recursive: true });
  await fs.copyFile(
    path.join(outputDir, "archive.tar.gz"),
    path.join(packageDir, "archive.tar.gz"),
  );
  await fs.writeFile(path.join(packageDir, "manifest.json"), manifestJson);
  await fs.writeFile(
    path.join(packageDir, "metadata.json"),
    `${JSON.stringify(
      {
        id: extensionId,
        ...manifest,
        published_at: new Date().toISOString(),
        download_count: 0,
      },
      null,
      2,
    )}\n`,
  );
}

async function ensureExtensionCli() {
  if (await fileExists("eterm-extension")) {
    return;
  }

  if (!ETERM_EXTENSION_CLI_SHA) {
    throw new Error(
      "ETERM_EXTENSION_CLI_SHA must be set to download eterm-extension.",
    );
  }

  const { stdout: targetTriple } = await exec("rustc", ["-vV"]);
  const host = targetTriple
    .split("\n")
    .find((line) => line.startsWith("host: "))
    ?.replace("host: ", "")
    .trim();

  if (!host) {
    throw new Error("Could not determine Rust host target triple.");
  }

  await exec("curl", [
    "-fsSL",
    "-o",
    "eterm-extension",
    `https://github.com/swedflow-oss/eterm/releases/download/extension-cli/${ETERM_EXTENSION_CLI_SHA}-${host}-eterm-extension`,
  ]);
  await fs.chmod("eterm-extension", 0o755);
}

/**
 * @param {Record<string, any>} extensionsToml
 * @param {boolean} useMergeBase
 */
async function changedExtensionIds(extensionsToml, useMergeBase) {
  let compareTarget;
  if (useMergeBase) {
    const { stdout: forkPoint } = await exec("git", [
      "merge-base",
      "HEAD",
      "origin/main",
    ]);
    compareTarget = forkPoint.trim();
  } else {
    compareTarget = "origin/main";
  }

  const { stdout: extensionsContents } = await exec("git", [
    "show",
    `${compareTarget}:extensions.toml`,
  ]);
  /** @type {any} */
  const mainExtensionsToml = toml.parse(extensionsContents);

  validateExtensionIdsNotChanged(extensionsToml, mainExtensionsToml);

  const result = [];
  for (const [extensionId, extensionInfo] of Object.entries(extensionsToml)) {
    const previousVersion = mainExtensionsToml[extensionId]?.version;
    const currentVersion = extensionInfo.version;

    if (previousVersion === currentVersion) {
      continue;
    }

    if (previousVersion && currentVersion) {
      assertVersionNotDecreased(extensionId, currentVersion, previousVersion);
    }

    result.push(extensionId);
  }

  console.log(
    "Extensions changed from main:",
    result.length !== 0 ? result.join(", ") : "No changed extensions detected.",
  );
  return result;
}
