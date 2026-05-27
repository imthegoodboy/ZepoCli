import { describe, expect, it } from "vitest";

import { parseCartItemsFromText, parseOrdersFromText, parseProductCard } from "../src/automation/extract.js";

describe("Zepto page extraction helpers", () => {
  it("parses product cards from Zepto-style text", () => {
    const product = parseProductCard(
      {
        automationId: 3,
        imageAlt: "Image: Amul Taaza Toned Milk",
        text: "ADD\n₹32₹34\n₹2 OFF\nAmul Taaza Toned Milk\n1 pack (500 ml)\n4.8(10.5k)"
      },
      0
    );

    expect(product).toEqual({
      index: 0,
      automationId: 3,
      name: "Amul Taaza Toned Milk",
      price: "₹32",
      mrp: "₹34",
      unit: "1 pack (500 ml)",
      rating: "4.8(10.5k)",
      url: undefined
    });
  });

  it("does not invent an automation id for image-only product cards", () => {
    const product = parseProductCard(
      {
        imageAlt: "Image: Tender Coconut",
        text: "Tender Coconut\n1 piece\n₹65"
      },
      0
    );

    expect(product).toEqual({
      index: 0,
      automationId: undefined,
      name: "Tender Coconut",
      price: "₹65",
      mrp: undefined,
      unit: "1 piece",
      rating: undefined,
      url: undefined
    });
  });

  it("parses cart-like text without creating empty items", () => {
    const items = parseCartItemsFromText(`
      Cart
      Amul Taaza Toned Milk
      1 pack (500 ml)
      ₹32
      Qty 1
      Grand Total ₹32
    `);

    expect(items).toEqual([
      {
        name: "Amul Taaza Toned Milk",
        price: "₹32",
        unit: "1 pack (500 ml)",
        quantity: "1"
      }
    ]);
  });

  it("parses order status text", () => {
    const orders = parseOrdersFromText("Order #ZEP1234 Confirmed ETA: 8 mins Total ₹249");

    expect(orders).toEqual([
      {
        id: "ZEP1234",
        status: "Confirmed",
        eta: "8 mins",
        total: "₹249",
        rawText: "Order #ZEP1234 Confirmed ETA: 8 mins Total ₹249"
      }
    ]);
  });
});
