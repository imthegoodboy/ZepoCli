import { describe, expect, it } from "vitest";

import { requireReorderCart } from "../src/automation/orders.js";

describe("order automation helpers", () => {
  it("returns a reorder cart with items", () => {
    const cart = {
      items: [
        {
          name: "Amul Taaza Toned Milk",
          unit: "1 pack (500 ml)",
          price: "₹32"
        }
      ]
    };

    expect(requireReorderCart(cart)).toBe(cart);
  });

  it("rejects reorder success without cart items", () => {
    expect(() =>
      requireReorderCart({
        items: []
      })
    ).toThrow("Zepto did not expose any cart items after the reorder action.");
  });
});
