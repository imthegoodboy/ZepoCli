import { describe, expect, it } from "vitest";

import {
  CART_OPEN_CLICK_LABELS,
  cartHasMatchingItem,
  clickTaggedCartRemoveButton,
  clickCartOpenButton,
  hasCartSurfaceEvidence,
  isCartOpenClickText,
  isCartPageText,
  isCartRemoveControlText,
  isEmptyCartText,
  isLikelyRemovableCartItemText,
  isUnsafeCartOpenClickText,
  isUnsafeCartRemoveControlText,
  requireReadableCartSnapshot
} from "../src/automation/cart.js";

describe("cart automation helpers", () => {
  it("matches cart items by product query", () => {
    expect(
      cartHasMatchingItem(
        {
          items: [
            {
              name: "Amul Taaza Toned Milk",
              unit: "1 pack (500 ml)"
            }
          ]
        },
        "milk"
      )
    ).toBe(true);
  });

  it("matches cart items by full item text", () => {
    expect(
      cartHasMatchingItem(
        {
          items: [
            {
              name: "Amul Taaza Toned Milk",
              unit: "1 pack (500 ml)"
            }
          ]
        },
        "Amul Taaza Toned Milk 1 pack (500 ml)"
      )
    ).toBe(true);
  });

  it("matches cart item compact unit queries without matching the wrong size", () => {
    const cart = {
      items: [
        {
          name: "Amul Taaza Toned Milk",
          unit: "1 pack (500 ml)"
        }
      ]
    };

    expect(cartHasMatchingItem(cart, "milk 500ml")).toBe(true);
    expect(cartHasMatchingItem(cart, "milk 1l")).toBe(false);
  });

  it("does not match unrelated items", () => {
    expect(
      cartHasMatchingItem(
        {
          items: [
            {
              name: "Potato Chips",
              unit: "52 g"
            }
          ]
        },
        "milk"
      )
    ).toBe(false);

    expect(
      cartHasMatchingItem(
        {
          items: [
            {
              name: "Price Drop Wheat Flour",
              unit: "1 pack (1 kg)"
            }
          ]
        },
        "rice"
      )
    ).toBe(false);
  });

  it("detects cart page text from readable items or empty-cart copy", () => {
    expect(isCartPageText("Cart\nAmul Taaza Toned Milk\n1 pack (500 ml)\nRs 32\nQty 1")).toBe(true);
    expect(isCartPageText("My Cart Your cart is empty Add items to continue")).toBe(true);
    expect(isCartPageText("Cart 2 items View bill To pay Rs 120")).toBe(true);
  });

  it("distinguishes explicit empty cart copy from unreadable cart content", () => {
    expect(isEmptyCartText("My Cart Your cart is empty Add items to continue")).toBe(true);
    expect(isEmptyCartText("Cart 2 items View bill To pay Rs 120")).toBe(false);

    expect(requireReadableCartSnapshot("My Cart Your cart is empty Add items to continue")).toMatchObject({
      items: [],
      total: undefined
    });
    expect(requireReadableCartSnapshot("My Cart Your cart is empty 0 items Add items to continue")).toMatchObject({
      items: [],
      total: undefined
    });
    expect(requireReadableCartSnapshot("Cart\nAmul Taaza Toned Milk\n1 pack (500 ml)\nRs 32\nQty 1")).toMatchObject({
      items: [
        {
          name: "Amul Taaza Toned Milk",
          unit: "1 pack (500 ml)",
          price: "₹32",
          quantity: "1"
        }
      ],
      total: undefined
    });
    expect(() => requireReadableCartSnapshot("Cart 2 items View bill To pay Rs 120")).toThrow(
      "Zepto cart page did not expose readable cart items."
    );
    expect(() => requireReadableCartSnapshot("My Cart Your cart is empty 2 items View bill To pay Rs 120")).toThrow(
      "Zepto cart page did not expose readable cart items."
    );
  });

  it("extracts cart totals only from explicit total labels", () => {
    expect(
      requireReadableCartSnapshot(`
        Cart
        Amul Taaza Toned Milk
        1 pack (500 ml)
        ₹32
        Qty 1
        Item total ₹32
        Delivery fee ₹25
        Grand Total ₹57
      `)
    ).toMatchObject({
      total: "₹57"
    });

    expect(
      requireReadableCartSnapshot(`
        Cart
        Total Protein Bar
        50 g
        ₹120
        Qty 1
      `)
    ).toMatchObject({
      items: [
        {
          name: "Total Protein Bar",
          price: "₹120",
          unit: "50 g",
          quantity: "1"
        }
      ],
      total: undefined
    });

    expect(
      requireReadableCartSnapshot(`
        Cart
        Amul Taaza Toned Milk
        1 pack (500 ml)
        ₹32
        Qty 1
        To Pay:
        ₹57
      `)
    ).toMatchObject({
      total: "₹57"
    });

    expect(
      requireReadableCartSnapshot(`
        Cart
        Amul Taaza Toned Milk
        1 pack (500 ml)
        ₹32
        Qty 1
        To Pay
        ₹57
      `)
    ).toMatchObject({
      total: "₹57"
    });

    expect(
      requireReadableCartSnapshot(`
        Cart
        Amul Taaza Toned Milk
        1 pack (500 ml)
        ₹32
        Qty 1
        Delivery fee
        ₹25
      `)
    ).toMatchObject({
      total: undefined
    });
  });

  it("rejects generic navigation text as cart page proof", () => {
    expect(isCartPageText("Search milk Cart Account Profile")).toBe(false);
    expect(isCartPageText("Sign in to view your cart")).toBe(false);
    expect(isCartPageText("Fresh groceries delivered fast Checkout these offers")).toBe(false);
  });

  it("rejects product listing text as cart page proof even when item-like rows parse", () => {
    const productListingText = `
      Search results
      ADD
      Amul Taaza Toned Milk
      1 pack (500 ml)
      ₹32
    `;

    expect(hasCartSurfaceEvidence(productListingText)).toBe(false);
    expect(isCartPageText(productListingText)).toBe(false);
    expect(() => requireReadableCartSnapshot(productListingText)).toThrow(
      "Zepto cart page did not expose readable cart items."
    );
  });

  it("does not treat add-to-cart product listing copy as cart surface evidence", () => {
    const productListingText = `
      Search results
      Add to Cart
      Amul Taaza Toned Milk
      1 pack (500 ml)
      ₹32
    `;

    expect(hasCartSurfaceEvidence(productListingText)).toBe(false);
    expect(isCartPageText(productListingText)).toBe(false);
    expect(() => requireReadableCartSnapshot(productListingText)).toThrow(
      "Zepto cart page did not expose readable cart items."
    );
  });

  it("does not treat add-to-cart listing copy with checkout promo text as a cart page", () => {
    const productListingText = `
      Search results
      Add to Cart
      Amul Taaza Toned Milk
      1 pack (500 ml)
      ₹32
      Checkout these offers
    `;

    expect(hasCartSurfaceEvidence(productListingText)).toBe(false);
    expect(isCartPageText(productListingText)).toBe(false);
    expect(() => requireReadableCartSnapshot(productListingText)).toThrow(
      "Zepto cart page did not expose readable cart items."
    );
  });

  it("accepts parsed cart items only with cart-surface evidence", () => {
    expect(hasCartSurfaceEvidence("Cart Amul Taaza Toned Milk 1 pack (500 ml) ₹32")).toBe(true);
    expect(hasCartSurfaceEvidence("Cart Add to Cart Amul Taaza Toned Milk 1 pack (500 ml) ₹32")).toBe(true);
    expect(hasCartSurfaceEvidence("Amul Taaza Toned Milk 1 pack (500 ml) ₹32 Qty 1")).toBe(true);
    expect(hasCartSurfaceEvidence("Amul Taaza Toned Milk 1 pack (500 ml) ₹32")).toBe(false);
  });

  it("opens cart only with cart-specific labels", () => {
    for (const label of ["Cart", "My Cart", "View Cart", "Go to Cart"]) {
      expect(CART_OPEN_CLICK_LABELS.some((pattern) => pattern.test(label))).toBe(true);
      expect(isCartOpenClickText(label)).toBe(true);
      expect(isUnsafeCartOpenClickText(label)).toBe(false);
    }

    for (const label of [
      "Checkout",
      "Proceed",
      "Continue",
      "Proceed to Pay",
      "Pay Now",
      "Order Now",
      "Pay ₹249",
      "Checkout and Pay",
      "Pay with UPI",
      "Payment Method",
      "UPI",
      "Credit Card",
      "Debit Card",
      "Wallet",
      "Cash on Delivery",
      "COD",
      "Customer Support",
      "Help",
      "Invoice",
      "Refunded",
      "Cancel Order",
      "Review Order",
      "Go",
      "Open",
      "Next",
      "Submit"
    ]) {
      expect(CART_OPEN_CLICK_LABELS.some((pattern) => pattern.test(label))).toBe(false);
      expect(isCartOpenClickText(label)).toBe(false);
      expect(isUnsafeCartOpenClickText(label)).toBe(true);
    }
  });

  it("does not click disabled cart navigation controls", async () => {
    const page = createDisabledCartOpenPage();

    await expect(clickCartOpenButton(page as never)).resolves.toBe(false);

    expect(page.clicked).toBe(false);
  });

  it("does not click cart navigation controls when any visible or accessible label is unsafe", async () => {
    for (const page of [
      createMixedLabelCartOpenPage("Checkout", "Cart"),
      createMixedLabelCartOpenPage("UPI", "Cart"),
      createMixedLabelCartOpenPage("Cart", "Credit Card"),
      createMixedLabelCartOpenPage("Cart", "Cart", { title: "Payment Method" }),
      createMixedLabelCartOpenPage("Open", "Cart"),
      createMixedLabelCartOpenPage("Cart", "Cart", { title: "Checkout" }),
      createMixedLabelCartOpenPage("Cart", "To Pay ₹249"),
      createMixedLabelCartOpenPage("Order Now", "Cart"),
      createMixedLabelCartOpenPage("Cart", "Checkout and Pay"),
      createMixedLabelCartOpenPage("Cart", "Cart", { "aria-description": "Pay with UPI" }),
      createMixedLabelCartOpenPage("Customer Support", "Cart"),
      createMixedLabelCartOpenPage("Cart", "Invoice"),
      createMixedLabelCartOpenPage("Cart", "Cart", { title: "Refunded" }),
      createMixedLabelCartOpenPage("Cart", "Cart", { "aria-description": "Review Order" })
    ]) {
      await expect(clickCartOpenButton(page as never)).resolves.toBe(false);

      expect(page.clicked).toBe(false);
    }
  });

  it("skips unsafe cart navigation matches before clicking a later safe control", async () => {
    const page = createCartOpenCollectionPage();

    await expect(clickCartOpenButton(page as never)).resolves.toBe(true);

    expect(page.clicks).toEqual(["safe"]);
  });

  it("revalidates cart navigation controls after scrolling before clicking", async () => {
    const page = createScrollRerenderedCartOpenPage("Cart", "Checkout");

    await expect(clickCartOpenButton(page as never)).resolves.toBe(false);

    expect(page.clicked).toBe(false);
  });

  it("does not click disabled tagged cart remove controls", async () => {
    const page = createTaggedCartRemovePage({ "data-disabled": "true" });

    await expect(clickTaggedCartRemoveButton(page as never, 3)).rejects.toThrow(
      "Zepto cart remove control is disabled."
    );

    expect(page.clicked).toBe(false);
  });

  it("recognizes only item remove controls without unrelated unsafe labels", () => {
    for (const label of ["-", "−", "Remove", "Delete", "Decrease", "Decrease quantity", "Remove item"]) {
      expect(isCartRemoveControlText(label)).toBe(true);
      expect(isUnsafeCartRemoveControlText(label)).toBe(false);
    }

    for (const label of [
      "Add coupon",
      "Apply coupon",
      "Checkout",
      "Pay",
      "Payment",
      "Payment Method",
      "Order Now",
      "Checkout and Pay",
      "Pay with UPI",
      "Pay ₹249",
      "UPI",
      "Credit Card",
      "Debit Card",
      "Wallet",
      "Cash on Delivery",
      "COD",
      "Confirm order",
      "Order Summary",
      "Track Order",
      "Reorder",
      "Order Again",
      "Repeat Order",
      "Cancel Order",
      "Refund",
      "Return",
      "Support",
      "Invoice",
      "Receipt",
      "Rate Order",
      "Address",
      "Clear cart",
      "+",
      "Qty +"
    ]) {
      expect(isCartRemoveControlText(label)).toBe(false);
      expect(isUnsafeCartRemoveControlText(label)).toBe(true);
    }
  });

  it("clicks tagged cart remove controls only when the row still matches the requested item", async () => {
    const page = createTaggedCartRemovePage({}, "Amul Taaza Toned Milk 1 pack (500 ml) ₹32 Qty 1 Remove");

    await expect(clickTaggedCartRemoveButton(page as never, 3, "milk 500ml")).resolves.toBeUndefined();

    expect(page.clicked).toBe(true);
  });

  it("revalidates tagged cart remove controls after scrolling before clicking", async () => {
    const page = createScrollRerenderedTaggedCartRemovePage(
      "Amul Taaza Toned Milk 1 pack (500 ml) ₹32 Qty 1 Remove",
      "Potato Chips 52 g ₹20 Qty 1 Remove"
    );

    await expect(clickTaggedCartRemoveButton(page as never, 3, "milk")).rejects.toThrow(
      "Zepto cart remove control no longer matches a removable cart item."
    );

    expect(page.clicked).toBe(false);
  });

  it("does not click stale tagged cart remove controls that no longer match the requested item", async () => {
    const page = createTaggedCartRemovePage({}, "Potato Chips 52 g ₹20 Qty 1 Remove");

    await expect(clickTaggedCartRemoveButton(page as never, 3, "milk")).rejects.toThrow(
      "Zepto cart remove control no longer matches a removable cart item."
    );

    expect(page.clicked).toBe(false);
  });

  it("does not click tagged cart remove controls when the query only matches inside another word", async () => {
    const page = createTaggedCartRemovePage({}, "Price Drop Wheat Flour 1 kg ₹99 Qty 1 Remove");

    await expect(clickTaggedCartRemoveButton(page as never, 3, "rice")).rejects.toThrow(
      "Zepto cart remove control no longer matches a removable cart item."
    );

    expect(page.clicked).toBe(false);
  });

  it("does not click tagged cart remove controls when any label is unsafe", async () => {
    for (const attributes of [
      { "aria-label": "Checkout" },
      { title: "Add coupon" },
      { "aria-description": "Payment" },
      { "aria-label": "UPI" },
      { title: "Cash on Delivery" },
      { "aria-description": "Credit Card" },
      { "aria-label": "Order Summary" },
      { title: "Track Order" },
      { "aria-description": "Reorder" },
      { title: "Order Now" },
      { "aria-label": "Checkout and Pay" },
      { "aria-description": "Pay with UPI" },
      { title: "Invoice" },
      { "aria-label": "Support" },
      { "aria-label": "Currently unavailable" },
      { title: "Move to cart" },
      { "aria-description": "Notify Me" },
      { value: "Pay Now" }
    ]) {
      const page = createTaggedCartRemovePage(attributes, "Amul Taaza Toned Milk 1 pack (500 ml) ₹32 Qty 1 Remove");

      await expect(clickTaggedCartRemoveButton(page as never, 3, "milk")).rejects.toThrow(
        "Zepto cart remove control no longer appears to be a safe item remove action."
      );

      expect(page.clicked).toBe(false);
    }
  });

  it("does not click tagged cart remove controls inside cart summary rows", async () => {
    const page = createTaggedCartRemovePage({}, "Bill Summary Item total ₹249 Delivery fee ₹30 Remove");

    await expect(clickTaggedCartRemoveButton(page as never, 3)).rejects.toThrow(
      "Zepto cart remove control no longer matches a removable cart item."
    );

    expect(page.clicked).toBe(false);
  });

  it("fails clearly when a tagged cart remove control is no longer visible", async () => {
    const page = createHiddenTaggedCartRemovePage();

    await expect(clickTaggedCartRemoveButton(page as never, 3)).rejects.toThrow(
      "Zepto cart remove control changed before it could be clicked."
    );

    expect(page.clicked).toBe(false);
  });

  it("treats only product item rows as removable cart item candidates", () => {
    expect(isLikelyRemovableCartItemText("Amul Taaza Toned Milk 1 pack (500 ml) ₹32 Qty 1", "milk")).toBe(true);
    expect(isLikelyRemovableCartItemText("Potato Chips 52 g Rs 20 Remove", undefined)).toBe(true);
    expect(isLikelyRemovableCartItemText("Amul Taaza Toned Milk 1 pack (500 ml) ₹32 Qty 1", "milk 500ml")).toBe(
      true
    );
    expect(isLikelyRemovableCartItemText("Amul Taaza Toned Milk 1 pack (500 ml) ₹32 Qty 1", "milk 1l")).toBe(false);
    expect(isLikelyRemovableCartItemText("Potato Chips 52 g Rs 20", undefined)).toBe(false);
    expect(isLikelyRemovableCartItemText("Apply coupon Remove coupon ₹20", undefined)).toBe(false);
    expect(isLikelyRemovableCartItemText("Bill Summary Item total ₹249 Delivery fee ₹30 To Pay ₹279", undefined)).toBe(
      false
    );
    expect(isLikelyRemovableCartItemText("Recommended Potato Chips 52 g Rs 20 Remove", undefined)).toBe(false);
    expect(isLikelyRemovableCartItemText("Saved for later Potato Chips 52 g Rs 20 Remove", undefined)).toBe(false);
    expect(isLikelyRemovableCartItemText("Currently unavailable Potato Chips 52 g Rs 20 Remove", undefined)).toBe(false);
    expect(isLikelyRemovableCartItemText("Out of stock Potato Chips 52 g Rs 20 Remove", undefined)).toBe(false);
    expect(isLikelyRemovableCartItemText("Sold out Potato Chips 52 g Rs 20 Remove", undefined)).toBe(false);
    expect(isLikelyRemovableCartItemText("Potato Chips 52 g Rs 20 Move to cart", undefined)).toBe(false);
    expect(isLikelyRemovableCartItemText("Potato Chips 52 g Rs 20 Notify Me", undefined)).toBe(false);
    expect(isLikelyRemovableCartItemText("Before you checkout Potato Chips 52 g Rs 20 Remove", undefined)).toBe(false);
    expect(isLikelyRemovableCartItemText("Complete your cart Potato Chips 52 g Rs 20 Remove", undefined)).toBe(false);
    expect(isLikelyRemovableCartItemText("Order Summary Amul Taaza Toned Milk 500 ml Rs 32 Remove", undefined)).toBe(false);
    expect(isLikelyRemovableCartItemText("Track Order Amul Taaza Toned Milk 500 ml Rs 32 Remove", undefined)).toBe(false);
    expect(isLikelyRemovableCartItemText("Reorder Amul Taaza Toned Milk 500 ml Rs 32 Remove", undefined)).toBe(false);
    expect(isLikelyRemovableCartItemText("Order Now Amul Taaza Toned Milk 500 ml Rs 32 Remove", undefined)).toBe(false);
    expect(isLikelyRemovableCartItemText("Checkout and Pay Amul Taaza Toned Milk 500 ml Rs 32 Remove", undefined)).toBe(false);
    expect(isLikelyRemovableCartItemText("Pay with UPI Amul Taaza Toned Milk 500 ml Rs 32 Remove", undefined)).toBe(false);
    expect(isLikelyRemovableCartItemText("Pay ₹249 Amul Taaza Toned Milk 500 ml Rs 32 Remove", undefined)).toBe(false);
    expect(isLikelyRemovableCartItemText("Invoice Amul Taaza Toned Milk 500 ml Rs 32 Remove", undefined)).toBe(false);
    expect(isLikelyRemovableCartItemText("Support Amul Taaza Toned Milk 500 ml Rs 32 Remove", undefined)).toBe(false);
    expect(isLikelyRemovableCartItemText("Cancellation Amul Taaza Toned Milk 500 ml Rs 32 Remove", undefined)).toBe(
      false
    );
    expect(isLikelyRemovableCartItemText("Rate & Review Amul Taaza Toned Milk 500 ml Rs 32 Remove", undefined)).toBe(
      false
    );
    expect(isLikelyRemovableCartItemText("Potato Chips 52 g Rs 20", "milk")).toBe(false);
    expect(isLikelyRemovableCartItemText("Price Drop Wheat Flour 1 kg Rs 99 Remove", "rice")).toBe(false);
  });
});

function createDisabledCartOpenPage() {
  const page = {
    clicked: false,
    getByRole: (role: string, options: { name?: RegExp | string } = {}) => {
      if (role === "button" && matchesLocatorName(options.name, "Cart")) {
        return createVisibleLocator("Cart", async () => {
          page.clicked = true;
        }, { "aria-disabled": "true" });
      }

      return createHiddenLocator();
    },
    locator: () => createHiddenLocator()
  };

  return page;
}

function createMixedLabelCartOpenPage(
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
        }, { "aria-label": ariaLabel, ...attributes });
      }

      return createHiddenLocator();
    },
    locator: () => createHiddenLocator()
  };

  return page;
}

function createCartOpenCollectionPage() {
  const clicks: string[] = [];
  const locators = createLocatorCollection([
    createVisibleLocator("Checkout", async () => {
      clicks.push("unsafe");
    }, { "aria-label": "Cart" }),
    createVisibleLocator("Cart", async () => {
      clicks.push("safe");
    })
  ]);
  const page = {
    clicks,
    getByRole: (role: string, options: { name?: RegExp | string } = {}) =>
      role === "button" && matchesLocatorName(options.name, "Cart") ? locators : createHiddenLocator(),
    locator: () => createHiddenLocator()
  };

  return page;
}

function createScrollRerenderedCartOpenPage(textBeforeScroll: string, textAfterScroll: string) {
  let text = textBeforeScroll;
  const page = {
    clicked: false,
    getByRole: (role: string, options: { name?: RegExp | string } = {}) => {
      if (role === "button" && matchesLocatorName(options.name, textBeforeScroll)) {
        return createVisibleLocator(
          () => text,
          async () => {
            page.clicked = true;
          },
          {},
          () => text,
          async () => {
            text = textAfterScroll;
          }
        );
      }

      return createHiddenLocator();
    },
    locator: () => createHiddenLocator()
  };

  return page;
}

function createTaggedCartRemovePage(
  attributes: Record<string, string | null> = {},
  cardText = "Amul Taaza Toned Milk 1 pack (500 ml) ₹32 Qty 1 Remove"
) {
  const page = {
    clicked: false,
    locator: () =>
      createVisibleLocator("Remove", async () => {
        page.clicked = true;
      }, attributes, cardText)
  };

  return page;
}

function createScrollRerenderedTaggedCartRemovePage(cardTextBeforeScroll: string, cardTextAfterScroll: string) {
  let cardText = cardTextBeforeScroll;
  const page = {
    clicked: false,
    locator: () =>
      createVisibleLocator("Remove", async () => {
        page.clicked = true;
      }, {}, () => cardText, async () => {
        cardText = cardTextAfterScroll;
      })
  };

  return page;
}

function createHiddenTaggedCartRemovePage() {
  return {
    clicked: false,
    locator: () => createHiddenLocator()
  };
}

function createVisibleLocator(
  text: string | (() => string),
  click: () => Promise<void>,
  attributes: Record<string, string | null> = {},
  cardText: string | (() => string) = text,
  scrollIntoViewIfNeeded: () => Promise<void> = async () => undefined
) {
  return {
    first() {
      return this;
    },
    filter() {
      return createHiddenLocator();
    },
    isVisible: async () => true,
    innerText: async () => resolveLocatorText(text),
    getAttribute: async (name: string) => attributes[name] ?? null,
    evaluate: async (fn?: unknown) => {
      const source = String(fn ?? "");
      if (source.includes("HTMLButtonElement") || source.includes("hasDisabledState")) {
        return false;
      }

      return typeof cardText === "function" ? cardText() : cardText;
    },
    scrollIntoViewIfNeeded,
    click
  };
}

function resolveLocatorText(text: string | (() => string)): string {
  return typeof text === "function" ? text() : text;
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
    scrollIntoViewIfNeeded: async () => undefined,
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
    evaluate: async (fn?: unknown) => collection.first().evaluate(fn),
    scrollIntoViewIfNeeded: async () => collection.first().scrollIntoViewIfNeeded(),
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
