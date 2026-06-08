import * as QRCode from "qrcode";
import { describe, expect, it } from "vitest";

import {
  isPaymentNavigationClickText,
  isUnsafePaymentNavigationClickText,
  isUpiQrPaymentSurfaceText,
  isUpiMethodSelectClickText,
  navigateToUpiQrSurface,
  readUpiQrFromPage,
  shouldClickCheckoutHandoffBeforeUpi
} from "../src/automation/upi-payment.js";

describe("upi payment automation", () => {
  it("accepts safe payment navigation labels and rejects final payment actions", () => {
    expect(isPaymentNavigationClickText("Continue to Payment ₹509")).toBe(true);
    expect(isPaymentNavigationClickText("Proceed to Payment ₹509")).toBe(true);
    expect(isPaymentNavigationClickText("Click to Pay ₹509")).toBe(true);
    expect(isPaymentNavigationClickText("Tap to Pay INR 509")).toBe(true);
    expect(isUpiMethodSelectClickText("UPI")).toBe(true);
    expect(isUpiMethodSelectClickText("Pay by UPI")).toBe(true);
    expect(isUpiMethodSelectClickText("Pay via QR Code")).toBe(true);
    expect(isUpiMethodSelectClickText("Pay via QR Code NEW")).toBe(true);
    expect(isUnsafePaymentNavigationClickText("Click to Pay ₹509")).toBe(false);
    expect(isUnsafePaymentNavigationClickText("Pay via QR Code NEW")).toBe(false);
    expect(isUnsafePaymentNavigationClickText("Pay Now")).toBe(true);
    expect(isUnsafePaymentNavigationClickText("Pay ₹249")).toBe(true);
    expect(isUnsafePaymentNavigationClickText("Pay with UPI")).toBe(true);
    expect(isPaymentNavigationClickText("Pay with UPI")).toBe(false);
    expect(isPaymentNavigationClickText("Click to Pay")).toBe(false);
    expect(isUnsafePaymentNavigationClickText("Click to Pay")).toBe(true);
  });

  it("detects Zepto's QR drawer copy as a UPI QR payment surface", () => {
    expect(isUpiQrPaymentSurfaceText("Share this QR code with trusted individuals. Scan and pay using any UPI app.")).toBe(
      true
    );
    expect(isUpiQrPaymentSurfaceText("Payment Options Pay via QR Code Credit & Debit Cards")).toBe(false);
    expect(isUpiQrPaymentSurfaceText("Payment Options Pay by UPI Credit & Debit Cards")).toBe(false);
  });

  it("reads a visible base64 UPI QR from the page", async () => {
    const payload = "upi://pay?pa=merchant@upi&pn=Zepto&am=32.00&cu=INR";
    const dataUrl = await QRCode.toDataURL(payload, { type: "image/png", width: 256, margin: 1 });
    const page = createUpiQrPage(dataUrl);

    await expect(readUpiQrFromPage(page)).resolves.toEqual({
      pngBase64: dataUrl.split(",")[1],
      payload
    });
  });

  it("ignores visible QR images that are not UPI payment payloads", async () => {
    const dataUrl = await QRCode.toDataURL("https://www.zepto.com/?cart=open", {
      type: "image/png",
      width: 256,
      margin: 1
    });
    const page = createUpiQrPage(dataUrl);

    await expect(readUpiQrFromPage(page)).resolves.toBeUndefined();
  });

  it("reads a rendered UPI QR screenshot from visible page candidates", async () => {
    const payload = "upi://pay?pa=merchant@upi&pn=Zepto&am=64.00&cu=INR";
    const dataUrl = await QRCode.toDataURL(payload, { type: "image/png", width: 256, margin: 1 });
    const page = createRenderedUpiQrPage(Buffer.from(dataUrl.split(",")[1] ?? "", "base64"));

    await expect(readUpiQrFromPage(page)).resolves.toMatchObject({
      payload
    });
  });

  it("navigates through payment method selection when a UPI QR is already visible", async () => {
    const payload = "upi://pay?pa=merchant@upi&pn=Zepto&am=34.00&cu=INR";
    const dataUrl = await QRCode.toDataURL(payload, { type: "image/png", width: 256, margin: 1 });
    const page = createUpiQrPage(dataUrl);

    await expect(navigateToUpiQrSurface(page)).resolves.toBeUndefined();
    await expect(readUpiQrFromPage(page)).resolves.toMatchObject({
      pngBase64: dataUrl.split(",")[1],
      payload
    });
  });

  it("navigates through Zepto's cart pay button and QR payment option", async () => {
    const payload = "upi://pay?pa=merchant@upi&pn=Zepto&am=104.00&cu=INR";
    const dataUrl = await QRCode.toDataURL(payload, { type: "image/png", width: 256, margin: 1 });
    const page = createZeptoPaymentFlowPage(dataUrl);

    await expect(navigateToUpiQrSurface(page as never)).resolves.toBeUndefined();
    await expect(readUpiQrFromPage(page as never)).resolves.toMatchObject({
      pngBase64: dataUrl.split(",")[1],
      payload
    });
    expect(page.clicks).toEqual(["Click to Pay ₹104", "Pay via QR Code NEW"]);
  });

  it("navigates through Zepto's non-semantic cart pay control", async () => {
    const payload = "upi://pay?pa=merchant@upi&pn=Zepto&am=104.00&cu=INR";
    const dataUrl = await QRCode.toDataURL(payload, { type: "image/png", width: 256, margin: 1 });
    const page = createZeptoDivPaymentFlowPage(dataUrl);

    await expect(navigateToUpiQrSurface(page as never)).resolves.toBeUndefined();
    await expect(readUpiQrFromPage(page as never)).resolves.toMatchObject({
      pngBase64: dataUrl.split(",")[1],
      payload
    });
    expect(page.clicks).toEqual(["Click to Pay ₹104", "Pay via QR Code NEW"]);
  });

  it("does not require the checkout handoff clicker when Zepto already shows a manual payment control", () => {
    expect(
      shouldClickCheckoutHandoffBeforeUpi(
        {
          mode: "manual_payment_control_visible",
          manualPaymentControlVisible: true
        },
        "My Cart Bill Summary To Pay ₹509 Continue to Payment ₹509"
      )
    ).toBe(false);
    expect(shouldClickCheckoutHandoffBeforeUpi(undefined, "My Cart Bill Summary To Pay ₹509 Checkout")).toBe(true);
  });
});

function createUpiQrPage(dataUrl: string) {
  return {
    title: async () => "",
    locator: (selector: string) =>
      selector === "body"
        ? {
            innerText: async () => "Scan & Pay with any UPI app"
          }
        : createHiddenLocator(),
    evaluate: async () => ({
      pngBase64: dataUrl.split(",")[1]
    }),
    waitForLoadState: async () => undefined,
    waitForTimeout: async () => undefined
  };
}

function createRenderedUpiQrPage(png: Buffer) {
  return {
    title: async () => "",
    locator: (selector: string) =>
      selector === "body"
        ? {
            innerText: async () => "Scan & Pay with any UPI app"
          }
        : createRenderedQrLocator(png),
    evaluate: async () => [],
    waitForLoadState: async () => undefined,
    waitForTimeout: async () => undefined
  };
}

function createZeptoPaymentFlowPage(dataUrl: string) {
  let stage: "cart" | "payment-options" | "qr" = "cart";
  const page = {
    clicks: [] as string[],
    title: async () => "Zepto",
    waitForLoadState: async () => undefined,
    waitForTimeout: async () => undefined,
    evaluate: async () => (stage === "qr" ? { pngBase64: dataUrl.split(",")[1] } : []),
    locator: (selector: string) => {
      if (selector === "body") {
        return {
          innerText: async () =>
            stage === "cart"
              ? "My Cart Bill Summary To Pay ₹104 Click to Pay ₹104"
              : stage === "payment-options"
                ? "Payment Options To Pay ₹104 Pay by UPI Pay via QR Code NEW Credit & Debit Cards Wallets"
                : "To Pay ₹104 Scan and pay using any UPI app"
        };
      }

      return createHiddenLocator();
    },
    getByRole: (role: string, options: { name?: RegExp | string } = {}) => {
      if (role !== "button") {
        return createHiddenLocator();
      }

      if (stage === "cart" && matchesLocatorName(options.name, "Click to Pay ₹104")) {
        return createVisibleLocator("Click to Pay ₹104", async () => {
          page.clicks.push("Click to Pay ₹104");
          stage = "payment-options";
        });
      }

      if (stage === "payment-options" && matchesLocatorName(options.name, "Pay via QR Code NEW")) {
        return createVisibleLocator("Pay via QR Code NEW", async () => {
          page.clicks.push("Pay via QR Code NEW");
          stage = "qr";
        });
      }

      return createHiddenLocator();
    }
  };

  return page;
}

function createZeptoDivPaymentFlowPage(dataUrl: string) {
  let stage: "cart" | "payment-options" | "qr" = "cart";
  const page = {
    clicks: [] as string[],
    title: async () => "Zepto",
    waitForLoadState: async () => undefined,
    waitForTimeout: async () => undefined,
    evaluate: async () => (stage === "qr" ? { pngBase64: dataUrl.split(",")[1] } : []),
    locator: (selector: string) => {
      if (selector === "body") {
        return {
          innerText: async () =>
            stage === "cart"
              ? "My Cart Bill Summary To Pay ₹104 Click to Pay ₹104"
              : stage === "payment-options"
                ? "Payment Options To Pay ₹104 Pay by UPI Pay via QR Code NEW Credit & Debit Cards Wallets"
                : "To Pay ₹104 Scan and pay using any UPI app"
        };
      }

      if (stage === "cart" && selector.includes("div")) {
        return createFilterableLocator("Click to Pay ₹104", async () => {
          page.clicks.push("Click to Pay ₹104");
          stage = "payment-options";
        });
      }

      return createHiddenLocator();
    },
    getByRole: () => createHiddenLocator(),
    getByText: (text: RegExp) => {
      if (stage === "payment-options" && matchesLocatorName(text, "Pay via QR Code NEW")) {
        return createVisibleLocator("Pay via QR Code NEW", async () => {
          page.clicks.push("Pay via QR Code NEW");
          stage = "qr";
        });
      }

      return createHiddenLocator();
    }
  };

  return page;
}

function createHiddenLocator() {
  return {
    first: () => createHiddenLocator(),
    nth: () => createHiddenLocator(),
    filter: () => createHiddenLocator(),
    isVisible: async () => false,
    getAttribute: async () => null,
    evaluate: async () => false,
    click: async () => undefined,
    count: async () => 0,
    boundingBox: async () => null,
    screenshot: async () => Buffer.alloc(0)
  };
}

function createRenderedQrLocator(png: Buffer) {
  const locator = {
    first: () => locator,
    nth: () => locator,
    filter: () => locator,
    isVisible: async () => true,
    getAttribute: async () => null,
    innerText: async () => "",
    evaluate: async () => false,
    click: async () => undefined,
    count: async () => 1,
    boundingBox: async () => ({ x: 0, y: 0, width: 256, height: 256 }),
    screenshot: async () => png
  };

  return locator;
}

function createVisibleLocator(label: string, onClick?: () => Promise<void> | void) {
  const locator = {
    first: () => locator,
    nth: () => locator,
    filter: () => locator,
    isVisible: async () => true,
    getAttribute: async (name: string) => {
      if (name === "aria-label") {
        return label;
      }

      return null;
    },
    innerText: async () => label,
    evaluate: async () => false,
    scrollIntoViewIfNeeded: async () => undefined,
    click: async () => {
      await onClick?.();
    },
    count: async () => 1
  };

  return locator;
}

function createFilterableLocator(label: string, onClick?: () => Promise<void> | void) {
  const visible = createVisibleLocator(label, onClick);
  return {
    ...createHiddenLocator(),
    filter: (options: { hasText?: RegExp | string } = {}) =>
      matchesLocatorName(options.hasText, label) ? visible : createHiddenLocator()
  };
}

function matchesLocatorName(name: RegExp | string | undefined, expected: string): boolean {
  if (!name) {
    return false;
  }

  if (typeof name === "string") {
    return name === expected;
  }

  return name.test(expected);
}
