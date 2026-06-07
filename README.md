# ZepoCli

`zepo` is a terminal-first CLI for user-directed Zepto workflows. It uses Playwright to operate the Zepto website with the user's own browser session. Installed-package commands run browser automation in background/headless mode by default and never show the browser unless `--visible` is explicitly used. Human-only login, address-add, and checkout handoffs fail with `visible_browser_required` in background mode before session checks and before browser launch, so package users do not get a surprise browser window.

## Install

Requires Node.js 20.19 or newer.

From npm after publishing:

```bash
npm install -g zepocli
npx playwright install chromium
zepo doctor
```

From this repository:

```bash
npm ci --include=prod --include=dev
npm run build
npm link
npm run prepare:browsers
zepo doctor
```

## Commands

```bash
zepo --visible login
zepo --visible login --phone 9876543210
zepo logout
zepo status
zepo status --live
zepo doctor
zepo search milk
zepo add "Amul Milk 500ml"
zepo add "Amul Milk 500ml" --quantity 2
zepo add "Amul Milk 500ml" --remove-limit-items
zepo add "protein bars" --choose
zepo cart
zepo cart --remove-limit-items
zepo remove chips
zepo clear
zepo address list
zepo address use home
zepo --visible address add
zepo --visible checkout
zepo --visible checkout --remove-limit-items
zepo track
zepo history
zepo reorder last
zepo completion bash
zepo help search
zepo help address
```

Most commands that return workflow state or completion status support `--json` for scripts and agents. You can pass it globally before the command or on the command itself:

```bash
zepo --json status
zepo status --live --json
zepo --visible login --json
zepo logout --json
zepo search milk --json
zepo add "Amul Milk 500ml" --json
zepo add "Amul Milk 500ml" --remove-limit-items --json
zepo add "protein bars" --choose --json
zepo cart --json
zepo cart --remove-limit-items --json
zepo remove chips --json
zepo clear --json
zepo address list --json
zepo address use home --json
zepo --visible checkout --json
zepo --visible checkout --remove-limit-items --json
zepo track --json
zepo history --json
zepo reorder last --json
```

When `--json` is requested and a command fails, errors are emitted as JSON on stderr:

```json
{
  "ok": false,
  "error": {
    "type": "user_error",
    "code": "no_confirmed_session",
    "message": "No confirmed Zepto session found.",
    "hint": "Run `zepo --visible login` first.",
    "exitCode": 1
  }
}
```

Interactive prompt UI is written to stderr so stdout stays reserved for command results and machine-readable JSON. Product, cart, remove, and order JSON output includes structured fields only; raw Zepto page text and internal automation IDs are kept internal and are not emitted for agents to scrape. Non-empty human `zepo cart` output prints `Checkout: zepo --visible checkout`, `Payment link: https://www.zepto.com/?cart=open`, and `Open in the user's Zepto session; Zepto handles payment.` after the cart total, while empty cart output does not show payment handoff guidance. Non-empty `zepo cart --json` output includes `checkout.command: "zepo --visible checkout"`, `checkout.waitCommand: "zepo --visible checkout --wait"`, `checkout.paymentLink: "https://www.zepto.com/?cart=open"`, and `checkout.paymentLinkSession: "user_zepto_session_required"` so agents can hand the user the Zepto-owned checkout/payment link or run the visible checkout handoff without guessing a `/cart` route; the checkout metadata also keeps `humanActionRequired: true`, `automationBoundary: "zepocli_did_not_click_payment_or_order_controls"`, `paymentStatus: "not_observed_by_zepocli"`, and `orderPlacement: "not_confirmed_by_zepocli"`. `zepo remove --json` returns `removedItems` with the readable cart rows actually clicked plus the resulting `cart`, so agents do not have to infer mutation success from a post-remove snapshot alone. Human spinner/status text, human error text, JSON error text, and JSON error object keys are redacted for sensitive-looking order-id, phone, OTP/PIN/CVV, payment-number, payment-handle, auth/session/token/password/secret URL parameters, and local-path values before printing, including URL/query-string encoded forms and standalone percent-encoded fragments of those values. Credential-like structured error/log keys such as authorization, cookie, token, password, OTP, phone, card, and UPI also cause their values to be replaced with stable redacted markers. They also redact npm-token-shaped values.

## First Run

Use a dedicated data directory when an agent or script owns the workflow:

```bash
zepo --data-dir ./.zepo-agent doctor
zepo --data-dir ./.zepo-agent --visible login
zepo --data-dir ./.zepo-agent status --live --json
```

Then run the explicit user workflow:

```bash
zepo --data-dir ./.zepo-agent search milk --json
zepo --data-dir ./.zepo-agent add "Amul Milk 500ml" --json
zepo --data-dir ./.zepo-agent cart --json
zepo --data-dir ./.zepo-agent --visible checkout --json
zepo --data-dir ./.zepo-agent track --json
```

`checkout` requires `--visible` and opens a visible Zepto browser page. Human text mode returns after the user presses Enter in the terminal; JSON mode returns structured handoff evidence immediately for agents and then the command closes its browser context. Use `zepo --visible checkout --wait` or human text mode when the browser must stay open for Zepto-side payment; wait mode prints `Payment link: https://www.zepto.com/?cart=open` and `Payment link session: user_zepto_session_required` to stderr before the prompt so agents can hand off the Zepto-owned session link even if the prompt later times out. Do not treat the CLI handoff as a paid or placed order. JSON checkout includes `humanActionRequired: true`, `automationBoundary: "zepocli_did_not_click_payment_or_order_controls"`, `handoffUrl: "https://www.zepto.com/?cart=open"`, `paymentHandoffUrl: "https://www.zepto.com/?cart=open"`, `paymentLink: "https://www.zepto.com/?cart=open"`, `paymentLinkSession: "user_zepto_session_required"`, `handoffSurface: "visible_zepto_browser"`, `browserOpenAfterReturn: false`, `checkoutWaitCompleted`, `manualPaymentControlVisible`, and, when available, sanitized `cartEvidence` with item count plus payable-total presence so automation can stop before payment/order controls while still giving the Zepto-owned payment/checkout link a user or agent can navigate to in the user's Zepto session, browser lifecycle, cart precondition, and whether explicit wait mode completed before returning. Plain checkout does not resolve Zepto item-limit warnings; use `zepo --visible checkout --remove-limit-items` only when you explicitly want ZepoCli to click Zepto's visible `Remove Items` action, handle repeated item-limit warnings in a bounded sequence, reread the live cart, and then continue checkout. If Zepto exposes only a cart-side amount-bearing control such as `Click to Pay ₹108`, `Pay ₹108`, `Continue to Pay ₹108`, or `Continue to Payment ₹108`, ZepoCli will not click it; JSON returns `status: "checkout_manual_action_required"` after the readable non-empty cart check so agents can detect the safe boundary. Live verification can accept that successful JSON step as checkout/payment-link handoff coverage when it preserves the fixed Zepto link/session markers, non-empty cart evidence, and payable-total evidence; failed or timed-out checkout reports may still preserve sanitized diagnostic `manualEvidence` with `humanActionRequired`, `automationBoundary`, `handoffUrl`, `paymentHandoffUrl`, `paymentLink`, `paymentLinkSession`, `handoffSurface`, `browserOpenAfterReturn`, `checkoutWaitCompleted`, `manualPaymentControlVisible`, `checkoutCartItemCount`, `checkoutHasPayableTotal`, cart precondition, payment status, and order-placement status so agents can see the safe cart/payment boundary without raw Zepto page text.

`zepo search --limit` accepts integers from 1 to 50. Invalid limits fail before browser automation starts.
`--timeout <ms>` accepts decimal integer milliseconds from 1000 to 300000. Invalid timeout values fail before runtime or browser automation starts and use stable `invalid_input` JSON issues for agents.
`--browser-locale <locale>` and `--browser-timezone <timezone>` control the Playwright browser context for Zepto automation. They default to `en-IN` and `Asia/Kolkata`, are validated before browser launch, and do not add a custom user agent.

Generate shell completion scripts without starting runtime storage or browser automation:

```bash
zepo completion bash
zepo completion zsh
zepo completion fish
zepo completion powershell
```

Completion is generated from the registered command tree, including built-in help topics such as `zepo help search` and nested topics such as `zepo help address`. PowerShell completion also accepts `pwsh` and `ps1` as aliases for `powershell`.

## Agent Runbook

1. Run `zepo status --json` or `zepo doctor --json` before account workflows.
2. If `confirmedSession` is false, ask a human to run `zepo --visible login` in a human-controlled terminal/browser.
3. Check `browserAutomationMode.current`; normal package runs should report `background_headless`, while `visible_human_controlled` means `--visible` was requested.
4. If `browserAutomation.ready` is false, wait for `browserAutomation.retryAfterMs`, wait for the active browser lock to clear, or rerun the next browser command with `--visible` when a human can complete Zepto-controlled verification. Use `browserAutomation.modes.backgroundHeadless` and `browserAutomation.modes.visibleHumanControlled` to distinguish headless-only cooldowns from locks that block every mode.
5. Use `--no-input` only for unattended checks that must fail instead of prompting.
6. Do not parallelize multiple data directories to bypass pacing or throttle signals.
7. Treat every non-zero exit as failure, even when stderr contains structured JSON.
8. After `zepo cart --json`, use `checkout.paymentLink` only as the Zepto-owned checkout/payment link for the user to open in the user's Zepto session (`checkout.paymentLinkSession: "user_zepto_session_required"`), or run `checkout.command` / `checkout.waitCommand`; do not treat it as payment proof or order proof.
9. After `zepo --visible checkout --json`, inspect `status`, `humanActionRequired`, `automationBoundary`, `handoffUrl`, `paymentHandoffUrl`, `paymentLink`, `paymentLinkSession`, `handoffSurface`, `browserOpenAfterReturn`, `checkoutWaitCompleted`, `cartPrecondition`, `manualPaymentControlVisible`, `cartEvidence`, `paymentStatus`, and `orderPlacement`. JSON checkout returns handoff evidence immediately for agents instead of waiting for a prompt; use human text mode (`zepo --visible checkout`) or explicit JSON wait mode (`zepo --visible checkout --json --wait`) when the browser must stay open for Zepto-side payment, then run `zepo track --json` only after payment is completed. Wait mode prints the fixed payment link and `user_zepto_session_required` session marker to stderr before the prompt. Wait mode re-checks the visible page after the human presses Enter, so a human-clicked manual continuation can still report `checkout_handoff_returned` if Zepto exposes a real checkout/payment handoff surface. `browserOpenAfterReturn: false` means the command does not leave its Playwright browser open after the JSON payload is returned. `checkoutWaitCompleted: true` means the command waited for the human-controlled Zepto continuation before returning; production-scope live reports do not require wait mode unless the human wants to continue in Zepto before JSON returns. `automationBoundary: "zepocli_did_not_click_payment_or_order_controls"` means agents must stop before payment/order controls. `paymentLink: "https://www.zepto.com/?cart=open"` is the Zepto-owned payment/checkout link the user or agent can open in the user's Zepto session; `paymentLinkSession: "user_zepto_session_required"` records that session requirement, and `paymentHandoffUrl` plus `handoffUrl` are the same fixed cart-open marker for compatibility and report validation. These are Zepto handoff targets, not payment-provider URLs, payment proof, or order proof. `manualPaymentControlVisible: true` means Zepto exposed an amount-bearing cart-side control that a human must handle. `cartEvidence` is sanitized count/boolean evidence only, not cart item names or payment proof. `status: "checkout_manual_action_required"` means Zepto showed only a manual payment control; it can count as checkout/payment-link handoff coverage when emitted as a successful JSON checkout step with fixed payment link/session markers and payable cart evidence, but it is still not payment proof or order-placement proof. Failed or timed-out reports may still include diagnostic sanitized `manualEvidence`.

JSON failures use a stable shape on stderr: `{ ok: false, error: { type, code, message, hint, exitCode, retryAfterMs } }`. Every JSON failure includes `error.code`; parser/validation failures use `error.code: "invalid_input"` and unexpected failures use `error.code: "unexpected_error"`. Agents should branch on `error.code` instead of parsing `message`. Important codes include `no_confirmed_session`, `visible_browser_required`, `interactive_input_required`, `invalid_input`, `runtime_setup_failed`, `headless_browser_throttle`, `zepto_access_cooldown`, `zepto_access_challenge`, `zepto_access_protection`, `delivery_location_required`, `cart_unreadable`, `cart_limit_exceeded`, `checkout_handoff_unverified`, `orders_unreadable`, `zepto_login_required`, and `unexpected_error`.

## How It Works

The CLI layers are deliberately simple:

```txt
CLI commands -> services -> Playwright automation -> Zepto website
```

Login requires `--visible`, opens Zepto in a visible browser, and stores the browser state locally only after the flow is completed or explicitly confirmed. Search, cart, address, order, and checkout commands reuse that state. Search uses visible, enabled, editable search inputs or explicit search controls and may fall back to real product cards visible on Zepto's public homepage when Zepto's search page is empty before a location is selected. If homepage search leaves ordinary homepage product cards on screen, the CLI tries the direct search URL before returning only query-matched homepage fallback cards. Homepage fallback never overrides explicit search-page no-results, delivery-location-required, or access-protection states. Search input discovery can use placeholder, title, description, and referenced accessible labels, but rejects mixed labels that point at address, phone/OTP, cart, payment-method/payment, coupon, or order actions. Safe-click checks inspect visible text, `aria-label`, `title`, `placeholder`, `value`, `aria-description`, and referenced `aria-labelledby`/`aria-describedby` text. Search, account/login, cart-navigation, order-history, account-menu, and reorder controls are rejected when any visible or accessible label points at an unrelated navigation, result-list, cart, address, checkout, payment-method/payment, final-order, support, invoice/receipt, refund/return/cancel, or rating/review action. Search/account/cart/order navigation labels and disabled state are revalidated after any scroll into view before clicking. Address manager/add-address controls use visible, enabled address controls only and reject mixed visible or accessible labels that point at location-consent, final address-confirmation, unrelated cart/checkout/order/bill/payment text, or payment-method/payment surfaces. Address manager navigation may open a current saved-address control only when its label contains structural address detail; label-only `Home`/`Work`/`Other` controls are not enough. Address automation also rejects support, invoice/receipt, refund/return/cancel-order, and rating/review order-action labels. Address manager/add-address labels and disabled state are revalidated after any scroll into view before clicking. Checkout never processes payment details; it first verifies Zepto exposes a readable non-empty cart, then verifies Zepto exposes checkout/payment handoff UI. Human text checkout keeps the visible browser open until the user presses Enter; JSON checkout returns structured handoff evidence immediately for agents unless the caller explicitly passes `--wait`, and wait mode observes the visible page again after Enter before returning JSON. Automation must not click `Place Order`, `Pay Now`, `Confirm Order`, or equivalent order-placement controls.
Checkout handoff controls are rejected if any visible or accessible label contains generic `continue`, bare `proceed`, payment-method, final-payment, final-order, support/help, invoice/receipt, refund/return/cancel, rating/review, `checkout and pay`, or amount-bearing pay text, even when another label looks like a safe checkout handoff. Those labels and disabled state are revalidated after any scroll into view before clicking. Checkout handoff verification requires explicit payment-selection or final checkout-page labels; payment method names or UPI promo copy on an ordinary cart page are not proof of handoff. If the only visible continuation is an amount-bearing manual payment control, the command returns `checkout_manual_action_required` instead of clicking it.
When an existing confirmed session is present, `zepo --visible login` snapshots the saved auth state and persistent browser profile before re-login. If the new login attempt fails or cannot be confirmed, the previous session data is restored.

Check local readiness before account-dependent commands:

```bash
zepo status
zepo status --json
zepo status --live
zepo status --live --json
zepo doctor
zepo doctor --json
```

`zepo status --json` includes `version`, `browserAutomationMode.default`, `browserAutomationMode.current`, `browserAutomationMode.visibleRequested`, `browserAutomation.ready`, `browserAutomation.reasons`, `browserAutomation.retryAfterMs`, and `browserAutomation.modes.backgroundHeadless` / `browserAutomation.modes.visibleHumanControlled`, plus local browser lock state, headless browser throttle state, recent Zepto access-challenge cooldown state, and cache counts for searches, cart snapshots, addresses, and orders. Browser lock JSON includes the lock owner `pid`, `createdAt`, and `staleReason` when available so agents can distinguish an active command from a dead-owner or expired stale lock. Those counts are diagnostics only; account-dependent commands still require a confirmed Zepto session and live browser automation. Normal search/cart/address/order commands stay background/headless unless the user explicitly passes `--visible`.
`zepo doctor --json` also includes `version`, `dataDir`, `browserAutomationMode`, `browserAutomation`, `browserLock`, `headlessBrowserThrottle`, and `accessChallenge` fields so agents can branch on readiness without scraping human check messages.
`zepo status --live` opens Zepto with the saved browser profile and checks whether the session still appears accepted. If Zepto clearly asks for login or OTP again, the CLI reports `liveSession.state: "login-required"` and demotes the local login marker so agents do not continue with stale session state. Logged-in account/profile text is trusted before login input evidence, and bare numeric fields alone are not treated as login proof, so a profile page that exposes a phone field is not demoted by that field alone. Ambiguous live checks are reported as `unknown` and should be resolved with `zepo status --live --visible` or `zepo --visible login`.
Account-dependent browser commands also demote the local login marker when a failed Zepto page clearly shows login or OTP prompts. The shared expired-session guard trusts explicit logged-in account/profile text before login input evidence, and ignores bare numeric fields plus unsafe phone-like payment/cart/address/search fields on ambiguous pages, so profile, payment, or cart pages with phone fields are not treated as expired sessions. This avoids repeated cart, checkout, address, or order commands against an expired session while preserving cached metadata for diagnostics.
`zepo doctor` checks Node.js, SQLite, Zepto session state, the browser automation lock, headless browser throttling, recent Zepto access-challenge cooldown state, Playwright Chromium, and writable runtime directories for auth state, browser profile data, logs, and diagnostics.
If browser launch fails, run `npm run prepare:browsers` or `npx playwright install chromium`, then rerun `zepo doctor`.

The CLI does not try to bypass Zepto protections. It runs one browser command at a time per data directory, paces browser automation between runs, keeps the headless burst budget deliberately small, stops on access challenges, rate-limit style pages, or suspicious empty Zepto responses, cools down headless automation after a challenge, and asks the user to resolve any Zepto-controlled verification in the visible browser. When a visible interactive run sees a verification page or a Zepto 403/429 navigation challenge with visible challenge text, it waits for the user to complete that Zepto-controlled check instead of trying to bypass it. Hidden Zepto API 403/429 responses without a visible verification surface still stop the command.

Zepto's official Terms of Use version 1.4 at https://www.zepto.com/s/terms-of-service were checked on 2026-06-05 and show "Last updated: 1 st November 2025". They describe Zepto as a marketplace for seller transactions in select serviceable areas, say payment methods and charges are displayed during the purchasing/checkout process, and explain that delivery ETA can vary or exceed the displayed estimate. They also describe Platform access as limited and revocable, say users must not impose excessive load, restrict access through non-Zepto interfaces or automatic devices, and allow Zepto to delay, cancel, reject, block, or suspend transactions/access for security, fair-use, or policy reasons. Use ZepoCli only where permitted by Zepto and applicable law. Do not use it for scraping, monitoring, resale, bulk ordering, bypassing protections, or forcing repeated headless retries.
Zepto's Terms also warn users not to share debit/credit card numbers, CVV, OTP, UPI/ATM PIN, or other sensitive information. ZepoCli must never ask for, store, log, print, or automate those values; all payment and verification entry stays in the visible Zepto browser.
Zepto's Privacy Notice version 1.1 at https://staticweb.zepto.com/privacy-policy/ was checked on 2026-06-05 and shows "Last updated: 17th June 2025". It treats passwords and payment instrument details as sensitive personal information, describes payment processing through payment gateways, and tells users to keep account information confidential and avoid sharing login credentials, passwords, or OTPs. ZepoCli therefore stores only the local browser session/profile state needed for user-directed workflows, never asks for payment or verification secrets, and keeps debug capture disabled for Zepto browser pages that may use the persistent profile.
ZepoCli treats both `zepto.com` and legacy `zeptonow.com` responses as Zepto platform surfaces for access-challenge detection.

## Data Storage

By default data is stored under the OS app data directory. Override it for agents, tests, or isolated runs:

```bash
zepo --data-dir ./.zepo --visible login
```

If the configured data directory is blank, cannot be created, or cannot be opened, the CLI fails before browser work starts. Use `zepo --data-dir <path> doctor` with a writable directory to diagnose local storage issues.

Browser automation is serialized per data directory because Chromium profile state is shared there. Browser commands register interrupt handlers so Ctrl+C/SIGTERM attempts to close the Playwright browser context and release the data-dir lock before exit. Browser context close is bounded and best-effort; if graceful context close fails or times out, the CLI attempts to force-close the owning browser before releasing the lock so a stuck close does not keep the CLI process alive indefinitely or strand the lock forever. If a command exits unexpectedly while holding the lock, `zepo doctor` reports the stale lock and the next browser command can recover dead-owner locks, plus old lock files that have no live owner PID. A lock with a still-running owner PID remains active even when it is old, so long visible login or checkout handoffs are not mistaken for stale state. Remove the lock manually only after confirming no browser command is still running. Use a separate `--data-dir` only when you intentionally need an independent session:

```bash
zepo --data-dir ./.zepo-agent-a search milk
zepo --data-dir ./.zepo-agent-b search bread
```

Use `--visible` when diagnosing Zepto rendering, location, blocking behavior, or starting a human-only login/address/checkout handoff:

```bash
zepo --visible search milk
zepo --visible login
zepo --visible address add
zepo --visible checkout
```

Agents should inspect `zepo status --json` or `zepo doctor --json` before retry loops. If `browserAutomation.ready` is false, branch on `browserAutomation.reasons`; wait for the reported `browserAutomation.retryAfterMs`, wait for an active browser lock to clear, or switch to a visible, human-controlled flow when Zepto verification must be completed. `browserAutomation.modes.backgroundHeadless.ready` can be false while `browserAutomation.modes.visibleHumanControlled.ready` remains true after a headless cooldown; that means a human-visible flow may be attempted, not that agents should loop headless commands. JSON errors for throttles, Zepto access challenges, access protection, and access cooldowns also include `error.retryAfterMs`. Do not loop headless commands to force Zepto pages to load.

Use `--no-input` for unattended scripts that must fail instead of waiting for a prompt:

```bash
zepo --no-input cart --json
zepo --no-input login --json
```

Interactive flows such as `login`, `address add`, `checkout`, and `add --choose` fail early with a structured error when `--no-input` is set. Human-only browser handoffs such as `login`, `address add`, and `checkout` also fail with `visible_browser_required` unless `--visible` is explicitly supplied; the visible-browser guard runs before session checks, browser launch, browser profile writes, and headless browser run accounting for those handoffs.
`zepo --visible login` opens the account/login surface through visible, enabled account/profile/login controls only, and rejects mixed labels that point at unrelated navigation, cart, address, checkout, payment-method/payment, order, phone/OTP, verification, support/help, invoice/receipt, refund/return/cancel, or rating/review actions. `zepo --visible login --phone` only pre-fills visible, enabled, editable phone/mobile/tel fields, including fields identified by placeholder, title, description, or referenced accessible labels. It rejects mixed labels that look like OTP, verification, payment-method/payment, address, cart, order, search, support/help, invoice/receipt, refund/return/cancel, or rating/review controls. It does not target bare numeric inputs so OTP entry remains fully Zepto-controlled.
Product ADD and quantity plus controls must be visible and enabled before automation clicks them. Tagged ADD/quantity controls must still match the selected product card immediately before click, including after any scroll into view that can trigger Zepto rerenders. Product ADD discovery/revalidation accepts referenced accessible labels and product-specific accessible labels such as `Add <product> to cart`, but rejects mixed unsafe labels such as `Added`, `Add more`, `Add coupon`, address/location, checkout, payment-method/payment, or support/help, invoice/receipt, refund/return/cancel, and rating/review order-action labels. Quantity-only labels such as `Add 2 to cart` are not product-specific ADD controls. Quantity plus controls also reject mixed unsafe labels such as decrease/remove, coupon, checkout, payment-method/payment, or order actions. Automated `zepo add --quantity` is capped at 12 and paced between quantity-control clicks so scripts do not hammer Zepto controls. Cart and order totals are reported only from explicit total/payable labels; `Item total`, `Items total`, `Subtotal`, and `Sub total` are not reported as final cart/order totals, and the CLI does not guess totals from arbitrary product, fee, discount, or badge prices.
Product extraction ignores text that Zepto exposes as product-card control labels, account/login/OTP/location/address prompts, checkout/payment panels, cart/checkout service rows such as fees, charges, tips, discounts, donations, taxes, and GST, promo gift panels, offer/upsell panels, merchandising headings, membership rows, and image alt/accessibility text when choosing product names, and ADD-control mapping rejects mixed controls whose labels are not explicit product-add labels. Public product URLs are kept only for Zepto-owned HTTP(S) links, with query strings and hash fragments stripped; offsite or unsafe-scheme hrefs are omitted. Product-specific `Add <product> to cart` labels count as explicit product-add labels only when they do not include unsafe workflow terms such as address, coupon, checkout, payment-method/payment, final-order text, support/help, invoice/receipt, refund/return/cancel, rating/review order-action text, or quantity-only add text such as `Add 2 items to cart`. This keeps unavailable or alternate-action controls from being treated as product names or safe ADD buttons without baking those labels into the parser.

Stored data includes:

- Playwright auth state
- Persistent Chromium browser profile data for Zepto session continuity
- SQLite metadata for sessions, search counts, cart snapshots, addresses, and order snapshots. Search cache stores diagnostic result counts with a fixed redacted query marker only; raw search text is not passed into SQLite writes. Address cache rows use local cache markers instead of raw address labels or text. Cart cache rows use local item markers only and do not retain cart item names, units, prices, totals, or raw page text. Order cache rows use local cache IDs only and do not retain raw Zepto order IDs, status, ETA, totals, placed-at text, or raw page text.
- Log file for debugging; Persistent log object keys/values, Error messages/stacks, and message strings are redacted with the same sensitive-looking order-id, phone, OTP/PIN/CVV, payment-number, payment-handle, auth/session/token/password/secret URL-parameter, and local-path rules used for terminal errors, including URL/query-string encoded forms and standalone percent-encoded fragments of those values. Credential-like structured keys such as authorization, cookie, token, password, OTP, phone, card, and UPI also redact their values. They also redact npm-token-shaped values.
- No raw Zepto page HTML/screenshot artifacts for browser flows that may use the persistent profile

Debug HTML/screenshot artifacts are disabled for Zepto browser flows that may use the persistent profile, including search, live session checks, login, cart, address, checkout, orders, and reorder, so OTP, address, cart, order, or payment-adjacent screens are not stored locally.

Unauthenticated search does not write Playwright auth state. Session state is saved by `zepo --visible login` and refreshed by account-dependent browser flows after a confirmed session exists. Empty Zepto origin storage, empty auth-looking cookie/localStorage values, public preference/location cookies, CSRF/XSRF or anti-forgery tokens, and bare login/logged UI flags are not enough to confirm local auth, even when the key name contains words like `user`, `customer`, `profile`, `login`, or `logged`; the saved state must include non-empty auth/session/token-like Zepto cookies or non-empty auth/session/token-like Zepto localStorage keys.
Session auth checks recognize both `zepto.com` and legacy `zeptonow.com` storage because Zepto platform sessions may surface through either domain.

`zepo logout` removes the saved Zepto session, clears the persistent browser profile, and deletes cached local user metadata such as searches, cart snapshots, addresses, and order snapshots. It refuses to run while another ZepoCli browser command owns the current data directory lock, so logout cannot delete profile files from under an active login, cart, checkout, address, or order flow.

## Safety Boundaries

- The CLI does not bypass login, OTP, payment, location, age checks, prescriptions, or delivery verification.
- The CLI does not use stealth automation or anti-detection bypasses.
- The CLI stops on Zepto verification, 403/429-style block pages, rate-limit text, browser checks, or suspicious empty pages instead of retrying aggressively.
- Use ZepoCli only where permitted by Zepto and applicable law; do not use it for scraping, monitoring, resale, bulk ordering, or load generation.
- The CLI does not store payment credentials.
- Address automation may open the add-address UI through visible, enabled address controls, including explicit select/change/set/choose delivery address or location labels, structurally detailed current saved-address controls, and explicit add/enter delivery address or location labels, but must not click current/device/precise-location sharing, browser location-access/GPS permission controls, cart/checkout/order/bill/payment controls, payment-method/payment controls, final address-confirmation controls, label-only saved-address controls such as `Home`/`Work`/`Other`, or account/order actions such as support, invoice/receipt, refund/return, cancellation, or rating/review. Address manager/add-address controls and saved-address extraction are rejected when visible or accessible copy contains location-consent, final address-confirmation, unrelated cart/checkout/order/bill/payment text, or payment-method/payment text. Address automation also rejects support, invoice/receipt, refund/return/cancel-order, and rating/review order-action labels. Address manager/add-address labels and disabled state are revalidated after any scroll into view before clicking.
- Saved-address labels are derived from Zepto's visible saved-address row text instead of a fixed `Home`/`Work`/`Other` list, and address detection uses structural address detail rather than a hardcoded service-city allow-list.
- `zepo address use` selects a saved address only when the best matching row is unique; if multiple saved addresses match, rerun with more visible address text such as street, building, or pincode. The tagged saved-address row is revalidated against Zepto's current visible row text before click, including after any scroll into view.
- User-visible checkout/payment remains inside Zepto and requires `--visible`.
- Checkout automation may open the checkout/payment handoff through enabled checkout controls, but must not click final order-placement or payment buttons. Payment method names or UPI/cart-promo copy alone must not be treated as proof that checkout handoff is already open.
- `zepo --visible checkout` is a handoff, not proof that an order was paid or placed. Its JSON output reports `humanActionRequired: true`, `automationBoundary: "zepocli_did_not_click_payment_or_order_controls"`, `handoffUrl: "https://www.zepto.com/?cart=open"`, `paymentHandoffUrl: "https://www.zepto.com/?cart=open"`, `paymentLink: "https://www.zepto.com/?cart=open"`, `paymentLinkSession: "user_zepto_session_required"`, `handoffSurface: "visible_zepto_browser"`, `browserOpenAfterReturn: false`, `checkoutWaitCompleted`, `cartPrecondition: "non_empty_cart_verified"`, `manualPaymentControlVisible`, and optional sanitized `cartEvidence` after the checkout command verifies a readable non-empty cart, keeps `paymentStatus: "not_observed_by_zepocli"` and `orderPlacement: "not_confirmed_by_zepocli"`, and includes `orderStatusCommand: "zepo track"`; use `paymentLink` when the user or agent needs a Zepto-owned payment/checkout link to navigate to in the user's Zepto session, use `zepo --visible checkout --wait` or human text checkout when a human needs the browser to remain open, then run `zepo track` after completing Zepto payment. `status: "checkout_manual_action_required"` is a safe fallback when Zepto exposes only a manual amount-bearing payment control such as `Click to Pay ₹108`, `Pay ₹108`, `Continue to Pay ₹108`, or `Continue to Payment ₹108`; it can count as checkout/payment-link handoff coverage only as a successful JSON checkout step with fixed payment link/session markers and payable cart evidence, and it remains neither payment proof nor order-placement proof.
- Cart navigation and cart remove/clear automation use visible, enabled cart controls only. Cart navigation controls are rejected if any visible or accessible label contains checkout, proceed, payment-method/payment, bill, final order text, support/help, invoice/receipt, refund/return/cancel, or rating/review order-action text, and cart navigation labels plus disabled state are revalidated after any scroll into view before clicking. Product listing `Add to Cart` copy is not cart-surface evidence. Tagged remove/decrease controls are rejected if any visible or accessible label points at coupon, address, checkout, payment-method/payment, inactive saved/unavailable item actions, promotional/merchandising/payment/membership rows, or order actions such as order summary, tracking, reorder, cancellation, refund, support, invoice, receipt, or rating; they are also revalidated against the current cart row before click, including after any scroll into view, and `zepo remove <query>` requires that row to still match the requested item. `zepo remove --json` includes detailed `removedItems` evidence from the revalidated rows before returning the resulting cart.
- Parsed product-like rows count as cart data only when Zepto also exposes cart-surface evidence such as cart, quantity, bill, total, or remove controls.
- Cart parsing skips delivery-address blocks with custom saved-address labels by using structural address detail, not a fixed address-label list or service-city allow-list. It also skips account/login/OTP/location/address prompts, inactive saved-for-later sections, unavailable item sections, checkout/payment panels, cart/checkout service rows such as clear-cart actions, bill/order summaries, minimum-order-value copy, demand/rain fees, charges, taxes/GST, tips, discounts, donations, round-off rows, instructions, and policy rows, promo gift rows, offer/upsell rows, merchandising headings, and membership rows instead of counting those rows as active cart items.
- `zepo cart` returns an empty cart only when Zepto shows explicit empty-cart copy without non-empty cart signals such as item counts, bill/total, checkout, quantity, or remove controls. If the cart page opens but items are unreadable, the CLI fails instead of treating the cart as empty. Plain `zepo add`, plain `zepo cart`, and plain `zepo --visible checkout` do not resolve Zepto item-limit warnings; use `zepo add --remove-limit-items`, `zepo cart --remove-limit-items`, or `zepo --visible checkout --remove-limit-items` only when you explicitly want ZepoCli to click Zepto's visible `Remove Items` action, handle repeated item-limit warnings in a bounded sequence, and reread the cart. `zepo add --remove-limit-items` applies only to the post-add cart verification read, and `zepo clear` may resolve the same warning because it is already an explicit request to remove cart contents.
- `zepo history` returns an empty list only when Zepto shows explicit empty-history copy without unreadable order signals such as reorder, order summary, track order, ETA, or status text. Empty-history marketing copy such as groceries "delivered in minutes" or snacks "arriving in 8 mins" is ignored, and no-id history rows need stronger evidence than a bare status word. No-id order rows with support, invoice/receipt, refund/return/cancel-action, rating/review, order-summary, bill-summary, or view-bill copy require explicit track/tracking context; otherwise they are treated as action/summary UI, not orders. If the orders page opens but order cards are unreadable, the CLI fails instead of treating history as empty.
- `zepo track` reports only a latest order with readable status or ETA. ETA text must be a real time value, not trailing UI action copy such as reorder, support, payment, or invoice labels. Implicit delivery/arriving time copy is treated as ETA only when the same order block exposes an active tracking status. If Zepto exposes only an order id or other incomplete tracking text, the CLI fails instead of presenting it as a tracked order.
- Order-history navigation clicks only visible, enabled, explicit orders/history controls; account/profile clicks may only open the menu before a separate orders/history click. Mixed labels for unrelated cart, account, address, checkout, payment-method/payment, tracking, reorder, final-order, support, invoice/receipt, refund/return/cancel, or rating/review actions are rejected.
- `zepo reorder last` clicks only a visible, enabled, explicit reorder/order-again/repeat-order control whose readable order-card text matches the latest detected order, including after any scroll into view before clicking. Mixed labels for unrelated order actions such as refund, return, support, invoice, receipt, rate, rating, review, track, cancel, payment-method/payment, checkout, or order summary are rejected. Order navigation also requires visible, enabled controls and revalidates labels plus disabled state after any scroll into view before clicking.
- If Zepto changes its website and automation cannot confidently complete a task, the command fails with a direct error instead of pretending success.

## Verification

```bash
npm run verify:secrets
npm run verify:dependencies
npm run check
npm run verify:cli
npm run verify:package
```

`npm run verify:secrets` scans tracked and unignored project text for npm-token-shaped values without printing the raw token. `npm run verify:dependencies` checks that declared runtime packages load and required dev-tool binaries are present, then tells you to run `npm ci --include=prod --include=dev` when local npm config omitted dev dependencies. `npm run check` runs those gates first, then builds, runs tests, verifies compiled CLI smoke behavior including the executable entry contract, runs both `doctor --skip-browser --json` and normal `doctor --json` browser-launch checks, installs the packed npm tarball into a disposable prefix, runs the installed `zepo` binary through the same doctor checks, checks `node dist/index.js --help`, runs `npm audit --omit=dev`, runs `npm pack --dry-run`, and runs `npm publish --dry-run --access public`.

## Release

Release publishing is tag-driven. Before creating a release tag, run the local gate and keep issue #1 open unless a fresh human-controlled `verify:live` report proves the Zepto account workflow in the current website UI.

```bash
npm run check
npm run verify:publish-dry-run
git tag v0.1.0
git push origin v0.1.0
```

The GitHub release workflow runs `npm ci`, installs Playwright Chromium, runs `npm run check`, then publishes the package with `npm publish --provenance --access public` using `NPM_TOKEN`. The local check includes `npm publish --dry-run --access public` so npm manifest/package issues are caught before a real tag publish. It does not run `verify:live`; that remains a manual human-account gate because it can require OTP, location, cart mutation, checkout handoff, and Zepto-side payment decisions.

Never put npm tokens in the app, README, tests, or committed config. Use a local environment variable for manual publishing, or store the token as the GitHub Actions secret named `NPM_TOKEN` for the release workflow.
For manual publishing, copy `.npmrc.example` to ignored `.npmrc` and set `NPM_TOKEN` in your shell; keep the token value out of the file.

For real human-account verification, use the opt-in live runner after building:

```bash
npm run build
npm --silent run verify:live -- --data-dir ./.zepo-live --login --production-scope --search milk --address home --add "Amul Milk 500ml"
npm --silent run verify:live -- --data-dir ./.zepo-live --login --production-scope --search milk --address home --add "Amul Milk 500ml" --add-remove-limit-items --cart-remove-limit-items --checkout-remove-limit-items
npm --silent run verify:live -- --data-dir ./.zepo-live --login --add "protein bars" --choose-add --cart
npm --silent run verify:live -- --data-dir ./.zepo-live --login --add "Amul Milk 500ml" --remove "Amul Milk" --cart
npm --silent run verify:live -- --data-dir ./.zepo-live --login --clear --cart
```

`verify:live` runs the compiled `zepo` commands with a dedicated data directory and visible browser handoffs where needed. It starts with a mode-aware `zepo doctor --json` preflight, including the Playwright Chromium launch check, then a mode-aware local `zepo status --json`; no-account/local smokes use background mode, while requested live account workflows pass `--visible` so a headless cooldown does not block human-controlled verification. Both preflight steps must report current-mode `browserAutomation.ready === true`, and doctor must also show a passing `Playwright Chromium` check, so browser locks, selected-mode cooldowns, and browser install failures are caught before account/cart/payment handoff steps. With no live workflow flags, a data directory that already has a confirmed local session stops after those local preflight checks instead of opening a visible `status --live`; no-session smoke still fails at the session precondition. Use `--production-scope` for the final readiness run; it requires `--search`, `--address`, and `--add`, then requests non-empty cart with total/payable evidence, safe checkout/payment-link handoff, and track coverage so the report lines up with `verify:live:report --require-production-scope --max-age-minutes 1440`. A successful `checkout_manual_action_required` checkout step can satisfy checkout handoff coverage when it preserves the fixed `paymentLink`, `paymentLinkSession`, human-action boundary markers, non-empty cart evidence, and payable-total evidence; it still is not payment proof or order-placement proof. Use `--checkout-wait` only when the human wants to continue inside Zepto before checkout JSON returns. Use `--add-remove-limit-items` only when the visible Zepto add verification step shows item-limit warnings and the human explicitly wants the runner to click Zepto's `Remove Items` action before reading cart. Use `--cart-remove-limit-items` only when the visible Zepto cart evidence step shows item-limit warnings and the human explicitly wants the runner to click Zepto's `Remove Items` action before reading cart. Use `--checkout-remove-limit-items` only when the visible Zepto cart shows item-limit warnings and the human explicitly wants the runner to click Zepto's `Remove Items` action before checkout. Add `--history` or `--reorder-last` when a human-controlled account has order history you want to verify; history live-report coverage requires at least one readable order record with status or ETA, so an empty `zepo history` result remains valid CLI output but not proof of order-history parsing. Use `--choose-add` with `--add` to exercise `zepo add --choose` when a human should pick the exact product from Zepto results. Use `--remove <query>` only when removing that item still leaves the cart suitable for checkout; focused remove coverage requires `removedItems` evidence with readable price or unit detail plus the resulting cart. Run `--clear` as a separate cleanup pass because it cannot be combined with checkout verification. Use `--browser-locale <locale>` and `--browser-timezone <timezone>` to pass the same validated browser context to every child `zepo` command in the live run; stored step commands redact those values as `<redacted-browser-locale>` and `<redacted-browser-timezone>`. Use `--step-timeout <ms>` only when a human-controlled Zepto step legitimately needs more than the default per-command timeout. `--login` is conditional: if the dedicated data directory already has a confirmed session, the runner does not force a fresh login or claim login coverage; it requires `liveSession` coverage from `status --live` instead. It writes a sanitized `live-verification-report.json` with the package `version`, step status, counts of structural address-detail records, product records with readable name plus price or unit detail, readable removed cart items, readable cart records, and status/ETA-bearing order records, stable error codes, and top-level `requested`, `attempted`, `coverage`, and `missingCoverage` objects showing which workflow capabilities were requested, ran, actually passed, and remain requested-but-unverified, such as `browserPreflight`, `login`, `liveSession`, `search`, `add`, `cart`, `checkoutHandoff`, `checkoutManualBoundary`, `track`, `history`, and `reorder`. Manual precondition failures, such as a missing confirmed session, are reported as incomplete manual steps and are not counted as workflow attempts. It omits raw Zepto page text, addresses, cart item names, payment credentials, order ids, phone input, local filesystem paths, unredacted workflow query arguments, and standalone percent-encoded sensitive fragments. Console command echoes, the final report-path line, and stored report command strings redact local data/report paths, browser locale/timezone values, phone input, search/add/remove/address-use query text, and npm-token-shaped values; stored step commands must also match the runner's redacted command shapes. It is not part of `npm run check` or CI because it requires a real human-controlled Zepto account, delivery context, cart choices, and optional Zepto-side payment/checkout decisions.
For final production-scope proof, ZepoCli only proves the CLI-safe handoff to Zepto's session-bound checkout/payment surface. If Zepto shows an amount-bearing cart/payment button, review the cart in Zepto and use the reported `paymentLink` in the user's Zepto session when a link handoff is needed. Any payment, OTP, PIN, age, prescription, or delivery-verification step stays inside Zepto's visible UI by the user. ZepoCli will not ask for those values, store them, or click final payment/order controls.
When `verify:live` reaches `checkout_manual_action_required`, the runner console prints the fixed `Payment link: https://www.zepto.com/?cart=open` plus `Payment link session: user_zepto_session_required` so the human/operator can open the Zepto-owned checkout/payment link in the user's Zepto session without reading the saved report first. That console guidance is not payment proof or order proof.
The examples use `npm --silent run verify:live -- ...` so npm does not echo raw invocation arguments before the runner can redact internal `zepo` command lines.
The live verifier accepts its value options as either `--option value` or `--option=value`; reports and console output still redact phone input, workflow query values, browser context values, local paths, and npm-token-shaped values.
If `verify:live` is interrupted with Ctrl+C/SIGTERM during a visible human handoff, it signals the active child command, writes the same sanitized partial report when possible, and keeps console paths redacted.
`verify:live --phone` accepts the same 10-digit, `+91`, or leading-0 Indian mobile formats as `zepo login --phone`, normalizes the value before invoking the CLI, and still redacts phone input from the live report.
After a human-controlled live run, validate the report before treating it as proof:

```bash
npm --silent run verify:live:report -- ./.zepo-live/live-verification-report.json
npm --silent run verify:live:report -- --require-production-scope --max-age-minutes 1440 ./.zepo-live/live-verification-report.json
```

`verify:live:report` does not contact Zepto or prove a fresh run happened. It checks the saved report contract: package version, `ok`, sanitized non-future `generatedAt` plus data/report path metadata, optional `--max-age-minutes` freshness, the fixed runner note, accepted report schema, complete boolean capability summaries, redacted step command contract, runner-defined manual/internal command markers only, consistent step `exitCode`/`ok`/`summary`/`error` fields, stable failure error objects with bounded retry timing, `ok` reports containing only passing known workflow steps, unique workflow step names, runner workflow order, complete workflow step summaries, typed workflow step summaries, runner-known string and string-array workflow step summaries, internally consistent workflow step summaries, bounded numeric workflow step summaries, all passing workflow step summaries satisfy their known contracts, `attempted`/`coverage` consistency with `steps`, sensitive-looking key/value redaction, requested coverage, `missingCoverage`, visible `doctor`/`status` preflight commands when `liveSession` is requested, and required step summaries for browser preflight, local status readiness including `liveSessionState`, login session evidence, live session, checkout handoff, checkout manual-boundary diagnostics, checkout cart precondition, checkout manual-payment-control state, sanitized checkout cart count/payable-total evidence, and requested workflows. For every checkout step, `checkoutWaitCompleted` in `summary` or `manualEvidence` must match whether the stored redacted checkout command includes `--wait`; an immediate checkout command cannot claim wait completion, and a wait-mode command cannot omit it. `coverage.checkoutManualBoundary: true` is accepted only from valid sanitized manual checkout evidence and remains diagnostic on incomplete reports; a successful `checkout_manual_action_required` summary can satisfy `coverage.checkoutHandoff` as payment-link handoff evidence without proving payment or order placement. Use `--require-production-scope` with `--max-age-minutes 1440` for the final readiness gate; it additionally requires browser preflight, local status, live session, address selection, search, add, a non-empty cart with total/payable evidence, checkout/payment-link handoff, and track to be explicitly requested and covered, without address-add, address-list, remove, clear, history, or reorder evidence mixed into the final report. Production-scope acceptance rejects missing freshness windows and cart evidence without totals so stale saved reports or stale order-history tracking cannot be reused as current evidence.
`verify:live:report --max-age-minutes` also accepts the assignment form, for example `--max-age-minutes=1440`, and keeps invalid values out of diagnostics.

Live report failures use stable `error.code` values. Contract failures use `live_doctor_contract_mismatch`, `live_login_contract_mismatch`, `live_status_contract_mismatch`, `live_checkout_contract_mismatch`, `live_track_contract_mismatch`, `live_search_contract_mismatch`, `live_add_contract_mismatch`, `live_cart_contract_mismatch`, `live_clear_contract_mismatch`, `live_address_contract_mismatch`, `live_history_contract_mismatch`, and `live_reorder_contract_mismatch`. Manual precondition failures and manual checkout continuation use `live_verification_incomplete`. Runner/reporting failures use `live_runner_failed`, `live_command_launch_failed`, `live_command_timeout`, `live_summary_failed`, `live_json_unreadable`, `live_json_unexpected`, or `command_failed`. A checkout `--wait` timeout report keeps the fixed `Payment link: https://www.zepto.com/?cart=open` and `Payment link session: user_zepto_session_required` in `error.hint` for handoff recovery. If the timed-out checkout child had already printed ZepoCli's fixed human-only cart payment-control warning, the hint may also say Zepto exposed that manual control before timeout; this remains recovery guidance only and still leaves checkout and track coverage missing.
