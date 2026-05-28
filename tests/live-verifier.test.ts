import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const rootDir = resolve(import.meta.dirname, "..");
const scriptPath = resolve(rootDir, "scripts", "verify-live-flow.mjs");

describe("live verification runner", () => {
  it("documents the opt-in human-controlled flow", () => {
    const result = spawnSync(process.execPath, [scriptPath, "--help"], {
      cwd: rootDir,
      encoding: "utf8"
    });

    expect(result.status).toBe(0);
    expect(result.stdout).toContain("human-controlled live verification");
    expect(result.stdout).toContain("--checkout");
    expect(result.stdout).toContain("omits raw page text, addresses, cart item names, payment credentials, and order ids");
  });

  it("requires an explicit data directory before touching the compiled CLI", () => {
    const result = spawnSync(process.execPath, [scriptPath], {
      cwd: rootDir,
      encoding: "utf8"
    });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("Missing required --data-dir <path>.");
  });
});
