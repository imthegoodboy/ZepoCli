import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { promptContext } from "../src/utils/prompts.js";

const rootDir = resolve(import.meta.dirname, "..");
const interactiveServiceFiles = [
  "src/services/auth.ts",
  "src/services/addresses.ts",
  "src/services/cart.ts",
  "src/services/checkout.ts"
];

describe("interactive prompt output", () => {
  it("renders prompt UI on stderr so json stdout stays machine-readable", () => {
    expect(promptContext()).toMatchObject({
      output: process.stderr,
      clearPromptOnDone: false
    });
  });

  it("routes service prompts through the shared prompt context", () => {
    for (const file of interactiveServiceFiles) {
      const source = readFileSync(resolve(rootDir, file), "utf8");
      const promptCalls = source.match(/\b(?:input|confirm|select)\s*\(/g) ?? [];

      expect(promptCalls.length, `${file} should have interactive prompt calls`).toBeGreaterThan(0);
      expect(source, `${file} should import promptContext`).toContain("promptContext");
      expect(source.match(/promptContext\(\)/g)?.length ?? 0, `${file} should route all prompts`).toBe(
        promptCalls.length
      );
    }
  });
});
