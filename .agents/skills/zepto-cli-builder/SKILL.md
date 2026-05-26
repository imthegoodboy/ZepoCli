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
   - Never store UPI IDs, card numbers, CVV, OTPs, or payment tokens.

4. Automation behavior.
   - Prefer resilient Playwright selectors: roles, visible text, form inputs, and short DOM walks.
   - If a selector becomes unreliable, fail with a specific error and hint.
   - Do not silently return fake cart/order/address data.

5. Storage behavior.
   - Session state lives in Playwright storage state.
   - Browser profile data lives in the configured data directory so IndexedDB, cookies, and site state survive between CLI runs.
   - SQLite is for local metadata, snapshots, and cache only.
   - Do not use cached data as proof that a live Zepto operation succeeded.

## Required Checks

Run:

```bash
npm run build
npm test
node dist/index.js --help
```

For browser-facing changes, also run a live command with a disposable `--data-dir` and document whether it required manual login/location setup. Use `--visible` when diagnosing Zepto rendering or blocking behavior.

## GitHub Workflow

- Open focused PRs with `gh`.
- Merge only after local or CI checks pass.
- Do not delete branches after merge.
