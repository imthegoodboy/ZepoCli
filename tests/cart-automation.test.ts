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
  openCart,
  parseActiveCartItemFromControlText,
  readCart,
  readVisibleCart,
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
    expect(isCartPageText("My Cart\nAmul Taaza Toned Milk\n1 pack (500 ml)\nRs 32\nQty 1")).toBe(true);
    expect(isCartPageText("My Cart Your cart is empty Add items to continue")).toBe(true);
    expect(isCartPageText("Cart 2 items View bill To pay Rs 120")).toBe(true);
    expect(
      isCartPageText(
        "Cart 5 You have 5 items in your cart. The page you’re looking for has made an egg-sit Go to Home Explore Our Top Categories"
      )
    ).toBe(false);
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
    expect(isCartPageText("Your cart is empty Cart16 Cart Go to Cart")).toBe(false);
    expect(() => requireReadableCartSnapshot("Your cart is empty Cart16 Cart Go to Cart")).toThrow(
      "Zepto cart page did not expose readable cart items."
    );
    expect(requireReadableCartSnapshot("My Cart\nAmul Taaza Toned Milk\n1 pack (500 ml)\nRs 32\nQty 1")).toMatchObject({
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

  it("parses only the active cart drawer when Zepto renders it over product shelves", () => {
    expect(
      requireReadableCartSnapshot(`
        Cart
        ADD
        ₹185
        Parachute 100% Pure Coconut Oil
        1 pc (300 ml)
        ADD
        ₹244
        L'Oreal Paris Conditioner
        1 pc (175 ml)
        Other - Study Home PG, Ramakrishna Ashrama Road, Bengaluru, Karnataka 560064, India
        Yay! You saved ₹77 on this order
        Coupons & offers
        Delivering in 5 mins
        3 items
        Nandini Standardized Fresh Milk | Pouch
        1 pack (500 ml)
        1
        ₹27
        Heritage Toned Fresh Milk | Pouch
        1 pack (500 ml)
        1
        ₹26
        Nandini Toned Fresh Milk | Pouch
        1 pack (500 ml)
        1
        ₹24
        Forgot something?
        Add More Items
        Bill Summary
        Item Total
        ₹77
        To Pay
        ₹77
      `)
    ).toMatchObject({
      items: [
        {
          name: "Nandini Standardized Fresh Milk | Pouch",
          price: "₹27",
          unit: "1 pack (500 ml)"
        },
        {
          name: "Heritage Toned Fresh Milk | Pouch",
          price: "₹26",
          unit: "1 pack (500 ml)"
        },
        {
          name: "Nandini Toned Fresh Milk | Pouch",
          price: "₹24",
          unit: "1 pack (500 ml)"
        }
      ],
      total: "₹77"
    });
  });

  it("extracts cart totals only from explicit total labels", () => {
    expect(
      requireReadableCartSnapshot(`
        My Cart
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
        My Cart
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
        My Cart
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
        My Cart
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
        My Cart
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

    expect(
      requireReadableCartSnapshot(`
        My Cart
        Amul Taaza Toned Milk
        1 pack (500 ml)
        ₹32
        Qty 1
        Item total ₹32
      `)
    ).toMatchObject({
      total: undefined
    });

    expect(
      requireReadableCartSnapshot(`
        My Cart
        Amul Taaza Toned Milk
        1 pack (500 ml)
        ₹32
        Qty 1
        Item total
        ₹32
      `)
    ).toMatchObject({
      total: undefined
    });

    expect(
      requireReadableCartSnapshot(`
        My Cart
        Amul Taaza Toned Milk
        1 pack (500 ml)
        ₹32
        Qty 1
        Subtotal ₹32
      `)
    ).toMatchObject({
      total: undefined
    });

    expect(
      requireReadableCartSnapshot(`
        My Cart
        Amul Taaza Toned Milk
        1 pack (500 ml)
        ₹32
        Qty 1
        Items total ₹32
      `)
    ).toMatchObject({
      total: undefined
    });

    expect(
      requireReadableCartSnapshot(`
        My Cart
        Amul Taaza Toned Milk
        1 pack (500 ml)
        ₹32
        Qty 1
        Sub total ₹32
      `)
    ).toMatchObject({
      total: undefined
    });

    expect(
      requireReadableCartSnapshot(`
        My Cart
        Amul Taaza Toned Milk
        1 pack (500 ml)
        ₹32
        Qty 1
        Total
        Sub total
        ₹32
      `)
    ).toMatchObject({
      total: undefined
    });
  });

  it("rejects generic navigation text as cart page proof", () => {
    expect(isCartPageText("Search milk Cart Account Profile")).toBe(false);
    expect(isCartPageText("Sign in to view your cart")).toBe(false);
    expect(isCartPageText("Fresh groceries delivered fast Checkout these offers")).toBe(false);
    expect(isCartPageText("Cart Fresh picks Nandini Toned Fresh Milk | Pouch 1 pack (500 ml) ₹24 ADD")).toBe(false);
  });

  it("rejects cart-header product shelves with quantity controls as readable cart data", () => {
    const productShelfText = `
      Search milk
      Cart
      Buy Again
      Nandini Toned Fresh Milk | Pouch
      1 pack (500 ml)
      ₹24
      Qty 1
      Fresh picks
    `;

    expect(isCartPageText(productShelfText)).toBe(false);
    expect(() => requireReadableCartSnapshot(productShelfText)).toThrow(
      "Zepto cart page did not expose readable cart items."
    );
  });

  it("rejects large Zepto pages with product shelves even when cart summary words are visible", () => {
    const repeatedProductRows = Array.from({ length: 30 }, (_, index) =>
      [
        "OFF",
        `Product Shelf Item ${index + 1}`,
        "1 pack (500 ml)",
        "₹32"
      ].join("\n")
    ).join("\n");
    const pageText = `
      Cart
      Bill Summary
      To Pay ₹999
      ${repeatedProductRows}
    `;

    expect(isCartPageText(pageText)).toBe(false);
    expect(() => requireReadableCartSnapshot(pageText)).toThrow(
      "Zepto cart page did not expose readable cart items."
    );
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

  it("parses active cart rows from compact quantity-control text", () => {
    expect(parseActiveCartItemFromControlText("1 ₹27 Nandini Standardized Fresh Milk | Pouch 1 pack (500 ml)")).toEqual({
      name: "Nandini Standardized Fresh Milk | Pouch",
      price: "₹27",
      unit: "1 pack (500 ml)",
      quantity: "1"
    });

    expect(
      parseActiveCartItemFromControlText(
        "1 ₹27 decorative text 1 pack (500 ml)",
        "Nandini Standardized Fresh Milk | Pouch"
      )
    ).toEqual({
      name: "Nandini Standardized Fresh Milk | Pouch",
      price: "₹27",
      unit: "1 pack (500 ml)",
      quantity: "1"
    });
  });

  it("does not parse back-in-stock promo rows as active cart items", () => {
    expect(
      requireReadableCartSnapshot(`
        Delivering in 5 mins
        1 item
        Amul Gold Full Cream Fresh Milk | Pouch
        ₹34
        Back in stock
        ₹34
        Bill Summary
        To Pay
        ₹34
      `)
    ).toMatchObject({
      items: [
        {
          name: "Amul Gold Full Cream Fresh Milk | Pouch",
          price: "₹34"
        }
      ],
      total: "₹34"
    });
  });

  it("rejects active cart row parser noise from promos, summaries, and asset alts", () => {
    expect(parseActiveCartItemFromControlText("1 ₹50 OFF 1 pack")).toBeUndefined();
    expect(parseActiveCartItemFromControlText("1 ₹50 Coupons & offers")).toBeUndefined();
    expect(parseActiveCartItemFromControlText("1 ₹599 Bill Summary To Pay")).toBeUndefined();
    expect(parseActiveCartItemFromControlText("1 ₹36 Back in stock")).toBeUndefined();
    expect(parseActiveCartItemFromControlText("1 ₹27 1 pack", "scooter-filled.png")).toBeUndefined();
  });

  it("uses active cart item overrides before whole-page text parsing", () => {
    expect(
      requireReadableCartSnapshot(
        `
        Cart
        Recommended
        Parle Hide & Seek Choco Chip Cookies
        1 pack (100 g)
        ₹27
        Qty 1
        Nandini Standardized Fresh Milk | Pouch
        1 pack (500 ml)
        ₹27
        Grand Total ₹102
      `,
        [
          {
            name: "Nandini Standardized Fresh Milk | Pouch",
            price: "₹27",
            unit: "1 pack (500 ml)",
            quantity: "1"
          }
        ]
      )
    ).toMatchObject({
      items: [
        {
          name: "Nandini Standardized Fresh Milk | Pouch",
          price: "₹27",
          unit: "1 pack (500 ml)",
          quantity: "1"
        }
      ],
      total: "₹102"
    });
  });

  it("accepts a readable body cart snapshot before scroll extraction", async () => {
    const page = createReadableCartBodyPage();

    await expect(readVisibleCart(page as never)).resolves.toMatchObject({
      items: [
        {
          name: "Amul Taaza Toned Milk",
          price: "₹32",
          unit: "1 pack (500 ml)",
          quantity: "1"
        }
      ],
      total: "₹32"
    });
    expect(page.evaluated).toBe(false);
  });

  it("does not include background product controls when extracting from a cart drawer", async () => {
    const page = createVirtualizedCartWithBackgroundControlsPage();

    await expect(readVisibleCart(page as never)).resolves.toMatchObject({
      items: [
        {
          name: "Nandini Toned Fresh Milk | Pouch",
          price: "₹24",
          unit: "1 pack (500 ml)"
        }
      ],
      total: "₹24"
    });
  });

  it("fails clearly when Zepto shows an item-limit cart modal", () => {
    expect(() =>
      requireReadableCartSnapshot(`
        You've exceeded limit for these items for today. Please order tomorrow.
        Fortune Pure & Hygienic Fine Grain Sugar (1)
        Remove Items
        Delivering in 5 mins
        1 item
        Amul Gold Full Cream Fresh Milk | Pouch
        1 pack (500 ml)
        1
        ₹34
        Bill Summary
        To Pay
        ₹34
      `)
    ).toThrow("Zepto cart has item-limit warnings that require manual review.");
  });

  it("clicks Zepto's explicit limit-warning remove control only when requested", async () => {
    const page = createCartLimitWarningPage();

    await expect(readCart(page as never, { removeLimitItems: true })).resolves.toMatchObject({
      items: [
        {
          name: "Amul Gold Full Cream Fresh Milk | Pouch",
          price: "₹34",
          unit: "1 pack (500 ml)"
        }
      ],
      total: "₹34"
    });
    expect(page.limitRemoveClicked).toBe(true);
  });

  it("rejects partial active-cart rows when Zepto exposes an item count", () => {
    expect(() =>
      requireReadableCartSnapshot(`
        Delivering in 5 mins
        2 items
        Amul Gold Full Cream Fresh Milk | Pouch
        1 pack (500 ml)
        ₹34
        Bill Summary
        To Pay
        ₹34
      `)
    ).toThrow("Zepto cart exposes 2 items, but only 1 readable item was detected.");
  });

  it("opens cart only with cart-specific labels", () => {
    for (const label of [
      "Cart",
      "Cart 11",
      "Cart\n11",
      "11 Cart",
      "11\nCart",
      "My Cart",
      "My Cart 2",
      "2 My Cart",
      "View Cart",
      "Go to Cart"
    ]) {
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

  it("does not navigate when the current page already exposes a cart surface", async () => {
    const page = createAlreadyOpenCartPage();

    await expect(openCart(page as never)).resolves.toBeUndefined();

    expect(page.urls).toEqual([]);
    expect(page.clicked).toBe(false);
  });

  it("opens cart through the visible Zepto cart control instead of a direct cart URL", async () => {
    const page = createCartOpenViaHomePage();

    await expect(openCart(page as never)).resolves.toBeUndefined();

    expect(page.clicked).toBe(true);
    expect(page.urls.map((url) => new URL(url).pathname)).toEqual(["/"]);
    expect(page.urls.some((url) => new URL(url).pathname === "/cart")).toBe(false);
  });

  it("opens cart from a non-semantic Zepto header cart label without using a direct cart URL", async () => {
    const page = createNonSemanticCartOpenViaHomePage();

    await expect(openCart(page as never)).resolves.toBeUndefined();

    expect(page.clicked).toBe(true);
    expect(page.urls.map((url) => new URL(url).pathname)).toEqual(["/"]);
    expect(page.urls.some((url) => new URL(url).pathname === "/cart")).toBe(false);
  });

  it("opens cart from a badge-before-label Zepto cart control without using a direct cart URL", async () => {
    const page = createBadgeBeforeCartOpenViaHomePage();

    await expect(openCart(page as never)).resolves.toBeUndefined();

    expect(page.clicked).toBe(true);
    expect(page.urls.map((url) => new URL(url).pathname)).toEqual(["/"]);
    expect(page.urls.some((url) => new URL(url).pathname === "/cart")).toBe(false);
  });

  it("recovers from a Zepto not-found surface before opening the real cart", async () => {
    const page = createCartOpenFromNotFoundPage();

    await expect(openCart(page as never)).resolves.toBeUndefined();

    expect(page.notFoundCartClicked).toBe(true);
    expect(page.homeCartClicked).toBe(true);
    expect(page.urls.map((url) => new URL(url).pathname)).toEqual(["/"]);
    expect(page.urls.some((url) => new URL(url).pathname === "/cart")).toBe(false);
  });

  it("retries home cart opening once when Zepto misses the first cart click", async () => {
    const page = createCartOpenAfterHomeRetryPage();

    await expect(openCart(page as never)).resolves.toBeUndefined();

    expect(page.homeCartClicks).toBe(2);
    expect(page.waits).toEqual([1500]);
    expect(page.urls.map((url) => new URL(url).pathname)).toEqual(["/", "/"]);
    expect(page.urls.some((url) => new URL(url).pathname === "/cart")).toBe(false);
  });

  it("recovers a readable cart after Zepto opens an unhydrated cart shell", async () => {
    const page = createCartReadRecoveryPage();

    await expect(readCart(page as never)).resolves.toMatchObject({
      items: [
        {
          name: "Amul Taaza Toned Milk",
          price: "₹32",
          unit: "1 pack (500 ml)",
          quantity: "1"
        }
      ],
      total: "₹32"
    });

    expect(page.cartClicks).toBe(1);
    expect(page.waits).toContain(1500);
    expect(page.urls.map((url) => new URL(url).pathname)).toEqual(["/"]);
    expect(page.urls.some((url) => new URL(url).pathname === "/cart")).toBe(false);
  });

  it("uses a second bounded cart recovery when Zepto reopens another unhydrated shell", async () => {
    const page = createCartSecondRecoveryPage();

    await expect(readCart(page as never)).resolves.toMatchObject({
      items: [
        {
          name: "Amul Taaza Toned Milk",
          price: "₹32",
          unit: "1 pack (500 ml)",
          quantity: "1"
        }
      ],
      total: "₹32"
    });

    expect(page.cartClicks).toBe(2);
    expect(page.urls.map((url) => new URL(url).pathname)).toEqual(["/", "/"]);
    expect(page.urls.some((url) => new URL(url).pathname === "/cart")).toBe(false);
  });

  it("recovers a readable cart after Zepto cannot confirm cart navigation", async () => {
    const page = createCartNavigationRecoveryPage();

    await expect(readCart(page as never)).resolves.toMatchObject({
      items: [
        {
          name: "Amul Taaza Toned Milk",
          price: "₹32",
          unit: "1 pack (500 ml)",
          quantity: "1"
        }
      ],
      total: "₹32"
    });

    expect(page.cartClicks).toBe(4);
    expect(page.recoveryCartClicks).toBe(1);
    expect(page.waits).toEqual([1500, 1500]);
    expect(page.urls.map((url) => new URL(url).pathname)).toEqual(["/", "/", "/"]);
    expect(page.urls.some((url) => new URL(url).pathname === "/cart")).toBe(false);
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
    for (const prefix of [
      "Top Picks For You",
      "Best Offers For You",
      "Trending Deals",
      "Best Sellers",
      "Offer Zone",
      "Buy More Save More",
      "Deals For You",
      "UPI Cashback",
      "Card Offers",
      "Saved Cards",
      "Wallet Cashback",
      "Cash on Delivery",
      "Zepto Pass",
      "Membership",
      "Free Gift",
      "Gift Unlocked",
      "Promo",
      "Checkout",
      "Payment Method"
    ]) {
      expect(isLikelyRemovableCartItemText(`${prefix} Potato Chips 52 g Rs 20 Remove`, undefined)).toBe(false);
      expect(isLikelyRemovableCartItemText(`${prefix} Potato Chips 52 g Rs 20 Remove`, "potato chips")).toBe(false);
    }
    expect(isLikelyRemovableCartItemText("Playing Cards 1 pack Rs 99 Remove", undefined)).toBe(true);
    expect(isLikelyRemovableCartItemText("Card Holder 1 pc Rs 149 Remove", undefined)).toBe(true);
    expect(isLikelyRemovableCartItemText("Wallet Cleaner 100 ml Rs 49 Remove", undefined)).toBe(true);
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

function createAlreadyOpenCartPage() {
  const page = {
    clicked: false,
    urls: [] as string[],
    title: async () => "",
    goto: async (url: string) => {
      page.urls.push(String(url));
      return createNavigationResponse(url);
    },
    waitForLoadState: async () => undefined,
    waitForFunction: async () => undefined,
    getByRole: () => createHiddenLocator(),
    locator: (selector: string) =>
      selector === "body"
        ? createBodyTextLocator(() => "My Cart Your cart is empty Add items to continue")
        : createHiddenLocator()
  };

  return page;
}

function createCartOpenViaHomePage() {
  let location = "current";
  let bodyText = "Search milk Cart Account Profile";
  const page = {
    clicked: false,
    urls: [] as string[],
    title: async () => "",
    goto: async (url: string) => {
      page.urls.push(String(url));
      location = "home";
      bodyText = "Welcome to Zepto Search Cart Account Profile";
      return createNavigationResponse(url);
    },
    waitForLoadState: async () => undefined,
    waitForFunction: async () => undefined,
    getByRole: (role: string, options: { name?: RegExp | string } = {}) => {
      if (location === "home" && role === "button" && matchesLocatorName(options.name, "Cart")) {
        return createVisibleLocator("Cart", async () => {
          page.clicked = true;
          bodyText = "My Cart\nAmul Taaza Toned Milk\n1 pack (500 ml)\n₹32\nQty 1\nGrand Total ₹32";
        });
      }

      return createHiddenLocator();
    },
    locator: (selector: string) =>
      selector === "body" ? createBodyTextLocator(() => bodyText) : createHiddenLocator()
  };

  return page;
}

function createNonSemanticCartOpenViaHomePage() {
  let location = "current";
  let bodyText = "Search milk Account Profile";
  const page = {
    clicked: false,
    urls: [] as string[],
    title: async () => "",
    goto: async (url: string) => {
      page.urls.push(String(url));
      location = "home";
      bodyText = "Welcome to Zepto Search Cart 11 Account Profile";
      return createNavigationResponse(url);
    },
    waitForLoadState: async () => undefined,
    waitForFunction: async () => undefined,
    getByRole: () => createHiddenLocator(),
    locator: (selector: string) => {
      if (selector === "body") {
        return createBodyTextLocator(() => bodyText);
      }

      if (location === "home" && selector.includes("div, span")) {
        return createVisibleLocator("Cart\n11", async () => {
          page.clicked = true;
          bodyText = "My Cart\nAmul Taaza Toned Milk\n1 pack (500 ml)\n₹32\nQty 1\nGrand Total ₹32";
        });
      }

      return createHiddenLocator();
    }
  };

  return page;
}

function createBadgeBeforeCartOpenViaHomePage() {
  let location = "current";
  let bodyText = "Search milk Account Profile";
  const page = {
    clicked: false,
    urls: [] as string[],
    title: async () => "",
    goto: async (url: string) => {
      page.urls.push(String(url));
      location = "home";
      bodyText = "Welcome to Zepto Search 11 Cart Account Profile";
      return createNavigationResponse(url);
    },
    waitForLoadState: async () => undefined,
    waitForFunction: async () => undefined,
    getByRole: () => createHiddenLocator(),
    locator: (selector: string) => {
      if (selector === "body") {
        return createBodyTextLocator(() => bodyText);
      }

      if (location === "home" && selector.includes("div, span")) {
        return createVisibleLocator("11\nCart", async () => {
          page.clicked = true;
          bodyText = "My Cart\nAmul Taaza Toned Milk\n1 pack (500 ml)\n₹32\nQty 1\nGrand Total ₹32";
        });
      }

      return createHiddenLocator();
    }
  };

  return page;
}

function createCartOpenFromNotFoundPage() {
  let location = "not-found";
  let bodyText =
    "Cart 11 The page you’re looking for has made an egg-sit Go to Home Explore Our Top Categories";
  const page = {
    notFoundCartClicked: false,
    homeCartClicked: false,
    urls: [] as string[],
    title: async () => "",
    goto: async (url: string) => {
      page.urls.push(String(url));
      location = "home";
      bodyText = "Welcome to Zepto Search Cart 11 Account Profile";
      return createNavigationResponse(url);
    },
    waitForLoadState: async () => undefined,
    waitForFunction: async () => undefined,
    getByRole: (role: string, options: { name?: RegExp | string } = {}) => {
      if (role !== "button" || !matchesLocatorName(options.name, "Cart 11")) {
        return createHiddenLocator();
      }

      if (location === "not-found") {
        return createVisibleLocator("Cart 11", async () => {
          page.notFoundCartClicked = true;
          bodyText =
            "Cart 11 The page you’re looking for has made an egg-sit Go to Home Explore Our Top Categories";
        });
      }

      return createVisibleLocator("Cart 11", async () => {
        page.homeCartClicked = true;
        bodyText = "My Cart\nAmul Taaza Toned Milk\n1 pack (500 ml)\n₹32\nQty 1\nGrand Total ₹32";
      });
    },
    locator: (selector: string) =>
      selector === "body" ? createBodyTextLocator(() => bodyText) : createHiddenLocator()
  };

  return page;
}

function createCartOpenAfterHomeRetryPage() {
  let location = "current";
  let bodyText = "Search milk Account Profile";
  const page = {
    homeCartClicks: 0,
    waits: [] as number[],
    urls: [] as string[],
    title: async () => "",
    goto: async (url: string) => {
      page.urls.push(String(url));
      location = "home";
      bodyText = "Welcome to Zepto Search Cart 12 Account Profile";
      return createNavigationResponse(url);
    },
    waitForLoadState: async () => undefined,
    waitForFunction: async () => undefined,
    waitForTimeout: async (waitMs: number) => {
      page.waits.push(waitMs);
    },
    getByRole: (role: string, options: { name?: RegExp | string } = {}) => {
      if (location !== "home" || role !== "button" || !matchesLocatorName(options.name, "Cart 12")) {
        return createHiddenLocator();
      }

      return createVisibleLocator("Cart 12", async () => {
        page.homeCartClicks += 1;
        if (page.homeCartClicks >= 2) {
          bodyText = "My Cart\nAmul Taaza Toned Milk\n1 pack (500 ml)\n₹32\nQty 1\nGrand Total ₹32";
        }
      });
    },
    locator: (selector: string) =>
      selector === "body" ? createBodyTextLocator(() => bodyText) : createHiddenLocator()
  };

  return page;
}

function createReadableCartBodyPage() {
  const page = {
    evaluated: false,
    title: async () => "",
    waitForFunction: async () => undefined,
    waitForLoadState: async () => undefined,
    waitForTimeout: async () => undefined,
    evaluate: async () => {
      page.evaluated = true;
      return [];
    },
    locator: (selector: string) =>
      selector === "body"
        ? createBodyTextLocator(() => "My Cart\nAmul Taaza Toned Milk\n1 pack (500 ml)\n₹32\nQty 1\nGrand Total ₹32")
        : createHiddenLocator()
  };

  return page;
}

function createVirtualizedCartWithBackgroundControlsPage() {
  let evaluated = false;
  const activeCartText = [
    "Delivering in 5 mins",
    "1 item",
    "Nandini Toned Fresh Milk | Pouch",
    "1 pack (500 ml)",
    "1",
    "₹24",
    "Forgot something?",
    "Bill Summary",
    "To Pay",
    "₹24"
  ].join("\n");
  const page = {
    title: async () => "",
    waitForFunction: async () => undefined,
    waitForLoadState: async () => undefined,
    waitForTimeout: async () => undefined,
    evaluate: async (fn?: unknown) => {
      evaluated = true;
      const source = String(fn ?? "");
      if (!source.includes("bodyTexts")) {
        return [];
      }

      return {
        bodyTexts: [activeCartText],
        controlRows: [
          {
            text: "1 ₹999 Background Product Shelf Item 1 pack (1 kg)",
            imageAlt: undefined
          }
        ]
      };
    },
    locator: (selector: string) =>
      selector === "body"
        ? createBodyTextLocator(() =>
            evaluated ? activeCartText : "My Cart View Bill To Pay ₹24 Background Product Shelf Item 1 pack (1 kg) ₹999"
          )
        : createHiddenLocator()
  };

  return page;
}

function createCartLimitWarningPage() {
  let bodyText = [
    "You've exceeded limit for these items for today. Please order tomorrow.",
    "Fortune Pure & Hygienic Fine Grain Sugar (1)",
    "Remove Items",
    "Delivering in 5 mins",
    "1 item",
    "Amul Gold Full Cream Fresh Milk | Pouch",
    "1 pack (500 ml)",
    "₹34",
    "Bill Summary",
    "To Pay",
    "₹34"
  ].join("\n");
  const page = {
    limitRemoveClicked: false,
    title: async () => "",
    waitForFunction: async () => undefined,
    waitForLoadState: async () => undefined,
    waitForTimeout: async () => undefined,
    getByRole: (role: string, options: { name?: RegExp | string } = {}) => {
      if ((role === "button" || role === "link") && matchesLocatorName(options.name, "Remove Items")) {
        return createVisibleLocator("Remove Items", async () => {
          page.limitRemoveClicked = true;
          bodyText = [
            "Delivering in 5 mins",
            "1 item",
            "Amul Gold Full Cream Fresh Milk | Pouch",
            "1 pack (500 ml)",
            "₹34",
            "Bill Summary",
            "To Pay",
            "₹34"
          ].join("\n");
        });
      }

      return createHiddenLocator();
    },
    locator: (selector: string) =>
      selector === "body" ? createBodyTextLocator(() => bodyText) : createHiddenLocator()
  };

  return page;
}

function createCartReadRecoveryPage() {
  let location = "stale-cart";
  let bodyText = "My Cart 2 items View Bill To Pay ₹120";
  const page = {
    cartClicks: 0,
    waits: [] as number[],
    urls: [] as string[],
    title: async () => "",
    goto: async (url: string) => {
      page.urls.push(String(url));
      location = "home";
      bodyText = "Welcome to Zepto Search Cart 2 Account Profile";
      return createNavigationResponse(url);
    },
    waitForLoadState: async () => undefined,
    waitForFunction: async () => undefined,
    waitForTimeout: async (waitMs: number) => {
      page.waits.push(waitMs);
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
          bodyText = "My Cart\nAmul Taaza Toned Milk\n1 pack (500 ml)\n₹32\nQty 1\nGrand Total ₹32";
        });
      }

      return createHiddenLocator();
    },
    locator: (selector: string) =>
      selector === "body" ? createBodyTextLocator(() => bodyText) : createHiddenLocator()
  };

  return page;
}

function createCartSecondRecoveryPage() {
  let location = "stale-cart";
  let bodyText = "My Cart 2 items View Bill To Pay ₹120";
  const page = {
    cartClicks: 0,
    urls: [] as string[],
    title: async () => "",
    goto: async (url: string) => {
      page.urls.push(String(url));
      location = "home";
      bodyText = "Welcome to Zepto Search Cart 2 Account Profile";
      return createNavigationResponse(url);
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
          bodyText =
            page.cartClicks >= 2
              ? "My Cart\nAmul Taaza Toned Milk\n1 pack (500 ml)\n₹32\nQty 1\nGrand Total ₹32"
              : "My Cart 2 items View Bill To Pay ₹120";
        });
      }

      return createHiddenLocator();
    },
    locator: (selector: string) =>
      selector === "body" ? createBodyTextLocator(() => bodyText) : createHiddenLocator()
  };

  return page;
}

function createCartNavigationRecoveryPage() {
  let bodyText = "Search results Cart 3 Account Profile";
  const page = {
    cartClicks: 0,
    recoveryCartClicks: 0,
    waits: [] as number[],
    urls: [] as string[],
    title: async () => "",
    goto: async (url: string) => {
      page.urls.push(String(url));
      bodyText = "Welcome to Zepto Search Cart 3 Account Profile";
      return createNavigationResponse(url);
    },
    waitForLoadState: async () => undefined,
    waitForFunction: async () => undefined,
    waitForTimeout: async (waitMs: number) => {
      page.waits.push(waitMs);
    },
    getByRole: (role: string, options: { name?: RegExp | string } = {}) => {
      if (role !== "button" || !matchesLocatorName(options.name, "Cart 3")) {
        return createHiddenLocator();
      }

      return createVisibleLocator("Cart 3", async () => {
        page.cartClicks += 1;
        if (page.cartClicks >= 4) {
          page.recoveryCartClicks += 1;
          bodyText = "My Cart\nAmul Taaza Toned Milk\n1 pack (500 ml)\n₹32\nQty 1\nGrand Total ₹32";
          return;
        }

        bodyText = "Cart 3 Continue shopping";
      });
    },
    locator: (selector: string) =>
      selector === "body" ? createBodyTextLocator(() => bodyText) : createHiddenLocator()
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

function createNavigationResponse(url: string) {
  return {
    status: () => 200,
    url: () => url
  };
}

function createBodyTextLocator(readText: () => string) {
  return {
    ...createHiddenLocator(),
    isVisible: async () => true,
    innerText: async () => readText()
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
    filter(options?: { hasText?: RegExp | string }) {
      return matchesLocatorName(options?.hasText, resolveLocatorText(text)) ? this : createHiddenLocator();
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
