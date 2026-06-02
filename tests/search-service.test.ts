import { describe, expect, it } from "vitest";

import { SearchService, parseSearchLimit } from "../src/services/search.js";

describe("search service validation helpers", () => {
  it("parses valid search limits", () => {
    expect(parseSearchLimit("10")).toBe(10);
    expect(parseSearchLimit(" 10 ")).toBe(10);
  });

  it("rejects invalid search limits with a user-facing error", () => {
    for (const limit of ["abc", "0", "51", "2.5", "1e1", "0x10", ""]) {
      expect(() => parseSearchLimit(limit)).toThrow("Search limit must be an integer from 1 to 50.");
    }
  });

  it("rejects blank search queries before browser work", async () => {
    const service = new SearchService(createNoBrowserRuntime());

    await expect(service.search("   ")).rejects.toMatchObject({
      code: "invalid_input",
      message: "Search query is required."
    });
  });

  it("records only diagnostic result counts in the search cache", async () => {
    const cacheCalls: unknown[][] = [];
    const service = new SearchService({
      sqlite: {
        recordSearch: (...args: unknown[]) => {
          cacheCalls.push(args);
        }
      }
    } as never);

    (service as unknown as { browser: { withPage: () => Promise<unknown[]> } }).browser = {
      withPage: async () => [
        {
          index: 1,
          name: "Amul Milk"
        }
      ]
    };

    await expect(service.search("private snacks 500")).resolves.toEqual([
      {
        index: 1,
        name: "Amul Milk"
      }
    ]);

    expect(cacheCalls).toEqual([[1]]);
    expect(JSON.stringify(cacheCalls)).not.toContain("private snacks");
  });
});

function createNoBrowserRuntime() {
  return {
    sqlite: {
      recordSearch: () => {
        throw new Error("browser work should not reach cache writes");
      }
    }
  } as never;
}
