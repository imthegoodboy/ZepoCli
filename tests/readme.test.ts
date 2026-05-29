import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

describe("README package guidance", () => {
  const readme = readFileSync(resolve(import.meta.dirname, "..", "README.md"), "utf8");

  it("documents package installation and browser setup", () => {
    expect(readme).toContain("npm install -g zepocli");
    expect(readme).toContain("npx playwright install chromium");
    expect(readme).toContain("zepo doctor");
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
    expect(readme).toContain("`zepo doctor --json` also includes `dataDir`, `browserAutomation`, `browserLock`, `headlessBrowserThrottle`, and `accessChallenge`");
    expect(readme).toContain("raw Zepto page text");
    expect(readme).toContain("internal automation IDs");
    expect(readme).toContain("Use ZepoCli only where permitted by Zepto and applicable law");
    expect(readme).toContain("https://www.zepto.com/s/terms-of-service");
    expect(readme).toContain("restrict access through non-Zepto interfaces or automatic devices");
    expect(readme).toContain("403/429-style block pages");
    expect(readme).toContain("access protection");
    expect(readme).toContain(
      "Checkout handoff controls are rejected if any visible or accessible label contains payment-method, final-payment, or final-order text"
    );
    expect(readme).toContain("Search uses visible, enabled, editable search inputs or explicit search controls");
    expect(readme).toContain("Search, account/login, order-history, and reorder controls are rejected when any visible or accessible label points at an unrelated navigation");
    expect(readme).toContain("visible, enabled address controls");
    expect(readme).toContain("location-consent, final address-confirmation, or payment-method/payment surfaces");
    expect(readme).toContain("unrelated navigation, cart, address, checkout, payment-method/payment, order, phone/OTP, or verification actions");
    expect(readme).toContain("payment-method/payment, coupon, or order actions");
    expect(readme).toContain("checkout, payment-method/payment, or final-order action");
    expect(readme).toContain("Cart navigation controls are rejected if any visible or accessible label contains checkout, proceed, payment-method/payment, bill, or final order text");
    expect(readme).toContain(
      'Empty-history marketing copy such as groceries "delivered in minutes" or snacks "arriving in 8 mins" is ignored'
    );
    expect(readme).toContain("no-id history rows need stronger evidence than a bare status word");
    expect(readme).toContain("Order-history navigation clicks only visible, enabled, explicit orders/history controls");
    expect(readme).toContain("unrelated cart, account, address, checkout, payment-method/payment, tracking, reorder, or final-order actions are rejected");
    expect(readme).toContain("visible, enabled, explicit reorder/order-again/repeat-order control");
    expect(readme).toContain("legacy `zeptonow.com` responses");
    expect(readme).toContain("Session auth checks recognize both `zepto.com` and legacy `zeptonow.com` storage");
    expect(readme).toContain("It does not target bare numeric inputs so OTP entry remains fully Zepto-controlled.");
    expect(readme).toContain("unsafe phone-like payment/cart/address/search fields");
    expect(readme).toContain("visible, enabled account/profile/login controls");
    expect(readme).toContain("Search cache stores redacted query text only");
    expect(readme).toContain("raw cart/order page text is used in memory for parsing but is not saved to SQLite snapshots");
    expect(readme).toContain("It refuses to run while another ZepoCli browser command owns the current data directory lock");
    expect(readme).toContain("configured data directory is blank");
    expect(readme).toContain('"code": "no_confirmed_session"');
    expect(readme).toContain('error.code: "unexpected_error"');
    expect(readme).toContain('paymentStatus: "not_observed_by_zepocli"');
    expect(readme).toContain('orderPlacement: "not_confirmed_by_zepocli"');
    expect(readme).toContain("npm run verify:live -- --data-dir ./.zepo-live");
    expect(readme).toContain("live-verification-report.json");
    expect(readme).toContain(
      "omits raw Zepto page text, addresses, cart item names, payment credentials, order ids, phone input, local filesystem paths, and unredacted workflow query arguments"
    );
    expect(readme).toContain("Stored report command strings redact search, add, remove, and address-use query text");
    expect(readme).toContain("not part of `npm run check` or CI");
  });
});
