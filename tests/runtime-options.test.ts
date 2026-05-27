import { describe, expect, it } from "vitest";
import { ZodError } from "zod";

import { parseRuntimeOptions } from "../src/commands/shared.js";

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
});
