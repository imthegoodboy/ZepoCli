import { describe, expect, it } from "vitest";

import { assertCartContainsProduct, parseAddQuantity, requireAddableProducts, requireBestMatch } from "../src/services/cart.js";

describe("cart service verification helpers", () => {
  it("parses valid add quantities", () => {
    expect(parseAddQuantity("2")).toBe(2);
  });

  it("rejects invalid add quantities with a user-facing error", () => {
    expect(() => parseAddQuantity("abc")).toThrow("Quantity must be an integer from 1 to 50.");
    expect(() => parseAddQuantity("0")).toThrow("Quantity must be an integer from 1 to 50.");
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
