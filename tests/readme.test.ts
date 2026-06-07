import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

describe("README and usage documentation", () => {
  const rootDir = resolve(import.meta.dirname, "..");
  const readme = readFileSync(resolve(rootDir, "README.md"), "utf8");
  const usageGuide = readFileSync(resolve(rootDir, "docs", "USAGE.md"), "utf8");

  it("keeps the README concise and product-focused", () => {
    expect(readme.length).toBeLessThan(12_000);
    expect(readme).toContain("# ZepoCli");
    expect(readme).toContain("A terminal-first developer CLI for user-directed Zepto workflows.");
    expect(readme).toContain("https://upload.wikimedia.org/wikipedia/commons/8/81/Zepto_Logo.svg");
    expect(readme).toContain("ZepoCli is an independent developer tool and is not affiliated with Zepto.");
    expect(readme).toContain("Full usage guide: [docs/USAGE.md](docs/USAGE.md)");
  });

  it("documents install, quick start, and the core command surface in README", () => {
    for (const text of [
      "Requires Node.js 20.19 or newer.",
      "npm install -g zepocli",
      "npx playwright install chromium",
      "zepo doctor",
      "zepo --visible login",
      "zepo status --live",
      "zepo search milk",
      'zepo add "Amul Milk 500ml"',
      "zepo cart",
      "zepo --visible checkout",
      "zepo track",
      "zepo address list",
      "zepo address use <query>",
      "zepo --visible address add",
      "zepo history",
      "zepo reorder last",
      "zepo completion bash\\|zsh\\|fish\\|powershell"
    ]) {
      expect(readme).toContain(text);
    }
  });

  it("keeps checkout and payment boundaries visible in README", () => {
    for (const text of [
      "ZepoCli does not process payments and does not click final payment/order controls.",
      "zepo --visible checkout --qr",
      "zepo --visible checkout --qr-file checkout-link.png",
      "https://www.zepto.com/?cart=open",
      "It must be opened in the user's Zepto session.",
      "It is not Zepto's live UPI QR, not a payment credential, not payment proof, and not order proof.",
      "Never put npm tokens in the app, README, docs, tests, `.npmrc`, or committed config."
    ]) {
      expect(readme).toContain(text);
    }
  });

  it("keeps the full human and agent runbook in docs/USAGE.md", () => {
    for (const text of [
      "ZepoCli uses the user's Zepto session and Zepto website state.",
      "npm install -g zepocli",
      "zepo --visible login --phone 9876543210",
      "zepo search milk --json",
      'zepo add "protein bars" --choose --json',
      "zepo cart --json",
      "zepo address list --json",
      "zepo address use home --json",
      "zepo --visible checkout --json --wait",
      "zepo --visible checkout --qr-file checkout-link.png",
      "checkout_manual_action_required",
      "automationBoundary",
      "zepocli_did_not_click_payment_or_order_controls",
      "paymentLinkSession",
      "user_zepto_session_required",
      "zepo track --json",
      "zepo history --json",
      "zepo reorder last --json",
      "Agent rules:",
      "Branch on `error.code`, not human error text.",
      "Do not scrape, save, crop, or terminal-render Zepto's live UPI QR.",
      "npm-token-shaped values"
    ]) {
      expect(usageGuide).toContain(text);
    }
  });
});
