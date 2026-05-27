import { describe, expect, it } from "vitest";

import { parseSearchLimit } from "../src/services/search.js";

describe("search service validation helpers", () => {
  it("parses valid search limits", () => {
    expect(parseSearchLimit("10")).toBe(10);
  });

  it("rejects invalid search limits with a user-facing error", () => {
    expect(() => parseSearchLimit("abc")).toThrow("Search limit must be an integer from 1 to 50.");
    expect(() => parseSearchLimit("51")).toThrow("Search limit must be an integer from 1 to 50.");
  });
});
