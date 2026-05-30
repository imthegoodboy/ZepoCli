import { describe, expect, it } from "vitest";

import {
  CartService,
  assertCartContainsProduct,
  parseAddQuantity,
  requireAddableProducts,
  requireBestMatch
} from "../src/services/cart.js";

describe("cart service verification helpers", () => {
  it("parses valid add quantities", () => {
    expect(parseAddQuantity("2")).toBe(2);
    expect(parseAddQuantity(" 2 ")).toBe(2);
  });

  it("rejects invalid add quantities with a user-facing error", () => {
    for (const quantity of ["abc", "0", "13", "2.5", "1e1", "0x2", ""]) {
      expect(() => parseAddQuantity(quantity)).toThrow("Quantity must be an integer from 1 to 12.");
    }
  });

  it("rejects blank add and remove queries before browser work", async () => {
    const service = new CartService(createNoBrowserRuntime());

    await expect(service.add("   ")).rejects.toMatchObject({
      code: "invalid_input",
      message: "Product query is required."
    });
    await expect(service.remove("   ")).rejects.toMatchObject({
      code: "invalid_input",
      message: "Cart item query is required."
    });
  });

  it("returns a confident product match for auto-add", () => {
    const product = {
      index: 0,
      automationId: 1,
      name: "Amul Taaza Toned Milk",
      unit: "1 pack (500 ml)",
      price: "₹32"
    };

    expect(requireBestMatch([product], "amul milk")).toBe(product);
  });

  it("matches compact unit queries to spaced product units for auto-add", () => {
    const product = {
      index: 0,
      automationId: 1,
      name: "Amul Taaza Toned Milk",
      unit: "1 pack (500 ml)",
      price: "₹32"
    };

    expect(requireBestMatch([product], "amul milk 500ml")).toBe(product);
  });

  it("rejects auto-add when search results do not confidently match the query", () => {
    expect(() =>
      requireBestMatch(
        [
          {
            index: 0,
            automationId: 1,
            name: "Potato Chips",
            unit: "52 g",
            price: "₹20"
          }
        ],
        "amul milk"
      )
    ).toThrow('No confident Zepto product match was found for "amul milk".');
  });

  it("rejects auto-add when a size-specific query only has the wrong size available", () => {
    expect(() =>
      requireBestMatch(
        [
          {
            index: 0,
            automationId: 1,
            name: "Amul Taaza Toned Milk",
            unit: "1 pack (500 ml)",
            price: "₹32"
          }
        ],
        "milk 1l"
      )
    ).toThrow('No confident Zepto product match was found for "milk 1l".');
  });

  it("returns only products with mapped ADD buttons for add flows", () => {
    const addable = {
      index: 0,
      automationId: 1,
      name: "Amul Taaza Toned Milk"
    };
    const readOnly = {
      index: 1,
      name: "Tender Coconut"
    };

    expect(requireAddableProducts([addable, readOnly], "milk")).toEqual([addable]);
  });

  it("rejects add flows when search results do not expose ADD buttons", () => {
    expect(() =>
      requireAddableProducts(
        [
          {
            index: 0,
            name: "Tender Coconut"
          }
        ],
        "coconut"
      )
    ).toThrow('Zepto did not expose ADD buttons for products matching "coconut".');
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

  it("rejects add verification when the cart shows the same product name with a different unit", () => {
    expect(() =>
      assertCartContainsProduct(
        {
          items: [
            {
              name: "Amul Taaza Toned Milk",
              unit: "1 pack (1 L)",
              price: "₹68"
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
    ).toThrow("did not show an item matching");
  });

  it("still verifies added products by name when Zepto did not expose a product unit", () => {
    expect(() =>
      assertCartContainsProduct(
        {
          items: [
            {
              name: "Tender Coconut",
              unit: "1 piece",
              price: "₹65"
            }
          ]
        },
        {
          index: 0,
          automationId: 1,
          name: "Tender Coconut"
        }
      )
    ).not.toThrow();
  });

  it("accepts a cart that shows at least the requested quantity", () => {
    expect(() =>
      assertCartContainsProduct(
        {
          items: [
            {
              name: "Amul Taaza Toned Milk",
              unit: "1 pack (500 ml)",
              price: "₹32",
              quantity: "2"
            }
          ]
        },
        {
          index: 0,
          automationId: 1,
          name: "Amul Taaza Toned Milk",
          unit: "1 pack (500 ml)",
          price: "₹32"
        },
        2
      )
    ).not.toThrow();
  });

  it("rejects multi-quantity add when the cart quantity is unreadable", () => {
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
          name: "Amul Taaza Toned Milk"
        },
        2
      )
    ).toThrow("did not expose the quantity");
  });

  it("rejects multi-quantity add when Zepto shows a lower quantity", () => {
    expect(() =>
      assertCartContainsProduct(
        {
          items: [
            {
              name: "Amul Taaza Toned Milk",
              unit: "1 pack (500 ml)",
              price: "₹32",
              quantity: "1"
            }
          ]
        },
        {
          index: 0,
          automationId: 1,
          name: "Amul Taaza Toned Milk"
        },
        2
      )
    ).toThrow("below requested 2");
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

function createNoBrowserRuntime() {
  return {
    options: {
      input: false
    },
    sqlite: {
      saveCartSnapshot: () => {
        throw new Error("browser work should not reach cache writes");
      }
    }
  } as never;
}
