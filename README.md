# ZepoCli

`zepo` is a terminal-first CLI for user-directed Zepto workflows. It uses Playwright to operate the Zepto website with the user's own browser session and hands payment back to Zepto in a visible browser.

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
npm install
npm run build
npm link
npm run prepare:browsers
zepo doctor
```

## Commands

```bash
zepo login
zepo login --phone 9876543210
zepo logout
zepo status
zepo status --live
zepo doctor
zepo search milk
zepo add "Amul Milk 500ml"
zepo add "Amul Milk 500ml" --quantity 2
zepo add "protein bars" --choose
zepo cart
zepo remove chips
zepo clear
zepo address list
zepo address use home
zepo address add
zepo checkout
zepo track
zepo history
zepo reorder last
```

Most commands that return workflow state or completion status support `--json` for scripts and agents. You can pass it globally before the command or on the command itself:

```bash
zepo --json status
zepo status --live --json
zepo login --json
zepo logout --json
zepo search milk --json
zepo add "Amul Milk 500ml" --json
zepo add "protein bars" --choose --json
zepo cart --json
zepo remove chips --json
zepo clear --json
zepo address list --json
zepo address use home --json
zepo checkout --json
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
    "hint": "Run `zepo login` first.",
    "exitCode": 1
  }
}
```

Interactive prompt UI is written to stderr so stdout stays reserved for command results and machine-readable JSON. Product, cart, and order JSON output includes structured fields only; raw Zepto page text and internal automation IDs are kept internal and are not emitted for agents to scrape. Human and JSON error text redact sensitive-looking order-id, phone, OTP/PIN/CVV, payment-number, payment-handle, auth/session/token URL parameters, and local-path values before printing, including URL/query-string encoded forms and standalone percent-encoded fragments of those values. They also redact npm-token-shaped values.

## First Run

Use a dedicated data directory when an agent or script owns the workflow:

```bash
zepo --data-dir ./.zepo-agent doctor
zepo --data-dir ./.zepo-agent login
zepo --data-dir ./.zepo-agent status --live --json
```

Then run the explicit user workflow:

```bash
zepo --data-dir ./.zepo-agent search milk --json
zepo --data-dir ./.zepo-agent add "Amul Milk 500ml" --json
zepo --data-dir ./.zepo-agent cart --json
zepo --data-dir ./.zepo-agent checkout --json
zepo --data-dir ./.zepo-agent track --json
```

`checkout` opens a visible Zepto browser page and returns only after the user presses Enter in the terminal. Complete payment in Zepto; do not treat the CLI handoff as a paid or placed order.

`zepo search --limit` accepts integers from 1 to 50. Invalid limits fail before browser automation starts.
`--timeout <ms>` accepts decimal integer milliseconds from 1000 to 300000. Invalid timeout values fail before runtime or browser automation starts and use stable `invalid_input` JSON issues for agents.

## Agent Runbook

1. Run `zepo status --json` or `zepo doctor --json` before account workflows.
2. If `confirmedSession` is false, run `zepo login` in a human-controlled terminal/browser.
3. If `browserAutomation.ready` is false, wait for `browserAutomation.retryAfterMs`, wait for the active browser lock to clear, or rerun the next browser command with `--visible` when a human can complete Zepto-controlled verification.
4. Use `--no-input` only for unattended checks that must fail instead of prompting.
5. Do not parallelize multiple data directories to bypass pacing or throttle signals.
6. Treat every non-zero exit as failure, even when stderr contains structured JSON.
7. After `zepo checkout --json`, inspect `paymentStatus`, `orderPlacement`, and then run `zepo track --json` only after Zepto-side payment is completed.

JSON failures use a stable shape on stderr: `{ ok: false, error: { type, code, message, hint, exitCode, retryAfterMs } }`. Every JSON failure includes `error.code`; parser/validation failures use `error.code: "invalid_input"` and unexpected failures use `error.code: "unexpected_error"`. Agents should branch on `error.code` instead of parsing `message`. Important codes include `no_confirmed_session`, `interactive_input_required`, `invalid_input`, `runtime_setup_failed`, `headless_browser_throttle`, `zepto_access_cooldown`, `zepto_access_challenge`, `zepto_access_protection`, `delivery_location_required`, `cart_unreadable`, `checkout_handoff_unverified`, `orders_unreadable`, `zepto_login_required`, and `unexpected_error`.

## How It Works

The CLI layers are deliberately simple:

```txt
CLI commands -> services -> Playwright automation -> Zepto website
```

Login opens Zepto in a visible browser and stores the browser state locally only after the flow is completed or explicitly confirmed. Search, cart, address, order, and checkout commands reuse that state. Search uses visible, enabled, editable search inputs or explicit search controls and may fall back to real product cards visible on Zepto's public homepage when Zepto's search page is empty before a location is selected. If homepage search leaves ordinary homepage product cards on screen, the CLI tries the direct search URL before returning only query-matched homepage fallback cards. Homepage fallback never overrides explicit search-page no-results, delivery-location-required, or access-protection states. Search input discovery can use placeholder, title, description, and referenced accessible labels, but rejects mixed labels that point at address, phone/OTP, cart, payment-method/payment, coupon, or order actions. Safe-click checks inspect visible text, `aria-label`, `title`, `placeholder`, `value`, `aria-description`, and referenced `aria-labelledby`/`aria-describedby` text. Search, account/login, order-history, and reorder controls are rejected when any visible or accessible label points at an unrelated navigation, result-list, cart, address, checkout, payment-method/payment, or final-order action. Address manager/add-address controls use visible, enabled address controls only and reject mixed visible or accessible labels that point at location-consent, final address-confirmation, unrelated cart/checkout/order/bill/payment text, or payment-method/payment surfaces. Checkout never processes payment details; it verifies Zepto exposes checkout/payment handoff UI, then leaves payment and order placement inside the visible Zepto browser. Automation must not click `Place Order`, `Pay Now`, `Confirm Order`, or equivalent order-placement controls.
Checkout handoff controls are rejected if any visible or accessible label contains payment-method, final-payment, final-order, `checkout and pay`, or amount-bearing pay text, even when another label looks like a safe checkout handoff. Checkout handoff verification requires explicit payment-selection or final checkout-page labels; payment method names or UPI promo copy on an ordinary cart page are not proof of handoff.
When an existing confirmed session is present, `zepo login` snapshots the saved auth state and persistent browser profile before re-login. If the new login attempt fails or cannot be confirmed, the previous session data is restored.

Check local readiness before account-dependent commands:

```bash
zepo status
zepo status --json
zepo status --live
zepo status --live --json
zepo doctor
zepo doctor --json
```

`zepo status --json` includes `version`, `browserAutomation.ready`, `browserAutomation.reasons`, and `browserAutomation.retryAfterMs`, plus local browser lock state, headless browser throttle state, recent Zepto access-challenge cooldown state, and cache counts for searches, cart snapshots, addresses, and orders. Browser lock JSON includes the lock owner `pid`, `createdAt`, and `staleReason` when available so agents can distinguish an active command from a dead-owner or expired stale lock. Those counts are diagnostics only; account-dependent commands still require a confirmed Zepto session and live browser automation.
`zepo doctor --json` also includes `version`, `dataDir`, `browserAutomation`, `browserLock`, `headlessBrowserThrottle`, and `accessChallenge` fields so agents can branch on readiness without scraping human check messages.
`zepo status --live` opens Zepto with the saved browser profile and checks whether the session still appears accepted. If Zepto clearly asks for login or OTP again, the CLI reports `liveSession.state: "login-required"` and demotes the local login marker so agents do not continue with stale session state. Logged-in account/profile text is trusted before login input evidence, and bare numeric fields alone are not treated as login proof, so a profile page that exposes a phone field is not demoted by that field alone. Ambiguous live checks are reported as `unknown` and should be resolved with `zepo status --live --visible` or `zepo login`.
Account-dependent browser commands also demote the local login marker when a failed Zepto page clearly shows login or OTP prompts. The shared expired-session guard trusts explicit logged-in account/profile text before login input evidence, and ignores bare numeric fields plus unsafe phone-like payment/cart/address/search fields on ambiguous pages, so profile, payment, or cart pages with phone fields are not treated as expired sessions. This avoids repeated cart, checkout, address, or order commands against an expired session while preserving cached metadata for diagnostics.
`zepo doctor` checks Node.js, SQLite, Zepto session state, the browser automation lock, headless browser throttling, recent Zepto access-challenge cooldown state, Playwright Chromium, and writable runtime directories for auth state, browser profile data, logs, and diagnostics.
If browser launch fails, run `npm run prepare:browsers` or `npx playwright install chromium`, then rerun `zepo doctor`.

The CLI does not try to bypass Zepto protections. It runs one browser command at a time per data directory, paces browser automation between runs, keeps the headless burst budget deliberately small, stops on access challenges, rate-limit style pages, or suspicious empty Zepto responses, cools down headless automation after a challenge, and asks the user to resolve any Zepto-controlled verification in the visible browser. When a visible interactive run sees a verification page or a Zepto 403/429 navigation challenge with visible challenge text, it waits for the user to complete that Zepto-controlled check instead of trying to bypass it. Hidden Zepto API 403/429 responses without a visible verification surface still stop the command.

Zepto's official Terms of Use version 1.4 at https://www.zepto.com/s/terms-of-service were checked on 2026-05-31 and show "Last updated: 1 st November 2025". They describe Zepto as a marketplace for seller transactions in select serviceable areas, say payment methods and charges are displayed during the purchasing/checkout process, and explain that delivery ETA can vary or exceed the displayed estimate. They also describe Platform access as limited and revocable, say users must not impose excessive load, restrict access through non-Zepto interfaces or automatic devices, and allow Zepto to delay, cancel, reject, block, or suspend transactions/access for security, fair-use, or policy reasons. Use ZepoCli only where permitted by Zepto and applicable law. Do not use it for scraping, monitoring, resale, bulk ordering, bypassing protections, or forcing repeated headless retries.
Zepto's Terms also warn users not to share debit/credit card numbers, CVV, OTP, UPI/ATM PIN, or other sensitive information. ZepoCli must never ask for, store, log, print, or automate those values; all payment and verification entry stays in the visible Zepto browser.
Zepto's Privacy Notice version 1.1 at https://staticweb.zepto.com/privacy-policy/ was checked on 2026-05-31 and shows "Last updated: 17th June 2025". It treats passwords and payment instrument details as sensitive personal information, describes payment processing through payment gateways, and tells users to keep account information confidential and avoid sharing login credentials, passwords, or OTPs. ZepoCli therefore stores only the local browser session/profile state needed for user-directed workflows, never asks for payment or verification secrets, and keeps debug capture disabled for account-dependent pages.
ZepoCli treats both `zepto.com` and legacy `zeptonow.com` responses as Zepto platform surfaces for access-challenge detection.

## Data Storage

By default data is stored under the OS app data directory. Override it for agents, tests, or isolated runs:

```bash
zepo --data-dir ./.zepo login
```

If the configured data directory is blank, cannot be created, or cannot be opened, the CLI fails before browser work starts. Use `zepo --data-dir <path> doctor` with a writable directory to diagnose local storage issues.

Browser automation is serialized per data directory because Chromium profile state is shared there. Browser commands register interrupt handlers so Ctrl+C/SIGTERM attempts to close the Playwright browser context and release the data-dir lock before exit. Browser context close is bounded and best-effort; if graceful context close fails or times out, the CLI attempts to force-close the owning browser before releasing the lock so a stuck close does not keep the CLI process alive indefinitely or strand the lock forever. If a command exits unexpectedly while holding the lock, `zepo doctor` reports the stale lock and the next browser command can recover dead-owner locks, plus old lock files that have no live owner PID. A lock with a still-running owner PID remains active even when it is old, so long visible login or checkout handoffs are not mistaken for stale state. Remove the lock manually only after confirming no browser command is still running. Use a separate `--data-dir` only when you intentionally need an independent session:

```bash
zepo --data-dir ./.zepo-agent-a search milk
zepo --data-dir ./.zepo-agent-b search bread
```

Use `--visible` when diagnosing Zepto rendering, location, or blocking behavior:

```bash
zepo --visible search milk
```

Agents should inspect `zepo status --json` or `zepo doctor --json` before retry loops. If `browserAutomation.ready` is false, branch on `browserAutomation.reasons`; wait for the reported `browserAutomation.retryAfterMs`, wait for an active browser lock to clear, or switch to a visible, human-controlled flow when Zepto verification must be completed. JSON errors for throttles, Zepto access challenges, access protection, and access cooldowns also include `error.retryAfterMs`. Do not loop headless commands to force Zepto pages to load.

Use `--no-input` for unattended scripts that must fail instead of waiting for a prompt:

```bash
zepo --no-input cart --json
zepo --no-input login --json
```

Interactive flows such as `login`, `address add`, `checkout`, and `add --choose` fail early with a structured error when `--no-input` is set.
`zepo login` opens the account/login surface through visible, enabled account/profile/login controls only, and rejects mixed labels that point at unrelated navigation, cart, address, checkout, payment-method/payment, order, phone/OTP, or verification actions. `zepo login --phone` only pre-fills visible, enabled, editable phone/mobile/tel input fields, including fields identified by placeholder, title, description, or referenced accessible labels. It rejects mixed labels that look like OTP, verification, payment-method/payment, address, cart, order, or search controls. It does not target bare numeric inputs so OTP entry remains fully Zepto-controlled.
Product ADD and quantity plus controls must be visible and enabled before automation clicks them. Tagged ADD/quantity controls must still match the selected product card immediately before click. Product ADD discovery/revalidation accepts referenced accessible labels but rejects mixed unsafe labels such as `Added`, `Add more`, `Add coupon`, address/location, checkout, or payment-method/payment labels. Quantity plus controls also reject mixed unsafe labels such as decrease/remove, coupon, checkout, payment-method/payment, or order actions. Automated `zepo add --quantity` is capped at 12 and paced between quantity-control clicks so scripts do not hammer Zepto controls. Cart and order totals are reported only from explicit total/payable labels; the CLI does not guess totals from arbitrary product, fee, discount, or badge prices.
Product extraction ignores delivery-speed and promo UI badges such as `10 MINS`, `Super Saver`, and `Lowest Price`, including when they appear as image alt text, when choosing product names.

Stored data includes:

- Playwright auth state
- Persistent Chromium browser profile data for Zepto session continuity
- SQLite metadata for sessions, search counts, cart snapshots, addresses, and order snapshots. Search cache stores redacted query text only. Cart and order caches persist parsed fields only; raw cart/order page text is used in memory for parsing but is not saved to SQLite snapshots.
- Log file for debugging; Persistent log object values, Error messages/stacks, and message strings are redacted with the same sensitive-looking order-id, phone, OTP/PIN/CVV, payment-number, payment-handle, auth/session/token URL-parameter, and local-path rules used for terminal errors, including URL/query-string encoded forms and standalone percent-encoded fragments of those values. They also redact npm-token-shaped values.
- Debug HTML/screenshot artifacts when `--debug` is used and non-account browser automation fails

Debug HTML/screenshot artifacts are disabled for account-dependent browser flows such as live session checks, login, cart, address, checkout, orders, and reorder so OTP, address, cart, order, or payment screens are not stored locally.

Unauthenticated search does not write Playwright auth state. Session state is saved by `zepo login` and refreshed by account-dependent browser flows after a confirmed session exists. Empty Zepto origin storage, empty auth-looking cookie/localStorage values, and public preference/location cookies are not enough to confirm local auth, even when the key name contains words like `user`, `customer`, or `profile`; the saved state must include non-empty auth/session-like Zepto cookies or non-empty auth/session-like Zepto localStorage keys.
Session auth checks recognize both `zepto.com` and legacy `zeptonow.com` storage because Zepto platform sessions may surface through either domain.

`zepo logout` removes the saved Zepto session, clears the persistent browser profile, and deletes cached local user metadata such as searches, cart snapshots, addresses, and order snapshots. It refuses to run while another ZepoCli browser command owns the current data directory lock, so logout cannot delete profile files from under an active login, cart, checkout, address, or order flow.

## Safety Boundaries

- The CLI does not bypass login, OTP, payment, location, age checks, prescriptions, or delivery verification.
- The CLI does not use stealth automation or anti-detection bypasses.
- The CLI stops on Zepto verification, 403/429-style block pages, rate-limit text, browser checks, or suspicious empty pages instead of retrying aggressively.
- Use ZepoCli only where permitted by Zepto and applicable law; do not use it for scraping, monitoring, resale, bulk ordering, or load generation.
- The CLI does not store payment credentials.
- Address automation may open the add-address UI through visible, enabled address controls, but must not click current/device/precise-location sharing, browser location-access/GPS permission controls, cart/checkout/order/bill/payment controls, payment-method/payment controls, or final address-confirmation controls. Address manager/add-address controls and saved-address extraction are rejected when visible or accessible copy contains location-consent, final address-confirmation, unrelated cart/checkout/order/bill/payment text, or payment-method/payment text.
- `zepo address use` selects a saved address only when the best matching row is unique; if multiple saved addresses match, rerun with more visible address text such as street, building, or pincode.
- User-visible checkout/payment remains inside Zepto.
- Checkout automation may open the checkout/payment handoff through enabled checkout controls, but must not click final order-placement or payment buttons. Payment method names or UPI/cart-promo copy alone must not be treated as proof that checkout handoff is already open.
- `zepo checkout` is a handoff, not proof that an order was paid or placed. Its JSON output reports `paymentStatus: "not_observed_by_zepocli"`, `orderPlacement: "not_confirmed_by_zepocli"`, and `orderStatusCommand: "zepo track"`; use `zepo track` after completing Zepto payment.
- Cart navigation and cart remove/clear automation use visible, enabled cart controls only. Cart navigation controls are rejected if any visible or accessible label contains checkout, proceed, payment-method/payment, bill, or final order text. Product listing `Add to Cart` copy is not cart-surface evidence. Tagged remove/decrease controls are rejected if any visible or accessible label points at coupon, address, checkout, payment-method/payment, or order actions; they are also revalidated against the current cart row before click, and `zepo remove <query>` requires that row to still match the requested item.
- Parsed product-like rows count as cart data only when Zepto also exposes cart-surface evidence such as cart, quantity, bill, total, or remove controls.
- `zepo cart` returns an empty cart only when Zepto shows explicit empty-cart copy without non-empty cart signals such as item counts, bill/total, checkout, quantity, or remove controls. If the cart page opens but items are unreadable, the CLI fails instead of treating the cart as empty.
- `zepo history` returns an empty list only when Zepto shows explicit empty-history copy without unreadable order signals such as reorder, order summary, track order, ETA, or status text. Empty-history marketing copy such as groceries "delivered in minutes" or snacks "arriving in 8 mins" is ignored, and no-id history rows need stronger evidence than a bare status word. If the orders page opens but order cards are unreadable, the CLI fails instead of treating history as empty.
- `zepo track` reports only a latest order with readable status or ETA. ETA text must be a real time value, not trailing UI action copy such as reorder, support, payment, or invoice labels. If Zepto exposes only an order id or other incomplete tracking text, the CLI fails instead of presenting it as a tracked order.
- Order-history navigation clicks only visible, enabled, explicit orders/history controls; account/profile clicks may only open the menu before a separate orders/history click. Mixed labels for unrelated cart, account, address, checkout, payment-method/payment, tracking, reorder, or final-order actions are rejected.
- `zepo reorder last` clicks only a visible, enabled, explicit reorder/order-again/repeat-order control whose readable order-card text matches the latest detected order. Mixed labels for unrelated order actions such as refund, return, support, invoice, receipt, rate, track, cancel, payment-method/payment, checkout, or order summary are rejected. Order navigation also requires visible, enabled controls.
- If Zepto changes its website and automation cannot confidently complete a task, the command fails with a direct error instead of pretending success.

## Verification

```bash
npm run verify:secrets
npm run check
npm run verify:cli
npm run verify:package
```

`npm run verify:secrets` scans tracked and unignored project text for npm-token-shaped values without printing the raw token. `npm run check` runs that secret gate first, then builds, runs tests, verifies compiled CLI smoke behavior including the executable entry contract, runs both `doctor --skip-browser --json` and normal `doctor --json` browser-launch checks, installs the packed npm tarball into a disposable prefix, runs the installed `zepo` binary through the same doctor checks, checks `node dist/index.js --help`, runs `npm audit --omit=dev`, and runs `npm pack --dry-run`.

## Release

Release publishing is tag-driven. Before creating a release tag, run the local gate and keep issue #1 open unless a fresh human-controlled `verify:live` report proves the Zepto account workflow in the current website UI.

```bash
npm run check
git tag v0.1.0
git push origin v0.1.0
```

The GitHub release workflow runs `npm ci`, installs Playwright Chromium, runs `npm run check`, then publishes the package with `npm publish --provenance --access public` using `NPM_TOKEN`. It does not run `verify:live`; that remains a manual human-account gate because it can require OTP, location, cart mutation, checkout handoff, and Zepto-side payment decisions.

Never put npm tokens in the app, README, tests, or committed config. Use a local environment variable for manual publishing, or store the token as the GitHub Actions secret named `NPM_TOKEN` for the release workflow.
For manual publishing, copy `.npmrc.example` to ignored `.npmrc` and set `NPM_TOKEN` in your shell; keep the token value out of the file.

For real human-account verification, use the opt-in live runner after building:

```bash
npm run build
npm --silent run verify:live -- --data-dir ./.zepo-live --login --search milk --address home --add "Amul Milk 500ml" --cart --checkout --track
npm --silent run verify:live -- --data-dir ./.zepo-live --login --add "protein bars" --choose-add --cart
npm --silent run verify:live -- --data-dir ./.zepo-live --login --add "Amul Milk 500ml" --remove "Amul Milk" --cart
npm --silent run verify:live -- --data-dir ./.zepo-live --login --clear --cart
```

`verify:live` runs the compiled `zepo` commands with a dedicated data directory and visible browser handoffs where needed. It starts with normal `zepo doctor --json`, including the Playwright Chromium launch check, and the live report contract requires `browserAutomation.ready === true` plus a passing `Playwright Chromium` check so browser locks, cooldowns, and browser install failures are caught before account/cart/payment handoff steps. Add `--history` or `--reorder-last` when a human-controlled account has order history you want to verify. Use `--choose-add` with `--add` to exercise `zepo add --choose` when a human should pick the exact product from Zepto results. Use `--remove <query>` only when removing that item still leaves the cart suitable for checkout, and run `--clear` as a separate cleanup pass because it cannot be combined with checkout verification. Use `--step-timeout <ms>` only when a human-controlled Zepto step legitimately needs more than the default per-command timeout. `--login` is conditional: if the dedicated data directory already has a confirmed session, the runner does not force a fresh login or claim login coverage; it requires `liveSession` coverage from `status --live` instead. It writes a sanitized `live-verification-report.json` with the package `version`, step status, counts, stable error codes, and top-level `requested`, `attempted`, `coverage`, and `missingCoverage` objects showing which workflow capabilities were requested, ran, actually passed, and remain requested-but-unverified, such as `browserPreflight`, `login`, `liveSession`, `search`, `add`, `cart`, `checkoutHandoff`, `track`, `history`, and `reorder`. It omits raw Zepto page text, addresses, cart item names, payment credentials, order ids, phone input, local filesystem paths, unredacted workflow query arguments, and standalone percent-encoded sensitive fragments. Console command echoes, the final report-path line, and stored report command strings redact local data/report paths, phone input, search/add/remove/address-use query text, and npm-token-shaped values; stored step commands must also match the runner's redacted command shapes. It is not part of `npm run check` or CI because it requires a real human-controlled Zepto account, delivery context, cart choices, and optional Zepto-side payment/checkout decisions.
The examples use `npm --silent run verify:live -- ...` so npm does not echo raw invocation arguments before the runner can redact internal `zepo` command lines.
If `verify:live` is interrupted with Ctrl+C/SIGTERM during a visible human handoff, it signals the active child command, writes the same sanitized partial report when possible, and keeps console paths redacted.
`verify:live --phone` accepts the same 10-digit, `+91`, or leading-0 Indian mobile formats as `zepo login --phone`, normalizes the value before invoking the CLI, and still redacts phone input from the live report.
After a human-controlled live run, validate the report before treating it as proof:

```bash
npm --silent run verify:live:report -- ./.zepo-live/live-verification-report.json
```

`verify:live:report` does not contact Zepto or prove a fresh run happened. It checks the saved report contract: package version, `ok`, sanitized non-future `generatedAt` plus data/report path metadata, the fixed runner note, accepted report schema, complete boolean capability summaries, redacted step command contract, consistent step `exitCode`/`ok`/`summary`/`error` fields, stable failure error objects, `ok` reports containing only passing known workflow steps, unique workflow step names, runner workflow order, complete workflow step summaries, typed workflow step summaries, runner-known string and string-array workflow step summaries, internally consistent workflow step summaries, bounded numeric workflow step summaries, all passing workflow step summaries satisfy their known contracts, `attempted`/`coverage` consistency with `steps`, sensitive-looking key/value redaction, requested coverage, `missingCoverage`, and required step summaries for browser preflight, login session evidence, live session, checkout handoff, and requested workflows.

Live report failures use stable `error.code` values. Contract failures use `live_doctor_contract_mismatch`, `live_login_contract_mismatch`, `live_status_contract_mismatch`, `live_checkout_contract_mismatch`, `live_track_contract_mismatch`, `live_search_contract_mismatch`, `live_add_contract_mismatch`, `live_cart_contract_mismatch`, `live_clear_contract_mismatch`, `live_address_contract_mismatch`, `live_history_contract_mismatch`, and `live_reorder_contract_mismatch`. Manual precondition failures use `live_verification_incomplete`. Runner/reporting failures use `live_runner_failed`, `live_command_launch_failed`, `live_command_timeout`, `live_summary_failed`, `live_json_unreadable`, `live_json_unexpected`, or `command_failed`.
