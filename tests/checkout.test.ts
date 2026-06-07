import { describe, expect, it } from "vitest";

import {
  assertReadableCheckoutCart,
  CHECKOUT_HANDOFF_CLICK_LABELS,
  clickCheckoutHandoffButton,
  detectCheckoutHandoffMode,
  isCheckoutHandoffClickText,
  isCheckoutHandoffText,
  isManualCheckoutActionText,
  openCheckout,
  isUnsafeCheckoutAutomationClickText
} from "../src/automation/checkout.js";
import { checkoutHandoffOutput } from "../src/commands/checkout.js";
import { checkoutLinkQrMetadata } from "../src/utils/checkout-qr.js";

describe("checkout handoff detection", () => {
  it("detects payment handoff text", () => {
    expect(isCheckoutHandoffText("Order Summary To Pay ₹249 Select payment method UPI Card Wallet")).toBe(true);
    expect(isCheckoutHandoffText("Payment Method UPI Credit Card Wallet")).toBe(true);
    expect(isCheckoutHandoffText("Payment Options UPI Credit Card Wallet")).toBe(true);
  });

  it("detects address and place-order checkout text", () => {
    expect(isCheckoutHandoffText("Delivery Address Home Place Order Cash on Delivery")).toBe(true);
  });

  it("does not treat address plus amount-due cart text as checkout handoff", () => {
    expect(isCheckoutHandoffText("Cart Delivery Address Home To Pay ₹249 Checkout Apply Coupon")).toBe(false);
    expect(isCheckoutHandoffText("Delivery Address Home To Pay ₹249")).toBe(false);
  });

  it("does not treat order-summary cart text as checkout handoff without payment controls", () => {
    expect(isCheckoutHandoffText("Cart Order Summary Item Total ₹249 Checkout Apply Coupon")).toBe(false);
    expect(isCheckoutHandoffText("Order Summary Delivery Address Home To Pay ₹249")).toBe(false);
  });

  it("does not allow automation click labels that can place or pay for an order", () => {
    for (const unsafeText of [
      "Place Order",
      "Confirm Order",
      "Pay Now",
      "Pay",
      "Pay Securely",
      "Pay with UPI",
      "Make Payment",
      "Complete Payment",
      "Confirm Payment",
      "Payment",
      "Payment Method",
      "Select Payment",
      "Choose Payment",
      "UPI",
      "UPI Apps",
      "Credit Card",
      "Debit Card",
      "Debit/Credit Card",
      "Credit and Debit Cards",
      "Credit & Debit Cards",
      "Debit & Credit Cards",
      "Saved Cards",
      "Card Offers",
      "Pay Later",
      "LazyPay",
      "Simpl",
      "EMI",
      "RuPay",
      "Visa",
      "Mastercard",
      "American Express",
      "Wallet",
      "Net Banking",
      "PhonePe",
      "CRED Pay",
      "Amazon Pay",
      "Mobikwik",
      "Google Pay",
      "BHIM",
      "Pay on Delivery",
      "Cash on Delivery",
      "COD",
      "Order Now",
      "Review Order",
      "Customer Support",
      "Help",
      "Invoice",
      "Receipt",
      "Refunded",
      "Cancel Order",
      "Rate Order",
      "Proceed",
      "Proceed to Cart",
      "Continue",
      "Continue to Pay",
      "Continue to Payment",
      "Continue to Checkout",
      "Pay ₹249",
      "Checkout and Pay",
      "Checkout Payment",
      "Checkout & Pay ₹249"
    ]) {
      expect(isUnsafeCheckoutAutomationClickText(unsafeText)).toBe(true);
      expect(isCheckoutHandoffClickText(unsafeText)).toBe(false);
    }

    for (const unsafeText of ["Place Order", "Confirm Order", "Pay Now", "Make Payment", "Pay ₹249", "Continue to Pay"]) {
      expect(CHECKOUT_HANDOFF_CLICK_LABELS.some((label) => label.test(unsafeText))).toBe(false);
    }
  });

  it("allows only explicit checkout handoff button text", () => {
    for (const handoffText of [
      "Checkout",
      "Checkout 2 items",
      "Checkout 1 product",
      "Proceed to Checkout",
      "Proceed to Payment",
      "Proceed to Pay"
    ]) {
      expect(isCheckoutHandoffClickText(handoffText)).toBe(true);
    }

    for (const nonHandoffText of [
      "Proceed",
      "Continue",
      "Continue to Pay",
      "Continue to Payment",
      "Continue to Checkout",
      "Continue Shopping",
      "Proceed to Cart",
      "Checkout these offers",
      "Checkout deals",
      "Checkout and save",
      "View Bill",
      "Apply Coupon"
    ]) {
      expect(isCheckoutHandoffClickText(nonHandoffText)).toBe(false);
    }
  });

  it("recognizes cart-side manual payment controls without allowing automated clicks", () => {
    expect(isManualCheckoutActionText("Click to Pay ₹509")).toBe(true);
    expect(isManualCheckoutActionText("Click to Pay Rs 509")).toBe(true);
    expect(isManualCheckoutActionText("Tap to Pay INR 509")).toBe(true);
    expect(isManualCheckoutActionText("Pay ₹509")).toBe(true);
    expect(isManualCheckoutActionText("Pay Now ₹509")).toBe(true);
    expect(isManualCheckoutActionText("Continue to Pay ₹509")).toBe(true);
    expect(isManualCheckoutActionText("Proceed to Pay ₹509")).toBe(true);
    expect(isManualCheckoutActionText("Continue to Payment ₹509")).toBe(true);
    expect(isManualCheckoutActionText("Proceed to Payment ₹509")).toBe(true);
    expect(isManualCheckoutActionText("Checkout and Pay ₹509")).toBe(true);
    expect(isManualCheckoutActionText("Pay Now")).toBe(false);
    expect(isManualCheckoutActionText("Pay with UPI ₹509")).toBe(false);
    expect(isManualCheckoutActionText("Get Upto ₹50 Cashback on using Amazon Pay")).toBe(false);

    expect(isUnsafeCheckoutAutomationClickText("Click to Pay ₹509")).toBe(true);
    expect(isUnsafeCheckoutAutomationClickText("Pay ₹509")).toBe(true);
    expect(isUnsafeCheckoutAutomationClickText("Continue to Pay ₹509")).toBe(true);
    expect(isCheckoutHandoffClickText("Click to Pay ₹509")).toBe(false);
    expect(isCheckoutHandoffClickText("Pay ₹509")).toBe(false);
    expect(isCheckoutHandoffClickText("Continue to Pay ₹509")).toBe(false);
    expect(isCheckoutHandoffClickText("Continue to Payment ₹509")).toBe(false);
  });


  it("uses role and aria-label checkout handoff controls before generic text matching", async () => {
    const page = createAriaCheckoutPage();

    await expect(clickCheckoutHandoffButton(page as never)).resolves.toBe(true);

    expect(page.clicked).toBe(true);
  });

  it("bounds checkout handoff clicks with an explicit timeout", async () => {
    const page = createCheckoutClickOptionsPage();

    await expect(clickCheckoutHandoffButton(page as never)).resolves.toBe(true);

    expect(page.clickOptions).toEqual({ timeout: 10_000 });
  });

  it("does not click disabled checkout handoff controls", async () => {
    const page = createDisabledCheckoutPage();

    await expect(clickCheckoutHandoffButton(page as never)).resolves.toBe(false);

    expect(page.clicked).toBe(false);
  });

  it("does not click checkout controls when any visible or accessible label is unsafe", async () => {
    for (const page of [
      createMixedLabelCheckoutPage("Pay Now", "Proceed to Checkout"),
      createMixedLabelCheckoutPage("Pay Securely", "Proceed to Pay"),
      createMixedLabelCheckoutPage("Payment", "Proceed to Pay"),
      createMixedLabelCheckoutPage("Payment Method", "Proceed to Pay"),
      createMixedLabelCheckoutPage("UPI", "Proceed to Pay"),
      createMixedLabelCheckoutPage("Debit/Credit Card", "Proceed to Pay"),
      createMixedLabelCheckoutPage("Credit & Debit Cards", "Proceed to Pay"),
      createMixedLabelCheckoutPage("Pay Later", "Proceed to Pay"),
      createMixedLabelCheckoutPage("Amazon Pay", "Proceed to Pay"),
      createMixedLabelCheckoutPage("RuPay", "Proceed to Pay"),
      createMixedLabelCheckoutPage("UPI Apps", "Proceed to Pay"),
      createMixedLabelCheckoutPage("Net Banking", "Proceed to Pay"),
      createMixedLabelCheckoutPage("PhonePe", "Proceed to Pay"),
      createMixedLabelCheckoutPage("Proceed", "Checkout"),
      createMixedLabelCheckoutPage("Continue", "Proceed to Checkout"),
      createMixedLabelCheckoutPage("Continue to Payment", "Checkout"),
      createMixedLabelCheckoutPage("Customer Support", "Checkout"),
      createMixedLabelCheckoutPage("Invoice", "Proceed to Checkout"),
      createMixedLabelCheckoutPage("Refunded", "Proceed to Checkout"),
      createMixedLabelCheckoutPage("Checkout", "Proceed to Checkout", { title: "Review Order" }),
      createMixedLabelCheckoutPage("Checkout", "Proceed to Pay", { title: "Payment Method" }),
      createMixedLabelCheckoutPage("Checkout", "Pay Now")
    ]) {
      await expect(clickCheckoutHandoffButton(page as never)).resolves.toBe(false);

      expect(page.clicked).toBe(false);
    }
  });

  it("skips unsafe checkout handoff matches before clicking a later safe control", async () => {
    const page = createCheckoutCollectionPage();

    await expect(clickCheckoutHandoffButton(page as never)).resolves.toBe(true);

    expect(page.clicks).toEqual(["safe"]);
  });

  it("revalidates checkout handoff controls after scrolling before clicking", async () => {
    const page = createCheckoutRerenderOnScrollPage();

    await expect(clickCheckoutHandoffButton(page as never)).resolves.toBe(false);

    expect(page.clicked).toBe(false);
  });

  it("rejects ordinary cart text", () => {
    expect(isCheckoutHandoffText("Cart Add more items Apply coupon Saved for later")).toBe(false);
  });

  it("rejects cart text with checkout labels but no payment handoff", () => {
    expect(isCheckoutHandoffText("Cart View Bill To Pay ₹249 Checkout")).toBe(false);
  });

  it("rejects ordinary cart text with payment-method promo copy", () => {
    expect(isCheckoutHandoffText("UPI Cards Wallet Cash on Delivery")).toBe(false);
    expect(
      isCheckoutHandoffText(
        "Cart Bill Summary Item Total ₹249 To Pay ₹249 Checkout Pay using UPI and save on this order"
      )
    ).toBe(false);
    expect(
      isCheckoutHandoffText(
        "Cart Add more items Apply Coupon View Bill Checkout UPI Credit Card Wallet Cash on Delivery"
      )
    ).toBe(false);
    expect(
      isCheckoutHandoffText(
        "Cart Bill Summary Item Total ₹249 Grand Total ₹249 Checkout Payment Methods Accepted UPI Cards Wallet"
      )
    ).toBe(false);
    expect(
      isCheckoutHandoffText(
        "Bill Summary Item Total ₹249 To Pay ₹249 Checkout Payment Methods Accepted UPI Cards Wallet"
      )
    ).toBe(false);
    expect(
      isCheckoutHandoffText("Order Summary To Pay ₹249 Payment Methods Accepted UPI Cards Wallet")
    ).toBe(false);
  });

  it("accepts cart-adjacent checkout pages only with explicit payment selection or final checkout controls", () => {
    expect(
      isCheckoutHandoffText(
        "Cart Order Summary Bill Summary To Pay ₹249 Select payment method UPI Cards Wallet"
      )
    ).toBe(true);
    expect(
      isCheckoutHandoffText(
        "Cart Order Summary Bill Summary To Pay ₹249 Place Order Cash on Delivery"
      )
    ).toBe(true);
  });

  it("rejects cart text with delivery address and totals but no payment handoff", () => {
    expect(isCheckoutHandoffText("Cart Delivery Address Home Bill Summary Item Total ₹249 To Pay ₹249 Checkout")).toBe(
      false
    );
  });

  it("does not treat broad unsafe final actions as checkout handoff proof", () => {
    expect(isCheckoutHandoffText("Review Order")).toBe(false);
    expect(isCheckoutHandoffText("Checkout and Pay")).toBe(false);
    expect(isCheckoutHandoffText("Pay ₹249")).toBe(false);
    expect(isCheckoutHandoffText("Pay with UPI")).toBe(false);
  });

  it("rejects ordinary cart text that contains product card copy", () => {
    expect(isCheckoutHandoffText("Cart Gift Card ₹249 Checkout View Bill")).toBe(false);
  });

  it("rejects empty pages", () => {
    expect(isCheckoutHandoffText("   ")).toBe(false);
  });

  it("accepts checkout only when cart text contains readable items", () => {
    expect(() =>
      assertReadableCheckoutCart(`
        My Cart
        Amul Taaza Toned Milk
        1 pack (500 ml)
        ₹32
        Checkout
      `)
    ).not.toThrow();
  });

  it("accepts checkout precondition items extracted from active cart controls", () => {
    expect(() =>
      assertReadableCheckoutCart("Cart You have 1 item in your cart. Recommended products Grand Total ₹102", [
        {
          name: "Nandini Standardized Fresh Milk | Pouch",
          price: "₹27",
          unit: "1 pack (500 ml)",
          quantity: "1"
        }
      ])
    ).not.toThrow();
  });

  it("rejects checkout when the cart has no readable items", () => {
    expect(() => assertReadableCheckoutCart("Cart Add more items Apply coupon Checkout")).toThrow(
      "Zepto cart does not show any readable items for checkout."
    );
  });

  it("rejects product listing rows as checkout cart proof", () => {
    expect(() =>
      assertReadableCheckoutCart(`
        Search results
        Add to Cart
        Amul Taaza Toned Milk
        1 pack (500 ml)
        ₹32
        Checkout these offers
      `)
    ).toThrow("Zepto cart does not show any readable items for checkout.");
  });

  it("rejects cart-header product shelves as checkout cart proof", () => {
    expect(() =>
      assertReadableCheckoutCart(`
        Search milk
        Cart
        Buy Again
        Nandini Toned Fresh Milk | Pouch
        1 pack (500 ml)
        ₹24
        Qty 1
      `)
    ).toThrow("Zepto cart does not show any readable items for checkout.");
  });

  it("rejects large product-shelf pages with cart summary words as checkout cart proof", () => {
    const repeatedProductRows = Array.from({ length: 30 }, (_, index) =>
      [
        "OFF",
        `Product Shelf Item ${index + 1}`,
        "1 pack (500 ml)",
        "₹32"
      ].join("\n")
    ).join("\n");

    expect(() =>
      assertReadableCheckoutCart(`
        Cart
        Bill Summary
        To Pay ₹999
        ${repeatedProductRows}
      `)
    ).toThrow("Zepto cart does not show any readable items for checkout.");
  });

  it("rejects cart mutation controls as checkout cart proof", () => {
    expect(() =>
      assertReadableCheckoutCart(`
        Cart
        Remove
        1 pack (500 ml)
        ₹32
        Checkout
      `)
    ).toThrow("Zepto cart does not show any readable items for checkout.");
  });

  it("reports checkout handoff without claiming payment or order placement", () => {
    expect(checkoutHandoffOutput()).toEqual({
      status: "checkout_handoff_returned",
      payment: "handled_by_zepto",
      humanActionRequired: true,
      automationBoundary: "zepocli_did_not_click_payment_or_order_controls",
      handoffUrl: "https://www.zepto.com/?cart=open",
      paymentHandoffUrl: "https://www.zepto.com/?cart=open",
      paymentLink: "https://www.zepto.com/?cart=open",
      paymentLinkSession: "user_zepto_session_required",
      handoffSurface: "visible_zepto_browser",
      browserOpenAfterReturn: false,
      checkoutWaitCompleted: false,
      cartPrecondition: "non_empty_cart_verified",
      manualPaymentControlVisible: false,
      paymentStatus: "not_observed_by_zepocli",
      orderPlacement: "not_confirmed_by_zepocli",
      orderStatusCommand: "zepo track",
      next: "Open `paymentLink` in the user's Zepto browser/session or run `zepo --visible checkout --wait` when the browser must stay open for Zepto-side payment; after any Zepto-side order action, run `zepo track` to inspect order status."
    });
  });

  it("reports manual checkout action when Zepto only exposes a cart-side payment control", () => {
    expect(checkoutHandoffOutput("manual_payment_control_visible")).toEqual({
      status: "checkout_manual_action_required",
      payment: "handled_by_zepto",
      humanActionRequired: true,
      automationBoundary: "zepocli_did_not_click_payment_or_order_controls",
      handoffUrl: "https://www.zepto.com/?cart=open",
      paymentHandoffUrl: "https://www.zepto.com/?cart=open",
      paymentLink: "https://www.zepto.com/?cart=open",
      paymentLinkSession: "user_zepto_session_required",
      handoffSurface: "visible_zepto_browser",
      browserOpenAfterReturn: false,
      checkoutWaitCompleted: false,
      cartPrecondition: "non_empty_cart_verified",
      manualPaymentControlVisible: true,
      paymentStatus: "not_observed_by_zepocli",
      orderPlacement: "not_confirmed_by_zepocli",
      orderStatusCommand: "zepo track",
      next: "Open `paymentLink` in the user's Zepto browser/session or run `zepo --visible checkout --wait` when a human must continue in Zepto. ZepoCli stops before payment/order controls; after any Zepto-side order action, run `zepo track` to inspect order status."
    });
  });

  it("reports wait-mode checkout guidance after a human-controlled handoff", () => {
    expect(checkoutHandoffOutput("checkout_or_payment_page", { waitForCompletion: true })).toMatchObject({
      status: "checkout_handoff_returned",
      browserOpenAfterReturn: false,
      checkoutWaitCompleted: true,
      next: "If payment/order was completed in Zepto before this command returned, run `zepo track` to inspect order status."
    });
    expect(checkoutHandoffOutput("manual_payment_control_visible", { waitForCompletion: true })).toMatchObject({
      status: "checkout_manual_action_required",
      browserOpenAfterReturn: false,
      checkoutWaitCompleted: true,
      next: "A human continued in Zepto before this command returned. ZepoCli still did not observe payment/order placement; after any Zepto-side order action, run `zepo track` to inspect order status."
    });
  });

  it("reports sanitized checkout cart evidence when the runtime has it", () => {
    expect(
      checkoutHandoffOutput("manual_payment_control_visible", {
        cartEvidence: {
          itemCount: 2,
          hasPayableTotal: true
        }
      })
    ).toMatchObject({
      status: "checkout_manual_action_required",
      manualPaymentControlVisible: true,
      cartEvidence: {
        itemCount: 2,
        hasPayableTotal: true
      }
    });
  });

  it("reports checkout-link QR metadata without turning it into payment proof", () => {
    expect(
      checkoutHandoffOutput("manual_payment_control_visible", {
        paymentQr: checkoutLinkQrMetadata({ terminal: true, fileSaved: true })
      })
    ).toMatchObject({
      status: "checkout_manual_action_required",
      paymentQr: {
        payload: "https://www.zepto.com/?cart=open",
        payloadSession: "user_zepto_session_required",
        format: "zepto_checkout_link_qr",
        payment: "handled_by_zepto",
        terminal: true,
        fileSaved: true,
        note: "QR opens Zepto checkout in the user's Zepto session; it is not a UPI QR, payment credential, payment proof, or order proof."
      },
      paymentStatus: "not_observed_by_zepocli",
      orderPlacement: "not_confirmed_by_zepocli"
    });
  });

  it("keeps manual checkout guidance human-controlled instead of agent-clickable", () => {
    const output = checkoutHandoffOutput("manual_payment_control_visible");

    expect(output.humanActionRequired).toBe(true);
    expect(output.automationBoundary).toBe("zepocli_did_not_click_payment_or_order_controls");
    expect(output.handoffUrl).toBe("https://www.zepto.com/?cart=open");
    expect(output.paymentHandoffUrl).toBe("https://www.zepto.com/?cart=open");
    expect(output.paymentLink).toBe("https://www.zepto.com/?cart=open");
    expect(output.paymentLinkSession).toBe("user_zepto_session_required");
    expect(output.handoffSurface).toBe("visible_zepto_browser");
    expect(output.browserOpenAfterReturn).toBe(false);
    expect(output.checkoutWaitCompleted).toBe(false);
    expect(output.manualPaymentControlVisible).toBe(true);
    expect(output.next).toContain("zepo --visible checkout --wait");
    expect(output.next).toContain("ZepoCli stops before payment/order controls");
    expect(output.next).not.toMatch(/^Click\b/i);
  });

  it("detects the current checkout handoff mode without clicking controls", async () => {
    await expect(
      detectCheckoutHandoffMode(createCheckoutHandoffDetectionPage("Select payment method UPI Card Wallet") as never)
    ).resolves.toEqual({ mode: "checkout_or_payment_page" });

    await expect(
      detectCheckoutHandoffMode(createCheckoutHandoffDetectionPage("Cart Bill Summary", ["Click to Pay ₹509"]) as never)
    ).resolves.toEqual({ mode: "manual_payment_control_visible" });

    await expect(
      detectCheckoutHandoffMode(createCheckoutHandoffDetectionPage("Cart Bill Summary", ["Pay ₹509"]) as never)
    ).resolves.toEqual({ mode: "manual_payment_control_visible" });

    await expect(
      detectCheckoutHandoffMode(createCheckoutHandoffDetectionPage("Cart Bill Summary Checkout") as never)
    ).resolves.toBeUndefined();
  });

  it("detects manual checkout controls from accessible label text", async () => {
    await expect(
      detectCheckoutHandoffMode(
        createCheckoutHandoffDetectionPage("Cart Bill Summary", [
          {
            text: "",
            attributes: { "aria-description": "Click to Pay ₹509" }
          }
        ]) as never
      )
    ).resolves.toEqual({ mode: "manual_payment_control_visible" });

    await expect(
      detectCheckoutHandoffMode(
        createCheckoutHandoffDetectionPage("Cart Bill Summary", [
          {
            text: "",
            attributes: { "aria-describedby": "pay-hint" },
            referencedLabels: { "pay-hint": "Click to Pay ₹509" }
          }
        ]) as never
      )
    ).resolves.toEqual({ mode: "manual_payment_control_visible" });
  });

  it("recovers a readable cart precondition before checkout when Zepto first shows a cart shell", async () => {
    const page = createCheckoutCartRecoveryPage();

    await expect(openCheckout(page as never)).resolves.toEqual({
      mode: "checkout_or_payment_page",
      cartEvidence: {
        itemCount: 1,
        hasPayableTotal: true
      },
      manualPaymentControlVisible: false
    });

    expect(page.cartClicks).toBe(1);
    expect(page.checkoutClicked).toBe(true);
    expect(page.urls.map((url) => new URL(url).pathname)).toEqual(["/"]);
    expect(page.urls.some((url) => new URL(url).pathname === "/cart")).toBe(false);
  });

  it("recovers checkout precondition when Zepto first exposes a stale empty cart", async () => {
    const page = createCheckoutEmptyCartRecoveryPage();

    await expect(openCheckout(page as never)).resolves.toEqual({
      mode: "checkout_or_payment_page",
      cartEvidence: {
        itemCount: 1,
        hasPayableTotal: true
      },
      manualPaymentControlVisible: false
    });

    expect(page.waits).toEqual([5000]);
    expect(page.cartClicks).toBe(1);
    expect(page.checkoutClicked).toBe(true);
    expect(page.urls.map((url) => new URL(url).pathname)).toEqual(["/"]);
  });

  it("lets cart recovery handle unverified checkout cart navigation", async () => {
    const page = createCheckoutCartNavigationRecoveryPage();

    await expect(openCheckout(page as never)).resolves.toEqual({
      mode: "checkout_or_payment_page",
      cartEvidence: {
        itemCount: 1,
        hasPayableTotal: true
      },
      manualPaymentControlVisible: false
    });

    expect(page.cartClicks).toBe(4);
    expect(page.checkoutClicked).toBe(true);
    expect(page.urls.map((url) => new URL(url).pathname)).toEqual(["/", "/", "/"]);
    expect(page.urls.some((url) => new URL(url).pathname === "/cart")).toBe(false);
  });

  it("keeps checkout read-only when Zepto shows an item-limit warning by default", async () => {
    const page = createCheckoutRepeatedCartLimitWarningPage();

    await expect(openCheckout(page as never)).rejects.toMatchObject({
      code: "cart_limit_exceeded"
    });

    expect(page.limitRemoveClicks).toBe(0);
    expect(page.checkoutClicked).toBe(false);
  });

  it("resolves repeated Zepto item-limit warnings before checkout when explicitly requested", async () => {
    const page = createCheckoutRepeatedCartLimitWarningPage();

    await expect(openCheckout(page as never, { removeLimitItems: true })).resolves.toEqual({
      mode: "checkout_or_payment_page",
      cartEvidence: {
        itemCount: 1,
        hasPayableTotal: true
      },
      manualPaymentControlVisible: false
    });

    expect(page.limitRemoveClicks).toBe(2);
    expect(page.checkoutClicked).toBe(true);
  });
});

type CheckoutDetectionControl =
  | string
  | {
      text: string;
      attributes?: Record<string, string | null>;
      referencedLabels?: Record<string, string>;
    };

function createCheckoutHandoffDetectionPage(bodyText: string, controlTexts: CheckoutDetectionControl[] = []) {
  return {
    title: async () => "",
    waitForLoadState: async () => undefined,
    locator: (selector: string) => {
      if (selector === "body") {
        return {
          innerText: async () => bodyText
        };
      }

      return {
        evaluateAll: async (callback: (elements: Element[]) => unknown) => {
          const elements = controlTexts.map((control) => {
            const text = typeof control === "string" ? control : control.text;
            const attributes: Record<string, string | null> =
              typeof control === "string" ? {} : control.attributes ?? {};
            const referencedLabels = typeof control === "string" ? {} : control.referencedLabels ?? {};
            return {
              textContent: text,
              ownerDocument: {
                getElementById: (id: string) =>
                  referencedLabels[id] === undefined ? null : { textContent: referencedLabels[id] }
              },
              getAttribute: (name: string) => attributes[name] ?? null,
              getBoundingClientRect: () => ({ width: 100, height: 20 }),
              hasAttribute: () => false
            };
          });
          const previousWindow = (globalThis as typeof globalThis & { window?: unknown }).window;
          (globalThis as typeof globalThis & { window?: unknown }).window = {
            getComputedStyle: () => ({ display: "block", visibility: "visible" })
          };
          try {
            return callback(elements as never);
          } finally {
            if (previousWindow === undefined) {
              delete (globalThis as typeof globalThis & { window?: unknown }).window;
            } else {
              (globalThis as typeof globalThis & { window?: unknown }).window = previousWindow;
            }
          }
        }
      };
    }
  };
}

function createCheckoutEmptyCartRecoveryPage() {
  let location = "empty-cart";
  let bodyText = "My Cart Your cart is empty";
  const page = {
    cartClicks: 0,
    checkoutClicked: false,
    waits: [] as number[],
    urls: [] as string[],
    title: async () => "",
    goto: async (url: string) => {
      page.urls.push(String(url));
      location = "home";
      bodyText = "Welcome to Zepto Search Cart 2 Account Profile";
      return {
        status: () => 200,
        url: () => String(url)
      };
    },
    waitForLoadState: async () => undefined,
    waitForFunction: async () => undefined,
    waitForTimeout: async (ms: number) => {
      page.waits.push(ms);
    },
    evaluate: async (fn?: unknown) => {
      const source = String(fn ?? "");
      return source.includes("bodyTexts") ? { bodyTexts: [], controlRows: [] } : [];
    },
    getByRole: (role: string, options: { name?: RegExp | string } = {}) => {
      if (location === "home" && role === "button" && matchesLocatorName(options.name, "Cart 2")) {
        return createVisibleLocator("Cart 2", async () => {
          page.cartClicks += 1;
          location = "cart";
          bodyText = [
            "My Cart",
            "Amul Taaza Toned Milk",
            "1 pack (500 ml)",
            "₹32",
            "Qty 1",
            "Grand Total ₹32",
            "Checkout"
          ].join("\n");
        });
      }

      if (location === "cart" && role === "button" && matchesLocatorName(options.name, "Checkout")) {
        return createVisibleLocator("Checkout", async () => {
          page.checkoutClicked = true;
          location = "checkout";
          bodyText = "Select payment method UPI Card Wallet";
        });
      }

      return createHiddenLocator();
    },
    locator: (selector: string) =>
      selector === "body"
        ? {
            innerText: async () => bodyText
          }
        : createHiddenLocator()
  };

  return page;
}

function createCheckoutCartRecoveryPage() {
  let location = "stale-cart";
  let bodyText = "My Cart 2 items View Bill To Pay ₹120";
  const page = {
    cartClicks: 0,
    checkoutClicked: false,
    urls: [] as string[],
    title: async () => "",
    goto: async (url: string) => {
      page.urls.push(String(url));
      location = "home";
      bodyText = "Welcome to Zepto Search Cart 2 Account Profile";
      return {
        status: () => 200,
        url: () => String(url)
      };
    },
    waitForLoadState: async () => undefined,
    waitForFunction: async () => undefined,
    waitForTimeout: async () => undefined,
    evaluate: async (fn?: unknown) => {
      const source = String(fn ?? "");
      return source.includes("bodyTexts") ? { bodyTexts: [], controlRows: [] } : [];
    },
    getByRole: (role: string, options: { name?: RegExp | string } = {}) => {
      if (location === "home" && role === "button" && matchesLocatorName(options.name, "Cart 2")) {
        return createVisibleLocator("Cart 2", async () => {
          page.cartClicks += 1;
          location = "cart";
          bodyText = [
            "My Cart",
            "Amul Taaza Toned Milk",
            "1 pack (500 ml)",
            "₹32",
            "Qty 1",
            "Grand Total ₹32",
            "Checkout"
          ].join("\n");
        });
      }

      if (location === "cart" && role === "button" && matchesLocatorName(options.name, "Checkout")) {
        return createVisibleLocator("Checkout", async () => {
          page.checkoutClicked = true;
          location = "checkout";
          bodyText = "Select payment method UPI Card Wallet";
        });
      }

      return createHiddenLocator();
    },
    locator: (selector: string) =>
      selector === "body"
        ? {
            innerText: async () => bodyText
          }
        : createHiddenLocator()
  };

  return page;
}

function createCheckoutCartNavigationRecoveryPage() {
  let location = "home";
  let bodyText = "Welcome to Zepto Search Cart 2 Account Profile";
  const page = {
    cartClicks: 0,
    checkoutClicked: false,
    urls: [] as string[],
    title: async () => "",
    goto: async (url: string) => {
      page.urls.push(String(url));
      location = "home";
      bodyText = "Welcome to Zepto Search Cart 2 Account Profile";
      return {
        status: () => 200,
        url: () => String(url)
      };
    },
    waitForLoadState: async () => undefined,
    waitForFunction: async () => undefined,
    waitForTimeout: async () => undefined,
    evaluate: async (fn?: unknown) => {
      const source = String(fn ?? "");
      return source.includes("bodyTexts") ? { bodyTexts: [], controlRows: [] } : [];
    },
    getByRole: (role: string, options: { name?: RegExp | string } = {}) => {
      if (location === "home" && role === "button" && matchesLocatorName(options.name, "Cart 2")) {
        return createVisibleLocator("Cart 2", async () => {
          page.cartClicks += 1;
          if (page.cartClicks >= 4) {
            location = "cart";
            bodyText = [
              "My Cart",
              "Amul Taaza Toned Milk",
              "1 pack (500 ml)",
              "₹32",
              "Qty 1",
              "Grand Total ₹32",
              "Checkout"
            ].join("\n");
            return;
          }

          location = "stuck";
          bodyText = "Search results Cart 2 Account Profile";
        });
      }

      if (location === "cart" && role === "button" && matchesLocatorName(options.name, "Checkout")) {
        return createVisibleLocator("Checkout", async () => {
          page.checkoutClicked = true;
          location = "checkout";
          bodyText = "Select payment method UPI Card Wallet";
        });
      }

      return createHiddenLocator();
    },
    locator: (selector: string) =>
      selector === "body"
        ? {
            innerText: async () => bodyText
          }
        : createHiddenLocator()
  };

  return page;
}

function createCheckoutRepeatedCartLimitWarningPage() {
  const readableCartText = [
    "My Cart",
    "Delivering in 5 mins",
    "1 item",
    "Amul Gold Full Cream Fresh Milk | Pouch",
    "1 pack (500 ml)",
    "₹34",
    "Bill Summary",
    "To Pay",
    "₹34",
    "Checkout"
  ].join("\n");
  const warningTexts = [
    [
      "You've exceeded limit for these items for today. Please order tomorrow.",
      "Fortune Pure & Hygienic Fine Grain Sugar (1)",
      "Remove Items",
      readableCartText
    ].join("\n"),
    [
      "You've exceeded limit for these items for today. Please order tomorrow.",
      "Parrys White Label Sugar (1)",
      "Remove Items",
      readableCartText
    ].join("\n")
  ];
  let bodyText = warningTexts[0] ?? readableCartText;
  const page = {
    checkoutClicked: false,
    limitRemoveClicks: 0,
    title: async () => "",
    goto: async (url: string) => ({
      status: () => 200,
      url: () => String(url)
    }),
    waitForLoadState: async () => undefined,
    waitForFunction: async () => undefined,
    waitForTimeout: async () => undefined,
    evaluate: async (fn?: unknown) => {
      const source = String(fn ?? "");
      return source.includes("bodyTexts") ? { bodyTexts: [], controlRows: [] } : [];
    },
    getByRole: (role: string, options: { name?: RegExp | string } = {}) => {
      if (
        (role === "button" || role === "link") &&
        bodyText.includes("Remove Items") &&
        matchesLocatorName(options.name, "Remove Items")
      ) {
        return createVisibleLocator("Remove Items", async () => {
          page.limitRemoveClicks += 1;
          bodyText = warningTexts[page.limitRemoveClicks] ?? readableCartText;
        });
      }

      if (role === "button" && matchesLocatorName(options.name, "Checkout") && bodyText === readableCartText) {
        return createVisibleLocator("Checkout", async () => {
          page.checkoutClicked = true;
          bodyText = "Select payment method UPI Card Wallet";
        });
      }

      return createHiddenLocator();
    },
    locator: (selector: string) =>
      selector === "body"
        ? {
            innerText: async () => bodyText
          }
        : createHiddenLocator()
  };

  return page;
}

function createAriaCheckoutPage() {
  const page = {
    clicked: false,
    getByRole: (role: string, options: { name?: RegExp | string } = {}) => {
      if (role === "link" && matchesLocatorName(options.name, "Proceed to Checkout")) {
        return createVisibleLocator("", async () => {
          page.clicked = true;
        }, "Proceed to Checkout");
      }

      return createHiddenLocator();
    },
    locator: () => createHiddenLocator()
  };

  return page;
}

function createCheckoutClickOptionsPage() {
  const page = {
    clickOptions: undefined as unknown,
    getByRole: (role: string, options: { name?: RegExp | string } = {}) => {
      if (role === "button" && matchesLocatorName(options.name, "Checkout")) {
        return createVisibleLocator("Checkout", async (clickOptions?: unknown) => {
          page.clickOptions = clickOptions;
        });
      }

      return createHiddenLocator();
    },
    locator: () => createHiddenLocator()
  };

  return page;
}

function createDisabledCheckoutPage() {
  const page = {
    clicked: false,
    getByRole: (role: string, options: { name?: RegExp | string } = {}) => {
      if (role === "button" && matchesLocatorName(options.name, "Checkout")) {
        return createVisibleLocator("Checkout", async () => {
          page.clicked = true;
        }, undefined, { "aria-disabled": "true" });
      }

      return createHiddenLocator();
    },
    locator: () => createHiddenLocator()
  };

  return page;
}

function createMixedLabelCheckoutPage(
  text: string,
  ariaLabel: string,
  attributes: Record<string, string | null> = {}
) {
  const page = {
    clicked: false,
    getByRole: (role: string, options: { name?: RegExp | string } = {}) => {
      if (
        role === "button" &&
        (matchesLocatorName(options.name, text) || matchesLocatorName(options.name, ariaLabel))
      ) {
        return createVisibleLocator(text, async () => {
          page.clicked = true;
        }, ariaLabel, attributes);
      }

      return createHiddenLocator();
    },
    locator: () => createHiddenLocator()
  };

  return page;
}

function createCheckoutCollectionPage() {
  const clicks: string[] = [];
  const locators = createLocatorCollection([
    createVisibleLocator("Pay Now", async () => {
      clicks.push("unsafe");
    }, "Checkout"),
    createVisibleLocator("Checkout", async () => {
      clicks.push("safe");
    })
  ]);
  const page = {
    clicks,
    getByRole: (role: string, options: { name?: RegExp | string } = {}) =>
      role === "button" && matchesLocatorName(options.name, "Checkout") ? locators : createHiddenLocator(),
    locator: () => createHiddenLocator()
  };

  return page;
}

function createCheckoutRerenderOnScrollPage() {
  let label = "Checkout";
  const page = {
    clicked: false,
    getByRole: (role: string, options: { name?: RegExp | string } = {}) => {
      if (role === "button" && matchesLocatorName(options.name, "Checkout")) {
        return {
          ...createVisibleLocator(label, async () => {
            page.clicked = true;
          }),
          innerText: async () => label,
          scrollIntoViewIfNeeded: async () => {
            label = "Pay Now";
          }
        };
      }

      return createHiddenLocator();
    },
    locator: () => createHiddenLocator()
  };

  return page;
}

function createVisibleLocator(
  text: string,
  click: (options?: unknown) => Promise<void>,
  ariaLabel?: string,
  attributes: Record<string, string | null> = {}
) {
  return {
    first() {
      return this;
    },
    filter() {
      return createHiddenLocator();
    },
    isVisible: async () => true,
    innerText: async () => text,
    getAttribute: async (name: string) => (name === "aria-label" ? ariaLabel : attributes[name] ?? null),
    evaluate: async () => false,
    click
  };
}

function createHiddenLocator() {
  return {
    first() {
      return this;
    },
    filter() {
      return this;
    },
    isVisible: async () => false,
    innerText: async () => "",
    getAttribute: async () => null,
    evaluate: async () => false,
    click: async () => undefined
  };
}

function createLocatorCollection(
  locators: Array<ReturnType<typeof createVisibleLocator> | ReturnType<typeof createHiddenLocator>>
) {
  const hidden = createHiddenLocator();
  const collection = {
    first() {
      return locators[0] ?? hidden;
    },
    nth(index: number) {
      return locators[index] ?? hidden;
    },
    count: async () => locators.length,
    filter() {
      return collection;
    },
    isVisible: async () => collection.first().isVisible(),
    innerText: async () => collection.first().innerText(),
    getAttribute: async (name: string) => collection.first().getAttribute(name),
    evaluate: async () => false,
    click: async () => collection.first().click()
  };

  return collection;
}

function matchesLocatorName(name: RegExp | string | undefined, text: string): boolean {
  if (name instanceof RegExp) {
    return name.test(text);
  }

  return name === text;
}
