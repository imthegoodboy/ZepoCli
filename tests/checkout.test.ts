import { describe, expect, it } from "vitest";

import {
  assertReadableCheckoutCart,
  CHECKOUT_HANDOFF_CLICK_LABELS,
  clickCheckoutHandoffButton,
  isCheckoutHandoffClickText,
  isCheckoutHandoffText,
  isUnsafeCheckoutAutomationClickText
} from "../src/automation/checkout.js";
import { checkoutHandoffOutput } from "../src/commands/checkout.js";

describe("checkout handoff detection", () => {
  it("detects payment handoff text", () => {
    expect(isCheckoutHandoffText("Order Summary To Pay ₹249 Select payment method UPI Card Wallet")).toBe(true);
    expect(isCheckoutHandoffText("Payment Method UPI Credit Card Wallet")).toBe(true);
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
      "Make Payment",
      "Continue to Pay",
      "Pay ₹249",
      "Checkout and Pay",
      "Checkout & Pay ₹249"
    ]) {
      expect(isUnsafeCheckoutAutomationClickText(unsafeText)).toBe(true);
      expect(isCheckoutHandoffClickText(unsafeText)).toBe(false);
    }

    for (const unsafeText of ["Place Order", "Confirm Order", "Pay Now", "Make Payment", "Pay ₹249"]) {
      expect(CHECKOUT_HANDOFF_CLICK_LABELS.some((label) => label.test(unsafeText))).toBe(false);
    }
  });

  it("allows only explicit checkout handoff button text", () => {
    for (const handoffText of ["Checkout", "Checkout 2 items", "Proceed to Checkout", "Proceed to Pay", "Continue to Payment"]) {
      expect(isCheckoutHandoffClickText(handoffText)).toBe(true);
    }

    for (const nonHandoffText of ["Proceed", "Continue", "Continue to Pay", "Continue Shopping", "View Bill", "Apply Coupon"]) {
      expect(isCheckoutHandoffClickText(nonHandoffText)).toBe(false);
    }
  });

  it("uses role and aria-label checkout handoff controls before generic text matching", async () => {
    const page = createAriaCheckoutPage();

    await expect(clickCheckoutHandoffButton(page as never)).resolves.toBe(true);

    expect(page.clicked).toBe(true);
  });

  it("does not click disabled checkout handoff controls", async () => {
    const page = createDisabledCheckoutPage();

    await expect(clickCheckoutHandoffButton(page as never)).resolves.toBe(false);

    expect(page.clicked).toBe(false);
  });

  it("does not click checkout controls when any visible or accessible label is unsafe", async () => {
    for (const page of [createMixedLabelCheckoutPage("Pay Now", "Proceed to Checkout"), createMixedLabelCheckoutPage("Checkout", "Pay Now")]) {
      await expect(clickCheckoutHandoffButton(page as never)).resolves.toBe(false);

      expect(page.clicked).toBe(false);
    }
  });

  it("rejects ordinary cart text", () => {
    expect(isCheckoutHandoffText("Cart Add more items Apply coupon Saved for later")).toBe(false);
  });

  it("rejects cart text with checkout labels but no payment handoff", () => {
    expect(isCheckoutHandoffText("Cart View Bill To Pay ₹249 Checkout")).toBe(false);
  });

  it("rejects cart text with delivery address and totals but no payment handoff", () => {
    expect(isCheckoutHandoffText("Cart Delivery Address Home Bill Summary Item Total ₹249 To Pay ₹249 Checkout")).toBe(
      false
    );
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
        Cart
        Amul Taaza Toned Milk
        1 pack (500 ml)
        ₹32
        Checkout
      `)
    ).not.toThrow();
  });

  it("rejects checkout when the cart has no readable items", () => {
    expect(() => assertReadableCheckoutCart("Cart Add more items Apply coupon Checkout")).toThrow(
      "Zepto cart does not show any readable items for checkout."
    );
  });

  it("reports checkout handoff without claiming payment or order placement", () => {
    expect(checkoutHandoffOutput()).toEqual({
      status: "checkout_handoff_returned",
      payment: "handled_by_zepto",
      paymentStatus: "not_observed_by_zepocli",
      orderPlacement: "not_confirmed_by_zepocli",
      orderStatusCommand: "zepo track",
      next: "Complete payment in Zepto, then run `zepo track` to inspect order status."
    });
  });
});

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

function createMixedLabelCheckoutPage(text: string, ariaLabel: string) {
  const page = {
    clicked: false,
    getByRole: (role: string, options: { name?: RegExp | string } = {}) => {
      if (
        role === "button" &&
        (matchesLocatorName(options.name, text) || matchesLocatorName(options.name, ariaLabel))
      ) {
        return createVisibleLocator(text, async () => {
          page.clicked = true;
        }, ariaLabel);
      }

      return createHiddenLocator();
    },
    locator: () => createHiddenLocator()
  };

  return page;
}

function createVisibleLocator(
  text: string,
  click: () => Promise<void>,
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

function matchesLocatorName(name: RegExp | string | undefined, text: string): boolean {
  if (name instanceof RegExp) {
    return name.test(text);
  }

  return name === text;
}
