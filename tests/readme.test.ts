import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

describe("README package guidance", () => {
  const readme = readFileSync(resolve(import.meta.dirname, "..", "README.md"), "utf8");

  it("documents package installation and browser setup", () => {
    expect(readme).toContain("Requires Node.js 20.19 or newer.");
    expect(readme).toContain("npm install -g zepocli");
    expect(readme).toContain("npx playwright install chromium");
    expect(readme).toContain("zepo doctor");
  });

  it("documents the full production command surface", () => {
    for (const command of [
      "zepo login",
      "zepo login --phone 9876543210",
      "zepo logout",
      "zepo status",
      "zepo status --live",
      "zepo doctor",
      "zepo search milk",
      'zepo add "Amul Milk 500ml"',
      'zepo add "protein bars" --choose',
      "zepo cart",
      "zepo remove chips",
      "zepo clear",
      "zepo address list",
      "zepo address use home",
      "zepo address add",
      "zepo checkout",
      "zepo track",
      "zepo history",
      "zepo reorder last"
    ]) {
      expect(readme).toContain(command);
    }
  });

  it("documents the agent preflight and checkout handoff contract", () => {
    expect(readme).toContain("## Agent Runbook");
    expect(readme).toContain("zepo status --json");
    expect(readme).toContain("browserAutomation.ready");
    expect(readme).toContain("browserAutomation.reasons");
    expect(readme).toContain("browserAutomation.retryAfterMs");
    expect(readme).toContain("Browser lock JSON includes the lock owner `pid`, `createdAt`, and `staleReason`");
    expect(readme).toContain("Browser commands register interrupt handlers so Ctrl+C/SIGTERM attempts to close the Playwright browser context");
    expect(readme).toContain("Browser context close is bounded and best-effort");
    expect(readme).toContain("if graceful context close fails or times out");
    expect(readme).toContain("the CLI attempts to force-close the owning browser before releasing the lock");
    expect(readme).toContain("the next browser command can recover dead-owner locks, plus old lock files that have no live owner PID");
    expect(readme).toContain("A lock with a still-running owner PID remains active even when it is old");
    expect(readme).toContain("Do not parallelize multiple data directories to bypass pacing or throttle signals");
    expect(readme).toContain("`zepo status --json` includes `version`");
    expect(readme).toContain("`zepo doctor --json` also includes `version`, `dataDir`, `browserAutomation`, `browserLock`, `headlessBrowserThrottle`, and `accessChallenge`");
    expect(readme).toContain("raw Zepto page text");
    expect(readme).toContain("internal automation IDs");
    expect(readme).toContain("Human and JSON error text redact sensitive-looking order-id, phone, OTP/PIN/CVV, payment-number, payment-handle");
    expect(readme).toContain("auth/session/token URL parameters, and local-path values");
    expect(readme).toContain("auth/session/token URL parameters");
    expect(readme).toContain("including URL/query-string encoded forms and standalone percent-encoded fragments of those values");
    expect(readme).toContain("npm-token-shaped values");
    expect(readme).toContain("Use ZepoCli only where permitted by Zepto and applicable law");
    expect(readme).toContain("https://www.zepto.com/s/terms-of-service");
    expect(readme).toContain("Terms of Use version 1.4");
    expect(readme).toContain("were checked on 2026-05-31");
    expect(readme).toContain("Last updated: 1 st November 2025");
    expect(readme).toContain("Privacy Notice version 1.1");
    expect(readme).toContain("https://staticweb.zepto.com/privacy-policy/");
    expect(readme).toContain("Last updated: 17th June 2025");
    expect(readme).toContain("passwords and payment instrument details as sensitive personal information");
    expect(readme).toContain("payment processing through payment gateways");
    expect(readme).toContain("avoid sharing login credentials, passwords, or OTPs");
    expect(readme).toContain("marketplace for seller transactions in select serviceable areas");
    expect(readme).toContain("delivery ETA can vary or exceed the displayed estimate");
    expect(readme).toContain("delay, cancel, reject, block, or suspend transactions/access");
    expect(readme).toContain("must never ask for, store, log, print, or automate");
    expect(readme).toContain("UPI/ATM PIN");
    expect(readme).toContain("restrict access through non-Zepto interfaces or automatic devices");
    expect(readme).toContain("403/429-style block pages");
    expect(readme).toContain("access protection");
    expect(readme).toContain("Hidden Zepto API 403/429 responses without a visible verification surface still stop the command");
    expect(readme).toContain(
      "Checkout handoff controls are rejected if any visible or accessible label contains payment-method, final-payment, final-order, `checkout and pay`, or amount-bearing pay text"
    );
    expect(readme).toContain("Search uses visible, enabled, editable search inputs or explicit search controls");
    expect(readme).toContain("the CLI tries the direct search URL before returning only query-matched homepage fallback cards");
    expect(readme).toContain("Homepage fallback never overrides explicit search-page no-results");
    expect(readme).toContain("Safe-click checks inspect visible text, `aria-label`, `title`, `placeholder`, `value`, `aria-description`, and referenced `aria-labelledby`/`aria-describedby` text");
    expect(readme).toContain("Search, account/login, order-history, and reorder controls are rejected when any visible or accessible label points at an unrelated navigation");
    expect(readme).toContain("visible, enabled address controls");
    expect(readme).toContain(
      "location-consent, final address-confirmation, unrelated cart/checkout/order/bill/payment text, or payment-method/payment surfaces"
    );
    expect(readme).toContain("unrelated navigation, cart, address, checkout, payment-method/payment, order, phone/OTP, or verification actions");
    expect(readme).toContain("payment-method/payment, coupon, or order actions");
    expect(readme).toContain("checkout, payment-method/payment, or final-order action");
    expect(readme).toContain("Cart navigation controls are rejected if any visible or accessible label contains checkout, proceed, payment-method/payment, bill, or final order text");
    expect(readme).toContain("Product listing `Add to Cart` copy is not cart-surface evidence");
    expect(readme).toContain(
      'Empty-history marketing copy such as groceries "delivered in minutes" or snacks "arriving in 8 mins" is ignored'
    );
    expect(readme).toContain("no-id history rows need stronger evidence than a bare status word");
    expect(readme).toContain("Order-history navigation clicks only visible, enabled, explicit orders/history controls");
    expect(readme).toContain("unrelated cart, account, address, checkout, payment-method/payment, tracking, reorder, or final-order actions are rejected");
    expect(readme).toContain("visible, enabled, explicit reorder/order-again/repeat-order control");
    expect(readme).toContain("legacy `zeptonow.com` responses");
    expect(readme).toContain("Session auth checks recognize both `zepto.com` and legacy `zeptonow.com` storage");
    expect(readme).toContain(
      "Empty Zepto origin storage, empty auth-looking cookie/localStorage values, and public preference/location cookies are not enough to confirm local auth, even when the key name contains words like `user`, `customer`, or `profile`"
    );
    expect(readme).toContain("non-empty auth/session-like Zepto cookies or non-empty auth/session-like Zepto localStorage keys");
    expect(readme).toContain("It does not target bare numeric inputs so OTP entry remains fully Zepto-controlled.");
    expect(readme).toContain("unsafe phone-like payment/cart/address/search fields");
    expect(readme).toContain("visible, enabled account/profile/login controls");
    expect(readme).toContain("Search cache stores redacted query text only");
    expect(readme).toContain("raw cart/order page text is used in memory for parsing but is not saved to SQLite snapshots");
    expect(readme).toContain("Persistent log object values, Error messages/stacks, and message strings are redacted with the same sensitive-looking order-id, phone, OTP/PIN/CVV, payment-number, payment-handle");
    expect(readme).toContain("auth/session/token URL-parameter, and local-path rules");
    expect(readme).toContain("auth/session/token URL-parameter");
    expect(readme).toContain("including URL/query-string encoded forms and standalone percent-encoded fragments of those values");
    expect(readme).toContain("They also redact npm-token-shaped values");
    expect(readme).toContain("It refuses to run while another ZepoCli browser command owns the current data directory lock");
    expect(readme).toContain("configured data directory is blank");
    expect(readme).toContain('"code": "no_confirmed_session"');
    expect(readme).toContain('error.code: "unexpected_error"');
    expect(readme).toContain('paymentStatus: "not_observed_by_zepocli"');
    expect(readme).toContain('orderPlacement: "not_confirmed_by_zepocli"');
    expect(readme).toContain("npm --silent run verify:live -- --data-dir ./.zepo-live");
    expect(readme).toContain('npm --silent run verify:live -- --data-dir ./.zepo-live --login --add "protein bars" --choose-add --cart');
    expect(readme).toContain("live-verification-report.json");
    expect(readme).toContain("It starts with normal `zepo doctor --json`, including the Playwright Chromium launch check");
    expect(readme).toContain("the live report contract requires `browserAutomation.ready === true` plus a passing `Playwright Chromium` check");
    expect(readme).toContain("normal `doctor --json` browser-launch checks");
    expect(readme).toContain("the same doctor checks");
    expect(readme).toContain("run `--clear` as a separate cleanup pass because it cannot be combined with checkout verification");
    expect(readme).toContain(
      "`--login` is conditional: if the dedicated data directory already has a confirmed session, the runner does not force a fresh login or claim login coverage; it requires `liveSession` coverage from `status --live` instead"
    );
    expect(readme).toContain(
      "top-level `requested`, `attempted`, `coverage`, and `missingCoverage` objects showing which workflow capabilities were requested, ran, actually passed, and remain requested-but-unverified"
    );
    expect(readme).toContain("`checkoutHandoff`");
    expect(readme).toContain(
      "omits raw Zepto page text, addresses, cart item names, payment credentials, order ids, phone input, local filesystem paths, unredacted workflow query arguments, and standalone percent-encoded sensitive fragments"
    );
    expect(readme).toContain("standalone percent-encoded sensitive fragments");
    expect(readme).toContain("live-verification-report.json` with the package `version`");
    expect(readme).toContain(
      "Console command echoes, the final report-path line, and stored report command strings redact local data/report paths, phone input, search/add/remove/address-use query text, and npm-token-shaped values; stored step commands must also match the runner's redacted command shapes"
    );
    expect(readme).toContain("The examples use `npm --silent run verify:live -- ...`");
    expect(readme).toContain("interrupted with Ctrl+C/SIGTERM");
    expect(readme).toContain("writes the same sanitized partial report when possible");
    expect(readme).toContain("npm --silent run verify:live:report -- ./.zepo-live/live-verification-report.json");
    expect(readme).toContain("`verify:live:report` does not contact Zepto or prove a fresh run happened");
    expect(readme).toContain("sanitized `generatedAt` plus data/report path metadata");
    expect(readme).toContain("accepted report schema");
    expect(readme).toContain("complete boolean capability summaries");
    expect(readme).toContain("redacted step command contract");
    expect(readme).toContain("consistent step `exitCode`/`ok`/`summary`/`error` fields");
    expect(readme).toContain("`attempted`/`coverage` consistency with `steps`");
    expect(readme).toContain("sensitive-looking key/value redaction");
    expect(readme).toContain("Use `--choose-add` with `--add` to exercise `zepo add --choose`");
    expect(readme).toContain("Use `--step-timeout <ms>` only when a human-controlled Zepto step legitimately needs more than the default per-command timeout");
    expect(readme).toContain("`verify:live --phone` accepts the same 10-digit, `+91`, or leading-0 Indian mobile formats");
    expect(readme).toContain("normalizes the value before invoking the CLI");
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
      expect(readme).toContain(code);
    }
    expect(readme).toContain("not part of `npm run check` or CI");
  });

  it("documents guarded npm release publishing", () => {
    expect(readme).toContain("## Release");
    expect(readme).toContain("Release publishing is tag-driven");
    expect(readme).toContain("npm run check");
    expect(readme).toContain("git tag v0.1.0");
    expect(readme).toContain("git push origin v0.1.0");
    expect(readme).toContain("npm publish --provenance --access public");
    expect(readme).toContain("NPM_TOKEN");
    expect(readme).toContain("It does not run `verify:live`");
    expect(readme).toContain("npm run verify:secrets");
    expect(readme).toContain("without printing the raw token");
    expect(readme).toContain("Never put npm tokens in the app, README, tests, or committed config.");
    expect(readme).toContain("GitHub Actions secret named `NPM_TOKEN`");
    expect(readme).toContain("copy `.npmrc.example` to ignored `.npmrc`");
    expect(readme).toContain("set `NPM_TOKEN` in your shell");
  });
});
