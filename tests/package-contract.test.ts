import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import packageJson from "../package.json" with { type: "json" };

const rootDir = resolve(import.meta.dirname, "..");

describe("package CLI contract", () => {
  it("publishes zepo as the compiled executable entry", () => {
    expect(packageJson.bin).toEqual({
      zepo: "./dist/index.js"
    });
  });

  it("keeps the source entry declared as a Node executable", () => {
    const sourceEntry = readFileSync(resolve(rootDir, "src", "index.ts"), "utf8");
    const firstLine = sourceEntry.split("\n", 1)[0]?.replace(/\r$/, "");

    expect(firstLine).toBe("#!/usr/bin/env node");
  });

  it("keeps npm check aligned with the required release gates", () => {
    const checkScript = packageJson.scripts?.check ?? "";

    for (const gate of [
      "npm run build",
      "npm test",
      "npm run verify:cli",
      "npm run verify:package",
      "node dist/index.js --help",
      "npm pack --dry-run"
    ]) {
      expect(checkScript).toContain(gate);
    }

    expect(checkScript).not.toContain("verify:live");
  });

  it("exposes live verification as an opt-in script outside CI gates", () => {
    expect(packageJson.scripts?.["verify:live"]).toBe("node scripts/verify-live-flow.mjs");
    expect(packageJson.files).toContain("scripts/live-report-utils.mjs");
    expect(packageJson.files).toContain("scripts/verify-live-flow.mjs");
  });
});
