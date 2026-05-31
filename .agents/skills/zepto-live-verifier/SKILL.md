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

- `doctor` passes, including normal `doctor --json` Playwright Chromium launch evidence.
- `status` passes with structured browser automation readiness.
- The runner stops with `live_verification_incomplete` for missing login.
- Slow human-controlled steps fail with `live_command_timeout`; increase `--step-timeout <ms>` only when the Zepto browser step legitimately needs more time.
- The report, live runner command echoes, and final report-path line redact data directory, report path, phone input, workflow query arguments, order ids, payment handles, card-like numbers, OTP/PIN values, npm-token-shaped values, standalone percent-encoded sensitive fragments, and raw Zepto page text. Stored step commands must match the runner's redacted command shapes.

## Human-Controlled Live Pass

Use a dedicated persistent data directory:

```bash
npm run build
npm --silent run verify:live -- --data-dir ./.zepo-live --login --search milk --address home --add "Amul Milk 500ml" --cart --checkout --track
```

`--login` is conditional. If the dedicated data directory already has a confirmed session, the runner must not force a fresh login or claim login coverage; it should require `liveSession` coverage from `status --live` instead.

Use `npm --silent run verify:live -- ...` so npm does not echo raw invocation arguments before the runner can redact internal `zepo` command lines.

If `verify:live` is interrupted with Ctrl+C/SIGTERM during a visible human handoff, it should signal the active child command, write the same sanitized partial report when possible, and keep console paths redacted.

After a human-controlled run, validate the saved report:

```bash
npm --silent run verify:live:report -- ./.zepo-live/live-verification-report.json
```

`verify:live:report` does not contact Zepto or prove a fresh run happened. It only checks the saved report contract before agents treat the report as acceptance evidence.

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
- If Zepto shows access challenges, 403/429 responses, verification surfaces, or cooldown signals, stop or switch to a visible human-controlled flow. Do not loop headless commands.
- Use `--phone` only with `--login`; accepted formats are the same as `zepo login --phone`: 10-digit Indian mobile, `+91`, or leading `0`.

## Report Acceptance

The live report is acceptable only when:

- `ok` is true.
- `version` matches `package.json`.
- `generatedAt` is a valid ISO timestamp, and `dataDir`/`reportPath` use redacted markers.
- The report contains only accepted schema fields; extra fields are not acceptable evidence.
- Stored step command strings match the redacted command contract.
- Passing steps include `exitCode: 0` and a summary; failing steps include a non-zero `exitCode` and an error.
- Failing step error objects use stable `code`, readable `message`/`hint`, and valid `retryAfterMs` fields.
- `ok: true` reports contain only passing known workflow steps.
- Every workflow step name appears at most once in an ok report.
- Ok report workflow steps follow the live runner order.
- Workflow step summaries include every runner-defined key.
- Workflow step summary values keep the runner's expected types.
- String and string-array workflow step summary values stay within runner-known values.
- Related workflow step summary fields are internally consistent.
- Numeric workflow step summaries stay within runner-supported ranges.
- Every passing workflow step summary satisfies its known report contract, even when that capability was not requested.
- `requested` shows the explicit verification scope without workflow query values.
- `attempted` shows which workflow capabilities the runner reached.
- `coverage` shows which workflow capabilities actually passed; do not treat omitted or false coverage fields as verified.
- `requested`, `attempted`, `coverage`, and `missingCoverage` contain every supported capability as booleans.
- `attempted` and `coverage` match the saved `steps` array; agents must reject edited summaries that do not match step evidence.
- The report keys and values do not contain sensitive-looking local paths, phone/order/payment/verification values, or npm-token-shaped values.
- `missingCoverage` shows requested capabilities that did not pass; all values must be false before treating a requested scope as verified.
- `doctor` shows ready browser automation and a passing `Playwright Chromium` check.
- `login` confirms `sessionSaved: true` and `confirmedSession: true` when a login step actually runs.
- Existing confirmed sessions with `--login` leave `requested.login` false and require `requested.liveSession` to pass instead.
- `status live` reports `liveSession.state: "logged-in"`.
- `search` has one or more product results when requested.
- `add` has both selected product evidence and readable cart items when requested.
- `cart`, `remove`, `clear`, `checkout`, `track`, `history`, and `reorder` satisfy their named live report contracts when requested.
- `checkout` preserves `paymentStatus: "not_observed_by_zepocli"`, `orderPlacement: "not_confirmed_by_zepocli"`, and `orderStatusCommand: "zepo track"`.

If any step fails with a stable `live_*_contract_mismatch`, `live_command_timeout`, `command_failed`, or `live_verification_incomplete` code, the live workflow is not fully verified yet.
