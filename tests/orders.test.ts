import { describe, expect, it } from "vitest";

import { isOrdersPageText, requireReorderCart } from "../src/automation/orders.js";
import { requireLatestOrder } from "../src/services/orders.js";

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

  it("returns the latest order when tracking has order data", () => {
    const latest = {
      id: "ZEP1234",
      status: "Out for delivery",
      eta: "8 mins",
      rawText: "Order #ZEP1234 Out for delivery ETA: 8 mins"
    };

    expect(requireLatestOrder([latest])).toBe(latest);
  });

  it("rejects latest-order tracking without detected orders", () => {
    expect(() => requireLatestOrder([])).toThrow("No Zepto order was detected to track.");
  });

  it("detects orders page text from parsed orders or empty-history copy", () => {
    expect(isOrdersPageText("Order #ZEP1234 Confirmed ETA: 8 mins Total ₹249")).toBe(true);
    expect(isOrdersPageText("My Orders No orders yet")).toBe(true);
    expect(isOrdersPageText("Track order Out for delivery ETA: 8 mins")).toBe(true);
  });

  it("rejects generic delivery marketing text as orders page text", () => {
    expect(isOrdersPageText("Groceries delivered in minutes ETA: 8 mins")).toBe(false);
    expect(isOrdersPageText("Search milk Cart Account")).toBe(false);
  });
});
