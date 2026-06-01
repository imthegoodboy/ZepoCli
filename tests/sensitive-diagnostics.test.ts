import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const rootDir = resolve(import.meta.dirname, "..");
const sensitiveServiceFiles = [
  "src/services/auth.ts",
  "src/services/search.ts",
  "src/services/cart.ts",
  "src/services/addresses.ts",
  "src/services/checkout.ts",
  "src/services/orders.ts"
];
const sensitiveBrowserFlowFiles = [
  ...sensitiveServiceFiles,
  "src/automation/address.ts",
  "src/automation/cart.ts",
  "src/automation/orders.ts"
];

describe("sensitive browser diagnostics", () => {
  it("disables debug HTML and screenshot capture for Zepto service browser flows", () => {
    for (const file of sensitiveServiceFiles) {
      const source = readFileSync(resolve(rootDir, file), "utf8");
      const browserCalls = source.match(/withPage\s*\(\s*\{[^}]*\}/g) ?? [];

      expect(browserCalls.length, `${file} should have Zepto browser calls`).toBeGreaterThan(0);
      for (const call of browserCalls) {
        expect(call, `${file} Zepto browser call should disable failure capture`).toMatch(
          /captureFailures:\s*false/
        );
      }
    }
  });

  it("does not tell users to capture debug artifacts for account-dependent browser pages", () => {
    for (const file of sensitiveBrowserFlowFiles) {
      const source = readFileSync(resolve(rootDir, file), "utf8");

      expect(source, `${file} should prefer visible inspection for account pages`).not.toContain("--visible --debug");
    }
  });
});
