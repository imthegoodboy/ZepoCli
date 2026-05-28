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
    expect(readme).toContain("the CLI attempts to force-close the owning browser before releasing the lock");
    expect(readme).toContain("the next browser command can recover dead-owner or expired locks automatically");
    expect(readme).toContain("Do not parallelize multiple data directories to bypass pacing or throttle signals");
    expect(readme).toContain("`zepo doctor --json` also includes `dataDir`, `browserAutomation`, `browserLock`, `headlessBrowserThrottle`, and `accessChallenge`");
    expect(readme).toContain("raw Zepto page text");
    expect(readme).toContain("internal automation IDs");
    expect(readme).toContain("Use ZepoCli only where permitted by Zepto and applicable law");
    expect(readme).toContain("https://www.zepto.com/s/terms-of-service");
    expect(readme).toContain("restrict access through non-Zepto interfaces or automatic devices");
    expect(readme).toContain("403/429-style block pages");
    expect(readme).toContain("access protection");
    expect(readme).toContain("Checkout handoff controls are rejected if any visible or accessible label contains final-payment or final-order text");
    expect(readme).toContain("Search uses visible, enabled, editable search inputs or explicit search controls");
    expect(readme).toContain("Search, account, order-history, and reorder controls are rejected when any visible or accessible label points at an unrelated navigation");
    expect(readme).toContain("visible, enabled address controls");
    expect(readme).toContain("Cart navigation controls are rejected if any visible or accessible label contains checkout, proceed, payment, bill, or final order text");
    expect(readme).toContain("visible, enabled, explicit reorder/order-again/repeat-order control");
    expect(readme).toContain("legacy `zeptonow.com` responses");
    expect(readme).toContain("Session auth checks recognize both `zepto.com` and legacy `zeptonow.com` storage");
    expect(readme).toContain("It does not target bare numeric inputs so OTP entry remains fully Zepto-controlled.");
    expect(readme).toContain("visible, enabled account/profile/login controls");
    expect(readme).toContain("raw cart/order page text is used in memory for parsing but is not saved to SQLite snapshots");
    expect(readme).toContain("It refuses to run while another ZepoCli browser command owns the current data directory lock");
    expect(readme).toContain("configured data directory is blank");
    expect(readme).toContain('"code": "no_confirmed_session"');
    expect(readme).toContain('error.code: "unexpected_error"');
    expect(readme).toContain('paymentStatus: "not_observed_by_zepocli"');
    expect(readme).toContain('orderPlacement: "not_confirmed_by_zepocli"');
  });
});
