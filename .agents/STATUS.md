# ZepoCli Current Status

Last updated: 2026-06-04.

## Local Package State

- `npm run check` passed locally on 2026-06-04 at 19:24 IST after the cart-read recovery and swap-suggestion parser fixes: secret scan, dependency readiness, build, 34 test files, 631 tests, compiled CLI smoke, installed-package smoke, audit, pack dry-run, and publish dry-run.
- `npm run check` passed locally again on 2026-06-04 at 18:02 IST after the order-history navigation hardening: 34 test files, 628 tests, compiled CLI smoke, installed-package smoke, audit, pack dry-run, and publish dry-run.
- A fresh compiled CLI smoke on 2026-06-04 with `node dist/index.js --data-dir ./.zepo-final-smoke status --json` reported `browserAutomationMode.default: "background_headless"`, `browserAutomationMode.current: "background_headless"`, `browserAutomationMode.visibleRequested: false`, `browserAutomation.ready: true`, no browser lock, no profile data, no headless run history, and no access cooldown.
- The npm package shape, compiled CLI entry, installed `zepo` binary, command help, JSON error contracts, no-surprise-browser guards, dependency readiness, secret scanning, audit, pack dry-run, and publish dry-run were verified by the local gate.
- `zepo completion <bash|zsh|fish|powershell>` is now part of the developer CLI surface. It is generated from the registered command tree plus Commander built-ins, includes `help`, nested help topics such as `help address`, and built-in `-h/--help`, and remains runtime-free and browser-free; compiled and installed-package smokes cover bash, zsh, fish, PowerShell, the `pwsh`/`ps1` aliases, and unsupported-shell JSON errors, and the installed README documents those PowerShell aliases.
- Compiled and installed-package verifiers also assert that `zepo --data-dir <new-dir> completion bash` does not create the requested data directory, proving shell completion generation does not initialize runtime storage, services, SQLite, or Playwright.
- The packed npm package now ships the exposed verifier entrypoints `scripts/verify-cli.mjs`, `scripts/verify-package.mjs`, `scripts/verify-live-flow.mjs`, and `scripts/verify-live-report.mjs`; installed-package checks assert `verify:live` and `verify:live:report` are wired to those scripts, and disposable installed-package `npm run verify:cli --silent` and `npm run verify:package --silent` smokes passed on 2026-06-04. Installed-package `verify:package` uses `npm pack --ignore-scripts` for its nested pack so runtime installs do not need dev-only `tsc`.
- Installed-package commands default to background/headless browser automation. Human-only login, address-add, and checkout handoffs require `--visible` and fail early with `visible_browser_required` before browser launch/profile writes/headless run accounting.
- Final CLI help now describes `login`, `address add`, and `checkout` as commands that require `--visible`, while the global `--visible` option documents that the default remains background/headless. After that wording change, `npm run check` passed on 2026-06-04.
- Do not parallelize browser-capable commands against the same `--data-dir`, including quick status/search/login/checkout experiments. ZepoCli intentionally serializes browser work per data directory and will report `browser_lock_active` on overlapping runs; run such checks serially or use separate data directories only for independent sessions.

## External Zepto References

- Official Zepto Terms of Use were rechecked on 2026-06-04 at `https://www.zepto.com/s/terms-of-service`: version 1.4, last updated 1 November 2025.
- Official Zepto Privacy Notice was rechecked on 2026-06-04 at `https://staticweb.zepto.com/privacy-policy/`: version 1.1, last updated 17 June 2025.
- Keep the CLI aligned with these boundaries: user-directed access only, no resale/bulk/load-generation flows, no payment handling inside the CLI, no OTP/payment credential capture, and no bypassing Zepto protections.

## Live Zepto Evidence

- A safe no-account `verify:live` smoke on 2026-06-04 using `./.zepo-live-smoke-current` passed `doctor` and local `status`, then stopped at the manual session precondition with `live_verification_incomplete`; it did not claim login, live-session, checkout, or order coverage. The ordinary report validator rejected the saved report with `live_report_not_ok`, which is correct because this smoke is incomplete evidence, not an acceptable live pass.
- A conservative public headless search smoke on 2026-06-04 returned Zepto HTTP 429 and the CLI emitted structured `error.code: "zepto_access_challenge"` with `retryAfterMs: 900000`.
- A `.zepo-live-prod` local-status check on 2026-06-04 showed a confirmed local session marker with no active browser lock. Earlier headless `status --live --json` checks returned Zepto HTTP 429 with `error.code: "zepto_access_challenge"` and `retryAfterMs: 900000`, including one retry after the cooldown cleared; do not loop headless live-session checks after this signal.
- A focused human-controlled visible live-session probe on 2026-06-04 using `.zepo-live-prod` and `npm --silent run verify:live -- --data-dir ./.zepo-live-prod --login --report ./.zepo-live-prod/live-session-report.json --step-timeout 120000` passed `doctor`, local `status`, and visible `status --live --json`. The saved focused report was accepted by `npm --silent run verify:live:report -- --max-age-minutes 1440 ./.zepo-live-prod/live-session-report.json`. This proves fresh browser preflight, local status, and live-session coverage only; it does not prove address selection, search, add, cart, checkout handoff, or track.
- A focused human-controlled visible order-history probe on 2026-06-04 using `.zepo-live-prod` and `npm --silent run verify:live -- --data-dir ./.zepo-live-prod --login --history --report ./.zepo-live-prod/live-history-report.json --step-timeout 180000` passed `doctor`, local `status`, visible `status --live --json`, and visible `history --json` after adding a bounded account-surface settle and `/account` fallback that still avoids direct `/orders`. The saved report was accepted by `npm --silent run verify:live:report -- --max-age-minutes 1440 ./.zepo-live-prod/live-history-report.json`. This proves focused history coverage only; it does not prove checkout handoff or post-payment order tracking.
- A focused visible add/cart probe on 2026-06-04 using `.zepo-live-prod` and a current exact product query passed `zepo add --json` after the bounded cart-read recovery. It proved the add command can recover when Zepto opens an unhydrated or initially unconfirmed cart surface, while still avoiding any direct `/cart` URL.
- A sanitized visible cart probe after the swap-suggestion parser fix reported a non-empty cart with a total and zero cart rows named as Zepto swap controls. This proves the cart parser no longer counts Zepto's swap suggestion controls as active cart items in that live session.
- The latest `.zepo-live-prod/live-verification-report.json` production-scope run on 2026-06-04 passed browser preflight, local status, live session, address selection, search, add, and cart coverage. It failed at checkout with `live_verification_incomplete` because Zepto exposed a manual payment-control action that ZepoCli correctly does not click; checkout handoff coverage and track coverage remain missing.
- Do not loop headless Zepto commands after this signal. Wait for cooldown or use an explicitly human-controlled visible flow when the user asks for it.
- This 429 result is not a product-search failure to work around with stealth, custom user agents, CAPTCHA bypasses, or aggressive retries. It is correct stop behavior under the project safety rules.

## Still Required Before Claiming Production Ready

- A fresh human-controlled production-scope live report is still missing.
- Required final command shape:

```bash
npm --silent run verify:live -- --data-dir <dedicated-dir> --login --production-scope --search <query> --address <query> --add <query>
```

- Required acceptance command:

```bash
npm --silent run verify:live:report -- --require-production-scope --max-age-minutes 1440 <report-path>
```

- Final readiness requires passing coverage for browser preflight, local status, live session, address selection, search, add, non-empty cart, checkout handoff, and track. Checkout handoff is not payment proof; payment and final order placement remain Zepto-side and unobserved by ZepoCli.
