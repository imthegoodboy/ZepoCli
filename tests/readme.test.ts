import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

describe("README package guidance", () => {
  const readme = readFileSync(resolve(import.meta.dirname, "..", "README.md"), "utf8");

  it("documents package installation and browser setup", () => {
    expect(readme).toContain("Requires Node.js 20.19 or newer.");
    expect(readme).toContain("npm install -g zepocli");
    expect(readme).toContain("npx playwright install chromium");
    expect(readme).toContain("npm ci --include=prod --include=dev");
    expect(readme).toContain("zepo doctor");
  });

  it("documents the full production command surface", () => {
    for (const command of [
      "zepo --visible login",
      "zepo --visible login --phone 9876543210",
      "zepo logout",
      "zepo status",
      "zepo status --live",
      "zepo doctor",
      "zepo search milk",
      'zepo add "Amul Milk 500ml"',
      'zepo add "Amul Milk 500ml" --remove-limit-items',
      'zepo add "protein bars" --choose',
      "zepo cart",
      "zepo cart --remove-limit-items",
      "zepo remove chips",
      "zepo clear",
      "zepo address list",
      "zepo address use home",
      "zepo --visible address add",
      "zepo --visible checkout",
      "zepo --visible checkout --remove-limit-items",
      "zepo track",
      "zepo history",
      "zepo reorder last",
      "zepo completion bash",
      "zepo help search",
      "zepo help address"
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
    expect(readme).toContain("browserAutomation.modes.backgroundHeadless");
    expect(readme).toContain("browserAutomation.modes.visibleHumanControlled");
    expect(readme).toContain("browserAutomationMode.current");
    expect(readme).toContain("normal package runs should report `background_headless`");
    expect(readme).toContain("`zepo status --json` includes `version`, `browserAutomationMode.default`, `browserAutomationMode.current`, `browserAutomationMode.visibleRequested`");
    expect(readme).toContain("never show the browser unless `--visible` is explicitly used");
    expect(readme).toContain("Browser lock JSON includes the lock owner `pid`, `createdAt`, and `staleReason`");
    expect(readme).toContain("Browser commands register interrupt handlers so Ctrl+C/SIGTERM attempts to close the Playwright browser context");
    expect(readme).toContain("Browser context close is bounded and best-effort");
    expect(readme).toContain("if graceful context close fails or times out");
    expect(readme).toContain("the CLI attempts to force-close the owning browser before releasing the lock");
    expect(readme).toContain("the next browser command can recover dead-owner locks, plus old lock files that have no live owner PID");
    expect(readme).toContain("A lock with a still-running owner PID remains active even when it is old");
    expect(readme).toContain("Do not parallelize multiple data directories to bypass pacing or throttle signals");
    expect(readme).toContain("`zepo status --json` includes `version`");
    expect(readme).toContain("`--browser-locale <locale>` and `--browser-timezone <timezone>`");
    expect(readme).toContain("do not add a custom user agent");
    expect(readme).toContain("`zepo doctor --json` also includes `version`, `dataDir`, `browserAutomationMode`, `browserAutomation`, `browserLock`, `headlessBrowserThrottle`, and `accessChallenge`");
    expect(readme).toContain("Installed-package commands run browser automation in background/headless mode by default");
    expect(readme).toContain("Human-only login, address-add, and checkout handoffs fail with `visible_browser_required`");
    expect(readme).toContain("before session checks and before browser launch");
    expect(readme).toContain("Normal search/cart/address/order commands stay background/headless unless the user explicitly passes `--visible`");
    expect(readme).toContain("Generate shell completion scripts without starting runtime storage or browser automation");
    expect(readme).toContain("Completion is generated from the registered command tree");
    expect(readme).toContain("nested topics such as `zepo help address`");
    expect(readme).toContain("PowerShell completion also accepts `pwsh` and `ps1` as aliases for `powershell`");
    expect(readme).toContain("raw Zepto page text");
    expect(readme).toContain("internal automation IDs");
    expect(readme).toContain("Human spinner/status text, human error text, JSON error text, and JSON error object keys are redacted for sensitive-looking order-id, phone, OTP/PIN/CVV, payment-number, payment-handle");
    expect(readme).toContain("auth/session/token/password/secret URL parameters, and local-path values");
    expect(readme).toContain("auth/session/token/password/secret URL parameters");
    expect(readme).toContain("including URL/query-string encoded forms and standalone percent-encoded fragments of those values");
    expect(readme).toContain("npm-token-shaped values");
    expect(readme).toContain("Use ZepoCli only where permitted by Zepto and applicable law");
    expect(readme).toContain("https://www.zepto.com/s/terms-of-service");
    expect(readme).toContain("Terms of Use version 1.4");
    expect(readme).toContain("were checked on 2026-06-05");
    expect(readme).toContain("Last updated: 1 st November 2025");
    expect(readme).toContain("Privacy Notice version 1.1");
    expect(readme).toContain("https://staticweb.zepto.com/privacy-policy/");
    expect(readme).toContain("was checked on 2026-06-05");
    expect(readme).toContain("Last updated: 17th June 2025");
    expect(readme).toContain("passwords and payment instrument details as sensitive personal information");
    expect(readme).toContain("payment processing through payment gateways");
    expect(readme).toContain("avoid sharing login credentials, passwords, or OTPs");
    expect(readme).toContain("keeps debug capture disabled for Zepto browser pages that may use the persistent profile");
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
      "Checkout handoff controls are rejected if any visible or accessible label contains generic `continue`, bare `proceed`, payment-method, final-payment, final-order, support/help, invoice/receipt, refund/return/cancel, rating/review, `checkout and pay`, or amount-bearing pay text"
    );
    expect(readme).toContain("Those labels and disabled state are revalidated after any scroll into view before clicking.");
    expect(readme).toContain("Search uses visible, enabled, editable search inputs or explicit search controls");
    expect(readme).toContain("the CLI tries the direct search URL before returning only query-matched homepage fallback cards");
    expect(readme).toContain("Homepage fallback never overrides explicit search-page no-results");
    expect(readme).toContain("Zepto exposes as product-card control labels");
    expect(readme).toContain("account/login/OTP/location/address prompts");
    expect(readme).toContain("checkout/payment panels, cart/checkout service rows such as fees, charges, tips, discounts, donations, taxes, and GST, promo gift panels, offer/upsell panels, merchandising headings, membership rows, and image alt/accessibility text");
    expect(readme).toContain("not explicit product-add labels");
    expect(readme).toContain("product-specific accessible labels such as `Add <product> to cart`");
    expect(readme).toContain("Quantity-only labels such as `Add 2 to cart` are not product-specific ADD controls.");
    expect(readme).toContain("quantity-only add text such as `Add 2 items to cart`");
    expect(readme).toContain("`Item total`, `Items total`, `Subtotal`, and `Sub total` are not reported as final cart/order totals");
    expect(readme).toContain("Safe-click checks inspect visible text, `aria-label`, `title`, `placeholder`, `value`, `aria-description`, and referenced `aria-labelledby`/`aria-describedby` text");
    expect(readme).toContain("Search, account/login, cart-navigation, order-history, account-menu, and reorder controls are rejected when any visible or accessible label points at an unrelated navigation");
    expect(readme).toContain("Search/account/cart/order navigation labels and disabled state are revalidated after any scroll into view before clicking.");
    expect(readme).toContain("visible, enabled address controls");
    expect(readme).toContain("explicit select/change/set/choose delivery address or location labels");
    expect(readme).toContain("explicit add/enter delivery address or location labels");
    expect(readme).toContain("Address manager/add-address labels and disabled state are revalidated after any scroll into view before clicking.");
    expect(readme).toContain("Saved-address labels are derived from Zepto's visible saved-address row text");
    expect(readme).toContain("checkout/payment panels, cart/checkout service rows such as clear-cart actions, bill/order summaries, minimum-order-value copy, demand/rain fees, charges, taxes/GST, tips, discounts, donations, round-off rows, instructions, and policy rows, promo gift rows, offer/upsell rows, merchandising headings, and membership rows instead of counting those rows as active cart items");
    expect(readme).toContain("The tagged saved-address row is revalidated against Zepto's current visible row text before click, including after any scroll into view");
    expect(readme).toContain("rather than a hardcoded service-city allow-list");
    expect(readme).toContain(
      "location-consent, final address-confirmation, unrelated cart/checkout/order/bill/payment text, or payment-method/payment surfaces"
    );
    expect(readme).toContain(
      "Address automation also rejects support, invoice/receipt, refund/return/cancel-order, and rating/review order-action labels"
    );
    expect(readme).toContain(
      "account/order actions such as support, invoice/receipt, refund/return, cancellation, or rating/review"
    );
    expect(readme).toContain(
      "unrelated navigation, cart, address, checkout, payment-method/payment, order, phone/OTP, verification, support/help, invoice/receipt, refund/return/cancel, or rating/review actions"
    );
    expect(readme).toContain("payment-method/payment, coupon, or order actions");
    expect(readme).toContain(
      "checkout, payment-method/payment, final-order, support, invoice/receipt, refund/return/cancel, or rating/review action"
    );
    expect(readme).toContain(
      "Cart navigation controls are rejected if any visible or accessible label contains checkout, proceed, payment-method/payment, bill, final order text, support/help, invoice/receipt, refund/return/cancel, or rating/review order-action text, and cart navigation labels plus disabled state are revalidated after any scroll into view before clicking"
    );
    expect(readme).toContain("inactive saved/unavailable item actions");
    expect(readme).toContain("promotional/merchandising/payment/membership rows");
    expect(readme).toContain("Product listing `Add to Cart` copy is not cart-surface evidence");
    expect(readme).toContain("revalidated against the current cart row before click, including after any scroll into view");
    expect(readme).toContain("order actions such as order summary, tracking, reorder, cancellation, refund, support, invoice, receipt, or rating");
    expect(readme).toContain("Cart parsing skips delivery-address blocks with custom saved-address labels");
    expect(readme).toContain("Plain `zepo add`, plain `zepo cart`, and plain `zepo --visible checkout` do not resolve Zepto item-limit warnings");
    expect(readme).toContain("plain `zepo --visible checkout`");
    expect(readme).toContain("`zepo add --remove-limit-items`, `zepo cart --remove-limit-items`, or `zepo --visible checkout --remove-limit-items`");
    expect(readme).toContain("`zepo --visible checkout --remove-limit-items`");
    expect(readme).toContain("skips account/login/OTP/location/address prompts");
    expect(readme).toContain("inactive saved-for-later sections, unavailable item sections, checkout/payment panels, cart/checkout service rows such as clear-cart actions, bill/order summaries, minimum-order-value copy, demand/rain fees, charges, taxes/GST, tips, discounts, donations, round-off rows, instructions, and policy rows, promo gift rows, offer/upsell rows, merchandising headings, and membership rows");
    expect(readme).toContain("not a fixed address-label list or service-city allow-list");
    expect(readme).toContain(
      'Empty-history marketing copy such as groceries "delivered in minutes" or snacks "arriving in 8 mins" is ignored'
    );
    expect(readme).toContain("no-id history rows need stronger evidence than a bare status word");
    expect(readme).toContain(
      "No-id order rows with support, invoice/receipt, refund/return/cancel-action, rating/review, order-summary, bill-summary, or view-bill copy require explicit track/tracking context"
    );
    expect(readme).toContain("Order-history navigation clicks only visible, enabled, explicit orders/history controls");
    expect(readme).toContain(
      "unrelated cart, account, address, checkout, payment-method/payment, tracking, reorder, final-order, support, invoice/receipt, refund/return/cancel, or rating/review actions are rejected"
    );
    expect(readme).toContain("Order navigation also requires visible, enabled controls and revalidates labels plus disabled state after any scroll into view before clicking.");
    expect(readme).toContain("visible, enabled, explicit reorder/order-again/repeat-order control");
    expect(readme).toContain("whose readable order-card text matches the latest detected order, including after any scroll into view before clicking");
    expect(readme).toContain("rate, rating, review, track, cancel, payment-method/payment, checkout, or order summary");
    expect(readme).toContain("legacy `zeptonow.com` responses");
    expect(readme).toContain("Session auth checks recognize both `zepto.com` and legacy `zeptonow.com` storage");
    expect(readme).toContain(
      "Public product URLs are kept only for Zepto-owned HTTP(S) links, with query strings and hash fragments stripped; offsite or unsafe-scheme hrefs are omitted."
    );
    expect(readme).toContain(
      "Empty Zepto origin storage, empty auth-looking cookie/localStorage values, public preference/location cookies, CSRF/XSRF or anti-forgery tokens, and bare login/logged UI flags are not enough to confirm local auth, even when the key name contains words like `user`, `customer`, `profile`, `login`, or `logged`"
    );
    expect(readme).toContain("non-empty auth/session/token-like Zepto cookies or non-empty auth/session/token-like Zepto localStorage keys");
    expect(readme).toContain("It does not target bare numeric inputs so OTP entry remains fully Zepto-controlled.");
    expect(readme).toContain("unsafe phone-like payment/cart/address/search fields");
    expect(readme).toContain(
      "support/help, invoice/receipt, refund/return/cancel, or rating/review actions"
    );
    expect(readme).toContain(
      "support/help, invoice/receipt, refund/return/cancel, or rating/review controls"
    );
    expect(readme).toContain("`zepo --visible login` opens the account/login surface");
    expect(readme).toContain("visible, enabled account/profile/login controls");
    expect(readme).toContain(
      "Search cache stores diagnostic result counts with a fixed redacted query marker only; raw search text is not passed into SQLite writes"
    );
    expect(readme).toContain("Address cache rows use local cache markers instead of raw address labels or text.");
    expect(readme).toContain(
      "Cart cache rows use local item markers only and do not retain cart item names, units, prices, totals, or raw page text."
    );
    expect(readme).toContain(
      "Order cache rows use local cache IDs only and do not retain raw Zepto order IDs, status, ETA, totals, placed-at text, or raw page text."
    );
    expect(readme).toContain("No raw Zepto page HTML/screenshot artifacts for browser flows that may use the persistent profile");
    expect(readme).toContain(
      "Debug HTML/screenshot artifacts are disabled for Zepto browser flows that may use the persistent profile, including search, live session checks, login, cart, address, checkout, orders, and reorder"
    );
    expect(readme).toContain("raw Zepto page text and internal automation IDs are kept internal");
    expect(readme).toContain("Persistent log object keys/values, Error messages/stacks, and message strings are redacted with the same sensitive-looking order-id, phone, OTP/PIN/CVV, payment-number, payment-handle");
    expect(readme).toContain("auth/session/token/password/secret URL-parameter, and local-path rules");
    expect(readme).toContain("auth/session/token/password/secret URL-parameter");
    expect(readme).toContain("including URL/query-string encoded forms and standalone percent-encoded fragments of those values");
    expect(readme).toContain("They also redact npm-token-shaped values");
    expect(readme).toContain("It refuses to run while another ZepoCli browser command owns the current data directory lock");
    expect(readme).toContain("configured data directory is blank");
    expect(readme).toContain('"code": "no_confirmed_session"');
    expect(readme).toContain("visible_browser_required");
    expect(readme).toContain("browser profile writes, and headless browser run accounting");
    expect(readme).toContain('error.code: "unexpected_error"');
    expect(readme).toContain('paymentStatus: "not_observed_by_zepocli"');
    expect(readme).toContain('handoffUrl: "https://www.zepto.com/?cart=open"');
    expect(readme).toContain('handoffSurface: "visible_zepto_browser"');
    expect(readme).toContain("browserOpenAfterReturn: false");
    expect(readme).toContain("checkoutWaitCompleted");
    expect(readme).toContain("checkoutWaitCompleted: true");
    expect(readme).toContain('cartPrecondition: "non_empty_cart_verified"');
    expect(readme).toContain('orderPlacement: "not_confirmed_by_zepocli"');
    expect(readme).toContain("`humanActionRequired: true`");
    expect(readme).toContain('automationBoundary: "zepocli_did_not_click_payment_or_order_controls"');
    expect(readme).toContain('status: "checkout_manual_action_required"');
    expect(readme).toContain("JSON checkout returns handoff evidence immediately for agents instead of waiting for a prompt");
    expect(readme).toContain("Use `zepo --visible checkout --wait` or human text mode");
    expect(readme).toContain("explicit JSON wait mode (`zepo --visible checkout --json --wait`)");
    expect(readme).toContain("unless the caller explicitly passes `--wait`");
    expect(readme).toContain("Wait mode re-checks the visible page after the human presses Enter");
    expect(readme).toContain("wait mode observes the visible page again after Enter before returning JSON");
    expect(readme).toContain("manual amount-bearing payment control");
    expect(readme).toContain("must not be counted as checkout handoff coverage");
    expect(readme).toContain("manual checkout continuation use `live_verification_incomplete`");
    expect(readme).toContain("npm --silent run verify:live -- --data-dir ./.zepo-live");
    expect(readme).toContain(
      'npm --silent run verify:live -- --data-dir ./.zepo-live --login --production-scope --search milk --address home --add "Amul Milk 500ml"'
    );
    expect(readme).toContain(
      'npm --silent run verify:live -- --data-dir ./.zepo-live --login --production-scope --search milk --address home --add "Amul Milk 500ml" --add-remove-limit-items --cart-remove-limit-items --checkout-remove-limit-items'
    );
    expect(readme).toContain('npm --silent run verify:live -- --data-dir ./.zepo-live --login --add "protein bars" --choose-add --cart');
    expect(readme).toContain("live-verification-report.json");
    expect(readme).toContain("It starts with a mode-aware `zepo doctor --json` preflight, including the Playwright Chromium launch check");
    expect(readme).toContain("then a mode-aware local `zepo status --json`");
    expect(readme).toContain("Both preflight steps must report current-mode `browserAutomation.ready === true`");
    expect(readme).toContain("requested live account workflows pass `--visible`");
    expect(readme).toContain("doctor must also show a passing `Playwright Chromium` check");
    expect(readme).toContain(
      "counts of structural address-detail records, product records with readable name plus price or unit detail, readable cart records, and status/ETA-bearing order records"
    );
    expect(readme).toContain("normal `doctor --json` browser-launch checks");
    expect(readme).toContain("the same doctor checks");
    expect(readme).toContain(
      "Use `--production-scope` for the final readiness run; it requires `--search`, `--address`, and `--add`, then requests non-empty cart, checkout handoff, and track coverage with checkout wait enabled"
    );
    expect(readme).toContain(
      "The wait step lets a human complete Zepto-side checkout/payment before tracking and is required for accepted production-scope evidence"
    );
    expect(readme).toContain(
      "Use `--add-remove-limit-items` only when the visible Zepto add verification step shows item-limit warnings and the human explicitly wants the runner to click Zepto's `Remove Items` action before reading cart"
    );
    expect(readme).toContain(
      "Use `--cart-remove-limit-items` only when the visible Zepto cart evidence step shows item-limit warnings and the human explicitly wants the runner to click Zepto's `Remove Items` action before reading cart"
    );
    expect(readme).toContain(
      "Use `--checkout-remove-limit-items` only when the visible Zepto cart shows item-limit warnings and the human explicitly wants the runner to click Zepto's `Remove Items` action before checkout"
    );
    expect(readme).toContain(
      "If checkout remains at `checkout_manual_action_required`, production-scope verification stops before `track` because final readiness requires checkout handoff coverage before tracking"
    );
    expect(readme).toContain("run `--clear` as a separate cleanup pass because it cannot be combined with checkout verification");
    expect(readme).toContain(
      "Use `--browser-locale <locale>` and `--browser-timezone <timezone>` to pass the same validated browser context to every child `zepo` command"
    );
    expect(readme).toContain(
      "With no live workflow flags, a data directory that already has a confirmed local session stops after those local preflight checks instead of opening a visible `status --live`"
    );
    expect(readme).toContain("<redacted-browser-locale>");
    expect(readme).toContain("<redacted-browser-timezone>");
    expect(readme).toContain(
      "`--login` is conditional: if the dedicated data directory already has a confirmed session, the runner does not force a fresh login or claim login coverage; it requires `liveSession` coverage from `status --live` instead"
    );
    expect(readme).toContain(
      "top-level `requested`, `attempted`, `coverage`, and `missingCoverage` objects showing which workflow capabilities were requested, ran, actually passed, and remain requested-but-unverified"
    );
    expect(readme).toContain(
      "Manual precondition failures, such as a missing confirmed session, are reported as incomplete manual steps and are not counted as workflow attempts"
    );
    expect(readme).toContain("`checkoutHandoff`");
    expect(readme).toContain(
      "omits raw Zepto page text, addresses, cart item names, payment credentials, order ids, phone input, local filesystem paths, unredacted workflow query arguments, and standalone percent-encoded sensitive fragments"
    );
    expect(readme).toContain("standalone percent-encoded sensitive fragments");
    expect(readme).toContain("live-verification-report.json` with the package `version`");
    expect(readme).toContain(
      "Console command echoes, the final report-path line, and stored report command strings redact local data/report paths, browser locale/timezone values, phone input, search/add/remove/address-use query text, and npm-token-shaped values; stored step commands must also match the runner's redacted command shapes"
    );
    expect(readme).toContain("The examples use `npm --silent run verify:live -- ...`");
    expect(readme).toContain("interrupted with Ctrl+C/SIGTERM");
    expect(readme).toContain("writes the same sanitized partial report when possible");
    expect(readme).toContain("npm --silent run verify:live:report -- ./.zepo-live/live-verification-report.json");
    expect(readme).toContain(
      "npm --silent run verify:live:report -- --require-production-scope --max-age-minutes 1440 ./.zepo-live/live-verification-report.json"
    );
    expect(readme).toContain("`verify:live:report` does not contact Zepto or prove a fresh run happened");
    expect(readme).toContain("sanitized non-future `generatedAt` plus data/report path metadata");
    expect(readme).toContain("optional `--max-age-minutes` freshness");
    expect(readme).toContain("the fixed runner note");
    expect(readme).toContain("accepted report schema");
    expect(readme).toContain("complete boolean capability summaries");
    expect(readme).toContain("redacted step command contract");
    expect(readme).toContain("runner-defined manual/internal command markers only");
    expect(readme).toContain("checkout cart precondition");
    expect(readme).toContain("`ok` reports containing only passing known workflow steps");
    expect(readme).toContain("unique workflow step names");
    expect(readme).toContain("runner workflow order");
    expect(readme).toContain("complete workflow step summaries");
    expect(readme).toContain("typed workflow step summaries");
    expect(readme).toContain("runner-known string and string-array workflow step summaries");
    expect(readme).toContain("internally consistent workflow step summaries");
    expect(readme).toContain("bounded numeric workflow step summaries");
    expect(readme).toContain("all passing workflow step summaries satisfy their known contracts");
    expect(readme).toContain("local status readiness");
    expect(readme).toContain("login session evidence");
    expect(readme).toContain("consistent step `exitCode`/`ok`/`summary`/`error` fields");
    expect(readme).toContain("stable failure error objects");
    expect(readme).toContain("Use `--require-production-scope` with `--max-age-minutes 1440` for the final readiness gate");
    expect(readme).toContain(
      "For every checkout step, `checkoutWaitCompleted` in `summary` or `manualEvidence` must match whether the stored redacted checkout command includes `--wait`"
    );
    expect(readme).toContain(
      "an immediate checkout command cannot claim wait completion, and a wait-mode command cannot omit it"
    );
    expect(readme).toContain("checkout wait evidence from both the sanitized `--wait` command string and `checkoutWaitCompleted: true`");
    expect(readme).toContain(
      "browser preflight, local status, live session, address selection, search, add, a non-empty cart, checkout handoff, and track to be explicitly requested and covered, with checkout wait evidence"
    );
    expect(readme).toContain(
      "without address-add, address-list, remove, clear, history, or reorder evidence mixed into the final report"
    );
    expect(readme).toContain("Production-scope acceptance rejects missing freshness windows and no-wait checkout evidence");
    expect(readme).toContain("`verify:live:report --max-age-minutes` also accepts the assignment form");
    expect(readme).toContain("--max-age-minutes=1440");
    expect(readme).toContain("stale saved reports or stale order-history tracking cannot be reused as current evidence");
    expect(readme).toContain(
      "browser preflight, local status, live session, address selection, search, add, a non-empty cart, checkout handoff, and track to be explicitly requested and covered"
    );
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
    expect(readme).toContain("npm run verify:publish-dry-run");
    expect(readme).toContain("git tag v0.1.0");
    expect(readme).toContain("git push origin v0.1.0");
    expect(readme).toContain("npm publish --provenance --access public");
    expect(readme).toContain("npm publish --dry-run --access public");
    expect(readme).toContain("NPM_TOKEN");
    expect(readme).toContain("It does not run `verify:live`");
    expect(readme).toContain("npm run verify:secrets");
    expect(readme).toContain("npm run verify:dependencies");
    expect(readme).toContain("declared runtime packages load and required dev-tool binaries are present");
    expect(readme).toContain("local npm config omitted dev dependencies");
    expect(readme).toContain("without printing the raw token");
    expect(readme).toContain("Never put npm tokens in the app, README, tests, or committed config.");
    expect(readme).toContain("GitHub Actions secret named `NPM_TOKEN`");
    expect(readme).toContain("copy `.npmrc.example` to ignored `.npmrc`");
    expect(readme).toContain("set `NPM_TOKEN` in your shell");
  });
});
