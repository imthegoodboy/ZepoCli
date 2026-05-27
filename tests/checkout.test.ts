import { describe, expect, it } from "vitest";

import { assertReadableCheckoutCart, isCheckoutHandoffText } from "../src/automation/checkout.js";

describe("checkout handoff detection", () => {
  it("detects payment handoff text", () => {
    expect(isCheckoutHandoffText("Order Summary To Pay ₹249 Select payment method UPI Card Wallet")).toBe(true);
  });

  it("detects address and place-order checkout text", () => {
    expect(isCheckoutHandoffText("Delivery Address Home Place Order Cash on Delivery")).toBe(true);
  });

  it("detects address plus amount-due checkout text", () => {
    expect(isCheckoutHandoffText("Delivery Address Home To Pay ₹249")).toBe(true);
  });

  it("rejects ordinary cart text", () => {
    expect(isCheckoutHandoffText("Cart Add more items Apply coupon Saved for later")).toBe(false);
  });

  it("rejects cart text with checkout labels but no payment handoff", () => {
    expect(isCheckoutHandoffText("Cart View Bill To Pay ₹249 Checkout")).toBe(false);
  });

  it("rejects empty pages", () => {
    expect(isCheckoutHandoffText("   ")).toBe(false);
  });

  it("accepts checkout only when cart text contains readable items", () => {
    expect(() =>
      assertReadableCheckoutCart(`
        Cart
        Amul Taaza Toned Milk
        1 pack (500 ml)
        ₹32
        Checkout
      `)
    ).not.toThrow();
  });

  it("rejects checkout when the cart has no readable items", () => {
    expect(() => assertReadableCheckoutCart("Cart Add more items Apply coupon Checkout")).toThrow(
      "Zepto cart does not show any readable items for checkout."
    );
  });
});
