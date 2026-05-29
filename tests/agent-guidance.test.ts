import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

describe("agent guidance", () => {
  const agentReadme = readFileSync(resolve(import.meta.dirname, "..", ".agents", "README.md"), "utf8");
  const builderSkill = readFileSync(
    resolve(import.meta.dirname, "..", ".agents", "skills", "zepto-cli-builder", "SKILL.md"),
    "utf8"
  );

  it("keeps future-agent address and payment safety boundaries explicit", () => {
    for (const guidance of [agentReadme, builderSkill]) {
      expect(guidance).toContain("payment-method/payment controls");
      expect(guidance).toContain("location-consent, final address-confirmation, and payment-method/payment copy");
      expect(guidance).toContain("src/automation/payment-labels.ts");
      expect(guidance).toContain("do not add per-module payment regex copies");
    }
  });
});
