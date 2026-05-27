import { describe, expect, it } from "vitest";

import { isCheckoutHandoffText } from "../src/automation/checkout.js";

describe("checkout handoff detection", () => {
  it("detects payment handoff text", () => {
    expect(isCheckoutHandoffText("Order Summary To Pay ₹249 Select payment method UPI Card Wallet")).toBe(true);
  });

  it("detects address and place-order checkout text", () => {
    expect(isCheckoutHandoffText("Delivery Address Home Place Order Cash on Delivery")).toBe(true);
  });

  it("rejects ordinary cart text", () => {
    expect(isCheckoutHandoffText("Cart Add more items Apply coupon Saved for later")).toBe(false);
  });

  it("rejects empty pages", () => {
    expect(isCheckoutHandoffText("   ")).toBe(false);
  });
});
