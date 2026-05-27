# ZepoCli

`zepo` is a terminal-first CLI for user-directed Zepto workflows. It uses Playwright to operate the Zepto website with the user's own browser session and hands payment back to Zepto in a visible browser.

## Install

```bash
npm install
npm run build
npm link
npm run prepare:browsers
```

## Commands

```bash
zepo login
zepo status
zepo doctor
zepo search milk
zepo add "Amul Milk 500ml"
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

Most commands that return workflow state or completion status support `--json` for scripts and agents:

```bash
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
    "message": "No confirmed Zepto session found.",
    "hint": "Run `zepo login` first.",
    "exitCode": 1
  }
}
```

## How It Works

The CLI layers are deliberately simple:

```txt
CLI commands -> services -> Playwright automation -> Zepto website
```

Login opens Zepto in a visible browser and stores the browser state locally only after the flow is completed or explicitly confirmed. Search, cart, address, order, and checkout commands reuse that state. Checkout never processes payment details; it verifies Zepto exposes checkout/payment handoff UI, then leaves payment and order placement inside the visible Zepto browser.

Check local readiness before account-dependent commands:

```bash
zepo status
zepo status --json
zepo doctor
zepo doctor --json
```

## Data Storage

By default data is stored under the OS app data directory. Override it for agents, tests, or isolated runs:

```bash
zepo --data-dir ./.zepo login
```

Use `--visible` when diagnosing Zepto rendering, location, or blocking behavior:

```bash
zepo --visible search milk
```

Use `--no-input` for unattended scripts that must fail instead of waiting for a prompt:

```bash
zepo --no-input cart --json
zepo --no-input login --json
```

Interactive flows such as `login`, `address add`, `checkout`, and `add --choose` fail early with a structured error when `--no-input` is set.

Stored data includes:

- Playwright auth state
- Persistent Chromium browser profile data for Zepto session continuity
- SQLite metadata for sessions, searches, cart snapshots, addresses, and order snapshots
- Log file for debugging
- Debug HTML/screenshot artifacts when `--debug` is used and browser automation fails

## Safety Boundaries

- The CLI does not bypass login, OTP, payment, location, age checks, prescriptions, or delivery verification.
- The CLI does not store payment credentials.
- User-visible checkout/payment remains inside Zepto.
- `zepo checkout` is a handoff, not proof that an order was paid or placed; use `zepo track` after completing Zepto payment.
- If Zepto changes its website and automation cannot confidently complete a task, the command fails with a direct error instead of pretending success.

## Verification

```bash
npm run check
node dist/index.js --help
npm pack --dry-run
```
