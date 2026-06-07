# ZepoCli Usage Guide

This guide is for humans and agents using `zepo` as a developer CLI for user-directed Zepto workflows.

ZepoCli uses the user's Zepto session and Zepto website state. It does not run autonomous shopping, does not bypass Zepto protections, and does not process payment. Payment stays inside Zepto.

## Install

Requires Node.js 20.19 or newer.

```bash
npm install -g zepocli
npx playwright install chromium
zepo doctor
```

If browser checks fail, run:

```bash
npx playwright install chromium
zepo doctor
```

Use a dedicated data directory when an agent or script owns a workflow:

```bash
zepo --data-dir ./.zepo-agent doctor
```

## Login

Login is a human-controlled flow and requires a visible browser.

```bash
zepo --visible login
```

Optional phone prefill:

```bash
zepo --visible login --phone 9876543210
```

The user completes OTP or Zepto-controlled verification inside the visible Zepto browser. ZepoCli saves the confirmed browser session locally after the login completes. It does not ask for or store OTPs.

Check session state:

```bash
zepo status
zepo status --live
zepo status --json
zepo status --live --json
```

For scripts and agents, inspect `confirmedSession` and `liveSession.state` before account workflows.

## Search

Search runs in background/headless mode by default.

```bash
zepo search milk
zepo search "protein bars"
zepo search milk --limit 10
zepo search milk --json
```

If Zepto requires login, delivery location, or visible verification, the command fails with a specific error code instead of returning fake data.

## Add Products

Add the best matching product:

```bash
zepo add "Amul Milk 500ml"
```

Add quantity:

```bash
zepo add "Amul Milk 500ml" --quantity 2
```

Let the user choose from search results:

```bash
zepo add "protein bars" --choose
```

If Zepto shows an item-limit warning and the user wants the CLI to click Zepto's visible `Remove Items` action before rereading the cart:

```bash
zepo add "milk" --remove-limit-items
```

Agents should use JSON:

```bash
zepo add "milk" --json
zepo add "protein bars" --choose --json
```

The add command verifies the cart after clicking Add. It does not report success from a button click alone.

## Cart

Show cart:

```bash
zepo cart
zepo cart --json
```

Handle item-limit warnings before reading cart:

```bash
zepo cart --remove-limit-items
```

Remove a matching item:

```bash
zepo remove chips
zepo remove chips --json
```

Clear detected cart items:

```bash
zepo clear
zepo clear --json
```

For a non-empty cart, human output includes:

```txt
Checkout: zepo --visible checkout
Payment link: https://www.zepto.com/?cart=open
Open in the user's Zepto session; Zepto handles payment.
```

For `zepo cart --json`, use:

- `checkout.command` to start the visible checkout handoff.
- `checkout.waitCommand` when a human wants the browser to stay open until Enter.
- `checkout.paymentLink` as the Zepto-owned checkout link.
- `checkout.paymentLinkSession` to confirm the link must be opened in the user's Zepto session.

The cart checkout metadata is not payment proof or order proof.

Safe checkout-link QR from the cart command:

```bash
zepo cart --qr
zepo cart --qr-file checkout-link.png
zepo cart --json --qr
```

`zepo cart --qr` reads the cart first. If the cart is non-empty, it prints or saves a QR for `https://www.zepto.com/?cart=open`. The QR opens Zepto checkout in the user's Zepto session; it is not a live UPI QR.

## Addresses

List saved addresses:

```bash
zepo address list
zepo address list --json
```

Use a saved address by visible label or address text:

```bash
zepo address use home
zepo address use "study home"
zepo address use home --json
```

Add address is a human-controlled visible flow:

```bash
zepo --visible address add
```

ZepoCli opens the Zepto address UI and avoids location-consent, payment, cart, order, support, invoice, refund, cancel, and rating/review controls.

## Checkout And Payment

Checkout is a Zepto-owned handoff and requires a visible browser:

```bash
zepo --visible checkout
```

Machine-readable handoff:

```bash
zepo --visible checkout --json
```

Keep the visible browser open for a human Zepto-side continuation:

```bash
zepo --visible checkout --wait
zepo --visible checkout --json --wait
```

If Zepto shows item-limit warnings and the user wants the CLI to click Zepto's visible `Remove Items` action before checkout:

```bash
zepo --visible checkout --remove-limit-items
```

Safe checkout-link QR:

```bash
zepo cart --qr
zepo cart --qr-file checkout-link.png
zepo --visible checkout --qr
zepo --visible checkout --qr-file checkout-link.png
```

The QR payload is only:

```txt
https://www.zepto.com/?cart=open
```

It opens Zepto checkout in the user's Zepto session. It is not Zepto's live UPI QR, not a payment credential, not payment proof, and not order proof.

ZepoCli does not click amount-bearing final payment or order-placement controls such as `Click to Pay`, `Pay Now`, `Place Order`, or equivalent controls. If Zepto exposes only a manual amount-bearing payment control, JSON checkout returns:

```json
{
  "status": "checkout_manual_action_required",
  "humanActionRequired": true,
  "automationBoundary": "zepocli_did_not_click_payment_or_order_controls",
  "paymentLink": "https://www.zepto.com/?cart=open",
  "paymentLinkSession": "user_zepto_session_required",
  "paymentStatus": "not_observed_by_zepocli",
  "orderPlacement": "not_confirmed_by_zepocli"
}
```

The user finishes payment inside Zepto. After payment/order completion, run:

```bash
zepo track
zepo track --json
```

## Orders

Latest order:

```bash
zepo track
zepo track --json
```

Order history:

```bash
zepo history
zepo history --json
```

Reorder the latest order and verify the resulting cart:

```bash
zepo reorder last
zepo reorder last --json
```

## Agent Workflow

Use JSON and explicit state checks:

```bash
zepo --data-dir ./.zepo-agent doctor --json
zepo --data-dir ./.zepo-agent status --live --json
zepo --data-dir ./.zepo-agent search milk --json
zepo --data-dir ./.zepo-agent add "milk" --json
zepo --data-dir ./.zepo-agent cart --json
zepo --data-dir ./.zepo-agent --visible checkout --json
zepo --data-dir ./.zepo-agent track --json
```

Agent rules:

- Treat non-zero exit codes as failure even when stderr contains JSON.
- Branch on `error.code`, not human error text.
- Use `--no-input` for unattended checks that must fail instead of prompting.
- Do not run concurrent browser commands against the same `--data-dir`.
- Do not retry headless commands through Zepto access challenges or cooldowns.
- Use `--visible` only for human-controlled login, address-add, checkout, and Zepto verification.
- Do not ask for OTPs, card numbers, CVV, UPI PIN, payment handles, or payment tokens.
- Do not scrape, save, crop, or terminal-render Zepto's live UPI QR.

Important error codes include:

```txt
no_confirmed_session
visible_browser_required
interactive_input_required
invalid_input
headless_browser_throttle
zepto_access_cooldown
zepto_access_challenge
delivery_location_required
cart_unreadable
cart_limit_exceeded
checkout_handoff_unverified
orders_unreadable
zepto_login_required
```

## Shell Completion

```bash
zepo completion bash
zepo completion zsh
zepo completion fish
zepo completion powershell
```

Completion generation does not start runtime storage or browser automation.

## Live Verification

Live verification is manual and opt-in because it uses a real Zepto account and may mutate cart state.

```bash
npm --silent run verify:live -- --data-dir ./.zepo-live --login --production-scope --search milk --address home --add "milk"
npm --silent run verify:live:report -- --require-production-scope --max-age-minutes 1440 ./.zepo-live/live-verification-report.json
```

Live reports are sanitized and omit raw page text, addresses, cart item names, payment credentials, order IDs, phone input, local filesystem paths, and npm-token-shaped values.

## Publish Notes

For maintainers:

```bash
npm run check
npm publish --access public
```

Never put npm tokens in the app, README, docs, tests, `.npmrc`, or committed config. Use `NPM_TOKEN` or `NODE_AUTH_TOKEN` only as a temporary environment variable for publish commands.
