import { describe, expect, it } from "vitest";

import { cartHasMatchingItem } from "../src/automation/cart.js";

describe("cart automation helpers", () => {
  it("matches cart items by product query", () => {
    expect(
      cartHasMatchingItem(
        {
          items: [
            {
              name: "Amul Taaza Toned Milk",
              unit: "1 pack (500 ml)"
            }
          ]
        },
        "milk"
      )
    ).toBe(true);
  });

  it("matches cart items by full item text", () => {
    expect(
      cartHasMatchingItem(
        {
          items: [
            {
              name: "Amul Taaza Toned Milk",
              unit: "1 pack (500 ml)"
            }
          ]
        },
        "Amul Taaza Toned Milk 1 pack (500 ml)"
      )
    ).toBe(true);
  });

  it("does not match unrelated items", () => {
    expect(
      cartHasMatchingItem(
        {
          items: [
            {
              name: "Potato Chips",
              unit: "52 g"
            }
          ]
        },
        "milk"
      )
    ).toBe(false);
  });
});
