import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const rootDir = resolve(import.meta.dirname, "..");
const scriptPath = resolve(rootDir, "scripts", "verify-live-flow.mjs");
const { parseJsonFromOutput, redactArgsForLiveConsole, redactArgsForLiveReport, summarizeCommandError } = await import(
  "../scripts/live-report-utils.mjs"
);

describe("live verification runner", () => {
  it("documents the opt-in human-controlled flow", () => {
    const result = spawnSync(process.execPath, [scriptPath, "--help"], {
      cwd: rootDir,
      encoding: "utf8"
    });

    expect(result.status).toBe(0);
    expect(result.stdout).toContain("human-controlled live verification");
    expect(result.stdout).toContain("--checkout");
    expect(result.stdout).toContain(
      "omits raw page text, addresses, cart item names, payment credentials, order ids, phone input, and local filesystem paths"
    );
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

  it("redacts workflow inputs from stored error messages and hints", () => {
    const args = [
      "--data-dir",
      "C:\\Users\\parth\\.zepo-live",
      "--visible",
      "address",
      "use",
      "Home Tower 7",
      "--json"
    ];

    expect(
      summarizeCommandError(
        {
          code: "address_not_selected",
          message: 'Zepto did not show a selected address matching "Home Tower 7" after the selection click.',
          hint: "Rerun with C:\\Users\\parth\\.zepo-live and confirm Home Tower 7 is selected."
        },
        "",
        args
      )
    ).toEqual({
      code: "address_not_selected",
      message: 'Zepto did not show a selected address matching "<redacted-address-query>" after the selection click.',
      hint: "Rerun with <redacted-data-dir> and confirm <redacted-address-query> is selected."
    });
  });

  it("redacts workflow inputs from fallback stderr summaries", () => {
    expect(
      summarizeCommandError(
        undefined,
        'Could not find a Zepto product matching "Amul Milk 500ml".\nMore details are omitted.',
        ["--data-dir", ".zepo-live", "--visible", "add", "Amul Milk 500ml", "--json"]
      )
    ).toEqual({
      code: "command_failed",
      message: 'Could not find a Zepto product matching "<redacted-query>".'
    });
  });

  it("redacts sensitive workflow arguments from stored report commands", () => {
    expect(
      redactArgsForLiveReport([
        "--data-dir",
        "C:\\Users\\parth\\.zepo-live",
        "--visible",
        "add",
        "Amul Milk 500ml",
        "--quantity",
        "2",
        "--json"
      ])
    ).toEqual([
      "--data-dir",
      "<redacted-data-dir>",
      "--visible",
      "add",
      "<redacted-query>",
      "--quantity",
      "2",
      "--json"
    ]);

    expect(
      redactArgsForLiveReport([
        "--data-dir",
        "/home/user/.zepo-live",
        "--visible",
        "address",
        "use",
        "Home Tower 7",
        "--json"
      ])
    ).toEqual([
      "--data-dir",
      "<redacted-data-dir>",
      "--visible",
      "address",
      "use",
      "<redacted-address-query>",
      "--json"
    ]);

    expect(
      redactArgsForLiveReport([
        "--data-dir",
        ".zepo-live",
        "--visible",
        "search",
        "protein bars",
        "--report",
        "C:\\Users\\parth\\report.json",
        "--json"
      ])
    ).toEqual([
      "--data-dir",
      "<redacted-data-dir>",
      "--visible",
      "search",
      "<redacted-query>",
      "--report",
      "<redacted-report-path>",
      "--json"
    ]);
  });

  it("keeps console command output useful while redacting phone input", () => {
    expect(
      redactArgsForLiveConsole([
        "--data-dir",
        ".zepo-live",
        "--visible",
        "login",
        "--phone",
        "9999999999",
        "--json"
      ])
    ).toEqual(["--data-dir", ".zepo-live", "--visible", "login", "--phone", "<redacted-phone>", "--json"]);

    expect(
      redactArgsForLiveConsole(["--data-dir", ".zepo-live", "--visible", "add", "Amul Milk 500ml", "--json"])
    ).toEqual(["--data-dir", ".zepo-live", "--visible", "add", "Amul Milk 500ml", "--json"]);
  });
});
