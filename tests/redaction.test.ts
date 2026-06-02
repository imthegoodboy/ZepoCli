import { describe, expect, it } from "vitest";

import { redactSensitiveText, redactSensitiveValue } from "../src/utils/redaction.js";

describe("sensitive value redaction", () => {
  it("redacts cyclic objects and errors without preserving circular references", () => {
    const root: Record<string, unknown> = {
      "phone=%2B91+98765+43210": "OTP 123456 near C:/Users/parth/.zepo-live/report.json",
      diagnosticCount: BigInt(3),
      diagnosticMessage: "OTP 123456 near C:/Users/parth/.zepo-live/report.json",
      authorization: "Bearer raw-authorization-token",
      cookie: "session=raw-cookie-value",
      otp: "123456",
      phoneNumber: 9876543210,
      cardNumber: "4111111111111111",
      upi: "abc@upi",
      password: "hunter2"
    };
    const child: Record<string, unknown> = {
      parent: root,
      token: "token=raw-token-123"
    };
    const list: unknown[] = ["card 4111 1111 1111 1111", child];
    const error = new Error("Order #ZEP1234 failed for +91 98765 43210");

    root.self = root;
    root.child = child;
    root.list = list;
    child.error = error;
    list.push(list);
    (error as Error & { cause?: unknown; root?: unknown }).cause = error;
    (error as Error & { cause?: unknown; root?: unknown }).root = root;

    const redacted = redactSensitiveValue(root);
    const redactedError = (redacted as { child?: { error?: unknown } }).child?.error;
    const serialized = JSON.stringify(redacted);

    expect(redactedError).toBeInstanceOf(Error);
    expect((redactedError as Error).message).toContain("<redacted-order-id>");
    expect((redactedError as Error & { cause?: unknown }).cause).toBe("[Circular]");
    expect(serialized).toContain("[Circular]");
    expect(serialized).toContain('"diagnosticCount":"3"');
    expect(serialized).toContain("phone=<redacted-phone>");
    expect(serialized).toContain("<redacted-verification-code>");
    expect(serialized).toContain("<redacted-payment-number>");
    expect(serialized).toContain("<redacted-phone>");
    expect(serialized).toContain("<redacted-payment-handle>");
    expect(serialized).toContain("<redacted-local-path>");
    expect(serialized).toContain("<redacted-auth-token>");
    expect(serialized).not.toContain("%2B91");
    expect(serialized).not.toContain("98765");
    expect(serialized).not.toContain("123456");
    expect(serialized).not.toContain("4111");
    expect(serialized).not.toContain("raw-authorization-token");
    expect(serialized).not.toContain("raw-cookie-value");
    expect(serialized).not.toContain("hunter2");
    expect(serialized).not.toContain("abc@upi");
    expect(serialized).not.toContain("ZEP1234");
    expect(serialized).not.toContain("C:/Users");
    expect(serialized).not.toContain("raw-token-123");
  });

  it("redacts relative Zepo data paths after value separators", () => {
    const redacted = redactSensitiveText(
      "bad option --bad=.zepo-live/report.json, encoded=--bad=%2Ezepto-live%2Freport.json, retry path:../.zepto-agent/report.json, and bare=.zepto-current-smoke"
    );

    expect(redacted).toContain("--bad=<redacted-local-path>");
    expect(redacted).toContain("encoded=--bad=<redacted-local-path>");
    expect(redacted).toContain("path:<redacted-local-path>");
    expect(redacted).toContain("bare=<redacted-local-path>");
    expect(redacted).not.toContain(".zepo-live");
    expect(redacted).not.toContain("%2Ezepto-live");
    expect(redacted).not.toContain(".zepto-agent");
    expect(redacted).not.toContain(".zepto-current-smoke");
    expect(redacted).not.toContain("report.json");
  });
});
