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
   - Keep the supported Node.js runtime floor aligned across `package.json`, `zepo doctor`, CI, and install docs. Current floor: Node.js 20.19.

2. Preserve the core workflow.
   - `zepo login`
   - `zepo logout`
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
   - Reject a checkout handoff control when any visible or accessible label contains payment-method/final-payment/order text, even if another label looks like a safe checkout handoff, and revalidate labels plus disabled state after any scroll into view before clicking.
   - Checkout handoff verification requires explicit payment-selection or final checkout-page labels; payment method names or UPI promo copy on an ordinary cart page are not proof of handoff.
   - Address automation may open the add-address UI only; never click current/device/precise-location sharing, browser location-access/GPS permission, cart/checkout/order/bill/payment controls, payment-method/payment controls, final address-confirmation controls, or account/order actions such as support, invoice/receipt, refund/return, cancellation, or rating/review. Reject address manager/add-address controls and saved-address extraction when visible or accessible copy contains location-consent, final address-confirmation, unrelated cart/checkout/order/bill/payment text, payment-method/payment text, or support/invoice/refund/cancel/rating order-action text, even if another label looks safe. Address manager/add-address labels and disabled state must be revalidated after any scroll into view before clicking.
   - Never store UPI IDs, card numbers, CVV, OTPs, or payment tokens.
   - ZepoCli must never ask for, store, log, print, or automate debit/credit card numbers, CVV, OTP, UPI/ATM PIN, payment handles, or other sensitive payment/verification values; Zepto warns users not to share those values and all entry stays in the visible Zepto browser.
   - Successful `zepo checkout --json` output must include `cartPrecondition: "non_empty_cart_verified"` so agents know ZepoCli verified a readable non-empty cart before handoff, keep payment/order placement explicitly unconfirmed, and include `orderStatusCommand: "zepo track"` so agents know what to run after Zepto-side payment.
   - Do not mark login complete while Zepto still shows login or OTP prompts.
   - A failed re-login attempt must not invalidate a previously marked valid local session.
   - Failed re-login attempts must restore both Playwright auth state and persistent browser profile data when a confirmed session existed before the attempt.
   - Validate `zepo login --phone` before launching the browser; if an explicit phone/mobile/tel input is visible, enabled, and editable, prefill it with paced typing and leave OTP fully Zepto-controlled.
   - Phone input discovery may use placeholder/title/description/referenced accessible labels, but must reject mixed-label controls that look like OTP, verification, payment-method/payment, address, cart, order, or search controls.
   - Phone prefill must target explicit phone/mobile/tel fields only; never use bare numeric input selectors because those can match OTP fields.

4. Automation behavior.
   - Prefer resilient Playwright selectors: roles, visible text, form inputs, and short DOM walks.
   - If a selector becomes unreliable, fail with a specific error and hint.
   - Browser launch failures should surface as user-facing errors with browser-install and doctor hints.
   - Do not capture debug HTML or screenshots for Zepto browser flows that may use the persistent profile, including search, live status, login, cart, address, checkout, orders, and reorder.
   - Do not add stealth automation, anti-detection bypasses, CAPTCHA bypasses, or aggressive retry loops.
   - Use the CLI only where permitted by Zepto and applicable law; do not use it for scraping, monitoring, resale, bulk ordering, bypassing protections, or load generation.
   - Zepto Terms of Use version 1.4 were checked on 2026-06-02 at https://www.zepto.com/s/terms-of-service and show "Last updated: 1 st November 2025".
   - Zepto Privacy Notice version 1.1 was checked on 2026-06-02 at https://staticweb.zepto.com/privacy-policy/ and shows "Last updated: 17th June 2025"; it treats passwords and payment instrument details as sensitive personal information, describes payment processing through payment gateways, and tells users to avoid sharing login credentials, passwords, or OTPs.
   - Zepto serviceability, seller/product availability, price, fees, charges, ETA, payment method availability, transaction acceptance, and cancellation/refund behavior are Zepto-side state. The CLI must read or hand off to Zepto-visible state, must not promise delivery timing, must not synthesize availability, and must not treat checkout handoff as payment/order confirmation.
   - Account/login surface navigation should click visible, enabled, explicit account/profile/login/sign-in controls, not generic page copy containing those words, must reject mixed labels that point at payment-method/payment, cart, address, phone/OTP, checkout, order, or verification actions, and must revalidate labels plus disabled state after any scroll into view before clicking.
   - Safe-click checks must inspect visible text, `aria-label`, `title`, `placeholder`, `value`, `aria-description`, and `aria-labelledby`/`aria-describedby` referenced text before clicking; reject the control if any label points at an unsafe action, including after any scroll into view before clicking.
   - Payment-method label matching should use `src/automation/payment-labels.ts`; do not add per-module payment regex copies that can drift across click surfaces.
   - Do not run concurrent browser commands against the same persistent profile; serialize browser automation per data directory.
   - Do not parallelize multiple data directories to bypass pacing or throttle signals.
   - Do not hardcode stale browser identity such as fixed Chrome user agents; let Playwright Chromium report its real browser identity while keeping locale/timezone/user pacing human-controlled. Browser locale/timezone must flow through validated runtime options such as `--browser-locale` and `--browser-timezone`.
   - Pace browser automation, keep headless burst limits conservative, and fail clearly if Zepto shows access challenges, rate limits, blocked-request pages, or suspicious empty Zepto responses.
   - Treat 403/429-style block pages, browser-check pages, temporary-restriction copy, and "enable JavaScript/cookies" checks as access challenges; stop or switch to a human-visible flow instead of trying to route around them.
   - Treat both `zepto.com` and legacy `zeptonow.com` origins as Zepto platform surfaces for access-challenge detection.
   - Visible interactive runs may wait for the user to complete Zepto-controlled verification only when Zepto exposes a visible verification or block surface, including Zepto 403/429 navigation challenges with visible challenge text; Hidden Zepto API 403/429 responses without visible verification text must still stop the command and set cooldown guidance.
   - Do not silently return fake cart/order/address data.
   - Product/cart/order parsers must ignore UI badges, generic image alt text, fee rows, summary rows, and empty-history marketing copy instead of treating them as real user data. Product extraction should ignore text that Zepto exposes as product-card control labels, including image alt/accessibility text, when choosing product names, and ADD-control mapping should reject mixed controls whose labels are not explicit product-add labels. Product-specific accessible labels such as `Add <product> to cart` count as explicit product-add labels only when they do not include unsafe workflow terms such as address, coupon, checkout, payment-method/payment, final-order text, or quantity-only add text such as `Add 2 items to cart`. Order extraction must not treat "delivered in minutes" / "arriving in 8 mins" style marketing copy or no-id status-only history rows as real orders, and implicit delivery/arriving time copy is ETA only when the same order block exposes an active tracking status.
   - Cart and order totals must come from explicit total/payable labels; never infer totals from arbitrary product, fee, discount, or badge prices.
   - `zepo search` may fall back to real product cards visible on Zepto's public homepage when Zepto's search page is empty before location setup; never synthesize product results from search suggestions, popular-search text, or AI guesses. If homepage search leaves ordinary homepage product cards on screen, try the direct search URL before returning only query-matched homepage fallback cards. Homepage fallback must not override explicit search-page no-results, delivery-location-required, or access-protection states.
   - Search navigation should use a visible, enabled, editable search input or explicit enabled search-control labels, and search-trigger labels plus disabled state must be revalidated after any scroll into view before clicking; search input discovery may use placeholder/title/description/referenced accessible labels, but must reject mixed-label search controls when any visible or accessible label points at popular-search, result-list, cart, account, address, phone/OTP, checkout, payment-method/payment, coupon, or order actions.
   - Search should avoid retry loops: use at most one homepage search attempt, at most one direct `/search?query=` attempt, then one public-homepage product-card fallback.
   - Product extraction should require real product detail such as price or unit before returning a card; image-only navigation, category, popular-search, and suggestion content is not a product result.
   - Address extraction should prefer specific saved address rows, avoid clicking broad containers that include multiple saved addresses, and reject label-only navigation/category text such as "Home" or "Work" without real address detail. Tagged saved-address rows must be revalidated against Zepto's current visible row text before click, including after any scroll into view. Saved-address labels must be derived from Zepto's visible saved-address row text instead of a fixed `Home`/`Work`/`Other` list, and address detection should use structural address detail rather than a hardcoded service-city allow-list.
   - Address manager navigation should click only visible, enabled, explicit address controls, including explicit select/change/set/choose delivery address or location labels; avoid broad `/address/` or `/location/` text clicks that can match current-location, selected-address, or final address-confirmation copy, and revalidate labels plus disabled state after any scroll into view before clicking.
   - Address add should click only visible, enabled, explicit add-address controls, including explicit add/enter delivery address or location labels; revalidate labels plus disabled state after any scroll into view before clicking; never click current/device/precise-location sharing, browser location-access/GPS permission, cart/checkout/order/bill/payment controls, payment-method/payment controls, save/confirm address, selected-address copy, support/invoice/refund/cancel/rating order actions, or mixed-label controls where any label is unsafe. Saved-address extraction should reject location-consent, final address-confirmation, unrelated cart/checkout/order/bill/payment copy, and payment-method/payment copy even when it contains city or pincode text. It should also reject support, invoice/receipt, refund/return/cancel-order, and rating/review order-action labels.
   - Cart navigation should click visible, enabled, explicit cart controls only; reject mixed-label cart controls when any visible or accessible label contains checkout, proceed, payment-method/payment, bill, or final order text while opening cart for `zepo cart`, `zepo remove`, or `zepo clear`, and revalidate labels plus disabled state after any scroll into view before clicking.
   - Parsed product-like rows count as cart data only when Zepto also exposes cart-surface evidence such as cart, quantity, bill, total, or remove controls. Product listing `Add to Cart` copy is not cart-surface evidence. Cart parsing must skip delivery-address blocks with custom saved-address labels by using structural address detail, not a fixed address-label list or service-city allow-list.
   - Product ADD and quantity plus controls must be visible and enabled before clicking, and tagged ADD/quantity controls must still match the selected product card immediately before click, including after any scroll into view that can trigger Zepto rerenders. Product ADD discovery/revalidation should accept referenced accessible labels and product-specific accessible labels such as `Add <product> to cart`, but reject mixed unsafe labels such as `Added`, `Add more`, `Add coupon`, address/location, checkout, payment-method/payment, order actions, or quantity-only labels such as `Add 2 to cart`. Quantity plus controls should also reject mixed unsafe labels such as decrease/remove, coupon, checkout, payment-method/payment, or order actions. Automated `zepo add --quantity` should stay capped to normal cart-sized quantities and paced between plus-control clicks; do not add fast loops for bulk cart changes.
   - Cart remove/clear should target enabled controls inside likely product item rows only; ignore coupon, bill summary, fee, discount, total, and order-history/action rows even if they expose remove/decrease controls. Tagged remove/decrease controls must reject mixed unsafe visible/accessibility labels such as coupon, address, checkout, payment-method/payment, or order actions including order summary, tracking, reorder, cancellation, refund, support, invoice, receipt, and rating, must be revalidated against the current cart row before click, including after any scroll into view, and `zepo remove <query>` must still match the requested item.
   - Order history navigation should click visible, enabled, explicit orders/history labels; account/profile clicks may only open the menu surface before a separate orders/history click, and mixed-label controls should be rejected when any visible or accessible label points at unrelated cart, account, address, checkout, payment-method/payment, tracking, reorder, or final-order actions. Order-history and account-menu labels plus disabled state must be revalidated after any scroll into view before clicking.
   - Reorder should click only visible, enabled, explicit reorder/order-again/repeat-order controls whose readable order-card text matches the latest detected order, including after any scroll into view before clicking; when no order id is readable, all available status/ETA/total fields from the latest order must match. Never click generic text containing "reorder", standalone order summary copy, a mixed-label payment-method/payment/cancel/track/refund/return/support/invoice/receipt/rate/order-placement control, or a reorder control for an older order.
   - `zepo cart` may return an empty cart only when Zepto exposes explicit empty-cart copy without non-empty cart signals such as item counts, bill/total, checkout, quantity, or remove controls. If the cart page opens but items are unreadable, fail clearly instead of treating the cart as empty.
   - `zepo history` may return an empty list only when Zepto exposes explicit empty-order-history copy without unreadable order signals such as reorder, order summary, track order, ETA, or status text. Empty-history marketing copy such as groceries "delivered in minutes" or snacks "arriving in 8 mins" must not be parsed as a real order, and no-id history rows need stronger evidence than a bare status word. If the orders page opens but order cards are unreadable, fail clearly instead of treating history as empty.
   - `zepo track` must require readable latest-order status or ETA. ETA text must be a real time value, not trailing UI action copy such as reorder, support, payment, or invoice labels; implicit delivery/arriving time copy is ETA only when the same order block exposes an active tracking status; do not present a bare order id as a tracked order.

5. CLI output behavior.
   - Keep human output concise and readable.
   - Keep `--json` output available for commands that return workflow state so agents and scripts do not scrape terminal text.
   - Public `--json` output should expose structured workflow fields only; keep raw Zepto page text and internal automation IDs internal instead of making agents scrape or depend on them.
   - Honor `--json` both before the command and on command-specific options.
   - Do not print spinner/status prose when `--json` is requested.
   - In JSON mode, failures should emit stable `{ ok: false, error: ... }` JSON on stderr while preserving the non-zero exit code.
   - All JSON failures must include stable `error.code` values, parser/validation failures should use `error.code: "invalid_input"`, unexpected failures should use `error.code: "unexpected_error"`, and throttle/access-challenge/access-protection/cooldown failures should include `error.retryAfterMs` so agents can wait or switch to `--visible` without parsing prose.
   - Human spinner/status text that includes user-provided arguments should use the same sensitive-looking value redaction as terminal errors before printing.
   - Human and JSON failure `message`, `hint`, issue text, and JSON error object keys should redact sensitive-looking order-id, phone, OTP/PIN/CVV, payment-number, payment-handle, auth/session/token/password/secret URL parameters, and local-path values before printing, including URL/query-string encoded forms and standalone percent-encoded fragments of those values. Credential-like structured error/log keys such as authorization, cookie, token, password, OTP, phone, card, and UPI should also redact their values. It should also redact npm-token-shaped values.
   - Persistent runtime log object keys/values, Error messages/stacks, and message strings should use the same sensitive-looking order-id, phone, OTP/PIN/CVV, payment-number, payment-handle, auth/session/token/password/secret URL-parameter, and local-path redaction rules as terminal errors, including URL/query-string encoded forms and standalone percent-encoded fragments of those values. Credential-like structured keys such as authorization, cookie, token, password, OTP, phone, card, and UPI should also redact their values. They should also redact npm-token-shaped values.
   - Interactive prompt UI should render on stderr through the shared prompt context so stdout stays reserved for results and JSON payloads.
   - Prompting flows must honor `--no-input` by failing early instead of launching browsers and waiting for input.
   - Runtime setup failures such as blank, invalid, or unwritable `--data-dir` values should produce user-facing errors with recovery hints.
   - Global `--timeout <ms>` must stay a decimal integer from 1000 to 300000 and fail before runtime or browser work with stable `invalid_input` JSON issues.
   - Top-level parser failures such as unknown commands/options must honor `--json` with structured `invalid_input` errors.

6. Storage behavior.
   - Session state lives in Playwright storage state.
   - Browser profile data lives in the configured data directory so IndexedDB, cookies, and site state survive between CLI runs.
   - Unauthenticated commands such as search must not write Playwright auth state or make local status look partially logged in.
   - Browser profile files alone may exist after unauthenticated browser use; they are not proof of partial login without auth state or the local login marker.
   - Empty Zepto origin storage, empty auth-looking cookie/localStorage values, and public preference/location cookies are not auth proof, even when the key name contains words like `user`, `customer`, or `profile`. Local auth state should require non-empty auth/session-like Zepto cookies or non-empty auth/session-like Zepto localStorage keys before contributing to confirmed session status.
   - Session auth-state validation should treat both `zepto.com` and legacy `zeptonow.com` storage as Zepto platform session evidence.
   - Doctor checks should probe all runtime directories needed for auth state, browser profile data, logs, and diagnostics.
   - Doctor checks should report active or stale browser automation locks for the configured data directory.
   - Browser commands should register interrupt handlers so Ctrl+C/SIGTERM closes the Playwright context and releases the data-dir lock before exit.
   - Browser context close should be bounded and best-effort. If graceful context close fails or times out, attempt to force-close the owning browser before releasing the lock so a stuck Playwright close does not keep the CLI process alive indefinitely or strand the data-dir lock forever.
   - Browser lock JSON should include `pid`, `createdAt`, and `staleReason` when available so agents can distinguish active commands from dead-owner or expired stale locks. Dead-owner locks and expired lock files without a live owner PID may be recovered by the next browser command, but a lock with a still-running owner PID remains active even when it is old. Agents should not delete active locks or stop processes unless a human has confirmed the owner is stale.
   - `zepo status --json` and `zepo doctor --json` should expose `version`, aggregate `browserAutomation` readiness, headless browser throttle, and recent Zepto access-challenge cooldown state so agents can wait or switch to `--visible` instead of retrying headless commands.
   - `zepo doctor --json` should expose structured `version`, `dataDir`, `browserAutomation`, `browserLock`, `headlessBrowserThrottle`, and `accessChallenge` fields; agents should not parse human doctor messages.
   - `zepo status --live --json` should verify the saved session against Zepto before account workflows and demote the local login marker if Zepto clearly asks for login/OTP again. Do not delete cached user data for a live-status demotion.
   - `zepo status --live --json` should return structured `liveSession.state = "login-required"` when Zepto asks for login again; do not let the shared account-command expired-session guard throw before live-status can report and demote.
   - Login-state detection should trust explicit page text before login input evidence. A logged-in account/profile page that exposes a phone field must not be demoted unless Zepto also shows login/OTP prompts. Bare numeric fields alone are not login proof.
   - Account-dependent browser commands should demote the local login marker when a failed Zepto page clearly shows login/OTP prompts. The shared expired-session guard should trust explicit logged-in account/profile text before login input evidence and ignore bare numeric fields or unsafe phone-like payment/cart/address/search fields on ambiguous pages, so profile/payment/cart/search pages with phone fields are not demoted. Do not capture debug HTML/screenshots for Zepto browser pages that may use the persistent profile, including the expired-session failure path.
   - SQLite is for local metadata, snapshots, and cache only.
   - Search cache writes should keep diagnostic counts without storing raw user search query text, and service code should not pass raw search text into SQLite write APIs.
   - Address cache writes should keep diagnostic counts without storing raw address labels or text.
   - Cart cache writes should keep local item markers only and must not store cart item names, units, prices, totals, or raw Zepto page text in SQLite snapshots.
   - Order cache writes should use local cache IDs only and must not store raw Zepto order IDs, status, ETA, totals, placed-at text, or raw Zepto page text in SQLite snapshots.
   - Do not use cached data as proof that a live Zepto operation succeeded.
   - Status may expose browser lock state, headless browser throttle state, access-challenge cooldown state, and cache counts for diagnostics, but session confirmation must not depend on those diagnostics or cached metadata.
   - Logout must clear cached user metadata snapshots as well as auth state and browser profile data, but it must refuse while a non-stale browser automation lock is active for the configured data directory.

## Required Checks

Run:

```bash
npm run verify:secrets
npm run verify:dependencies
npm run build
npm test
npm run verify:cli
npm run verify:package
node dist/index.js --help
npm audit --omit=dev
npm pack --dry-run
```

Keep package verification checking that `package.json` maps `zepo` to `dist/index.js` and that the compiled entry keeps the `#!/usr/bin/env node` shebang. Keep the bin path in npm-normalized form so `npm publish --dry-run --access public` does not auto-correct the manifest during release.

Keep `verify:cli` and `verify:package` checking both `doctor --skip-browser --json` and normal `doctor --json` so release gates prove Playwright Chromium launches for the compiled and installed CLI.

Build and package gates that clean or rebuild `dist` must run serially. Do not run `npm run verify:cli` in parallel with `npm run verify:package`, `npm pack`, or any command that triggers `prepack`, because those commands can rebuild `dist` while the compiled CLI verifier is reading it.

Keep `.github/workflows/release.yml` tag-driven, using Node.js 20.19, installing Playwright Chromium, running `npm run check`, then publishing with `npm publish --provenance --access public` and `NPM_TOKEN`. Do not add `verify:live` to release automation; live Zepto account verification remains manual and human-controlled.

Never store npm tokens in the app, tests, docs, `.npmrc`, or agent guidance. Keep local `.npmrc` and `.env*` files ignored and reference only the placeholder secret name `NPM_TOKEN`; `.npmrc.example` and `.env.example` may contain placeholder names only. Keep `verify:secrets` in `npm run check`; it should scan tracked and unignored project text and fail on npm-token-shaped values without printing the raw token.

Keep local runtime data directories ignored and outside secret scanning, including both `.zepo*` and service-spelled `.zepto*` directory names. These directories can contain Playwright profile/session files from human-controlled live verification and must not be treated as project source.

Keep `verify:dependencies` in `npm run check` immediately after `verify:secrets`; it should fail early when runtime packages cannot load or required dev-tool binaries are missing, and its recovery guidance should use `npm ci --include=prod --include=dev`.

Use `npm --silent run verify:live -- --data-dir <dedicated-dir> ...` only for opt-in human-account verification. Keep it out of CI and normal `npm run check` because it requires a real Zepto account, visible browser handoffs, delivery context, cart mutation choices, and optional Zepto-side checkout/payment decisions. Use `--production-scope --search <query> --address <query> --add <query>` for the final readiness run so non-empty cart, checkout handoff, and track are requested consistently with `verify:live:report --require-production-scope --max-age-minutes 1440`. It can cover `zepo add --choose` with `--add <query> --choose-add --cart`, and cart cleanup with `--remove <query>` and `--clear` when the test cart can be safely changed. Use `--step-timeout <ms>` only when a human-controlled Zepto step legitimately needs more than the default per-command timeout. Its report must include the package `version` and top-level `requested`, `attempted`, `coverage`, and `missingCoverage` booleans for capabilities that were requested, ran, actually passed, and remain requested-but-unverified; when `--login` is supplied but the data directory already has a confirmed session, the report must not claim login coverage and must require `liveSession` coverage instead. The report, live runner command echoes, and final report-path line must stay sanitized and omit raw page text, addresses, cart item names, payment credentials, order ids, phone input, local filesystem paths, standalone percent-encoded sensitive fragments, and unredacted workflow query arguments; stored step commands must match the runner's redacted command shapes.

Use silent npm for live verification examples so npm does not echo raw invocation arguments before the runner can redact internal `zepo` command lines.

If `verify:live` is interrupted with Ctrl+C/SIGTERM during a visible human handoff, it should signal the active child command, write the same sanitized partial report when possible, and keep console paths redacted.

`verify:live` should start with normal `zepo doctor --json`, including the Playwright Chromium launch check, before login/cart/checkout/order verification. Its report contract should require `browserAutomation.ready === true` and a passing `Playwright Chromium` check instead of accepting skip-browser doctor output or a data directory with an active browser lock/cooldown.

`verify:live --phone` should accept the same 10-digit, `+91`, or leading-0 Indian mobile formats as `zepo login --phone`, pass the normalized 10-digit value to the CLI, and redact phone input from reports.

After a human-controlled live run, `npm --silent run verify:live:report -- <report-path>` should validate the saved report contract before agents treat it as acceptance evidence. Use `npm --silent run verify:live:report -- --require-production-scope --max-age-minutes 1440 <report-path>` for the final production readiness gate so valid partial reports and stale saved reports are rejected unless browser preflight, local status, live session, search, address selection, add, a non-empty cart, checkout handoff, and track are explicitly requested and have passing coverage on fresh evidence. For final readiness, browser preflight, local status, live session, search, address selection, add, a non-empty cart, checkout handoff, and track must be explicitly requested and covered, focused workflows such as address-add, address-list, remove, clear, history, and reorder must not be mixed into final evidence, and `--max-age-minutes` must be supplied so production-scope evidence is fresh. The report validator does not contact Zepto or prove a fresh run happened, checks optional `--max-age-minutes` freshness for ordinary reports, and it must reject reports with missing, malformed, future, or stale top-level report metadata when a freshness window is requested, edited report notes, incomplete or non-boolean capability summaries, fields outside the accepted schema, `ok` reports containing failed, manual, internal, unknown, duplicate, or out-of-order workflow steps, passing workflow steps whose summaries do not satisfy their known contracts, missing runner-defined workflow step summary keys, stringly typed or otherwise malformed workflow step summary values, free-form string or string-array workflow step summary values outside the runner-known value sets, internally inconsistent workflow step summary fields, malformed failure error objects with unstable codes, unreadable message/hint values, or invalid/beyond-runner retry timing, oversized or sensitive-looking numeric workflow step summary values, step command strings outside the redacted command contract, inconsistent step `exitCode`/`ok`/`summary`/`error` fields, `attempted` or `coverage` summaries that do not match the saved `steps` array, final production-scope reports with unrequested required capabilities, missing freshness windows, empty cart evidence, or focused workflow evidence, or keys/values containing sensitive-looking local paths, phone/order/payment/verification values, or npm-token-shaped values.

Live report failures should keep stable `error.code` values. Contract mismatch codes include `live_doctor_contract_mismatch`, `live_login_contract_mismatch`, `live_status_contract_mismatch`, `live_checkout_contract_mismatch`, `live_track_contract_mismatch`, `live_search_contract_mismatch`, `live_add_contract_mismatch`, `live_cart_contract_mismatch`, `live_clear_contract_mismatch`, `live_address_contract_mismatch`, `live_history_contract_mismatch`, and `live_reorder_contract_mismatch`; manual precondition failures use `live_verification_incomplete`; runner/reporting failures use `live_runner_failed`, `live_command_launch_failed`, `live_command_timeout`, `live_summary_failed`, `live_json_unreadable`, `live_json_unexpected`, or `command_failed`.

Do not combine `verify:live --clear` with `--checkout`; `--clear` empties the cart, so run it as a separate cleanup verification pass.

For browser-facing changes, also run a live command with a disposable `--data-dir` and document whether it required manual login/location setup. Use `--visible` when diagnosing Zepto rendering or blocking behavior.

## GitHub Workflow

- Use Git/GitHub only when the current user instruction allows it. If the user says local-only, do not run Git or GitHub commands until they explicitly re-enable them.
- Open focused PRs with `gh`.
- Merge only after local or CI checks pass.
- Do not delete branches after merge.
