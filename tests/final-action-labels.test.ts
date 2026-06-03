import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import {
  isFinalCheckoutSurfaceText,
  isFinalPaymentOrOrderActionText
} from "../src/automation/final-action-labels.js";

describe("final payment and order action labels", () => {
  it("recognizes final payment and order-placement actions", () => {
    for (const label of [
      "Place Order",
      "Confirm Order",
      "Pay Now",
      "Make Payment",
      "Complete Payment",
      "Confirm Payment",
      "Pay Securely",
      "Pay with UPI",
      "Pay using card",
      "Pay via wallet",
      "Pay by cash",
      "Order Now",
      "Review Order",
      "Checkout and Pay",
      "Checkout & Pay",
      "Pay ₹249",
      "Pay Rs 249",
      "Pay INR 249",
      "Pay 249"
    ]) {
      expect(isFinalPaymentOrOrderActionText(label)).toBe(true);
    }
  });

  it("keeps safe handoff and ordinary workflow labels out of final actions", () => {
    for (const label of [
      "Proceed to Pay",
      "Proceed to Payment",
      "Proceed to Checkout",
      "Checkout",
      "Payment Method",
      "Payment Options",
      "UPI",
      "Cart",
      "Pay ₹",
      "Pay Rs",
      "Add Amul Milk to Cart"
    ]) {
      expect(isFinalPaymentOrOrderActionText(label)).toBe(false);
    }
  });

  it("keeps checkout surface proof narrower than unsafe final action matching", () => {
    for (const label of ["Place Order", "Confirm Order", "Pay Now", "Make Payment", "Complete Payment", "Confirm Payment"]) {
      expect(isFinalCheckoutSurfaceText(label)).toBe(true);
    }

    for (const label of ["Review Order", "Checkout and Pay", "Pay with UPI", "Pay ₹249", "Order Now"]) {
      expect(isFinalCheckoutSurfaceText(label)).toBe(false);
    }
  });

  it("keeps final action matching centralized across automation modules", () => {
    for (const file of [
      "address.ts",
      "auth.ts",
      "cart.ts",
      "checkout.ts",
      "extract.ts",
      "login-inputs.ts",
      "orders.ts",
      "search.ts"
    ]) {
      const source = readFileSync(resolve(import.meta.dirname, "..", "src", "automation", file), "utf8");

      expect(source).toContain("./final-action-labels.js");
      expect(source).not.toMatch(/const FINAL_PAYMENT_OR_ORDER_ACTION_PATTERN(?:_SOURCE)?\s*=/);
      expect(source).not.toMatch(/const FINAL_CHECKOUT_SURFACE_PATTERN(?:_SOURCE)?\s*=/);
    }
  });
});
