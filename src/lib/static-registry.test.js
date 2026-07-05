import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { generateStaticRegistry } from "./static-registry.js";

/** @type {string} */
let tempDir;

beforeEach(async () => {
  tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "eterm-registry-"));
});

afterEach(async () => {
  await fs.rm(tempDir, { recursive: true, force: true });
});

describe("generateStaticRegistry", () => {
  it("writes latest, update, version, and archive endpoints", async () => {
    const versionDir = path.join(tempDir, "api", "extensions", "rust", "1.2.3");
    await fs.mkdir(versionDir, { recursive: true });
    await fs.writeFile(
      path.join(versionDir, "metadata.json"),
      JSON.stringify({
        id: "rust",
        name: "Rust",
        version: "1.2.3",
        description: "Rust language support",
        authors: ["Eterm"],
        repository: "https://github.com/swedflow-oss/extensions",
        schema_version: 1,
        wasm_api_version: null,
        provides: ["languages"],
        published_at: "2026-07-05T00:00:00Z",
        download_count: 0,
      }),
    );
    await fs.writeFile(path.join(versionDir, "manifest.json"), "{}");
    await fs.writeFile(path.join(versionDir, "archive.tar.gz"), "archive");

    await generateStaticRegistry(tempDir);

    await expect(readJson("api/extensions.json")).resolves.toMatchObject({
      data: [{ id: "rust", version: "1.2.3" }],
    });
    await expect(
      readJson("api/extensions/updates.json"),
    ).resolves.toMatchObject({
      data: [{ id: "rust", version: "1.2.3" }],
    });
    await expect(readJson("api/extensions/rust.json")).resolves.toMatchObject({
      data: [{ id: "rust", version: "1.2.3" }],
    });
    await expect(
      fs.readFile(
        path.join(
          tempDir,
          "api",
          "extensions",
          "rust",
          "latest",
          "archive.tar.gz",
        ),
        "utf-8",
      ),
    ).resolves.toBe("archive");
  });
});

/**
 * @param {string} relativePath
 */
function readJson(relativePath) {
  return fs
    .readFile(path.join(tempDir, relativePath), "utf-8")
    .then((contents) => JSON.parse(contents));
}
