import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

import { afterEach, describe, expect, it } from "vitest";

import { readPackageVersion } from "../src/config/package.js";

describe("package metadata", () => {
  let tempDir: string | undefined;

  afterEach(() => {
    if (tempDir) {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("reads the package version from package.json", () => {
    tempDir = mkdtempSync(join(tmpdir(), "zepo-package-version-"));
    const packagePath = join(tempDir, "package.json");
    writeFileSync(packagePath, JSON.stringify({ version: "9.8.7" }));

    expect(readPackageVersion(pathToFileURL(packagePath))).toBe("9.8.7");
  });

  it("rejects missing package version metadata", () => {
    tempDir = mkdtempSync(join(tmpdir(), "zepo-package-version-"));
    const packagePath = join(tempDir, "package.json");
    writeFileSync(packagePath, JSON.stringify({ name: "zepocli" }));

    expect(() => readPackageVersion(pathToFileURL(packagePath))).toThrow("package.json must define a non-empty version.");
  });
});
