import { describe, expect, it } from "vitest";

import { ORDER_ACTION_LABEL_PATTERN_SOURCE, isOrderActionLabelText } from "../src/automation/order-action-labels.js";

describe("order action label matching", () => {
  it("matches account and order action surfaces that should not drive workflow clicks", () => {
    for (const label of [
      "Customer Support",
      "Help",
      "Help Centre",
      "Support Ticket",
      "Contact Support",
      "Invoice",
      "Receipt",
      "Refund",
      "Refunded",
      "Refunds",
      "Return",
      "Returns",
      "Return Order",
      "Return Request",
      "Cancel",
      "Cancel Order",
      "Cancel Request",
      "Cancellation",
      "Cancellations",
      "Cancelled",
      "Rate Order",
      "Rate Your Order",
      "Rate & Review",
      "Rate and Review",
      "Rating",
      "Review Order",
      "Review Your Order",
      "Write Review"
    ]) {
      expect(isOrderActionLabelText(label)).toBe(true);
    }
  });

  it("does not match ordinary workflow labels", () => {
    for (const label of ["Account", "Login", "Search", "Cart", "Checkout", "Reorder", "Track Order", "Product Reviews"]) {
      expect(isOrderActionLabelText(label)).toBe(false);
    }
  });

  it("exports the pattern source for DOM-evaluated safety guards", () => {
    const pattern = new RegExp(ORDER_ACTION_LABEL_PATTERN_SOURCE, "i");

    expect(pattern.test("Support Desk")).toBe(true);
    expect(pattern.test("Rate & Review")).toBe(true);
    expect(pattern.test("Cancellation")).toBe(true);
    expect(pattern.test("Saved Address")).toBe(false);
  });
});
