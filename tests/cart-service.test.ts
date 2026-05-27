import { describe, expect, it } from "vitest";

import { assertCartContainsProduct, parseAddQuantity } from "../src/services/cart.js";

describe("cart service verification helpers", () => {
  it("parses valid add quantities", () => {
    expect(parseAddQuantity("2")).toBe(2);
  });

  it("rejects invalid add quantities with a user-facing error", () => {
    expect(() => parseAddQuantity("abc")).toThrow("Quantity must be an integer from 1 to 50.");
    expect(() => parseAddQuantity("0")).toThrow("Quantity must be an integer from 1 to 50.");
  });

  it("accepts a cart that contains the added product", () => {
    expect(() =>
      assertCartContainsProduct(
        {
          items: [
            {
              name: "Amul Taaza Toned Milk",
              unit: "1 pack (500 ml)",
              price: "₹32"
            }
          ]
        },
        {
          index: 0,
          automationId: 1,
          name: "Amul Taaza Toned Milk",
          unit: "1 pack (500 ml)",
          price: "₹32"
        }
      )
    ).not.toThrow();
  });

  it("rejects an unreadable cart after add", () => {
    expect(() =>
      assertCartContainsProduct(
        {
          items: []
        },
        {
          index: 0,
          automationId: 1,
          name: "Amul Taaza Toned Milk"
        }
      )
    ).toThrow("no readable cart items were detected");
  });

  it("rejects carts that do not show the added product", () => {
    expect(() =>
      assertCartContainsProduct(
        {
          items: [
            {
              name: "Potato Chips",
              unit: "52 g",
              price: "₹20"
            }
          ]
        },
        {
          index: 0,
          automationId: 1,
          name: "Amul Taaza Toned Milk"
        }
      )
    ).toThrow("did not show an item matching");
  });
});
