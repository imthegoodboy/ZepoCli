# ZepoCli Agent Notes

This project is a developer CLI tool, not an autonomous shopping agent.

## Product Boundary

Build and maintain `zepo` like a normal production CLI:

- Commands are explicit user actions.
- Browser automation performs the requested Zepto workflow.
- Payment, OTP, address confirmation, age checks, prescription checks, and delivery verification stay in Zepto-controlled browser UI.
- Do not add fake "AI agent" features, autonomous purchasing, background ordering, or placeholder commands.
- If a command cannot really complete or hand off to Zepto, fail clearly with an actionable message.

## Current Architecture

```txt
CLI commands
  -> services
  -> Playwright automation
  -> Zepto website
```

Storage:

- Playwright auth state: local `auth-state.json`
- Metadata/cache: SQLite
- Logs: local file under the configured data directory

## Researched Zepto Facts

Sources checked on 2026-05-27:

- Official site: https://www.zepto.com/
- Terms: https://www.zepto.com/s/terms-of-service
- App Store listing: https://apps.apple.com/us/app/zepto-groceries-in-minutes/id1575323645

Relevant product behavior:

- Zepto supports website/app shopping for groceries, cafe, electronics, fashion, pharmacy, pet care, and other quick-commerce categories.
- Users log in and manage account information including phone and delivery address.
- Cart and checkout show product pricing, delivery charges, handling/convenience/platform/surge-style charges when applicable.
- Payment methods are Zepto-side flows such as UPI, cards, wallets, netbanking, and COD when available.
- Delivery ETA is shown by Zepto and may vary.
- Users are responsible for accurate delivery address details.

Implementation consequence:

- `zepo checkout` must open Zepto checkout in a visible browser and let the user complete payment.
- The CLI must not collect or store payment credentials.
- The CLI should reuse the user's own session and should not bypass platform controls.

## Verification Expectations

Before claiming production readiness:

- `npm run build` passes.
- `npm test` passes.
- `node dist/index.js --help` shows the intended command surface.
- At least one browser smoke test is run against Zepto for search or login handoff when Chromium is available.
- Commands that depend on a real Zepto account are marked verified only after a human-controlled session exercises them.
