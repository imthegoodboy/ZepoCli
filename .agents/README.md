# ZepoCli Agent Notes

This project is a developer CLI tool, not an autonomous shopping agent.

## Product Boundary

Build and maintain `zepo` like a normal production CLI:

- Commands are explicit user actions.
- Browser automation performs the requested Zepto workflow.
- Payment, OTP, address confirmation, age checks, prescription checks, and delivery verification stay in Zepto-controlled browser UI.
- Address automation may open the add-address UI only; never click current-location sharing, browser location permission, or final address-confirmation controls. Reject address manager/add-address controls when any visible or accessible label contains location-consent or final address-confirmation text, even if another label looks safe.
- Checkout automation may open checkout/payment handoff only; never click `Place Order`, `Pay Now`, `Confirm Order`, or equivalent order-placement/payment controls.
- Checkout handoff clicks should target enabled, explicit checkout/proceed-to-checkout/proceed-to-pay style button controls; avoid generic `continue` or bare `proceed` text that can match unrelated page actions.
- Do not add fake "AI agent" features, autonomous purchasing, background ordering, or placeholder commands.
- Use ZepoCli only where permitted by Zepto and applicable law; do not use it for scraping, monitoring, resale, bulk ordering, bypassing protections, or load generation.
- If a command cannot really complete or hand off to Zepto, fail clearly with an actionable message.
- Prefer `--json` when another agent or script needs to consume command output; do not scrape colored human text.
- Public JSON output should expose stable structured fields only; do not make agents depend on raw Zepto page text or internal automation IDs.
- `--json` works as a global flag before the command and as a command flag where supported.
- In JSON mode, command failures emit `{ "ok": false, "error": ... }` on stderr. Treat non-zero exit status as failure even when the JSON is parseable.
- Interactive prompt UI must render on stderr via the shared prompt context so stdout stays reserved for command results and JSON payloads.
- Use `--no-input` for unattended runs that must fail instead of waiting on an interactive prompt.

## Current Architecture

```txt
CLI commands
  -> services
  -> Playwright automation
  -> Zepto website
```

Storage:

- Playwright auth state: local `auth-state.json`
- Browser profile: persistent Chromium profile under the configured data directory
- Metadata/cache: SQLite
- Logs: local file under the configured data directory
- Diagnostics: failure HTML/screenshot artifacts only for non-account browser automation when `--debug` is used
- Cart and order caches persist parsed fields only. Do not store raw Zepto cart/order page text in SQLite snapshots because it can contain address or order copy.
- `zepo logout` must clear auth state, browser profile data, and cached user metadata snapshots, but it must refuse while a non-stale browser automation lock is active for the configured data directory.
- `zepo status --json` exposes `browserAutomation.ready`, `browserAutomation.reasons`, `browserAutomation.retryAfterMs`, local browser lock state, headless browser throttle state, Zepto access-challenge cooldown state, and cache counts for diagnostics only; never treat cache counts as proof that a live Zepto operation succeeded. Browser lock JSON should include `pid`, `createdAt`, and `staleReason` when available so agents can distinguish an active command from a dead-owner or expired stale lock.
- `zepo doctor --json` exposes `dataDir`, `browserAutomation`, `browserLock`, `headlessBrowserThrottle`, and `accessChallenge` as structured fields; agents should branch on those fields instead of parsing human check messages.
- JSON failures are emitted on stderr as `{ ok: false, error: { type, code, message, hint, exitCode, retryAfterMs } }`. Every JSON failure includes `error.code`; parser/validation failures use `error.code: "invalid_input"` and unexpected failures use `error.code: "unexpected_error"`. Agents should branch on codes instead of parsing prose. Retry timing belongs in `error.retryAfterMs` for throttle, access-challenge, access-protection, and cooldown failures.
- `zepo status --live --json` is the agent preflight for account workflows. It may open Zepto with the saved browser profile; if Zepto clearly asks for login/OTP again, demote the local login marker without deleting cached user data.
- `zepo status --live --json` should report `liveSession.state = "login-required"` when Zepto asks for login again; it should not fail first with a generic expired-session account-command error.
- Login-state detection should trust explicit page text before generic phone/numeric inputs. A logged-in account/profile page that exposes a phone field must not be demoted unless Zepto also shows login/OTP prompts.
- Account-dependent browser commands should also demote the local login marker if a failed page clearly shows login/OTP prompts. The shared expired-session guard should trust explicit logged-in account/profile text before generic phone/numeric inputs, so profile pages with phone fields are not demoted. Do not capture debug HTML/screenshots for account-dependent browser pages, including the expired-session failure path.
- Browser automation is locked per configured data directory. Do not run concurrent browser commands against the same persistent Chromium profile; use `zepo doctor` to inspect active/stale lock state, and use separate `--data-dir` values only for intentionally independent sessions. Browser commands should register interrupt handlers so Ctrl+C/SIGTERM closes the Playwright context and releases the lock before exit. Browser context close should be bounded and best-effort; if graceful context close fails or times out, the CLI should attempt to force-close the owning browser before releasing the lock so a stuck close does not keep the CLI process alive indefinitely or strand the lock forever. Dead-owner locks and expired lock files without a live owner PID may be recovered by the next browser command, but a lock with a still-running owner PID remains active even when it is old. Agents should not delete active locks or stop processes unless a human has confirmed the owner is stale. Do not parallelize multiple data directories to bypass pacing or throttle signals.
- `zepo status --json` and `zepo doctor --json` expose aggregate `browserAutomation` readiness plus headless browser throttle and recent Zepto access-challenge cooldown state so agents can wait or switch to `--visible` instead of retrying headless commands.
- Unauthenticated commands such as `zepo search` must not create `auth-state.json`; session state should be saved by login and refreshed only by confirmed-session flows.
- Empty Zepto origin storage is not auth proof. Local auth state should require Zepto cookies or auth/session-like Zepto localStorage keys before contributing to confirmed session status.
- Session auth-state validation should treat both `zepto.com` and legacy `zeptonow.com` storage as Zepto platform session evidence.
- Account/login surface navigation should click visible, enabled, explicit account/profile/login/sign-in controls, not generic page copy containing those words.

## Researched Zepto Facts

Sources checked on 2026-05-28:

- Official site: https://www.zepto.com/
- Terms: https://www.zepto.com/s/terms-of-service
- Customer support: https://www.zepto.com/s/customer-support
- App Store listing: https://apps.apple.com/in/app/zepto-groceries-in-minutes/id1575323645

Relevant product behavior:

- Zepto supports website/app shopping for groceries, cafe, electronics, fashion, pharmacy, pet care, and other quick-commerce categories.
- Zepto's own "How it Works" flow is open app, choose products, place an order, then delivery in minutes; the CLI should mirror that explicit user-directed flow.
- Users log in and manage account information including phone and delivery address.
- Cart and checkout show product pricing, delivery charges, handling/convenience/platform/surge-style charges when applicable.
- Payment methods are Zepto-side flows such as UPI, cards, wallets, netbanking, and COD when available.
- Delivery ETA is shown by Zepto and may vary.
- Users are responsible for accurate delivery address details.
- Restricted/regulated categories such as alcohol/tobacco and pharmacy can involve Zepto-side eligibility, age, identity, prescription, or delivery verification; the CLI must not bypass or complete those checks.
- Official real-time support is through the Zepto app; do not direct users to unofficial phone numbers.
- Zepto Terms of Use version 1.4 were last updated on 2025-11-01. They describe Platform access as limited and revocable, prohibit excessive load, restrict access through non-Zepto interfaces or automatic devices, and allow Zepto to block or suspend access for violations.

Implementation consequence:

- `zepo checkout` must open Zepto checkout in a visible browser and let the user complete payment.
- The CLI must not collect or store payment credentials.
- The CLI should reuse the user's own session and should not bypass platform controls.
- Successful `zepo checkout --json` output must not imply payment or order placement succeeded; keep `paymentStatus` and `orderPlacement` explicitly unconfirmed, include `orderStatusCommand: "zepo track"`, and tell agents to run `zepo track` after Zepto payment.
- Checkout handoff controls must be rejected when any visible or accessible label contains unsafe final-payment/order text, even if another label looks like a safe checkout handoff.
- `zepo search` may use real product cards visible on Zepto's public homepage as a fallback when the search page is empty before location setup; never synthesize product results from search suggestions or popular-search text.
- Search navigation should use a visible, enabled, editable search input or explicit enabled search-control labels; reject mixed-label search controls when any visible or accessible label points at popular-search, result-list, cart, account, address, checkout, payment, or order actions.
- `zepo login` must not mark a local session logged in while Zepto still exposes obvious login/OTP prompts.
- `zepo login --phone` should validate and normalize Indian mobile formats before opening the browser, then prefill only visible, enabled, editable Zepto phone fields with paced typing.
- Phone prefill must target explicit phone/mobile/tel fields only; never use bare numeric input selectors because those can match OTP fields.
- Failed re-login attempts must preserve a previously confirmed session by restoring both Playwright auth state and persistent browser profile data.
- Address extraction should prefer specific saved address rows, avoid clicking broad containers that include multiple saved addresses, and reject label-only navigation/category text such as "Home" or "Work" without real address detail.
- Account-dependent commands should require confirmed local session state, not just leftover files.
- Non-session search should not make status/doctor look partially logged in by writing auth state.
- Browser profile files alone can exist after unauthenticated browser use; do not treat that as a partial Zepto login without auth state or a local login marker.
- State-changing commands should keep machine-readable `--json` output aligned with their human output.
- Keep JSON-mode error payloads stable and structured enough for agents to branch on `error.code`, `error.type`, `error.message`, `error.hint`, and `error.exitCode`.
- Product, cart, and order JSON output should omit internal automation IDs and raw Zepto page text; keep those values internal for automation, parsing, and cache only.
- Prompting commands must reject `--no-input` before opening browsers or waiting for user input.
- Logout must remove cached user data such as searches, cart snapshots, addresses, and order snapshots.
- `zepo cart` may return an empty cart only when Zepto exposes explicit empty-cart copy. If the cart page opens but items are unreadable, fail clearly instead of treating the cart as empty.
- `zepo history` may return an empty list only when Zepto exposes explicit empty-order-history copy. If the orders page opens but order cards are unreadable, fail clearly instead of treating history as empty.
- `zepo track` must require a readable latest-order status or ETA. Do not present a bare order id or incomplete tracking text as a tracked order.
- Address manager navigation should click only visible, enabled, explicit address controls; avoid broad `/address/` or `/location/` text clicks that can match current-location, selected-address, or final address-confirmation copy.
- Address add should click only visible, enabled, explicit add-address controls; never click current-location sharing, save/confirm address, selected-address copy, or mixed-label controls where any label is unsafe.
- Cart navigation should click visible, enabled, explicit cart controls only; reject mixed-label cart controls when any visible or accessible label contains checkout, proceed, payment, bill, or final order text while opening cart for `zepo cart`, `zepo remove`, or `zepo clear`.
- Parsed product-like rows count as cart data only when Zepto also exposes cart-surface evidence such as cart, quantity, bill, total, or remove controls.
- Product ADD and quantity plus controls must be visible and enabled before clicking. Tagged ADD/quantity controls must still match the selected product card immediately before click. Automated `zepo add --quantity` should stay capped to normal cart-sized quantities and paced between plus-control clicks; do not add fast loops for bulk cart changes.
- Cart remove/clear should target enabled controls inside likely product item rows only; ignore coupon, bill summary, fee, discount, and total rows even if they expose remove/decrease controls. Tagged remove/decrease controls must be revalidated against the current cart row before click, and `zepo remove <query>` must still match the requested item.
- Order history navigation should click visible, enabled, explicit orders/history labels; account/profile clicks may only open the menu surface before a separate orders/history click, and mixed-label controls should be rejected when any visible or accessible label points at unrelated cart, account, address, checkout, payment, tracking, reorder, or final-order actions.
- Reorder should click only visible, enabled, explicit reorder/order-again/repeat-order controls whose readable order-card text matches the latest detected order; never click generic text containing "reorder", standalone order summary copy, a mixed-label payment/cancel/track/order-placement control, or a reorder control for an older order.
- `zepo doctor` should verify all runtime paths needed by the CLI, not just one diagnostics directory.
- `zepo doctor` should report active or stale browser automation locks so agents know whether to wait, remove a stale lock, or use a separate data directory.
- Browser launch failures should be user-facing errors with `prepare:browsers` and `zepo doctor` recovery hints, not raw Playwright stack traces.
- Runtime setup failures for blank, invalid, or unwritable `--data-dir` values should be user-facing errors, not raw filesystem or SQLite traces.
- Disable debug HTML/screenshot capture for account-dependent browser flows such as live status, login, cart, address, checkout, orders, and reorder.
- Do not add stealth automation, anti-detection bypasses, CAPTCHA bypasses, or aggressive retries. Serialize browser automation per data directory, pace runs, keep headless burst limits conservative, and fail clearly when Zepto shows access challenges, rate-limit style pages, or suspicious empty Zepto responses. Visible interactive runs may wait for the user to complete Zepto-controlled verification; after a detected challenge or headless burst throttle, agents should wait for the reported retry delay or use `--visible` instead of looping. Agents should treat `browserAutomation.ready: false` as a stop signal until the listed reasons clear.
- Treat 403/429-style block pages, browser-check pages, temporary-restriction copy, and "enable JavaScript/cookies" checks as access challenges; stop or switch to a human-visible flow instead of trying to route around them.
- Treat both `zepto.com` and legacy `zeptonow.com` origins as Zepto platform surfaces for access-challenge detection.
- Do not hardcode stale browser identity such as fixed Chrome user agents. Let Playwright Chromium report its real browser identity while keeping locale, timezone, pacing, and visible handoffs explicit.

## Verification Expectations

Before claiming production readiness:

- `npm run build` passes.
- `npm test` passes.
- `npm run verify:cli` passes against the compiled `dist/index.js`.
- `npm run verify:package` passes after packing the npm tarball, installing it into a disposable prefix, and running the installed `zepo` binary.
- The verify scripts keep checking the `zepo` package bin entry and compiled shebang so the installed CLI works as a normal executable, not only through `node dist/index.js`.
- The verify scripts should keep checking machine-readable `status --json` browser lock/headless-throttle/access-challenge fields and `doctor --skip-browser --json` readiness output.
- The verify scripts should keep checking clean `{ ok: false, error: ... }` no-session JSON for account-dependent command families, not only `zepo cart`.
- `node dist/index.js --help` shows the intended command surface.
- `npm pack --dry-run` passes before publishing or claiming package readiness.
- `npm run verify:live -- --data-dir <dedicated-dir> ...` is the opt-in human-account verification runner. Use it only with a human-controlled Zepto session; it writes a sanitized report and must not be added to CI or unattended release gates. The report must not store raw page text, addresses, cart item names, order ids, payment credentials, phone input, local filesystem paths, or unredacted search/add/address-use query arguments.
- At least one browser smoke test is run against Zepto for search or login handoff when Chromium is available.
- Commands that depend on a real Zepto account are marked verified only after a human-controlled session exercises them.

## GitHub Project Management

- Use Git/GitHub only when the current user instruction allows it. If the user says local-only, do not run Git or GitHub commands until they explicitly re-enable them.
- Use `gh` for issues and PRs when managing project work.
- Do not delete local or remote branches after merging PRs.
- Keep the production-hardening issue open until login, address, cart, checkout handoff, and order tracking are verified with a real human-controlled Zepto session.
- Top-level parser failures such as unknown commands/options must honor `--json` with structured `invalid_input` errors.
