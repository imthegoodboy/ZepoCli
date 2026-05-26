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

## How It Works

The CLI layers are deliberately simple:

```txt
CLI commands -> services -> Playwright automation -> Zepto website
```

Login opens Zepto in a visible browser and stores the browser state locally only after the flow is completed or explicitly confirmed. Search, cart, address, order, and checkout commands reuse that state. Checkout never processes payment details; it opens Zepto checkout and waits for the user to complete payment in the browser.

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
- If Zepto changes its website and automation cannot confidently complete a task, the command fails with a direct error instead of pretending success.

## Verification

```bash
npm run check
node dist/index.js --help
npm pack --dry-run
```
