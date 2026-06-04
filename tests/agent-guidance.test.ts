import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

describe("agent guidance", () => {
  const skillsDir = resolve(import.meta.dirname, "..", ".agents", "skills");
  const agentReadme = readFileSync(resolve(import.meta.dirname, "..", ".agents", "README.md"), "utf8");
  const agentStatus = readFileSync(resolve(import.meta.dirname, "..", ".agents", "STATUS.md"), "utf8");
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
      expect(guidance).toContain("support/help, invoice/receipt, refund/return/cancel, or rating/review actions");
      expect(guidance).toContain("support/help, invoice/receipt, refund/return/cancel, or rating/review controls");
      expect(guidance).toContain("unsafe phone-like payment/cart/address/search/support/refund/rating fields");
      expect(guidance).toContain("background/headless mode by default");
      expect(guidance).toContain("browserAutomationMode.current");
      expect(guidance).toContain("background_headless");
      expect(guidance).toContain("human-only login, address-add, and checkout handoffs must fail with `visible_browser_required`");
      expect(guidance).toContain("before session checks instead of opening a surprise browser");
      expect(guidance).toContain("before browser launch, browser profile writes, and headless browser run accounting");
      expect(guidance).toContain("Background/headless mode is for explicit user-requested CLI commands only");
      expect(guidance).toContain("Show the browser only when the user explicitly passes `--visible`");
      expect(guidance).toContain("`zepo completion <shell>`");
      expect(guidance).toContain("runtime storage, services, Playwright, or browser automation");
      expect(guidance).toContain("revalidate labels plus disabled state after any scroll into view before clicking");
      expect(guidance).toContain("search-trigger labels plus disabled state");
      expect(guidance).toContain("Order-history and account-menu labels plus disabled state must be revalidated after any scroll into view before clicking");
      expect(guidance).toContain(
        "final-order, support, invoice/receipt, refund/return/cancel, or rating/review actions"
      );
      expect(guidance).toContain("rate/rating/review/order-placement");
      expect(guidance).toContain("Address manager/add-address labels and disabled state must be revalidated after any scroll into view before clicking");
      expect(guidance).toContain(
        "location-consent, final address-confirmation, unrelated cart/checkout/order/bill/payment copy, and payment-method/payment copy"
      );
      expect(guidance).toContain("support/invoice/refund/cancel/rating order-action");
      expect(guidance).toContain("support, invoice/receipt, refund/return, cancellation, or rating/review");
      expect(guidance).toContain(
        "support, invoice/receipt, refund/return/cancel-order, and rating/review order-action labels"
      );
      expect(guidance).toContain("`value`");
      expect(guidance).toContain("src/automation/payment-labels.ts");
      expect(guidance).toContain("do not add per-module payment regex copies");
      expect(guidance).toContain("src/automation/final-action-labels.ts");
      expect(guidance).toContain("amount-bearing pay, checkout-and-pay, and pay-with labels do not drift per module");
      expect(guidance).toContain("src/automation/order-action-labels.ts");
      expect(guidance).toContain("do not add per-module copies that can drift");
      expect(guidance).toContain("try the direct search URL before returning only query-matched homepage fallback cards");
      expect(guidance).toContain("Homepage fallback must not override explicit search-page no-results");
      expect(guidance).toContain("Zepto exposes as product-card control labels");
      expect(guidance).toContain("account/login/OTP/location/address prompts");
      expect(guidance).toContain("checkout/payment panels, cart/checkout service rows such as fees, charges, tips, discounts, donations, taxes, and GST, promo gift panels, offer/upsell panels, merchandising headings, membership rows");
      expect(guidance).toContain("image alt/accessibility text");
      expect(guidance).toContain("not explicit product-add labels");
      expect(guidance).toContain("product-specific accessible labels such as `Add <product> to cart`");
      expect(guidance).toContain("quantity-only add text such as `Add 2 items to cart`");
      expect(guidance).toContain("quantity-only labels such as `Add 2 to cart`");
      expect(guidance).toContain("report `Item total`, `Items total`, `Subtotal`, or `Sub total` as final cart/order totals");
      expect(guidance).toContain("Public product URLs");
      expect(guidance).toContain("Zepto-owned HTTP(S)");
      expect(guidance).toContain("query strings and hash fragments");
      expect(guidance).toContain("unsafe-scheme hrefs");
      expect(guidance).toContain("Product listing `Add to Cart` copy is not cart-surface evidence");
      expect(guidance).toContain("revalidated against the current cart row before click, including after any scroll into view");
      expect(guidance).toContain("inactive saved/unavailable item actions");
      expect(guidance).toContain("promotional/merchandising/payment/membership rows");
      expect(guidance).toContain("order actions including order summary, tracking, reorder, cancellation, refund, support, invoice, receipt, and rating");
      expect(guidance).toContain("Tagged saved-address rows must be revalidated against Zepto's current visible row text before click, including after any scroll into view");
      expect(guidance).toContain("Saved-address labels must be derived from Zepto's visible saved-address row text");
      expect(guidance).toContain("explicit select/change/set/choose delivery address or location labels");
      expect(guidance).toContain("explicit add/enter delivery address or location labels");
      expect(guidance).toContain("rather than a hardcoded service-city allow-list");
      expect(guidance).toContain("Cart parsing must skip delivery-address blocks with custom saved-address labels");
      expect(guidance).toContain("skip account/login/OTP/location/address prompts");
      expect(guidance).toContain("inactive saved-for-later sections, unavailable item sections, checkout/payment panels, cart/checkout service rows such as clear-cart actions, bill/order summaries, minimum-order-value copy, demand/rain fees, charges, taxes/GST, tips, discounts, donations, round-off rows, instructions, and policy rows, promo gift rows, offer/upsell rows, merchandising headings, and membership rows");
      expect(guidance).toContain("not a fixed address-label list or service-city allow-list");
      expect(guidance).toContain(
        "No-id order rows with support, invoice/receipt, refund/return/cancel-action, rating/review, order-summary, bill-summary, or view-bill copy require explicit track/tracking context"
      );
      expect(guidance).toContain("Hidden Zepto API 403/429 responses without visible verification text");
      expect(guidance).toContain("`--browser-locale`");
      expect(guidance).toContain("`--browser-timezone`");
      expect(guidance).toContain("`version`");
      expect(guidance).toContain("serviceability");
      expect(guidance).toContain("must not promise delivery timing");
      expect(guidance).toContain("must never ask for, store, log, print, or automate");
      expect(guidance).toContain("UPI/ATM PIN");
      expect(guidance).toContain('cartPrecondition: "non_empty_cart_verified"');
      expect(guidance).toContain('status: "checkout_manual_action_required"');
      expect(guidance).toContain("`zepo --visible checkout --json` returns structured handoff evidence immediately instead of waiting for a prompt");
      expect(guidance).toContain("production-scope checkout handoff coverage");
      expect(guidance).toContain("manual checkout continuation use `live_verification_incomplete`");
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
      expect(guidance).toContain("2026-06-04");
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
      expect(guidance).toContain("npm publish --dry-run --access public");
      expect(guidance).toContain(
        "browser preflight, local status, live session, address selection, search, add, a non-empty cart, checkout handoff, and track must be explicitly requested and covered"
      );
      expect(guidance).toContain("focused workflows such as address-add, address-list, remove, clear, history, and reorder must not be mixed into final evidence");
      expect(guidance).toContain("The report validator does not contact Zepto or prove a fresh run happened");
      expect(guidance).toContain("Playwright Chromium launches");
      expect(guidance).toContain("then local `zepo status --json`");
      expect(guidance).toContain("both preflight steps to report `browserAutomation.ready === true`");
      expect(guidance).toContain("passing `Playwright Chromium` check from doctor");
      expect(guidance).toContain("package `version`");
      expect(guidance).toContain("top-level `requested`, `attempted`, `coverage`, and `missingCoverage`");
      expect(guidance).toContain("capabilities that were requested, ran, actually passed, and remain requested-but-unverified");
      expect(guidance.toLowerCase()).toContain(
        "with no live workflow flags, a data directory that already has a confirmed local session should stop after doctor/local status"
      );
      expect(guidance).toContain("local status readiness");
      expect(guidance).toContain("runner-known");
      expect(guidance).toContain("when `--login` is supplied but the data directory already has a confirmed session");
      expect(guidance).toContain("must not claim login coverage and must require `liveSession` coverage instead");
      expect(guidance).toContain("Manual precondition failures such as a missing confirmed session are incomplete manual steps, not workflow attempts");
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
        "Empty Zepto origin storage, empty auth-looking cookie/localStorage values, public preference/location cookies, CSRF/XSRF or anti-forgery tokens, and bare login/logged UI flags are not auth proof"
      );
      expect(guidance).toContain("non-empty auth/session/token-like Zepto cookies or non-empty auth/session/token-like Zepto localStorage keys");
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
    expect(agentReadme).toContain(".agents/STATUS.md");
    expect(agentReadme).toContain("Local tests and package smoke checks are not full end-to-end live proof.");

    expect(liveVerifierSkill).toContain("Local gates prove the CLI package shape");
    expect(liveVerifierSkill).toContain("They do not prove a real Zepto account can complete login");
    expect(liveVerifierSkill).toContain("Do not mark the project fully complete until a human-controlled Zepto account exercises the required live workflow");
    expect(liveVerifierSkill).toContain("`generatedAt` is a valid non-future ISO timestamp");
    expect(liveVerifierSkill).toContain("Local `status` shows ready browser automation before live account workflows.");
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
    expect(liveVerifierSkill).toContain(
      "Address summaries require structural address detail without storing raw address text"
    );
    expect(liveVerifierSkill).toContain("product summaries require a readable name plus price or unit detail");
    expect(liveVerifierSkill).toContain("name-only product rows such as `Amul Milk 500ml`");
    expect(liveVerifierSkill).toContain("String and string-array workflow step summary values stay within runner-known values");
    expect(liveVerifierSkill).toContain("Related workflow step summary fields are internally consistent");
    expect(liveVerifierSkill).toContain("Numeric workflow step summaries stay within runner-supported ranges");
    expect(liveVerifierSkill).toContain("Every passing workflow step summary satisfies its known report contract");
    expect(liveVerifierSkill).toContain("`requested` shows the explicit verification scope without workflow query values");
    expect(liveVerifierSkill).toContain("`attempted` shows which workflow capabilities the runner reached");
    expect(liveVerifierSkill).toContain("`coverage` shows which workflow capabilities actually passed");
    expect(liveVerifierSkill).toContain("contain every supported capability as booleans");
    expect(liveVerifierSkill).toContain("`attempted` and `coverage` match the saved `steps` array");
    expect(liveVerifierSkill).toContain("Manual precondition failures such as a missing confirmed session are incomplete manual steps, not workflow attempts");
    expect(liveVerifierSkill).toContain("Manual/internal command markers are valid only for runner-defined precondition/internal failure steps");
    expect(liveVerifierSkill).toContain("report keys and values do not contain sensitive-looking local paths");
    expect(liveVerifierSkill).toContain("`missingCoverage` shows requested capabilities that did not pass");
    expect(liveVerifierSkill).toContain("`--login` is conditional");
    expect(liveVerifierSkill).toContain("Existing confirmed sessions with `--login` leave `requested.login` false");
    expect(liveVerifierSkill).toContain(
      "With no live workflow flags, a data directory that already has a confirmed local session should stop after doctor/local status"
    );
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
      "browser preflight, local status, live session, address selection, search, add, a non-empty cart, checkout handoff, and track must be explicitly requested and have passing coverage"
    );
    expect(liveVerifierSkill).toContain(
      "focused workflows such as address-add, address-list, remove, clear, history, and reorder must not be mixed into final evidence"
    );
    expect(liveVerifierSkill).toContain("normal `doctor --json` Playwright Chromium launch evidence");
    expect(liveVerifierSkill).toContain("--data-dir ./.zepo-live --login --production-scope --search milk --address home --add");
    expect(liveVerifierSkill).toContain("Do not combine `--clear` with `--checkout`");
    expect(liveVerifierSkill).toContain("Keep OTP, UPI PIN, card, CVV");
    expect(liveVerifierSkill).toContain("`status live` reports ready browser automation");
    expect(liveVerifierSkill).toContain('liveSession.state: "logged-in"');
    expect(liveVerifierSkill).toContain('paymentStatus: "not_observed_by_zepocli"');
    expect(liveVerifierSkill).toContain('cartPrecondition: "non_empty_cart_verified"');
    expect(liveVerifierSkill).toContain('orderPlacement: "not_confirmed_by_zepocli"');
    expect(liveVerifierSkill).toContain('orderStatusCommand: "zepo track"');
    expect(liveVerifierSkill).toContain('status: "checkout_manual_action_required"');
    expect(liveVerifierSkill).toContain("returns structured handoff evidence immediately instead of waiting for an Enter prompt");
    expect(liveVerifierSkill).toContain("reports it as `live_verification_incomplete`");
    expect(liveVerifierSkill).toContain("not accepted as checkout handoff coverage");
    expect(liveVerifierSkill).toContain('Checkout coverage requires `status: "checkout_handoff_returned"`');
  });

  it("records current local readiness separately from missing live production proof", () => {
    expect(agentStatus).toContain("Last updated: 2026-06-04");
    expect(agentStatus).toContain("`npm run check` passed locally");
    expect(agentStatus).toContain("34 test files, 613 tests");
    expect(agentStatus).toContain("publish dry-run");
    expect(agentStatus).toContain("`zepo completion <bash|zsh|fish|powershell>`");
    expect(agentStatus).toContain("includes `help`, nested help topics");
    expect(agentStatus).toContain("nested help topics such as `help address`");
    expect(agentStatus).toContain("compiled and installed-package smokes cover bash, zsh, fish, PowerShell");
    expect(agentStatus).toContain("the `pwsh`/`ps1` aliases");
    expect(agentStatus).toContain("installed README documents those PowerShell aliases");
    expect(agentStatus).toContain("ships the exposed verifier entrypoints");
    expect(agentStatus).toContain("scripts/verify-cli.mjs");
    expect(agentStatus).toContain("scripts/verify-package.mjs");
    expect(agentStatus).toContain("scripts/verify-live-flow.mjs");
    expect(agentStatus).toContain("scripts/verify-live-report.mjs");
    expect(agentStatus).toContain("installed-package checks assert `verify:live` and `verify:live:report`");
    expect(agentStatus).toContain("`npm run verify:cli --silent` and `npm run verify:package --silent` smokes passed");
    expect(agentStatus).toContain("npm pack --ignore-scripts");
    expect(agentStatus).toContain("runtime installs do not need dev-only `tsc`");
    expect(agentStatus).toContain('browserAutomationMode.default: "background_headless"');
    expect(agentStatus).toContain('browserAutomationMode.current: "background_headless"');
    expect(agentStatus).toContain("browserAutomationMode.visibleRequested: false");
    expect(agentStatus).toContain("background/headless");
    expect(agentStatus).toContain("visible_browser_required");
    expect(agentStatus).toContain("Do not parallelize browser-capable commands against the same `--data-dir`");
    expect(agentStatus).toContain("browser_lock_active");
    expect(agentStatus).toContain("run such checks serially");
    expect(agentStatus).toContain("Official Zepto Terms of Use were rechecked");
    expect(agentStatus).toContain("version 1.4");
    expect(agentStatus).toContain("last updated 1 November 2025");
    expect(agentStatus).toContain("Official Zepto Privacy Notice was rechecked");
    expect(agentStatus).toContain("version 1.1");
    expect(agentStatus).toContain("last updated 17 June 2025");
    expect(agentStatus).toContain("A safe no-account `verify:live` smoke");
    expect(agentStatus).toContain("manual session precondition with `live_verification_incomplete`");
    expect(agentStatus).toContain("did not claim login, live-session, checkout, or order coverage");
    expect(agentStatus).toContain("confirmed local session marker");
    expect(agentStatus).toContain("focused human-controlled visible live-session probe");
    expect(agentStatus).toContain("passed `doctor`, local `status`, and visible `status --live --json`");
    expect(agentStatus).toContain("saved focused report was accepted");
    expect(agentStatus).toContain("proves fresh browser preflight, local status, and live-session coverage only");
    expect(agentStatus).toContain("does not prove address selection, search, add, cart, checkout handoff, or track");
    expect(agentStatus).toContain("including one retry after the cooldown cleared");
    expect(agentStatus).toContain("do not loop headless live-session checks");
    expect(agentStatus).toContain("was checked with `verify:live:report --require-production-scope --max-age-minutes 1440`");
    expect(agentStatus).toContain("was rejected");
    expect(agentStatus).toContain("checkout handoff coverage did not pass");
    expect(agentStatus).toContain("track coverage did not pass");
    expect(agentStatus).toContain("production-scope coverage is missing");
    expect(agentStatus).toContain('error.code: "zepto_access_challenge"');
    expect(agentStatus).toContain("retryAfterMs: 900000");
    expect(agentStatus).toContain("Do not loop headless Zepto commands");
    expect(agentStatus).toContain("not a product-search failure to work around with stealth");
    expect(agentStatus).toContain("A fresh human-controlled production-scope live report is still missing");
    expect(agentStatus).toContain("verify:live:report -- --require-production-scope --max-age-minutes 1440");
    expect(agentStatus).toContain("Checkout handoff is not payment proof");
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
