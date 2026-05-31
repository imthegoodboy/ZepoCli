import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

describe("agent guidance", () => {
  const skillsDir = resolve(import.meta.dirname, "..", ".agents", "skills");
  const agentReadme = readFileSync(resolve(import.meta.dirname, "..", ".agents", "README.md"), "utf8");
  const builderSkill = readFileSync(
    resolve(import.meta.dirname, "..", ".agents", "skills", "zepto-cli-builder", "SKILL.md"),
    "utf8"
  );
  const liveVerifierSkill = readFileSync(
    resolve(import.meta.dirname, "..", ".agents", "skills", "zepto-live-verifier", "SKILL.md"),
    "utf8"
  );

  it("keeps future-agent address and payment safety boundaries explicit", () => {
    for (const guidance of [agentReadme, builderSkill]) {
      expect(guidance).toContain("payment-method/payment controls");
      expect(guidance).toContain("cart/checkout/order/bill/payment controls");
      expect(guidance).toContain("`checkout and pay`, or amount-bearing pay text");
      expect(guidance).toContain(
        "location-consent, final address-confirmation, unrelated cart/checkout/order/bill/payment copy, and payment-method/payment copy"
      );
      expect(guidance).toContain("`value`");
      expect(guidance).toContain("src/automation/payment-labels.ts");
      expect(guidance).toContain("do not add per-module payment regex copies");
      expect(guidance).toContain("try the direct search URL before returning only query-matched homepage fallback cards");
      expect(guidance).toContain("Homepage fallback must not override explicit search-page no-results");
      expect(guidance).toContain("Product listing `Add to Cart` copy is not cart-surface evidence");
      expect(guidance).toContain("Hidden Zepto API 403/429 responses without visible verification text");
      expect(guidance).toContain("`version`");
      expect(guidance).toContain("serviceability");
      expect(guidance).toContain("must not promise delivery timing");
      expect(guidance).toContain("must never ask for, store, log, print, or automate");
      expect(guidance).toContain("UPI/ATM PIN");
      expect(guidance).toContain("Human and JSON");
      expect(guidance).toContain("redact sensitive-looking order-id, phone, OTP/PIN/CVV, payment-number, payment-handle");
      expect(guidance).toContain("auth/session/token URL parameters, and local-path values");
      expect(guidance).toContain("Persistent runtime log object values, Error messages/stacks, and message strings should use the same sensitive-looking order-id, phone, OTP/PIN/CVV, payment-number, payment-handle");
      expect(guidance).toContain("auth/session/token URL-parameter, and local-path redaction rules");
      expect(guidance).toContain("including URL/query-string encoded forms and standalone percent-encoded fragments of those values");
      expect(guidance).toContain("npm-token-shaped values");
      expect(guidance).toContain("doctor --json");
      expect(guidance).toContain("2026-05-31");
      expect(guidance).toContain("Privacy Notice version 1.1");
      expect(guidance).toContain("Last updated: 17th June 2025");
      expect(guidance).toContain("passwords and payment instrument details as sensitive personal information");
      expect(guidance).toContain("payment processing through payment gateways");
      expect(guidance).toContain("avoid sharing login credentials, passwords, or OTPs");
      expect(guidance).toContain("verify:live` should start with normal `zepo doctor --json`");
      expect(guidance).toContain("--choose-add");
      expect(guidance).toContain("--add <query> --choose-add --cart");
      expect(guidance).toContain("--step-timeout <ms>");
      expect(guidance).toContain("live runner command echoes");
      expect(guidance).toContain("final report-path line");
      expect(guidance).toContain("stored step commands must match the runner's redacted command shapes");
      expect(guidance).toContain("npm --silent run verify:live");
      expect(guidance).toContain("interrupted with Ctrl+C/SIGTERM");
      expect(guidance).toContain("write the same sanitized partial report when possible");
      expect(guidance).toContain("`verify:live --phone` should accept the same 10-digit, `+91`, or leading-0 Indian mobile formats");
      expect(guidance).toContain("npm --silent run verify:live:report -- <report-path>");
      expect(guidance).toContain("The report validator does not contact Zepto or prove a fresh run happened");
      expect(guidance).toContain("Playwright Chromium launches");
      expect(guidance).toContain("require `browserAutomation.ready === true` and a passing `Playwright Chromium` check");
      expect(guidance).toContain("package `version`");
      expect(guidance).toContain("top-level `requested`, `attempted`, `coverage`, and `missingCoverage`");
      expect(guidance).toContain("capabilities that were requested, ran, actually passed, and remain requested-but-unverified");
      expect(guidance).toContain("runner-known");
      expect(guidance).toContain("when `--login` is supplied but the data directory already has a confirmed session");
      expect(guidance).toContain("must not claim login coverage and must require `liveSession` coverage instead");
      for (const code of [
        "live_doctor_contract_mismatch",
        "live_login_contract_mismatch",
        "live_status_contract_mismatch",
        "live_checkout_contract_mismatch",
        "live_track_contract_mismatch",
        "live_search_contract_mismatch",
        "live_add_contract_mismatch",
        "live_cart_contract_mismatch",
        "live_clear_contract_mismatch",
        "live_address_contract_mismatch",
        "live_history_contract_mismatch",
        "live_reorder_contract_mismatch",
        "live_verification_incomplete",
        "live_runner_failed",
        "live_command_launch_failed",
        "live_command_timeout",
        "live_summary_failed",
        "live_json_unreadable",
        "live_json_unexpected",
        "command_failed"
      ]) {
        expect(guidance).toContain(code);
      }
      expect(guidance).toContain("Node.js 20.19");
      expect(guidance).toContain("zepo logout");
      expect(guidance).toContain(
        "Empty Zepto origin storage, empty auth-looking cookie/localStorage values, and public preference/location cookies are not auth proof"
      );
      expect(guidance).toContain("non-empty auth/session-like Zepto cookies or non-empty auth/session-like Zepto localStorage keys");
    }
  });

  it("keeps live verification guidance separate from local package smoke proof", () => {
    expect(agentReadme).toContain(".agents/skills/zepto-live-verifier/SKILL.md");
    expect(agentReadme).toContain("Local tests and package smoke checks are not full end-to-end live proof.");

    expect(liveVerifierSkill).toContain("Local gates prove the CLI package shape");
    expect(liveVerifierSkill).toContain("They do not prove a real Zepto account can complete login");
    expect(liveVerifierSkill).toContain("Do not mark the project fully complete until a human-controlled Zepto account exercises the required live workflow");
    expect(liveVerifierSkill).toContain("`generatedAt` is a valid ISO timestamp");
    expect(liveVerifierSkill).toContain("The report contains only accepted schema fields");
    expect(liveVerifierSkill).toContain("Stored step command strings match the redacted command contract");
    expect(liveVerifierSkill).toContain("Passing steps include `exitCode: 0` and a summary");
    expect(liveVerifierSkill).toContain("`ok: true` reports contain only passing known workflow steps");
    expect(liveVerifierSkill).toContain("Every workflow step name appears at most once in an ok report");
    expect(liveVerifierSkill).toContain("Ok report workflow steps follow the live runner order");
    expect(liveVerifierSkill).toContain("Workflow step summaries include every runner-defined key");
    expect(liveVerifierSkill).toContain("Workflow step summary values keep the runner's expected types");
    expect(liveVerifierSkill).toContain("String and string-array workflow step summary values stay within runner-known values");
    expect(liveVerifierSkill).toContain("Related workflow step summary fields are internally consistent");
    expect(liveVerifierSkill).toContain("Numeric workflow step summaries stay within runner-supported ranges");
    expect(liveVerifierSkill).toContain("Every passing workflow step summary satisfies its known report contract");
    expect(liveVerifierSkill).toContain("`requested` shows the explicit verification scope without workflow query values");
    expect(liveVerifierSkill).toContain("`attempted` shows which workflow capabilities the runner reached");
    expect(liveVerifierSkill).toContain("`coverage` shows which workflow capabilities actually passed");
    expect(liveVerifierSkill).toContain("contain every supported capability as booleans");
    expect(liveVerifierSkill).toContain("`attempted` and `coverage` match the saved `steps` array");
    expect(liveVerifierSkill).toContain("report keys and values do not contain sensitive-looking local paths");
    expect(liveVerifierSkill).toContain("`missingCoverage` shows requested capabilities that did not pass");
    expect(liveVerifierSkill).toContain("`--login` is conditional");
    expect(liveVerifierSkill).toContain("Existing confirmed sessions with `--login` leave `requested.login` false");
    expect(liveVerifierSkill).toContain("do not treat omitted or false coverage fields as verified");
    expect(liveVerifierSkill).toContain("npm run check");
    expect(liveVerifierSkill).toContain("live_verification_incomplete");
    expect(liveVerifierSkill).toContain("live_command_timeout");
    expect(liveVerifierSkill).toContain("--step-timeout <ms>");
    expect(liveVerifierSkill).toContain("The report, live runner command echoes, and final report-path line redact data directory");
    expect(liveVerifierSkill).toContain("Stored step commands must match the runner's redacted command shapes");
    expect(liveVerifierSkill).toContain("npm-token-shaped values");
    expect(liveVerifierSkill).toContain("standalone percent-encoded sensitive fragments");
    expect(liveVerifierSkill).toContain("npm --silent run verify:live");
    expect(liveVerifierSkill).toContain("npm --silent run verify:live:report -- ./.zepo-live/live-verification-report.json");
    expect(liveVerifierSkill).toContain("It only checks the saved report contract");
    expect(liveVerifierSkill).toContain("normal `doctor --json` Playwright Chromium launch evidence");
    expect(liveVerifierSkill).toContain("--data-dir ./.zepo-live --login --search milk --address home --add");
    expect(liveVerifierSkill).toContain("Do not combine `--clear` with `--checkout`");
    expect(liveVerifierSkill).toContain("Keep OTP, UPI PIN, card, CVV");
    expect(liveVerifierSkill).toContain('liveSession.state: "logged-in"');
    expect(liveVerifierSkill).toContain('paymentStatus: "not_observed_by_zepocli"');
    expect(liveVerifierSkill).toContain('orderPlacement: "not_confirmed_by_zepocli"');
    expect(liveVerifierSkill).toContain('orderStatusCommand: "zepo track"');
  });

  it("keeps project agent skills discoverable and documented", () => {
    const skillNames = readdirSync(skillsDir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort();

    expect(skillNames).toEqual(["zepto-cli-builder", "zepto-live-verifier"]);

    for (const skillName of skillNames) {
      const skillPath = `.agents/skills/${skillName}/SKILL.md`;
      const skill = readFileSync(resolve(skillsDir, skillName, "SKILL.md"), "utf8").replace(/\r\n/g, "\n");

      expect(skill).toMatch(/^---\nname: [a-z0-9-]+\ndescription: .+\n---/);
      expect(agentReadme).toContain(skillPath);
    }
  });
});
