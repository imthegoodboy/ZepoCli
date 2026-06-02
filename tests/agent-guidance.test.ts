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
      expect(guidance).toContain("generic `continue`, bare `proceed`");
      expect(guidance).toContain("`checkout and pay`, or amount-bearing pay text");
      expect(guidance).toContain("after any scroll into view before clicking");
      expect(guidance).toContain("Account/login surface navigation should click visible, enabled, explicit account/profile/login/sign-in controls");
      expect(guidance).toContain("revalidate labels plus disabled state after any scroll into view before clicking");
      expect(guidance).toContain("search-trigger labels plus disabled state");
      expect(guidance).toContain("Order-history and account-menu labels plus disabled state must be revalidated after any scroll into view before clicking");
      expect(guidance).toContain("Address manager/add-address labels and disabled state must be revalidated after any scroll into view before clicking");
      expect(guidance).toContain(
        "location-consent, final address-confirmation, unrelated cart/checkout/order/bill/payment copy, and payment-method/payment copy"
      );
      expect(guidance).toContain("`value`");
      expect(guidance).toContain("src/automation/payment-labels.ts");
      expect(guidance).toContain("do not add per-module payment regex copies");
      expect(guidance).toContain("try the direct search URL before returning only query-matched homepage fallback cards");
      expect(guidance).toContain("Homepage fallback must not override explicit search-page no-results");
      expect(guidance).toContain("Zepto exposes as product-card control labels");
      expect(guidance).toContain("including image alt/accessibility text");
      expect(guidance).toContain("not explicit product-add labels");
      expect(guidance).toContain("product-specific accessible labels such as `Add <product> to cart`");
      expect(guidance).toContain("quantity-only add text such as `Add 2 items to cart`");
      expect(guidance).toContain("quantity-only labels such as `Add 2 to cart`");
      expect(guidance).toContain("Product listing `Add to Cart` copy is not cart-surface evidence");
      expect(guidance).toContain("revalidated against the current cart row before click, including after any scroll into view");
      expect(guidance).toContain("order actions including order summary, tracking, reorder, cancellation, refund, support, invoice, receipt, and rating");
      expect(guidance).toContain("Tagged saved-address rows must be revalidated against Zepto's current visible row text before click, including after any scroll into view");
      expect(guidance).toContain("Saved-address labels must be derived from Zepto's visible saved-address row text");
      expect(guidance).toContain("explicit select/change/set/choose delivery address or location labels");
      expect(guidance).toContain("explicit add/enter delivery address or location labels");
      expect(guidance).toContain("rather than a hardcoded service-city allow-list");
      expect(guidance).toContain("Cart parsing must skip delivery-address blocks with custom saved-address labels");
      expect(guidance).toContain("not a fixed address-label list or service-city allow-list");
      expect(guidance).toContain("Hidden Zepto API 403/429 responses without visible verification text");
      expect(guidance).toContain("`--browser-locale`");
      expect(guidance).toContain("`--browser-timezone`");
      expect(guidance).toContain("`version`");
      expect(guidance).toContain("serviceability");
      expect(guidance).toContain("must not promise delivery timing");
      expect(guidance).toContain("must never ask for, store, log, print, or automate");
      expect(guidance).toContain("UPI/ATM PIN");
      expect(guidance).toContain('cartPrecondition: "non_empty_cart_verified"');
      expect(guidance).toContain("Human spinner/status text");
      expect(guidance).toContain("redact sensitive-looking order-id, phone, OTP/PIN/CVV, payment-number, payment-handle");
      expect(guidance).toContain("JSON error object keys");
      expect(guidance).toContain("same sensitive-looking value redaction as terminal errors");
      expect(guidance).toContain("auth/session/token/password/secret URL parameters, and local-path values");
      expect(guidance).toContain("Persistent runtime log object keys/values, Error messages/stacks, and message strings should use the same sensitive-looking order-id, phone, OTP/PIN/CVV, payment-number, payment-handle");
      expect(guidance).toContain("auth/session/token/password/secret URL-parameter, and local-path redaction rules");
      expect(guidance).toContain("including URL/query-string encoded forms and standalone percent-encoded fragments of those values");
      expect(guidance).toContain("npm-token-shaped values");
      expect(guidance).toContain("doctor --json");
      expect(guidance).toContain("2026-06-02");
      expect(guidance).toContain("Privacy Notice version 1.1");
      expect(guidance).toContain("Last updated: 17th June 2025");
      expect(guidance).toContain("passwords and payment instrument details as sensitive personal information");
      expect(guidance).toContain("payment processing through payment gateways");
      expect(guidance).toContain("avoid sharing login credentials, passwords, or OTPs");
      expect(guidance).toContain("Zepto browser pages that may use the persistent profile");
      expect(guidance).toContain("including search, live status, login, cart, address, checkout, orders, and reorder");
      expect(guidance).toContain("verify:live` should start with normal `zepo doctor --json`");
      expect(guidance).toContain("--production-scope --search <query> --address <query> --add <query>");
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
      expect(guidance).toContain("npm --silent run verify:live:report -- --require-production-scope --max-age-minutes 1440 <report-path>");
      expect(guidance).toContain("optional `--max-age-minutes` freshness");
      expect(guidance).toContain("`--max-age-minutes` must be supplied so production-scope evidence is fresh");
      expect(guidance).toContain("Do not run `npm run verify:cli` in parallel with `npm run verify:package`");
      expect(guidance).toContain(
        "browser preflight, local status, live session, search, address selection, add, a non-empty cart, checkout handoff, and track must be explicitly requested and covered"
      );
      expect(guidance).toContain("focused workflows such as address-add, address-list, remove, clear, history, and reorder must not be mixed into final evidence");
      expect(guidance).toContain("The report validator does not contact Zepto or prove a fresh run happened");
      expect(guidance).toContain("Playwright Chromium launches");
      expect(guidance).toContain("require `browserAutomation.ready === true` and a passing `Playwright Chromium` check");
      expect(guidance).toContain("package `version`");
      expect(guidance).toContain("top-level `requested`, `attempted`, `coverage`, and `missingCoverage`");
      expect(guidance).toContain("capabilities that were requested, ran, actually passed, and remain requested-but-unverified");
      expect(guidance).toContain("runner-known");
      expect(guidance).toContain("when `--login` is supplied but the data directory already has a confirmed session");
      expect(guidance).toContain("must not claim login coverage and must require `liveSession` coverage instead");
      expect(guidance).toContain("whose readable order-card text matches the latest detected order, including after any scroll into view before clicking");
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
      expect(guidance).toContain("raw search text");
      expect(guidance).toContain("raw address labels or text");
      expect(guidance).toContain("local item markers only");
      expect(guidance).toContain("cart item names, units, prices, totals");
      expect(guidance).toContain("local cache IDs only");
      expect(guidance).toContain("status, ETA, totals, placed-at text");
      expect(guidance).toContain("raw Zepto order IDs");
    }
  });

  it("keeps live verification guidance separate from local package smoke proof", () => {
    expect(agentReadme).toContain(".agents/skills/zepto-live-verifier/SKILL.md");
    expect(agentReadme).toContain("Local tests and package smoke checks are not full end-to-end live proof.");

    expect(liveVerifierSkill).toContain("Local gates prove the CLI package shape");
    expect(liveVerifierSkill).toContain("They do not prove a real Zepto account can complete login");
    expect(liveVerifierSkill).toContain("Do not mark the project fully complete until a human-controlled Zepto account exercises the required live workflow");
    expect(liveVerifierSkill).toContain("`generatedAt` is a valid non-future ISO timestamp");
    expect(liveVerifierSkill).toContain("satisfies any `--max-age-minutes` freshness window");
    expect(liveVerifierSkill).toContain("`note` matches the runner literal");
    expect(liveVerifierSkill).toContain("The report contains only accepted schema fields");
    expect(liveVerifierSkill).toContain("Stored step command strings match the redacted command contract");
    expect(liveVerifierSkill).toContain("Passing steps include `exitCode: 0` and a summary");
    expect(liveVerifierSkill).toContain("Failing step error objects use stable `code`, readable `message`/`hint`, and valid `retryAfterMs` fields");
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
    expect(liveVerifierSkill).toContain("browser locale/timezone values");
    expect(liveVerifierSkill).toContain("`--browser-locale <locale>` and `--browser-timezone <timezone>` are optional");
    expect(liveVerifierSkill).toContain("<redacted-browser-locale>");
    expect(liveVerifierSkill).toContain("<redacted-browser-timezone>");
    expect(liveVerifierSkill).toContain("The report, live runner command echoes, and final report-path line redact data directory");
    expect(liveVerifierSkill).toContain("Stored step commands must match the runner's redacted command shapes");
    expect(liveVerifierSkill).toContain("npm-token-shaped values");
    expect(liveVerifierSkill).toContain("standalone percent-encoded sensitive fragments");
    expect(liveVerifierSkill).toContain("npm --silent run verify:live");
    expect(liveVerifierSkill).toContain("--production-scope --search milk --address home --add");
    expect(liveVerifierSkill).toContain("`--production-scope` is the final readiness preset");
    expect(liveVerifierSkill).toContain("npm --silent run verify:live:report -- ./.zepo-live/live-verification-report.json");
    expect(liveVerifierSkill).toContain(
      "npm --silent run verify:live:report -- --require-production-scope --max-age-minutes 1440 ./.zepo-live/live-verification-report.json"
    );
    expect(liveVerifierSkill).toContain("It only checks the saved report contract");
    expect(liveVerifierSkill).toContain("Use `--require-production-scope` for final readiness");
    expect(liveVerifierSkill).toContain("Use `--max-age-minutes 1440` for final readiness");
    expect(liveVerifierSkill).toContain("`--max-age-minutes` must be supplied so production-scope evidence is fresh");
    expect(liveVerifierSkill).toContain(
      "browser preflight, local status, live session, search, address selection, add, a non-empty cart, checkout handoff, and track must be explicitly requested and have passing coverage"
    );
    expect(liveVerifierSkill).toContain(
      "focused workflows such as address-add, address-list, remove, clear, history, and reorder must not be mixed into final evidence"
    );
    expect(liveVerifierSkill).toContain("normal `doctor --json` Playwright Chromium launch evidence");
    expect(liveVerifierSkill).toContain("--data-dir ./.zepo-live --login --production-scope --search milk --address home --add");
    expect(liveVerifierSkill).toContain("Do not combine `--clear` with `--checkout`");
    expect(liveVerifierSkill).toContain("Keep OTP, UPI PIN, card, CVV");
    expect(liveVerifierSkill).toContain('liveSession.state: "logged-in"');
    expect(liveVerifierSkill).toContain('paymentStatus: "not_observed_by_zepocli"');
    expect(liveVerifierSkill).toContain('cartPrecondition: "non_empty_cart_verified"');
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
