import { afterEach, describe, expect, it, vi } from "vitest";

import { printAddResult, printCart, printJsonError, printOrders, printProducts } from "../src/utils/output.js";

describe("command JSON output", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("omits raw cart page text from JSON output", () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);

    printCart(
      {
        items: [
          {
            name: "Amul Milk",
            unit: "500 ml",
            quantity: "1",
            price: "₹32"
          }
        ],
        total: "₹32",
        rawText: "Cart Amul Milk 500 ml ₹32 Delivery address 221B Test Street"
      },
      true
    );

    const payload = JSON.parse(String(log.mock.calls[0]?.[0])) as Record<string, unknown>;
    expect(payload).toEqual({
      items: [
        {
          name: "Amul Milk",
          unit: "500 ml",
          quantity: "1",
          price: "₹32"
        }
      ],
      total: "₹32"
    });
    expect(JSON.stringify(payload)).not.toContain("221B Test Street");
    expect(payload).not.toHaveProperty("rawText");
  });

  it("prints code-bearing JSON errors on stderr for agents", () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);

    printJsonError({
      type: "unexpected_error",
      code: "unexpected_error",
      message: "boom",
      exitCode: 1
    });

    const payload = JSON.parse(String(error.mock.calls[0]?.[0])) as {
      ok: boolean;
      error: {
        type: string;
        code?: string;
        message: string;
        exitCode: number;
      };
    };
    expect(payload).toEqual({
      ok: false,
      error: {
        type: "unexpected_error",
        code: "unexpected_error",
        message: "boom",
        exitCode: 1
      }
    });
  });

  it("omits internal automation ids from product JSON output", () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);

    printProducts(
      [
        {
          index: 0,
          automationId: 12,
          name: "Amul Milk",
          unit: "500 ml",
          price: "₹32"
        }
      ],
      true
    );

    const payload = JSON.parse(String(log.mock.calls[0]?.[0])) as Array<Record<string, unknown>>;
    expect(payload).toEqual([
      {
        index: 0,
        name: "Amul Milk",
        unit: "500 ml",
        price: "₹32"
      }
    ]);
    expect(payload[0]).not.toHaveProperty("automationId");
  });

  it("omits raw cart text and internal product automation ids from add JSON output", () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);

    printAddResult({
      product: {
        index: 0,
        automationId: 12,
        name: "Amul Milk",
        unit: "500 ml",
        price: "₹32"
      },
      cart: {
        items: [
          {
            name: "Amul Milk",
            unit: "500 ml",
            quantity: "1",
            price: "₹32"
          }
        ],
        total: "₹32",
        rawText: "Cart Amul Milk 500 ml ₹32 Delivery address 221B Test Street"
      }
    });

    const payload = JSON.parse(String(log.mock.calls[0]?.[0])) as {
      product: Record<string, unknown>;
      cart: Record<string, unknown>;
    };
    expect(payload.product).toEqual({
      index: 0,
      name: "Amul Milk",
      unit: "500 ml",
      price: "₹32"
    });
    expect(payload.product).not.toHaveProperty("automationId");
    expect(payload.cart).not.toHaveProperty("rawText");
    expect(JSON.stringify(payload)).not.toContain("221B Test Street");
  });

  it("omits raw order page text from JSON output", () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);

    printOrders(
      [
        {
          id: "ZEP1234",
          status: "Out for delivery",
          eta: "8 mins",
          total: "₹249",
          rawText: "Order #ZEP1234 Out for delivery ETA: 8 mins Home 221B Test Street"
        }
      ],
      true
    );

    const payload = JSON.parse(String(log.mock.calls[0]?.[0])) as Array<Record<string, unknown>>;
    expect(payload).toEqual([
      {
        id: "ZEP1234",
        status: "Out for delivery",
        eta: "8 mins",
        total: "₹249"
      }
    ]);
    expect(JSON.stringify(payload)).not.toContain("221B Test Street");
    expect(payload[0]).not.toHaveProperty("rawText");
  });
});
