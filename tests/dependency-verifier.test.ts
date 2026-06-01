import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { describe, expect, it } from "vitest";

const rootDir = resolve(import.meta.dirname, "..");
const scriptPath = resolve(rootDir, "scripts", "verify-dependencies.mjs");
const DEPENDENCY_VERIFIER_TEST_TIMEOUT_MS = 30_000;

describe("dependency verifier", () => {
  it(
    "passes when the workspace dependencies are usable",
    () => {
      const result = spawnSync(process.execPath, [scriptPath], {
        cwd: rootDir,
        encoding: "utf8",
        timeout: DEPENDENCY_VERIFIER_TEST_TIMEOUT_MS
      });

      expect(result.status).toBe(0);
      expect(result.stdout).toContain("Dependency readiness check passed.");
      expect(result.stderr).toBe("");
    },
    DEPENDENCY_VERIFIER_TEST_TIMEOUT_MS
  );

  it("fails with reinstall guidance when declared dependencies are missing", () => {
    const fixtureRoot = mkdtempSync(join(tmpdir(), "zepo-dependency-fixture-"));

    writeFileSync(
      join(fixtureRoot, "package.json"),
      JSON.stringify({
        dependencies: { chalk: "^5.6.2" },
        devDependencies: { typescript: "^5.9.3" }
      })
    );

    try {
      const result = spawnSync(process.execPath, [scriptPath], {
        cwd: rootDir,
        encoding: "utf8",
        env: {
          ...process.env,
          ZEPOCLI_VERIFY_DEPENDENCIES_ROOT: fixtureRoot
        },
        timeout: DEPENDENCY_VERIFIER_TEST_TIMEOUT_MS
      });

      expect(result.status).toBe(1);
      expect(result.stderr).toContain("Dependency readiness check failed.");
      expect(result.stderr).toContain("Missing dependency package chalk.");
      expect(result.stderr).toContain("Missing devDependency package typescript.");
      expect(result.stderr).toContain("npm ci --include=prod --include=dev");
      expect(result.stderr).not.toContain(fixtureRoot);
      expect(result.stdout).toBe("");
    } finally {
      rmSync(fixtureRoot, { recursive: true, force: true });
    }
  });
});
