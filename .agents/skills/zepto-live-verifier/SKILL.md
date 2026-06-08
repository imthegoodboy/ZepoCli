---
name: zepto-live-verifier
description: Verify ZepoCli's real human-controlled Zepto workflow without confusing local smoke tests for end-to-end proof.
---

# ZepoCli Live Verifier Skill

Use this skill when deciding whether ZepoCli is production-ready end to end, when running `npm run verify:live`, or when documenting live account verification status.

## Verification Boundary

- Local gates prove the CLI package shape, parser behavior, JSON contracts, safety guards, and browser launch readiness.
- They do not prove a real Zepto account can complete login, address selection, cart mutation, checkout handoff, payment, tracking, history, or reorder in the current Zepto UI.
- Do not mark the project fully complete until a human-controlled Zepto account exercises the required live workflow and the sanitized live report proves each requested step.
- Never treat cached SQLite data, old screenshots, raw page text, or a successful checkout handoff as proof of payment or order placement.

## Required Local Preflight

Run the full local gate before live verification:

```bash
npm run check
```

For a safe no-account smoke, run `verify:live` with a disposable data directory and no `--login`. Expected result:

- `doctor` passes, including background-mode `doctor --json` Playwright Chromium launch evidence for no-workflow/local smokes.
- `status` passes with structured browser automation readiness for the current mode.
- The runner stops with `live_verification_incomplete` for missing login.
- Slow human-controlled steps fail with `live_command_timeout`; increase `--step-timeout <ms>` only when the Zepto browser step legitimately needs more time.
- The report, live runner command echoes, and final report-path line redact data directory, report path, browser locale/timezone values, phone input, workflow query arguments, order ids, payment handles, card-like numbers, OTP/PIN values, npm-token-shaped values, standalone percent-encoded sensitive fragments, and raw Zepto page text. Stored step commands must match the runner's redacted command shapes.

## Human-Controlled Live Pass

Use a dedicated persistent data directory:

```bash
npm run build
npm --silent run verify:live -- --data-dir ./.zepo-live --login --production-scope --search milk --address home --add "Amul Milk 500ml"
npm --silent run verify:live -- --data-dir ./.zepo-live --login --production-scope --search milk --address home --add "Amul Milk 500ml" --add-remove-limit-items --cart-remove-limit-items --checkout-remove-limit-items
```

`--login` is conditional. If the dedicated data directory already has a confirmed session, the runner must not force a fresh login or claim login coverage; it should require `liveSession` coverage from `status --live` instead.
When a live account workflow is requested, the runner uses `--visible doctor --json` and `--visible status --json` for preflight so background/headless cooldowns do not block human-controlled verification by themselves.
With no live workflow flags, a data directory that already has a confirmed local session should stop after doctor/local status instead of opening a visible `status --live`; a no-session smoke still fails at the session precondition.
`--production-scope` is the final readiness preset shape. It requires `--search`, `--address`, and `--add`, then requests non-empty cart with total/payable evidence, safe checkout/payment-link handoff, and track coverage so the saved report can be checked with `verify:live:report --require-production-scope --max-age-minutes 1440`. A successful `checkout_manual_action_required` checkout step can satisfy checkout handoff coverage when it preserves the fixed `paymentLink`, `paymentLinkSession`, human-action boundary markers, non-empty cart evidence, and payable-total evidence; it still is not payment proof or order-placement proof. Use `--checkout-wait` only when the human wants to continue inside Zepto before checkout JSON returns. Use `--add-remove-limit-items` only when the visible Zepto add verification step shows item-limit warnings and the human explicitly wants the runner to click Zepto's `Remove Items` action before reading cart. Use `--cart-remove-limit-items` only when the visible Zepto cart evidence step shows item-limit warnings and the human explicitly wants the runner to click Zepto's `Remove Items` action before reading cart. Use `--checkout-remove-limit-items` only when the visible Zepto cart shows item-limit warnings and the human explicitly wants the runner to click Zepto's `Remove Items` action before checkout.
`--browser-locale <locale>` and `--browser-timezone <timezone>` are optional; when supplied, the live runner passes the same validated browser context to every child `zepo` command and stores only `<redacted-browser-locale>` / `<redacted-browser-timezone>` in report command strings.

Use `npm --silent run verify:live -- ...` so npm does not echo raw invocation arguments before the runner can redact internal `zepo` command lines.
`verify:live` value options accept both `--option value` and `--option=value`; both forms must keep phone input, workflow queries, browser context values, local paths, and npm-token-shaped values redacted from report commands and console diagnostics.

If `verify:live` is interrupted with Ctrl+C/SIGTERM during a visible human handoff, it should signal the active child command, write the same sanitized partial report when possible, and keep console paths redacted.

After a human-controlled run, validate the saved report:

```bash
npm --silent run verify:live:report -- ./.zepo-live/live-verification-report.json
npm --silent run verify:live:report -- --require-production-scope --max-age-minutes 1440 ./.zepo-live/live-verification-report.json
```

`verify:live:report` does not contact Zepto or prove a fresh run happened. It only checks the saved report contract before agents treat the report as acceptance evidence.
Use `--require-production-scope` for final readiness so a valid partial report cannot be mistaken for core production workflow proof. Use `--max-age-minutes 1440` for final readiness so stale saved reports cannot be reused as current evidence. Final production-scope acceptance requires checkout/payment-link handoff evidence with fixed session markers and payable cart evidence; checkout wait evidence is optional and only proves a human waited inside Zepto before the command returned.
`verify:live:report --max-age-minutes` accepts both `--max-age-minutes 1440` and `--max-age-minutes=1440`; invalid values should fail with generic diagnostics.
`zepo --visible checkout --json` returns structured handoff evidence immediately instead of waiting for an Enter prompt, so live verification can parse the checkout boundary without hanging; that immediate JSON mode closes its Playwright browser context after returning and reports `browserOpenAfterReturn: false` plus `checkoutWaitCompleted: false`. Use `--checkout-wait` only when a human is ready to continue in the visible Zepto browser before JSON returns; the live runner prints `Payment link: https://www.zepto.com/?cart=open` plus `Payment link session: user_zepto_session_required` before launching the waiting checkout command so a later prompt timeout still leaves the Zepto-owned session link in the console. JSON wait mode also prints the same link/session marker to stderr before the prompt, and reports `checkoutWaitCompleted: true` only after the human presses Enter. Use `--checkout-remove-limit-items` only for the explicit Zepto item-limit warning removal before that checkout handoff; it does not make checkout/payment autonomous. Wait mode re-checks the visible page after Enter; if a human-clicked manual continuation reaches a real checkout/payment handoff surface, the checkout step may return `checkout_handoff_returned`. Checkout JSON must include `paymentLinkSession: "user_zepto_session_required"` plus fixed `handoffUrl: "https://www.zepto.com/?cart=open"`, `paymentHandoffUrl: "https://www.zepto.com/?cart=open"`, `paymentLink: "https://www.zepto.com/?cart=open"`, `handoffSurface: "visible_zepto_browser"`, `browserOpenAfterReturn: false`, `checkoutWaitCompleted`, and `manualPaymentControlVisible` markers; `paymentLink` is the Zepto-owned payment/checkout link the user or agent can navigate to in the user's Zepto session, not a payment-provider URL, payment proof, or order proof. Checkout-link QR commands (`zepo cart --qr`, cart `--qr-file`, checkout `--qr`, and checkout `--qr-file`) may render or save only a QR for this fixed Zepto checkout link. `zepo payment` and `zepo payment --qr-file` may fetch Zepto's live UPI payment QR as an explicit user-requested payment command; this remains a live payment instrument, not payment proof or order proof. Do not log decoded UPI payloads outside the user's payment flow. Sanitized checkout report evidence includes the same handoff URL/link/session markers without raw Zepto page text. Checkout JSON may also include sanitized `cartEvidence` with item count plus payable-total presence only, and live reports flatten that as `checkoutCartItemCount` plus `checkoutHasPayableTotal`. If Zepto exposes only an amount-bearing cart payment control such as `Continue to Payment ₹...` or `Proceed to Payment ₹...`, `status: "checkout_manual_action_required"` can be accepted as checkout handoff coverage only when emitted as a successful JSON checkout step with the fixed payment link/session markers and payable cart evidence. It remains CLI payment-link handoff evidence only and does not prove payment or order placement.
When `verify:live` reaches `checkout_manual_action_required`, the runner console should print the fixed `Payment link: https://www.zepto.com/?cart=open` plus `Payment link session: user_zepto_session_required` so the human/operator can open the Zepto-owned checkout/payment link in the user's Zepto session without reading the saved report first. This is handoff guidance only, not payment proof or order proof.

Optional focused passes:

```bash
npm --silent run verify:live -- --data-dir ./.zepo-live --login --address-list
npm --silent run verify:live -- --data-dir ./.zepo-live --login --address-add
npm --silent run verify:live -- --data-dir ./.zepo-live --login --add "protein bars" --choose-add --cart
npm --silent run verify:live -- --data-dir ./.zepo-live --login --history
npm --silent run verify:live -- --data-dir ./.zepo-live --login --reorder-last --cart
npm --silent run verify:live -- --data-dir ./.zepo-live --login --add "Amul Milk 500ml" --remove "Amul Milk" --cart
npm --silent run verify:live -- --data-dir ./.zepo-live --login --clear --cart
```

Do not combine `--clear` with `--checkout`; clearing the cart destroys checkout evidence.

## Safety Rules

- Keep OTP, UPI PIN, card, CVV, address confirmation, age checks, prescriptions, delivery verification, and payment completion inside Zepto's visible browser UI.
- ZepoCli may open checkout/payment handoff, but it must not click final payment or final order-placement controls.
- Checkout-link QR commands may generate only the fixed Zepto checkout-link QR. `zepo payment` may show Zepto's live UPI payment QR for the current cart, but it must still not process payment, observe payment proof, or confirm order placement.
- If Zepto shows access challenges, 403/429 responses, verification surfaces, or cooldown signals, stop or switch to a visible human-controlled flow. Do not loop headless commands.
- Use `--phone` only with `--login`; accepted formats are the same as `zepo login --phone`: 10-digit Indian mobile, `+91`, or leading `0`.
- Live verifier stderr streaming must redact across chunk boundaries, including immediate visible handoff streams for login, checkout, address add, and `zepo add --choose`, so split workflow queries, phone/order/payment/verification values, local paths, and npm-token-shaped values are not printed before the runner writes the sanitized report.

## Report Acceptance

The live report is acceptable only when:

- `ok` is true.
- `version` matches `package.json`.
- `generatedAt` is a valid non-future ISO timestamp, satisfies any `--max-age-minutes` freshness window used for acceptance, `dataDir`/`reportPath` use redacted markers, and `note` matches the runner literal.
- The report contains only accepted schema fields; extra fields are not acceptable evidence.
- Stored step command strings match the redacted command contract.
- For every checkout step, `checkoutWaitCompleted` in `summary` or `manualEvidence` matches whether the stored redacted checkout command includes `--wait`; an immediate checkout command cannot claim wait completion, and a wait-mode command cannot omit it.
- Manual/internal command markers are valid only for runner-defined precondition/internal failure steps.
- Passing steps include `exitCode: 0` and a summary; failing steps include a non-zero `exitCode` and an error.
- Failing step error objects use stable `code`, readable `message`/`hint`, and valid `retryAfterMs` fields bounded to runner-supported timing.
- `ok: true` reports contain only passing known workflow steps.
- Every workflow step name appears at most once in an ok report.
- Ok report workflow steps follow the live runner order.
- Workflow step summaries include every runner-defined key.
- Workflow step summary values keep the runner's expected types.
- Address summaries require structural address detail without storing raw address text, product summaries require a readable name plus price or unit detail, cart count summaries count readable item records only, and order count summaries count status/ETA-bearing records only; placeholder objects such as `{}`, label-only address rows such as `Home`, name-only product rows such as `Amul Milk 500ml`, payment/cart/order text, total-only rows, and date-only rows are not live evidence.
- String and string-array workflow step summary values stay within runner-known values.
- Related workflow step summary fields are internally consistent.
- Numeric workflow step summaries stay within runner-supported ranges.
- Every passing workflow step summary satisfies its known report contract, even when that capability was not requested.
- `requested` shows the explicit verification scope without workflow query values.
- `attempted` shows which workflow capabilities the runner reached.
- `coverage` shows which workflow capabilities actually passed; do not treat omitted or false coverage fields as verified.
- `requested`, `attempted`, `coverage`, and `missingCoverage` contain every supported capability as booleans.
- `attempted` and `coverage` match the saved `steps` array; agents must reject edited summaries that do not match step evidence.
- Manual precondition failures such as a missing confirmed session are incomplete manual steps, not workflow attempts; do not treat them as login, live-session, checkout, or order evidence.
- `coverage.checkoutManualBoundary: true` can come only from valid sanitized manual checkout evidence showing Zepto's human-only payment-control boundary. It is diagnostic on incomplete reports; a successful `checkout_manual_action_required` checkout summary can satisfy `coverage.checkoutHandoff` as payment-link handoff evidence without proving payment or order placement.
- The report keys and values do not contain sensitive-looking local paths, phone/order/payment/verification values, or npm-token-shaped values.
- `missingCoverage` shows requested capabilities that did not pass; all values must be false before treating a requested scope as verified.
- `doctor` shows ready browser automation and a passing `Playwright Chromium` check.
- Reports with `liveSession` requested preserve visible `doctor` and `status` preflight command strings.
- Local `status` shows ready browser automation and an explicit `liveSessionState` summary before live account workflows.
- `login` confirms `sessionSaved: true` and `confirmedSession: true` when a login step actually runs.
- Existing confirmed sessions with `--login` leave `requested.login` false and require `requested.liveSession` to pass instead.
- `status live` reports ready browser automation and `liveSession.state: "logged-in"`.
- `search` has one or more product results with readable price or unit detail when requested.
- `add` has selected product evidence with readable price or unit detail and readable cart items when requested.
- `cart`, `remove`, `clear`, `checkout`, `track`, `history`, and `reorder` satisfy their named live report contracts when requested. `remove` coverage requires `removedItems` evidence with readable price or unit detail plus the resulting cart. `history` coverage requires at least one readable order record with status or ETA; an empty `zepo history` result is valid CLI output only, not order-history live-report coverage.
- `checkout` preserves `handoffUrl: "https://www.zepto.com/?cart=open"`, `paymentHandoffUrl: "https://www.zepto.com/?cart=open"`, `paymentLink: "https://www.zepto.com/?cart=open"`, `paymentLinkSession: "user_zepto_session_required"`, `handoffSurface: "visible_zepto_browser"`, `cartPrecondition: "non_empty_cart_verified"`, `manualPaymentControlVisible`, sanitized checkout cart count/payable-total evidence, `paymentStatus: "not_observed_by_zepocli"`, `orderPlacement: "not_confirmed_by_zepocli"`, and `orderStatusCommand: "zepo track"`.
- Checkout coverage requires either `status: "checkout_handoff_returned"` or successful `status: "checkout_manual_action_required"` plus the fixed handoff/lifecycle markers including `handoffUrl`, `paymentHandoffUrl`, `paymentLink`, `paymentLinkSession`, `handoffSurface`, `browserOpenAfterReturn: false`, boolean `checkoutWaitCompleted`, boolean `manualPaymentControlVisible`, positive `checkoutCartItemCount`, `checkoutHasPayableTotal: true`, `paymentStatus: "not_observed_by_zepocli"`, and `orderPlacement: "not_confirmed_by_zepocli"`. A `manualEvidence` block on a failed or timed-out report remains diagnostic and does not satisfy checkout coverage.
- With `--require-production-scope`, browser preflight, local status, live session, address selection, search, add, a non-empty cart with total/payable evidence, checkout/payment-link handoff, and track must be explicitly requested and have passing coverage, focused workflows such as address-add, address-list, remove, clear, history, and reorder must not be mixed into final evidence, and `--max-age-minutes` must be supplied so production-scope evidence is fresh.

If any step fails with a stable `live_*_contract_mismatch`, `live_command_timeout`, `command_failed`, or `live_verification_incomplete` code, the live workflow is not fully verified yet. A checkout `--wait` timeout report may include the fixed `Payment link: https://www.zepto.com/?cart=open` and `Payment link session: user_zepto_session_required` in `error.hint` for handoff recovery. If the timed-out checkout child had already printed ZepoCli's fixed human-only cart payment-control warning, the hint may also say Zepto exposed that manual control before timeout; this remains recovery guidance only and must still leave checkout and track coverage missing.
