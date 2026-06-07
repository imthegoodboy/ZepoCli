# ZepoCli

<p align="center">
  <img src="https://upload.wikimedia.org/wikipedia/commons/8/81/Zepto_Logo.svg" alt="Zepto logo" height="54" />
</p>

<p align="center">
  <strong>A terminal-first developer CLI for user-directed Zepto workflows.</strong>
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/zepocli"><img alt="npm" src="https://img.shields.io/npm/v/zepocli?color=7c3aed"></a>
  <a href="https://github.com/imthegoodboy/ZepoCli/actions"><img alt="CI" src="https://img.shields.io/github/actions/workflow/status/imthegoodboy/ZepoCli/ci.yml?branch=main"></a>
  <img alt="Node" src="https://img.shields.io/badge/node-%3E%3D20.19-16a34a">
  <img alt="License" src="https://img.shields.io/badge/license-MIT-111827">
</p>

ZepoCli gives humans and agents a clean command-line interface for shopping workflows that normally happen on Zepto:

- Search products.
- Add, inspect, remove, and clear cart items.
- List, select, and open address management.
- Open a safe checkout handoff.
- Track latest orders, view history, and reorder.
- Emit JSON for scripts and agent tooling.

It is a CLI tool, not an autonomous shopping agent. ZepoCli uses Playwright with the user's own Zepto browser session and only performs explicit user-requested actions.

## Status

Current package state:

- Production CLI command surface is implemented.
- Local package verification passes.
- Production-scope live verification has accepted checkout/payment-link handoff evidence.
- Payment and order placement remain Zepto-owned and human-controlled.

## Install

Requires Node.js 20.19 or newer.

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

## Quick Start

```bash
zepo --visible login
zepo status --live
zepo search milk
zepo add "Amul Milk 500ml"
zepo cart
zepo --visible checkout
zepo track
```

Use JSON when another program or agent consumes output:

```bash
zepo status --live --json
zepo search milk --json
zepo add "milk" --json
zepo cart --json
zepo --visible checkout --json
zepo track --json
```

Full usage guide: [docs/USAGE.md](docs/USAGE.md)

## Command Surface

| Workflow | Commands |
| --- | --- |
| Session | `zepo --visible login`, `zepo logout`, `zepo status`, `zepo status --live` |
| Diagnostics | `zepo doctor` |
| Search | `zepo search <query>` |
| Cart | `zepo add <query>`, `zepo cart`, `zepo remove <query>`, `zepo clear` |
| Addresses | `zepo address list`, `zepo address use <query>`, `zepo --visible address add` |
| Checkout | `zepo --visible checkout`, `zepo --visible checkout --wait` |
| Payment handoff | `zepo --visible checkout --qr`, `zepo --visible checkout --qr-file <path>` |
| Orders | `zepo track`, `zepo history`, `zepo reorder last` |
| Shells | `zepo completion bash\|zsh\|fish\|powershell` |

Most workflow commands support `--json`. Global runtime options include:

```bash
--data-dir <path>
--json
--no-input
--visible
--browser-locale <locale>
--browser-timezone <timezone>
--timeout <ms>
```

## How It Works

```txt
CLI commands -> services -> Playwright automation -> Zepto website
```

ZepoCli stores local session/profile state under the configured data directory, serializes browser automation per data directory, and keeps normal installed-package commands background/headless by default.

Human-only flows require `--visible`:

- `login`
- `address add`
- `checkout`

Those commands fail early with `visible_browser_required` in background mode instead of opening a surprise browser.

## Checkout And Payment

ZepoCli does not process payments and does not click final payment/order controls.

Checkout is a handoff:

```bash
zepo --visible checkout
```

Safe checkout-link QR:

```bash
zepo --visible checkout --qr
zepo --visible checkout --qr-file checkout-link.png
```

The QR payload is the fixed Zepto checkout link:

```txt
https://www.zepto.com/?cart=open
```

It must be opened in the user's Zepto session. It is not Zepto's live UPI QR, not a payment credential, not payment proof, and not order proof.

After the user completes payment inside Zepto:

```bash
zepo track
```

## Agent Use

Agents should:

- Start with `zepo doctor --json` and `zepo status --live --json`.
- Branch on JSON `error.code`, not human prose.
- Treat non-zero exit codes as failure.
- Use one `--data-dir` per active browser session.
- Avoid parallel browser commands against the same data directory.
- Use `--visible` only for human-controlled Zepto flows.
- Never ask for OTPs, card numbers, CVV, UPI PIN, payment handles, or payment tokens.

See [docs/USAGE.md](docs/USAGE.md) for the full agent runbook.

## Verification

Release gate:

```bash
npm run check
```

This runs secret scanning, dependency readiness, TypeScript build, the test suite, compiled CLI verification, installed-package verification, help smoke, audit, pack dry-run, and publish dry-run.

Live Zepto verification is manual and opt-in:

```bash
npm --silent run verify:live -- --data-dir ./.zepo-live --login --production-scope --search milk --address home --add "milk"
npm --silent run verify:live:report -- --require-production-scope --max-age-minutes 1440 ./.zepo-live/live-verification-report.json
```

## Release

Local publish flow:

```bash
npm run check
npm publish --access public
```

Tag-driven release workflow:

```bash
git tag v0.1.0
git push origin v0.1.0
```

Never put npm tokens in the app, README, docs, tests, `.npmrc`, or committed config. Use `NPM_TOKEN` or `NODE_AUTH_TOKEN` only as an environment variable.

## Notes

ZepoCli is an independent developer tool and is not affiliated with Zepto. Zepto owns the Zepto brand, website, checkout, payment, delivery, and order state. Use this CLI only where permitted by Zepto and applicable law.

The Zepto logo shown above is referenced from Wikimedia Commons. It may be subject to trademark restrictions.
