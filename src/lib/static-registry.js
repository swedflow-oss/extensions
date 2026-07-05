import fs from "node:fs/promises";
import path from "node:path";
import semver from "semver";

/**
 * @param {string} publicDir
 */
export async function generateStaticRegistry(publicDir = "public") {
  const apiDir = path.join(publicDir, "api");
  const extensionsDir = path.join(apiDir, "extensions");
  await fs.mkdir(extensionsDir, { recursive: true });

  const metadataByExtensionId = await readPackagedMetadata(extensionsDir);
  const latestExtensions = [];

  for (const [extensionId, versions] of metadataByExtensionId) {
    versions.sort(compareMetadataVersionsDescending);
    const latest = versions[0];
    if (!latest) {
      continue;
    }

    latestExtensions.push(latest.metadata);
    await writeJson(path.join(extensionsDir, `${extensionId}.json`), {
      data: versions.map((version) => version.metadata),
    });
    await refreshLatestArchive(extensionsDir, extensionId, latest.version);
  }

  latestExtensions.sort((left, right) => left.id.localeCompare(right.id));
  await writeJson(path.join(apiDir, "extensions.json"), {
    data: latestExtensions,
  });
  await writeJson(path.join(extensionsDir, "updates.json"), {
    data: latestExtensions,
  });
}

/**
 * @param {string} extensionsDir
 * @returns {Promise<Map<string, Array<{ version: string, metadata: any }>>>}
 */
async function readPackagedMetadata(extensionsDir) {
  /** @type {Map<string, Array<{ version: string, metadata: any }>>} */
  const metadataByExtensionId = new Map();

  for (const extensionId of await readDirectoryNames(extensionsDir)) {
    const extensionDir = path.join(extensionsDir, extensionId);
    for (const version of await readDirectoryNames(extensionDir)) {
      if (version === "latest") {
        continue;
      }

      const versionDir = path.join(extensionDir, version);
      const metadataPath = path.join(versionDir, "metadata.json");
      if (!(await fileExists(metadataPath))) {
        continue;
      }

      const metadata = JSON.parse(await fs.readFile(metadataPath, "utf-8"));
      const metadataVersions = metadataByExtensionId.get(extensionId) ?? [];
      metadataVersions.push({ version, metadata });
      metadataByExtensionId.set(extensionId, metadataVersions);
    }
  }

  return metadataByExtensionId;
}

/**
 * @param {string} extensionsDir
 * @param {string} extensionId
 * @param {string} version
 */
async function refreshLatestArchive(extensionsDir, extensionId, version) {
  const versionDir = path.join(extensionsDir, extensionId, version);
  const latestDir = path.join(extensionsDir, extensionId, "latest");
  await fs.rm(latestDir, { recursive: true, force: true });
  await fs.mkdir(latestDir, { recursive: true });

  await Promise.all(
    ["archive.tar.gz", "manifest.json", "metadata.json"].map((filename) =>
      fs.copyFile(
        path.join(versionDir, filename),
        path.join(latestDir, filename),
      ),
    ),
  );
}

/**
 * @param {{ version: string }} left
 * @param {{ version: string }} right
 */
function compareMetadataVersionsDescending(left, right) {
  if (semver.valid(left.version) && semver.valid(right.version)) {
    return semver.rcompare(left.version, right.version);
  }

  return right.version.localeCompare(left.version);
}

/**
 * @param {string} directory
 * @returns {Promise<string[]>}
 */
async function readDirectoryNames(directory) {
  try {
    const entries = await fs.readdir(directory, { withFileTypes: true });
    return entries
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort();
  } catch (err) {
    if (
      err &&
      typeof err === "object" &&
      "code" in err &&
      err.code === "ENOENT"
    ) {
      return [];
    }

    throw err;
  }
}

/**
 * @param {string} filePath
 */
async function fileExists(filePath) {
  try {
    const stat = await fs.stat(filePath);
    return stat.isFile();
  } catch (err) {
    if (
      err &&
      typeof err === "object" &&
      "code" in err &&
      err.code === "ENOENT"
    ) {
      return false;
    }

    throw err;
  }
}

/**
 * @param {string} filePath
 * @param {any} data
 */
async function writeJson(filePath, data) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, `${JSON.stringify(data, null, 2)}\n`);
}
