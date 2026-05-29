---
name: zepto-cli-builder
description: Maintain ZepoCli as a real developer CLI for Zepto workflows without adding fake autonomous-agent features.
---

# ZepoCli Builder Skill

Use this skill when changing the ZepoCli command surface, browser automation, storage, or docs.

## Rules

1. Keep the product a CLI tool.
   - Add or change commands only when they map to an explicit user action.
   - Do not add autonomous shopping, hidden recommendation flows, or placeholder features.

2. Preserve the core workflow.
   - `zepo login`
   - `zepo status`
   - `zepo doctor`
   - `zepo search <query>`
   - `zepo add <query>`
   - `zepo cart`
   - `zepo remove <query>`
   - `zepo clear`
   - `zepo address list|use|add`
   - `zepo checkout`
   - `zepo track`
   - `zepo history`
   - `zepo reorder last`

3. Payment boundary.
   - Never process payment inside the CLI.
   - Always hand checkout/payment to a visible Zepto browser page.
   - Checkout automation may open checkout/payment handoff only; never click `Place Order`, `Pay Now`, `Confirm Order`, or equivalent final order-placement/payment controls.
   - Checkout handoff clicks should target enabled, explicit checkout/proceed-to-checkout/proceed-to-pay style button controls; avoid generic `continue`, bare `proceed`, `checkout and pay`, or amount-bearing pay text that can match unrelated or final-payment page actions.
   - Reject a checkout handoff control when any visible or accessible label contains payment-method/final-payment/order text, even if another label looks like a safe checkout handoff.
   - Address automation may open the add-address UI only; never click current-location sharing, browser location-access/GPS permission, or final address-confirmation controls. Reject address manager/add-address controls when any visible or accessible label contains location-consent or final address-confirmation text, even if another label looks safe.
   - Never store UPI IDs, card numbers, CVV, OTPs, or payment tokens.
   - Successful `zepo checkout --json` output must keep payment/order placement explicitly unconfirmed and include `orderStatusCommand: "zepo track"` so agents know what to run after Zepto-side payment.
   - Do not mark login complete while Zepto still shows login or OTP prompts.
   - A failed re-login attempt must not invalidate a previously marked valid local session.
   - Failed re-login attempts must restore both Playwright auth state and persistent browser profile data when a confirmed session existed before the attempt.
   - Validate `zepo login --phone` before launching the browser; if an explicit phone/mobile/tel input is visible, enabled, and editable, prefill it with paced typing and leave OTP fully Zepto-controlled.
   - Phone input discovery may use placeholder/title/description/referenced accessible labels, but must reject mixed-label controls that look like OTP, verification, payment, address, cart, order, or search controls.
   - Phone prefill must target explicit phone/mobile/tel fields only; never use bare numeric input selectors because those can match OTP fields.

4. Automation behavior.
   - Prefer resilient Playwright selectors: roles, visible text, form inputs, and short DOM walks.
   - If a selector becomes unreliable, fail with a specific error and hint.
   - Browser launch failures should surface as user-facing errors with browser-install and doctor hints.
   - Do not capture debug HTML or screenshots for account-dependent browser flows such as live status, login, cart, address, checkout, orders, and reorder.
   - Do not add stealth automation, anti-detection bypasses, CAPTCHA bypasses, or aggressive retry loops.
   - Use the CLI only where permitted by Zepto and applicable law; do not use it for scraping, monitoring, resale, bulk ordering, bypassing protections, or load generation.
   - Account/login surface navigation should click visible, enabled, explicit account/profile/login/sign-in controls, not generic page copy containing those words.
   - Safe-click checks must inspect visible text, `aria-label`, `title`, `aria-description`, and `aria-labelledby`/`aria-describedby` referenced text before clicking; reject the control if any label points at an unsafe action.
   - Do not run concurrent browser commands against the same persistent profile; serialize browser automation per data directory.
   - Do not parallelize multiple data directories to bypass pacing or throttle signals.
   - Do not hardcode stale browser identity such as fixed Chrome user agents; let Playwright Chromium report its real browser identity while keeping locale/timezone/user pacing human-controlled.
   - Pace browser automation, keep headless burst limits conservative, and fail clearly if Zepto shows access challenges, rate limits, blocked-request pages, or suspicious empty Zepto responses.
   - Treat 403/429-style block pages, browser-check pages, temporary-restriction copy, and "enable JavaScript/cookies" checks as access challenges; stop or switch to a human-visible flow instead of trying to route around them.
   - Treat both `zepto.com` and legacy `zeptonow.com` origins as Zepto platform surfaces for access-challenge detection.
   - Visible interactive runs may wait for the user to complete Zepto-controlled verification, including Zepto 403/429 navigation challenges; headless runs must cool down after detected challenges instead of retrying.
   - Do not silently return fake cart/order/address data.
   - Product/cart/order parsers must ignore UI badges, generic image alt text, fee rows, and summary rows instead of treating them as real user data.
   - Cart and order totals must come from explicit total/payable labels; never infer totals from arbitrary product, fee, discount, or badge prices.
   - `zepo search` may fall back to real product cards visible on Zepto's public homepage when Zepto's search page is empty before location setup; never synthesize product results from search suggestions, popular-search text, or AI guesses.
   - Search navigation should use a visible, enabled, editable search input or explicit enabled search-control labels; search input discovery may use placeholder/title/description/referenced accessible labels, but must reject mixed-label search controls when any visible or accessible label points at popular-search, result-list, cart, account, address, phone/OTP, checkout, payment, coupon, or order actions.
   - Search should avoid retry loops: use at most one homepage search attempt, at most one direct `/search?query=` attempt, then one public-homepage product-card fallback.
   - Product extraction should require real product detail such as price or unit before returning a card; image-only navigation, category, popular-search, and suggestion content is not a product result.
   - Address extraction should prefer specific saved address rows, avoid clicking broad containers that include multiple saved addresses, and reject label-only navigation/category text such as "Home" or "Work" without real address detail.
   - Address manager navigation should click only visible, enabled, explicit address controls; avoid broad `/address/` or `/location/` text clicks that can match current-location, selected-address, or final address-confirmation copy.
   - Address add should click only visible, enabled, explicit add-address controls; never click current-location sharing, browser location-access/GPS permission, save/confirm address, selected-address copy, or mixed-label controls where any label is unsafe.
   - Cart navigation should click visible, enabled, explicit cart controls only; reject mixed-label cart controls when any visible or accessible label contains checkout, proceed, payment, bill, or final order text while opening cart for `zepo cart`, `zepo remove`, or `zepo clear`.
   - Parsed product-like rows count as cart data only when Zepto also exposes cart-surface evidence such as cart, quantity, bill, total, or remove controls.
   - Product ADD and quantity plus controls must be visible and enabled before clicking, and tagged ADD/quantity controls must still match the selected product card immediately before click. Product ADD discovery/revalidation should accept referenced accessible labels but reject mixed unsafe labels such as `Added`, `Add more`, `Add coupon`, address/location, checkout, or payment labels. Quantity plus controls should also reject mixed unsafe labels such as decrease/remove, coupon, checkout, payment, or order actions. Automated `zepo add --quantity` should stay capped to normal cart-sized quantities and paced between plus-control clicks; do not add fast loops for bulk cart changes.
   - Cart remove/clear should target enabled controls inside likely product item rows only; ignore coupon, bill summary, fee, discount, and total rows even if they expose remove/decrease controls. Tagged remove/decrease controls must reject mixed unsafe visible/accessibility labels such as coupon, address, checkout, payment, or order actions, must be revalidated against the current cart row before click, and `zepo remove <query>` must still match the requested item.
   - Order history navigation should click visible, enabled, explicit orders/history labels; account/profile clicks may only open the menu surface before a separate orders/history click, and mixed-label controls should be rejected when any visible or accessible label points at unrelated cart, account, address, checkout, payment, tracking, reorder, or final-order actions.
   - Reorder should click only visible, enabled, explicit reorder/order-again/repeat-order controls whose readable order-card text matches the latest detected order; when no order id is readable, all available status/ETA/total fields from the latest order must match. Never click generic text containing "reorder", standalone order summary copy, a mixed-label payment/cancel/track/refund/return/support/invoice/receipt/rate/order-placement control, or a reorder control for an older order.
   - `zepo cart` may return an empty cart only when Zepto exposes explicit empty-cart copy without non-empty cart signals such as item counts, bill/total, checkout, quantity, or remove controls. If the cart page opens but items are unreadable, fail clearly instead of treating the cart as empty.
   - `zepo history` may return an empty list only when Zepto exposes explicit empty-order-history copy without unreadable order signals such as reorder, order summary, track order, ETA, or status text. If the orders page opens but order cards are unreadable, fail clearly instead of treating history as empty.
   - `zepo track` must require readable latest-order status or ETA. ETA text must be a real time value, not trailing UI action copy such as reorder, support, payment, or invoice labels; do not present a bare order id as a tracked order.

5. CLI output behavior.
   - Keep human output concise and readable.
   - Keep `--json` output available for commands that return workflow state so agents and scripts do not scrape terminal text.
   - Public `--json` output should expose structured workflow fields only; keep raw Zepto page text and internal automation IDs internal instead of making agents scrape or depend on them.
   - Honor `--json` both before the command and on command-specific options.
   - Do not print spinner/status prose when `--json` is requested.
   - In JSON mode, failures should emit stable `{ ok: false, error: ... }` JSON on stderr while preserving the non-zero exit code.
   - All JSON failures must include stable `error.code` values, parser/validation failures should use `error.code: "invalid_input"`, unexpected failures should use `error.code: "unexpected_error"`, and throttle/access-challenge/access-protection/cooldown failures should include `error.retryAfterMs` so agents can wait or switch to `--visible` without parsing prose.
   - Interactive prompt UI should render on stderr through the shared prompt context so stdout stays reserved for results and JSON payloads.
   - Prompting flows must honor `--no-input` by failing early instead of launching browsers and waiting for input.
   - Runtime setup failures such as blank, invalid, or unwritable `--data-dir` values should produce user-facing errors with recovery hints.
   - Top-level parser failures such as unknown commands/options must honor `--json` with structured `invalid_input` errors.

6. Storage behavior.
   - Session state lives in Playwright storage state.
   - Browser profile data lives in the configured data directory so IndexedDB, cookies, and site state survive between CLI runs.
   - Unauthenticated commands such as search must not write Playwright auth state or make local status look partially logged in.
   - Browser profile files alone may exist after unauthenticated browser use; they are not proof of partial login without auth state or the local login marker.
   - Empty Zepto origin storage is not auth proof. Local auth state should require Zepto cookies or auth/session-like Zepto localStorage keys before contributing to confirmed session status.
   - Session auth-state validation should treat both `zepto.com` and legacy `zeptonow.com` storage as Zepto platform session evidence.
   - Doctor checks should probe all runtime directories needed for auth state, browser profile data, logs, and diagnostics.
   - Doctor checks should report active or stale browser automation locks for the configured data directory.
   - Browser commands should register interrupt handlers so Ctrl+C/SIGTERM closes the Playwright context and releases the data-dir lock before exit.
   - Browser context close should be bounded and best-effort. If graceful context close fails or times out, attempt to force-close the owning browser before releasing the lock so a stuck Playwright close does not keep the CLI process alive indefinitely or strand the data-dir lock forever.
   - Browser lock JSON should include `pid`, `createdAt`, and `staleReason` when available so agents can distinguish active commands from dead-owner or expired stale locks. Dead-owner locks and expired lock files without a live owner PID may be recovered by the next browser command, but a lock with a still-running owner PID remains active even when it is old. Agents should not delete active locks or stop processes unless a human has confirmed the owner is stale.
   - `zepo status --json` and `zepo doctor --json` should expose aggregate `browserAutomation` readiness, headless browser throttle, and recent Zepto access-challenge cooldown state so agents can wait or switch to `--visible` instead of retrying headless commands.
   - `zepo doctor --json` should expose structured `dataDir`, `browserAutomation`, `browserLock`, `headlessBrowserThrottle`, and `accessChallenge` fields; agents should not parse human doctor messages.
   - `zepo status --live --json` should verify the saved session against Zepto before account workflows and demote the local login marker if Zepto clearly asks for login/OTP again. Do not delete cached user data for a live-status demotion.
   - `zepo status --live --json` should return structured `liveSession.state = "login-required"` when Zepto asks for login again; do not let the shared account-command expired-session guard throw before live-status can report and demote.
   - Login-state detection should trust explicit page text before login input evidence. A logged-in account/profile page that exposes a phone field must not be demoted unless Zepto also shows login/OTP prompts. Bare numeric fields alone are not login proof.
   - Account-dependent browser commands should demote the local login marker when a failed Zepto page clearly shows login/OTP prompts. The shared expired-session guard should trust explicit logged-in account/profile text before login input evidence and ignore bare numeric fields on ambiguous pages, so profile pages with phone fields are not demoted. Do not capture debug HTML/screenshots for account-dependent browser pages, including the expired-session failure path.
   - SQLite is for local metadata, snapshots, and cache only.
   - Search cache writes should keep diagnostic counts without storing raw user search query text.
   - Cart and order cache writes should persist parsed fields only; do not store raw Zepto cart/order page text in SQLite snapshots.
   - Do not use cached data as proof that a live Zepto operation succeeded.
   - Status may expose browser lock state, headless browser throttle state, access-challenge cooldown state, and cache counts for diagnostics, but session confirmation must not depend on those diagnostics or cached metadata.
   - Logout must clear cached user metadata snapshots as well as auth state and browser profile data, but it must refuse while a non-stale browser automation lock is active for the configured data directory.

## Required Checks

Run:

```bash
npm run build
npm test
npm run verify:cli
npm run verify:package
node dist/index.js --help
npm pack --dry-run
```

Keep package verification checking that `package.json` maps `zepo` to `./dist/index.js` and that the compiled entry keeps the `#!/usr/bin/env node` shebang.

Use `npm run verify:live -- --data-dir <dedicated-dir> ...` only for opt-in human-account verification. Keep it out of CI and normal `npm run check` because it requires a real Zepto account, visible browser handoffs, delivery context, cart mutation choices, and optional Zepto-side checkout/payment decisions. It can cover cart cleanup with `--remove <query>` and `--clear` when the test cart can be safely changed. Its report must stay sanitized and omit raw page text, addresses, cart item names, payment credentials, order ids, phone input, local filesystem paths, and unredacted workflow query arguments.

For browser-facing changes, also run a live command with a disposable `--data-dir` and document whether it required manual login/location setup. Use `--visible` when diagnosing Zepto rendering or blocking behavior.

## GitHub Workflow

- Use Git/GitHub only when the current user instruction allows it. If the user says local-only, do not run Git or GitHub commands until they explicitly re-enable them.
- Open focused PRs with `gh`.
- Merge only after local or CI checks pass.
- Do not delete branches after merge.
