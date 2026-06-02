import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import {
  isPaymentMethodLabelText,
  PAYMENT_METHOD_LABEL_PATTERN_SOURCE
} from "../src/automation/payment-labels.js";

describe("payment label helpers", () => {
  it("recognizes Zepto-side payment method labels", () => {
    for (const label of [
      "Payment Method",
      "Payment Options",
      "Select Payment",
      "Choose Payment",
      "UPI",
      "Cards",
      "Credit Card",
      "Debit Card",
      "Wallet",
      "Credit & Debit Cards",
      "Debit & Credit Cards",
      "Saved Cards",
      "Card Offers",
      "Card ending 4242",
      "Net Banking",
      "Cash on Delivery",
      "COD",
      "Pay on Delivery",
      "Pay Later",
      "LazyPay",
      "Lazy Pay",
      "Simpl",
      "EMI",
      "RuPay",
      "Visa",
      "Mastercard",
      "Maestro",
      "Amex",
      "American Express",
      "Diners Club",
      "PhonePe",
      "Google Pay",
      "GPay",
      "Paytm",
      "BHIM",
      "CRED Pay",
      "Amazon Pay",
      "Mobikwik",
      "Freecharge",
      "Sodexo",
      "Meal Card"
    ]) {
      expect(isPaymentMethodLabelText(label)).toBe(true);
    }
  });

  it("does not treat ordinary workflow labels as payment methods", () => {
    for (const label of ["Search", "Add Address", "Delivery Address", "Cart", "My Orders", "Reorder", "Simple Snacks"]) {
      expect(isPaymentMethodLabelText(label)).toBe(false);
    }
  });

  it("keeps payment label matching centralized across automation modules", () => {
    expect(PAYMENT_METHOD_LABEL_PATTERN_SOURCE).toContain("cash on delivery");

    for (const file of [
      "address.ts",
      "auth.ts",
      "cart.ts",
      "checkout.ts",
      "login-inputs.ts",
      "orders.ts",
      "search.ts"
    ]) {
      const source = readFileSync(resolve(import.meta.dirname, "..", "src", "automation", file), "utf8");

      expect(source).toContain("./payment-labels.js");
      expect(source).not.toMatch(/const PAYMENT_METHOD_LABEL_PATTERN(?:_SOURCE)?\s*=/);
    }
  });
});
