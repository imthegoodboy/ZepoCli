import { describe, expect, it } from "vitest";

import { cartHasMatchingItem, isCartPageText } from "../src/automation/cart.js";

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

  it("detects cart page text from readable items or empty-cart copy", () => {
    expect(isCartPageText("Cart\nAmul Taaza Toned Milk\n1 pack (500 ml)\nRs 32\nQty 1")).toBe(true);
    expect(isCartPageText("My Cart Your cart is empty Add items to continue")).toBe(true);
    expect(isCartPageText("Cart 2 items View bill To pay Rs 120")).toBe(true);
  });

  it("rejects generic navigation text as cart page proof", () => {
    expect(isCartPageText("Search milk Cart Account Profile")).toBe(false);
    expect(isCartPageText("Sign in to view your cart")).toBe(false);
    expect(isCartPageText("Fresh groceries delivered fast Checkout these offers")).toBe(false);
  });
});
