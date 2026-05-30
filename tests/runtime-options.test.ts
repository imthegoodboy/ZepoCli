import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";

import { describe, expect, it } from "vitest";
import { ZodError } from "zod";

import { parseRuntimeOptions, toRuntimeSetupError } from "../src/commands/shared.js";
import { closeRuntime, closeRuntimeBestEffort, createRuntime } from "../src/config/runtime.js";
import { UserFacingError } from "../src/utils/errors.js";

describe("global runtime options", () => {
  it("parses visible/debug/timeout flags", () => {
    expect(
      parseRuntimeOptions({
        visible: true,
        debug: true,
        input: false,
        timeout: "45000",
        dataDir: ".zepo-test"
      })
    ).toEqual({
      visible: true,
      debug: true,
      input: false,
      timeout: 45000,
      dataDir: ".zepo-test"
    });
  });

  it("rejects invalid timeout before runtime creation with stable issue messages", () => {
    expectRuntimeOptionIssue("abc", "must be a decimal integer number of milliseconds");
    expectRuntimeOptionIssue("1e3", "must be a decimal integer number of milliseconds");
    expectRuntimeOptionIssue("999", "must be at least 1000 ms");
    expectRuntimeOptionIssue("300001", "must be at most 300000 ms");
  });

  it("rejects blank data directories before runtime creation", () => {
    expect(() => parseRuntimeOptions({ dataDir: "   " })).toThrow(ZodError);
  });

  it("converts runtime setup failures into actionable user errors", () => {
    const error = toRuntimeSetupError(new Error("EEXIST: file already exists"), "./blocked");

    expect(error).toBeInstanceOf(UserFacingError);
    expect(error.message).toBe("Could not initialize local ZepoCli storage at ./blocked.");
    expect(error.hint).toContain("zepo --data-dir <path> doctor");
    expect(error.hint).toContain("EEXIST");
  });

  it("closes SQLite and the runtime log destination together", () => {
    let sqliteClosed = false;
    let flushed = false;
    let ended = false;

    closeRuntime({
      sqlite: {
        close: () => {
          sqliteClosed = true;
        }
      },
      logDestination: {
        flushSync: () => {
          flushed = true;
        },
        end: () => {
          ended = true;
        }
      }
    } as never);

    expect(sqliteClosed).toBe(true);
    expect(flushed).toBe(true);
    expect(ended).toBe(true);
  });

  it("does not let best-effort runtime cleanup replace command errors", () => {
    expect(() =>
      closeRuntimeBestEffort({
        sqlite: {
          close: () => {
            throw new Error("sqlite close failed");
          }
        },
        logDestination: {
          flushSync: () => {
            throw new Error("sonic boom is not ready yet");
          },
          end: () => {
            throw new Error("log end failed");
          }
        }
      } as never)
    ).not.toThrow();
  });

  it("redacts sensitive-looking values from persistent runtime logs", async () => {
    const dataDir = mkdtempSync(join(tmpdir(), "zepo-runtime-log-redaction-"));
    const runtime = createRuntime({ dataDir, debug: true });
    const fakeNpmToken = `npm_${"A".repeat(24)}`;

    try {
      await waitForLogDestinationReady(runtime.logDestination);
      runtime.logger.error(
        {
          error: `Order #ZEP1234 OTP 123456 failed for +91-98765-43210 with ${fakeNpmToken} near C:\\Users\\parth\\.zepo-live\\trace.txt and C:/Users/parth/.zepo-live/trace.txt`,
          browserProfileDir: runtime.paths.browserProfileDir,
          nested: {
            payment: "card 4111 1111 1111 1111 and handle abc@upi",
            encoded:
              "https://example.test/callback?phone=%2B91+98765+43210&otp=%31%32%33%34%35%36&card=4111%201111%201111%201111&upi=abc%40upi&token=raw-token-123&access_token=abc.def.ghi&file=C%3A%2FUsers%2Fparth%2F.zepo-live%2Ftrace.txt",
            encodedBlob:
              "https%3A%2F%2Fexample.test%2Fcallback%3Fphone%3D%2B91%2098765%2043210%26card%3D4111%201111%201111%201111%26file%3DC%3A%2FUsers%2Fparth%2F.zepo-live%2Ftrace.txt"
          },
          values: ["CVV 123", "./local-report.json and rerun `zepo doctor`."]
        },
        "browser launch failed for ZEP9999 near 09876543210, C:\\Users\\parth\\.zepo-live\\debug.log, and file:///C:/Users/parth/.zepo-live/debug.log"
      );
      const directError = new Error(
        "Direct Error for Order ID: ZEP7777 with OTP 654321 and phone +91 98765 43210 near C:\\Users\\parth\\.zepo-live\\error.txt and C:/Users/parth/.zepo-live/error.txt"
      );
      directError.stack =
        "Error: Direct Error for Order ID: ZEP7777 with OTP 654321\n    at run (C:/Users/parth/.zepo-live/error.ts:1:1)";
      runtime.logger.error(directError, "direct error for ZEP8888 and card 5555 5555 5555 4444");
      closeRuntime(runtime);

      const log = readFileSync(runtime.paths.logPath, "utf8");
      const entries = log
        .trim()
        .split(/\r?\n/)
        .map((line) => JSON.parse(line)) as Array<{
        error: string;
        browserProfileDir: string;
        msg: string;
        nested: { payment: string; encoded: string; encodedBlob: string };
        values: string[];
        err?: { message?: string; stack?: string };
      }>;
      const entry = entries[0];
      const directErrorEntry = entries[1];
      const serialized = JSON.stringify(entries);

      expect(serialized).toContain("<redacted-verification-code>");
      expect(serialized).toContain("<redacted-order-id>");
      expect(serialized).toContain("<redacted-phone>");
      expect(serialized).toContain("<redacted-payment-number>");
      expect(serialized).toContain("<redacted-payment-handle>");
      expect(serialized).toContain("<redacted-npm-token>");
      expect(serialized).toContain("<redacted-local-path>");
      expect(serialized).not.toContain("123456");
      expect(serialized).not.toContain("654321");
      expect(serialized).not.toContain("98765-43210");
      expect(serialized).not.toContain("98765 43210");
      expect(serialized).not.toContain("09876543210");
      expect(serialized).not.toContain(fakeNpmToken);
      expect(serialized).not.toContain("4111");
      expect(serialized).not.toContain("5555");
      expect(serialized).not.toContain("abc@upi");
      expect(serialized).not.toContain("%2B91");
      expect(serialized).not.toContain("%31%32%33");
      expect(serialized).not.toContain("4111%201111");
      expect(serialized).not.toContain("abc%40upi");
      expect(serialized).toContain("<redacted-auth-token>");
      expect(serialized).not.toContain("raw-token-123");
      expect(serialized).not.toContain("abc.def.ghi");
      expect(serialized).not.toContain("C%3A%2FUsers");
      expect(serialized).not.toContain("https%3A%2F%2Fexample.test");
      expect(serialized).not.toContain("file:///");
      expect(serialized).not.toContain("Users");
      expect(serialized).not.toContain("local-report.json");
      expect(serialized).not.toContain("error.ts");
      expect(serialized).not.toContain("ZEP1234");
      expect(serialized).not.toContain("ZEP9999");
      expect(serialized).not.toContain("ZEP7777");
      expect(serialized).not.toContain("ZEP8888");
      expect(entry?.msg).toContain("<redacted-order-id>");
      expect(entry?.msg).toContain("<redacted-phone>");
      expect(entry?.msg).toContain("<redacted-local-path>");
      expect(entry?.values[1]).toBe("<redacted-local-path> and rerun `zepo doctor`.");
      expect(directErrorEntry?.err?.message).toContain("<redacted-order-id>");
      expect(directErrorEntry?.err?.message).toContain("<redacted-verification-code>");
      expect(directErrorEntry?.err?.message).toContain("<redacted-phone>");
      expect(directErrorEntry?.err?.stack).toContain("<redacted-local-path>");
      expect(serialized).not.toContain(runtime.paths.browserProfileDir);
    } finally {
      rmSync(dataDir, { recursive: true, force: true });
    }
  });
});

function expectRuntimeOptionIssue(timeout: string, message: string): void {
  try {
    parseRuntimeOptions({ timeout });
  } catch (error) {
    expect(error).toBeInstanceOf(ZodError);
    expect((error as ZodError).issues[0]).toMatchObject({
      path: ["timeout"],
      message
    });
    return;
  }

  throw new Error(`Expected timeout ${timeout} to be rejected.`);
}

async function waitForLogDestinationReady(destination: { fd?: number; once(event: string, callback: () => void): void }): Promise<void> {
  if (typeof destination.fd === "number" && destination.fd >= 0) {
    return;
  }

  await Promise.race([
    new Promise<void>((resolve) => destination.once("ready", resolve)),
    sleep(1_000).then(() => undefined)
  ]);
}
