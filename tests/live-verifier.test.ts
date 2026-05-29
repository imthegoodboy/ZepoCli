import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const rootDir = resolve(import.meta.dirname, "..");
const scriptPath = resolve(rootDir, "scripts", "verify-live-flow.mjs");
const { parseJsonFromOutput, summarizeCommandError } = await import("../scripts/live-report-utils.mjs");

describe("live verification runner", () => {
  it("documents the opt-in human-controlled flow", () => {
    const result = spawnSync(process.execPath, [scriptPath, "--help"], {
      cwd: rootDir,
      encoding: "utf8"
    });

    expect(result.status).toBe(0);
    expect(result.stdout).toContain("human-controlled live verification");
    expect(result.stdout).toContain("--checkout");
    expect(result.stdout).toContain("omits raw page text, addresses, cart item names, payment credentials, and order ids");
  });

  it("requires an explicit data directory before touching the compiled CLI", () => {
    const result = spawnSync(process.execPath, [scriptPath], {
      cwd: rootDir,
      encoding: "utf8"
    });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("Missing required --data-dir <path>.");
  });

  it("parses final JSON after prompt output on stderr", () => {
    const mixedStderr = [
      "? Press enter after the Zepto-side flow is complete.",
      "  You can keep payment inside Zepto.",
      "{",
      '  "ok": false,',
      '  "error": {',
      '    "type": "user_error",',
      '    "code": "zepto_access_cooldown",',
      '    "message": "Recent Zepto verification or block was detected; pausing headless browser automation.",',
      '    "hint": "Use --visible after the cooldown.",',
      '    "exitCode": 1,',
      '    "retryAfterMs": 120000',
      "  }",
      "}"
    ].join("\n");

    expect(parseJsonFromOutput(mixedStderr)).toMatchObject({
      ok: false,
      error: {
        code: "zepto_access_cooldown",
        retryAfterMs: 120000
      }
    });
  });

  it("keeps live report errors stable and sanitized", () => {
    const mixedStderr = [
      "? Press enter after the Zepto-side flow is complete.",
      "{",
      '  "ok": false,',
      '  "error": {',
      '    "type": "user_error",',
      '    "code": "no_confirmed_session",',
      '    "message": "No confirmed Zepto session found.",',
      '    "hint": "Run `zepo login` first.",',
      '    "exitCode": 1',
      "  }",
      "}"
    ].join("\n");
    const parsed = parseJsonFromOutput(mixedStderr);

    expect(summarizeCommandError(parsed?.error, mixedStderr)).toEqual({
      code: "no_confirmed_session",
      message: "No confirmed Zepto session found.",
      hint: "Run `zepo login` first."
    });
  });
});
