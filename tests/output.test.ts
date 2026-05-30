import { afterEach, describe, expect, it, vi } from "vitest";

import {
  printAddResult,
  printAddress,
  printAddresses,
  printCart,
  printJson,
  printJsonError,
  printOrders,
  printProducts
} from "../src/utils/output.js";
import type { Address, CartItem } from "../src/types.js";

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

  it("omits internal fields from cart item JSON output", () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);

    printCart(
      {
        items: [
          {
            name: "Amul Milk",
            unit: "500 ml",
            quantity: "1",
            price: "₹32",
            rawText: "Cart row with internal page text",
            automationId: 4
          } as unknown as CartItem
        ],
        total: "₹32"
      },
      true
    );

    const payload = JSON.parse(String(log.mock.calls[0]?.[0])) as { items: Array<Record<string, unknown>> };
    expect(payload.items[0]).toEqual({
      name: "Amul Milk",
      quantity: "1",
      price: "₹32",
      unit: "500 ml"
    });
    expect(payload.items[0]).not.toHaveProperty("rawText");
    expect(payload.items[0]).not.toHaveProperty("automationId");
    expect(JSON.stringify(payload)).not.toContain("internal page text");
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

  it("omits raw text and automation ids from JSON errors", () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);

    printJsonError({
      type: "unexpected_error",
      code: "unexpected_error",
      message: "boom",
      exitCode: 1,
      rawText: "raw Zepto checkout page text",
      issues: [{ path: "product", message: "failed", automationId: 17 }]
    } as unknown as Parameters<typeof printJsonError>[0]);

    const payload = JSON.parse(String(error.mock.calls[0]?.[0])) as {
      ok: boolean;
      error: {
        type: string;
        code?: string;
        message: string;
        exitCode: number;
        issues?: Array<Record<string, unknown>>;
      };
    };
    expect(payload).toEqual({
      ok: false,
      error: {
        type: "unexpected_error",
        code: "unexpected_error",
        message: "boom",
        exitCode: 1,
        issues: [{ path: "product", message: "failed" }]
      }
    });
    expect(JSON.stringify(payload)).not.toContain("raw Zepto checkout page text");
    expect(JSON.stringify(payload)).not.toContain("automationId");
  });

  it("redacts sensitive-looking strings from JSON errors", () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const fakeNpmToken = `npm_${"A".repeat(24)}`;

    printJsonError({
      type: "invalid_input",
      code: "invalid_input",
      message:
        `Order #ZEP1234 OTP 123456 for +91 98765 43210 failed with ${fakeNpmToken} near C:\\Users\\parth\\Desktop\\ZepoCli\\.zepo-live\\report.json`,
      hint: "Inspect order ZEP9999 in Zepto; do not paste card 4111 1111 1111 1111 or abc@upi into CLI logs.",
      exitCode: 2,
      retryAfterMs: 1500,
      issues: [
        {
          path: "phone",
          message:
            "CVV 123 found in /Users/parth/.zepo-live/report.json and ./local-report.json or rerun `zepo doctor`."
        }
      ]
    });

    const payload = JSON.parse(String(error.mock.calls[0]?.[0])) as {
      ok: boolean;
      error: {
        code: string;
        message: string;
        hint?: string;
        retryAfterMs?: number;
        issues?: Array<{ path: string; message: string }>;
      };
    };
    const serialized = JSON.stringify(payload);

    expect(payload.error.code).toBe("invalid_input");
    expect(payload.error.retryAfterMs).toBe(1500);
    expect(payload.error.issues?.[0]?.path).toBe("phone");
    expect(payload.error.issues?.[0]?.message).toContain("or rerun `zepo doctor`.");
    expect(serialized).toContain("<redacted-order-id>");
    expect(serialized).toContain("<redacted-verification-code>");
    expect(serialized).toContain("<redacted-phone>");
    expect(serialized).toContain("<redacted-payment-number>");
    expect(serialized).toContain("<redacted-payment-handle>");
    expect(serialized).toContain("<redacted-npm-token>");
    expect(serialized).toContain("<redacted-local-path>");
    expect(serialized).not.toContain("123456");
    expect(serialized).not.toContain("98765 43210");
    expect(serialized).not.toContain(fakeNpmToken);
    expect(serialized).not.toContain("4111");
    expect(serialized).not.toContain("abc@upi");
    expect(serialized).not.toContain("Users");
    expect(serialized).not.toContain("local-report.json");
    expect(serialized).not.toContain("ZEP1234");
    expect(serialized).not.toContain("ZEP9999");
  });

  it("redacts URL-encoded sensitive-looking values from JSON errors", () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);

    printJsonError({
      type: "unexpected_error",
      code: "unexpected_error",
      message:
        "Request failed at https://example.test/callback?phone=%2B91+98765+43210&otp=%31%32%33%34%35%36&card=4111%201111%201111%201111&upi=abc%40upi&token=raw-token-123&access_token=abc.def.ghi&file=C%3A%5CUsers%5Cparth%5C.zepo-live%5Ctrace.txt",
      exitCode: 1
    });

    const payload = JSON.parse(String(error.mock.calls[0]?.[0])) as { error: { message: string } };
    const serialized = JSON.stringify(payload);

    expect(serialized).toContain("phone=<redacted-phone>");
    expect(serialized).toContain("otp=<redacted-verification-code>");
    expect(serialized).toContain("card=<redacted-payment-number>");
    expect(serialized).toContain("upi=<redacted-payment-handle>");
    expect(serialized).toContain("token=<redacted-auth-token>");
    expect(serialized).toContain("access_token=<redacted-auth-token>");
    expect(serialized).toContain("file=<redacted-local-path>");
    expect(serialized).not.toContain("%2B91");
    expect(serialized).not.toContain("%31%32%33");
    expect(serialized).not.toContain("4111%201111");
    expect(serialized).not.toContain("abc%40upi");
    expect(serialized).not.toContain("raw-token-123");
    expect(serialized).not.toContain("abc.def.ghi");
    expect(serialized).not.toContain("C%3A%5CUsers");
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

  it("recursively removes raw text and automation ids from generic JSON output", () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);

    printJson({
      ok: true,
      rawText: "Zepto page text",
      result: {
        automationId: 99,
        keep: "workflow-state",
        nested: [{ rawText: "nested raw Zepto copy", keep: true }]
      }
    });

    const payload = JSON.parse(String(log.mock.calls[0]?.[0])) as Record<string, unknown>;
    expect(payload).toEqual({
      ok: true,
      result: {
        keep: "workflow-state",
        nested: [{ keep: true }]
      }
    });
    expect(JSON.stringify(payload)).not.toContain("Zepto page text");
    expect(JSON.stringify(payload)).not.toContain("automationId");
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

  it("omits internal address fields from address list JSON output", () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);

    printAddresses(
      [
        {
          label: "Home",
          text: "Home 221B Baker Street, Bengaluru, India",
          selected: true,
          rawText: "Saved Addresses Home 221B Baker Street, Bengaluru, India",
          automationId: 9
        }
      ] as unknown as Address[],
      true
    );

    const payload = JSON.parse(String(log.mock.calls[0]?.[0])) as Array<Record<string, unknown>>;
    expect(payload).toEqual([
      {
        label: "Home",
        text: "Home 221B Baker Street, Bengaluru, India",
        selected: true
      }
    ]);
    expect(payload[0]).not.toHaveProperty("rawText");
    expect(payload[0]).not.toHaveProperty("automationId");
  });

  it("omits internal address fields from selected address JSON output", () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);

    printAddress({
      label: "Work",
      text: "Work Flat 42, Tower B, MG Road, Bengaluru, India",
      selected: false,
      rawText: "Address row Work Flat 42, Tower B, MG Road, Bengaluru, India",
      automationId: 10
    } as unknown as Address);

    const payload = JSON.parse(String(log.mock.calls[0]?.[0])) as Record<string, unknown>;
    expect(payload).toEqual({
      label: "Work",
      text: "Work Flat 42, Tower B, MG Road, Bengaluru, India",
      selected: false
    });
    expect(payload).not.toHaveProperty("rawText");
    expect(payload).not.toHaveProperty("automationId");
  });
});
