# ZepoCli

`zepo` is a terminal-first CLI for user-directed Zepto workflows. It uses Playwright to operate the Zepto website with the user's own browser session and hands payment back to Zepto in a visible browser.

## Install

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
zepo status
zepo status --live
zepo doctor
zepo search milk
zepo add "Amul Milk 500ml"
zepo add "Amul Milk 500ml" --quantity 2
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

Interactive prompt UI is written to stderr so stdout stays reserved for command results and machine-readable JSON. Product, cart, and order JSON output includes structured fields only; raw Zepto page text and internal automation IDs are kept internal and are not emitted for agents to scrape.

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

Login opens Zepto in a visible browser and stores the browser state locally only after the flow is completed or explicitly confirmed. Search, cart, address, order, and checkout commands reuse that state. Search uses visible, enabled, editable search inputs or explicit search controls and may fall back to real product cards visible on Zepto's public homepage when Zepto's search page is empty before a location is selected. Search, account, order-history, and reorder controls are rejected when any visible or accessible label points at an unrelated navigation, result-list, cart, address, checkout, payment, or final-order action. Checkout never processes payment details; it verifies Zepto exposes checkout/payment handoff UI, then leaves payment and order placement inside the visible Zepto browser. Automation must not click `Place Order`, `Pay Now`, `Confirm Order`, or equivalent order-placement controls.
Checkout handoff controls are rejected if any visible or accessible label contains final-payment or final-order text, even when another label looks like a safe checkout handoff.
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

`zepo status --json` includes `browserAutomation.ready`, `browserAutomation.reasons`, and `browserAutomation.retryAfterMs`, plus local browser lock state, headless browser throttle state, recent Zepto access-challenge cooldown state, and cache counts for searches, cart snapshots, addresses, and orders. Browser lock JSON includes the lock owner `pid`, `createdAt`, and `staleReason` when available so agents can distinguish an active command from a dead-owner or expired stale lock. Those counts are diagnostics only; account-dependent commands still require a confirmed Zepto session and live browser automation.
`zepo doctor --json` also includes `dataDir`, `browserAutomation`, `browserLock`, `headlessBrowserThrottle`, and `accessChallenge` fields so agents can branch on readiness without scraping human check messages.
`zepo status --live` opens Zepto with the saved browser profile and checks whether the session still appears accepted. If Zepto clearly asks for login or OTP again, the CLI reports `liveSession.state: "login-required"` and demotes the local login marker so agents do not continue with stale session state. Logged-in account/profile text is trusted before generic phone or numeric inputs, so a profile page that exposes a phone field is not demoted by that field alone. Ambiguous live checks are reported as `unknown` and should be resolved with `zepo status --live --visible` or `zepo login`.
Account-dependent browser commands also demote the local login marker when a failed Zepto page clearly shows login or OTP prompts. The shared expired-session guard trusts explicit logged-in account/profile text before generic phone or numeric inputs, so profile pages with phone fields are not treated as expired sessions. This avoids repeated cart, checkout, address, or order commands against an expired session while preserving cached metadata for diagnostics.
`zepo doctor` checks Node.js, SQLite, Zepto session state, the browser automation lock, headless browser throttling, recent Zepto access-challenge cooldown state, Playwright Chromium, and writable runtime directories for auth state, browser profile data, logs, and diagnostics.
If browser launch fails, run `npm run prepare:browsers` or `npx playwright install chromium`, then rerun `zepo doctor`.

The CLI does not try to bypass Zepto protections. It runs one browser command at a time per data directory, paces browser automation between runs, keeps the headless burst budget deliberately small, stops on access challenges, rate-limit style pages, or suspicious empty Zepto responses, cools down headless automation after a challenge, and asks the user to resolve any Zepto-controlled verification in the visible browser. When a visible interactive run sees a verification page, it waits for the user to complete that Zepto-controlled check instead of trying to bypass it.

Zepto's official Terms of Use at https://www.zepto.com/s/terms-of-service were checked on 2026-05-28. They describe Platform access as limited and revocable, say users must not impose excessive load, restrict access through non-Zepto interfaces or automatic devices, and allow Zepto to block or suspend access for violations. Use ZepoCli only where permitted by Zepto and applicable law. Do not use it for scraping, monitoring, resale, bulk ordering, bypassing protections, or forcing repeated headless retries.
ZepoCli treats both `zepto.com` and legacy `zeptonow.com` responses as Zepto platform surfaces for access-challenge detection.

## Data Storage

By default data is stored under the OS app data directory. Override it for agents, tests, or isolated runs:

```bash
zepo --data-dir ./.zepo login
```

If the configured data directory is blank, cannot be created, or cannot be opened, the CLI fails before browser work starts. Use `zepo --data-dir <path> doctor` with a writable directory to diagnose local storage issues.

Browser automation is serialized per data directory because Chromium profile state is shared there. Browser commands register interrupt handlers so Ctrl+C/SIGTERM attempts to close the Playwright browser context and release the data-dir lock before exit. Browser context close is bounded and best-effort; if graceful context close times out, the CLI attempts to force-close the owning browser before releasing the lock so a stuck close does not keep the CLI process alive indefinitely or strand the lock forever. If a command exits unexpectedly while holding the lock, `zepo doctor` reports the stale lock and the next browser command can recover dead-owner or expired locks automatically. Remove the lock manually only after confirming no browser command is still running. Use a separate `--data-dir` only when you intentionally need an independent session:

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
`zepo login` opens the account/login surface through visible, enabled account/profile/login controls only. `zepo login --phone` only pre-fills visible, enabled, editable phone/mobile/tel input fields. It does not target bare numeric inputs so OTP entry remains fully Zepto-controlled.
Product ADD and quantity plus controls must be visible and enabled before automation clicks them. Tagged ADD/quantity controls must still match the selected product card immediately before click. Automated `zepo add --quantity` is capped at 12 and paced between quantity-control clicks so scripts do not hammer Zepto controls.

Stored data includes:

- Playwright auth state
- Persistent Chromium browser profile data for Zepto session continuity
- SQLite metadata for sessions, searches, cart snapshots, addresses, and order snapshots. Cart and order caches persist parsed fields only; raw cart/order page text is used in memory for parsing but is not saved to SQLite snapshots.
- Log file for debugging
- Debug HTML/screenshot artifacts when `--debug` is used and non-account browser automation fails

Debug HTML/screenshot artifacts are disabled for account-dependent browser flows such as live session checks, login, cart, address, checkout, orders, and reorder so OTP, address, cart, order, or payment screens are not stored locally.

Unauthenticated search does not write Playwright auth state. Session state is saved by `zepo login` and refreshed by account-dependent browser flows after a confirmed session exists. Empty Zepto origin storage is not enough to confirm local auth; the saved state must include Zepto cookies or auth/session-like Zepto localStorage keys.
Session auth checks recognize both `zepto.com` and legacy `zeptonow.com` storage because Zepto platform sessions may surface through either domain.

`zepo logout` removes the saved Zepto session, clears the persistent browser profile, and deletes cached local user metadata such as searches, cart snapshots, addresses, and order snapshots. It refuses to run while another ZepoCli browser command owns the current data directory lock, so logout cannot delete profile files from under an active login, cart, checkout, address, or order flow.

## Safety Boundaries

- The CLI does not bypass login, OTP, payment, location, age checks, prescriptions, or delivery verification.
- The CLI does not use stealth automation or anti-detection bypasses.
- The CLI stops on Zepto verification, 403/429-style block pages, rate-limit text, browser checks, or suspicious empty pages instead of retrying aggressively.
- Use ZepoCli only where permitted by Zepto and applicable law; do not use it for scraping, monitoring, resale, bulk ordering, or load generation.
- The CLI does not store payment credentials.
- Address automation may open the add-address UI through visible, enabled address controls, but must not click current-location sharing or final address-confirmation controls. Address manager/add-address controls are rejected when any visible or accessible label contains location-consent or final address-confirmation text.
- `zepo address use` selects a saved address only when the best matching row is unique; if multiple saved addresses match, rerun with more visible address text such as street, building, or pincode.
- User-visible checkout/payment remains inside Zepto.
- Checkout automation may open the checkout/payment handoff through enabled checkout controls, but must not click final order-placement or payment buttons.
- `zepo checkout` is a handoff, not proof that an order was paid or placed. Its JSON output reports `paymentStatus: "not_observed_by_zepocli"`, `orderPlacement: "not_confirmed_by_zepocli"`, and `orderStatusCommand: "zepo track"`; use `zepo track` after completing Zepto payment.
- Cart navigation and cart remove/clear automation use visible, enabled cart controls only. Cart navigation controls are rejected if any visible or accessible label contains checkout, proceed, payment, bill, or final order text. Tagged remove/decrease controls are revalidated against the current cart row before click, and `zepo remove <query>` requires that row to still match the requested item.
- Parsed product-like rows count as cart data only when Zepto also exposes cart-surface evidence such as cart, quantity, bill, total, or remove controls.
- `zepo cart` returns an empty cart only when Zepto shows explicit empty-cart copy. If the cart page opens but items are unreadable, the CLI fails instead of treating the cart as empty.
- `zepo history` returns an empty list only when Zepto shows explicit empty-history copy. If the orders page opens but order cards are unreadable, the CLI fails instead of treating history as empty.
- `zepo track` reports only a latest order with readable status or ETA. If Zepto exposes only an order id or other incomplete tracking text, the CLI fails instead of presenting it as a tracked order.
- `zepo reorder last` clicks only a visible, enabled, explicit reorder/order-again/repeat-order control whose readable order-card text matches the latest detected order. Order navigation also requires visible, enabled controls.
- If Zepto changes its website and automation cannot confidently complete a task, the command fails with a direct error instead of pretending success.

## Verification

```bash
npm run check
npm run verify:cli
npm run verify:package
```

`npm run check` builds, runs tests, verifies compiled CLI smoke behavior including the executable entry contract, installs the packed npm tarball into a disposable prefix, runs the installed `zepo` binary, checks `node dist/index.js --help`, and runs `npm pack --dry-run`.
