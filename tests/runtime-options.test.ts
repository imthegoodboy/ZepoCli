import { describe, expect, it } from "vitest";
import { ZodError } from "zod";

import { parseRuntimeOptions, toRuntimeSetupError } from "../src/commands/shared.js";
import { closeRuntime, closeRuntimeBestEffort } from "../src/config/runtime.js";
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

  it("rejects invalid timeout before runtime creation", () => {
    expect(() => parseRuntimeOptions({ timeout: "abc" })).toThrow(ZodError);
    expect(() => parseRuntimeOptions({ timeout: "999" })).toThrow(ZodError);
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
});
