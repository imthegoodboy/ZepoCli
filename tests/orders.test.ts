import { describe, expect, it } from "vitest";

import {
  ACCOUNT_MENU_CLICK_LABELS,
  clickAccountMenuControl,
  clickReorderActionButton,
  clickOrdersNavigationControl,
  isAccountMenuClickText,
  isEmptyOrdersText,
  isOrdersOpenClickText,
  isOrdersPageText,
  isReorderControlInReadableOrderText,
  isReorderControlInReadableLatestOrderText,
  isReorderActionClickText,
  isUnsafeAccountMenuClickText,
  isUnsafeOrdersOpenClickText,
  isUnsafeReorderActionClickText,
  ORDERS_OPEN_CLICK_LABELS,
  openOrders,
  REORDER_ACTION_CLICK_LABELS,
  requireReadableOrders,
  requireReadableLatestOrderForReorder,
  reorderLast,
  requireReorderCart
} from "../src/automation/orders.js";
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

  it("requires a readable latest order before reordering", () => {
    expect(requireReadableLatestOrderForReorder("Order #ZEP1234 Delivered Total ₹249")).toMatchObject({
      id: "ZEP1234",
      status: "Delivered"
    });
    expect(() => requireReadableLatestOrderForReorder("My Orders No orders yet")).toThrow(
      "No Zepto order was detected to reorder."
    );
    expect(() => requireReadableLatestOrderForReorder("My Orders Reorder Order summary")).toThrow(
      "Zepto orders page did not expose readable order history."
    );
  });

  it("does not click reorder when order history is unreadable", async () => {
    const page = createUnreadableReorderPage();

    await expect(reorderLast(page as never)).rejects.toThrow(
      "Zepto orders page did not expose readable order history."
    );

    expect(page.clicked).toBe(false);
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

  it("rejects latest-order tracking when status and ETA are unreadable", () => {
    expect(() =>
      requireLatestOrder([
        {
          id: "ZEP1234",
          total: "₹249",
          rawText: "Order #ZEP1234 Total ₹249"
        }
      ])
    ).toThrow("Latest Zepto order did not expose a status or ETA.");
  });

  it("detects orders page text from parsed orders or empty-history copy", () => {
    expect(isOrdersPageText("Order #ZEP1234 Confirmed ETA: 8 mins Total ₹249")).toBe(true);
    expect(isOrdersPageText("My Orders No orders yet")).toBe(true);
    expect(isOrdersPageText("Track order Out for delivery ETA: 8 mins")).toBe(true);
  });

  it("distinguishes explicit empty order history from unreadable order content", () => {
    expect(isEmptyOrdersText("My Orders No past orders yet")).toBe(true);
    expect(isEmptyOrdersText("My Orders Reorder Order summary")).toBe(false);
    expect(requireReadableOrders("My Orders No orders yet")).toEqual([]);
    expect(requireReadableOrders("My Orders No orders yet Groceries delivered in minutes")).toEqual([]);
    expect(requireReadableOrders("My Orders No orders yet Snacks arriving in 8 mins")).toEqual([]);
    expect(() => requireReadableOrders("My Orders No orders yet Reorder Order summary")).toThrow(
      "Zepto orders page did not expose readable order history."
    );
    expect(requireReadableOrders("Order #ZEP1234 Delivered Total ₹249")).toEqual([
      {
        id: "ZEP1234",
        status: "Delivered",
        eta: undefined,
        total: "₹249",
        rawText: "Order #ZEP1234 Delivered Total ₹249"
      }
    ]);
    expect(() => requireReadableOrders("My Orders Reorder Order summary")).toThrow(
      "Zepto orders page did not expose readable order history."
    );
  });

  it("parses Zepto no-id order cards with status, placed-at text, and total", () => {
    expect(
      requireReadableOrders(`
        Orders
        Order delivered
        Placed at 26th May 2026, 01:04 pm
        ₹128
        Rate order
        Order Again
        Order delivered
        Placed at 23rd May 2026, 07:46 pm
        ₹171
        Rate order
        Order Again
      `)
    ).toEqual([
      {
        status: "Delivered",
        eta: undefined,
        total: "₹128",
        placedAt: "26th May 2026, 01:04 pm",
        rawText:
          "Order delivered Placed at 26th May 2026, 01:04 pm ₹128 Rate order Order Again"
      },
      {
        status: "Delivered",
        eta: undefined,
        total: "₹171",
        placedAt: "23rd May 2026, 07:46 pm",
        rawText:
          "Order delivered Placed at 23rd May 2026, 07:46 pm ₹171 Rate order Order Again"
      }
    ]);
  });

  it("rejects no-id order action rows without card evidence", () => {
    expect(() => requireReadableOrders("Orders Order delivered Rate order Order Again")).toThrow(
      "Zepto orders page did not expose readable order history."
    );
  });

  it("rejects generic delivery marketing text as orders page text", () => {
    expect(isOrdersPageText("Groceries delivered in minutes ETA: 8 mins")).toBe(false);
    expect(isOrdersPageText("Search milk Cart Account")).toBe(false);
  });

  it("uses explicit order labels instead of treating account/profile as order navigation", () => {
    for (const label of ["My Orders", "Orders", "Order History", "Past Orders"]) {
      expect(ORDERS_OPEN_CLICK_LABELS.some((pattern) => pattern.test(label))).toBe(true);
    }

    for (const label of ["Account", "Profile", "Track Order", "Reorder", "Order Summary"]) {
      expect(ORDERS_OPEN_CLICK_LABELS.some((pattern) => pattern.test(label))).toBe(false);
    }

    expect(ACCOUNT_MENU_CLICK_LABELS.some((pattern) => pattern.test("Account"))).toBe(true);
    expect(ACCOUNT_MENU_CLICK_LABELS.some((pattern) => pattern.test("Profile"))).toBe(true);
    expect(ACCOUNT_MENU_CLICK_LABELS.some((pattern) => pattern.test("My Orders"))).toBe(false);

    expect(isOrdersOpenClickText("My Orders")).toBe(true);
    expect(isUnsafeOrdersOpenClickText("My Orders")).toBe(false);
    expect(isOrdersOpenClickText("Account My Orders Wallet")).toBe(false);
    expect(isUnsafeOrdersOpenClickText("Account My Orders Wallet")).toBe(true);
    expect(isUnsafeOrdersOpenClickText("Open")).toBe(true);
    expect(isUnsafeOrdersOpenClickText("Continue")).toBe(true);
    expect(isOrdersOpenClickText("Track Order")).toBe(false);
    expect(isUnsafeOrdersOpenClickText("Track Order")).toBe(true);
    expect(isUnsafeOrdersOpenClickText("UPI")).toBe(true);
    expect(isUnsafeOrdersOpenClickText("Cash on Delivery")).toBe(true);
    expect(isUnsafeOrdersOpenClickText("COD")).toBe(true);
    expect(isUnsafeOrdersOpenClickText("Customer Support")).toBe(true);
    expect(isUnsafeOrdersOpenClickText("Invoice")).toBe(true);
    expect(isUnsafeOrdersOpenClickText("Refund")).toBe(true);
    expect(isUnsafeOrdersOpenClickText("Order Now")).toBe(true);
    expect(isUnsafeOrdersOpenClickText("Checkout and Pay")).toBe(true);
    expect(isUnsafeOrdersOpenClickText("Pay with UPI")).toBe(true);
    expect(isUnsafeOrdersOpenClickText("Pay ₹249")).toBe(true);
    expect(isUnsafeOrdersOpenClickText("Return")).toBe(true);
    expect(isUnsafeOrdersOpenClickText("Return Request")).toBe(true);
    expect(isUnsafeOrdersOpenClickText("Cancellation")).toBe(true);
    expect(isUnsafeOrdersOpenClickText("Rate & Review")).toBe(true);
    expect(isUnsafeOrdersOpenClickText("Rating")).toBe(true);
    expect(isAccountMenuClickText("Account")).toBe(true);
    expect(isUnsafeAccountMenuClickText("Account")).toBe(false);
    expect(isAccountMenuClickText("Account settings are secure")).toBe(false);
    expect(isAccountMenuClickText("My Orders")).toBe(false);
    expect(isUnsafeAccountMenuClickText("My Orders")).toBe(true);
    expect(isUnsafeAccountMenuClickText("Menu")).toBe(true);
    expect(isUnsafeAccountMenuClickText("Open")).toBe(true);
    expect(isUnsafeAccountMenuClickText("UPI")).toBe(true);
    expect(isUnsafeAccountMenuClickText("Cash on Delivery")).toBe(true);
    expect(isUnsafeAccountMenuClickText("COD")).toBe(true);
    expect(isUnsafeAccountMenuClickText("Customer Support")).toBe(true);
    expect(isUnsafeAccountMenuClickText("Invoice")).toBe(true);
    expect(isUnsafeAccountMenuClickText("Refund")).toBe(true);
    expect(isUnsafeAccountMenuClickText("Order Now")).toBe(true);
    expect(isUnsafeAccountMenuClickText("Checkout and Pay")).toBe(true);
    expect(isUnsafeAccountMenuClickText("Pay with UPI")).toBe(true);
    expect(isUnsafeAccountMenuClickText("Pay ₹249")).toBe(true);
    expect(isUnsafeAccountMenuClickText("Return")).toBe(true);
    expect(isUnsafeAccountMenuClickText("Return Request")).toBe(true);
    expect(isUnsafeAccountMenuClickText("Cancellation")).toBe(true);
    expect(isUnsafeAccountMenuClickText("Rate & Review")).toBe(true);
    expect(isUnsafeAccountMenuClickText("Rating")).toBe(true);
  });

  it("clicks only explicit reorder action labels", () => {
    for (const label of ["Reorder", "Order Again", "Repeat Order"]) {
      expect(REORDER_ACTION_CLICK_LABELS.some((pattern) => pattern.test(label))).toBe(true);
      expect(isReorderActionClickText(label)).toBe(true);
    }

    for (const label of [
      "No orders to reorder",
      "Order Summary",
      "Track Order",
      "Proceed to Pay",
      "Payment Method",
      "Select Payment",
      "UPI",
      "Credit Card",
      "Debit Card",
      "Debit/Credit Card",
      "Wallet",
      "Order Now",
      "Checkout and Pay",
      "Pay with UPI",
      "Pay ₹249",
      "Net Banking",
      "Cash on Delivery",
      "COD",
      "PhonePe",
      "Google Pay",
      "BHIM",
      "Refund",
      "Return Order",
      "Help",
      "Support",
      "Invoice",
      "Receipt",
      "Rate Order",
      "Rating",
      "Review Order"
    ]) {
      expect(REORDER_ACTION_CLICK_LABELS.some((pattern) => pattern.test(label))).toBe(false);
      expect(isReorderActionClickText(label)).toBe(false);
    }

    expect(isUnsafeReorderActionClickText("Reorder")).toBe(false);
    expect(isUnsafeReorderActionClickText("Proceed to Pay")).toBe(true);
    expect(isUnsafeReorderActionClickText("Order Now")).toBe(true);
    expect(isUnsafeReorderActionClickText("Checkout and Pay")).toBe(true);
    expect(isUnsafeReorderActionClickText("Pay with UPI")).toBe(true);
    expect(isUnsafeReorderActionClickText("Pay ₹249")).toBe(true);
    expect(isUnsafeReorderActionClickText("Payment Method")).toBe(true);
    expect(isUnsafeReorderActionClickText("UPI")).toBe(true);
    expect(isUnsafeReorderActionClickText("Credit Card")).toBe(true);
    expect(isUnsafeReorderActionClickText("Cash on Delivery")).toBe(true);
    expect(isUnsafeReorderActionClickText("COD")).toBe(true);
    expect(isUnsafeReorderActionClickText("Cancel Order")).toBe(true);
    expect(isUnsafeReorderActionClickText("Order Summary")).toBe(true);
    expect(isUnsafeReorderActionClickText("Refund")).toBe(true);
    expect(isUnsafeReorderActionClickText("Return Order")).toBe(true);
    expect(isUnsafeReorderActionClickText("Return Request")).toBe(true);
    expect(isUnsafeReorderActionClickText("Cancellation")).toBe(true);
    expect(isUnsafeReorderActionClickText("Support")).toBe(true);
    expect(isUnsafeReorderActionClickText("Invoice")).toBe(true);
    expect(isUnsafeReorderActionClickText("Receipt")).toBe(true);
    expect(isUnsafeReorderActionClickText("Rate Order")).toBe(true);
    expect(isUnsafeReorderActionClickText("Rate & Review")).toBe(true);
    expect(isUnsafeReorderActionClickText("Rating")).toBe(true);
    expect(isUnsafeReorderActionClickText("Review Order")).toBe(true);
    expect(isUnsafeReorderActionClickText("Review Your Order")).toBe(true);
    expect(isUnsafeReorderActionClickText("Again")).toBe(true);
    expect(isUnsafeReorderActionClickText("Open")).toBe(true);
  });

  it("requires reorder controls to be inside readable order text", () => {
    expect(isReorderControlInReadableOrderText("Order #ZEP1234 Delivered Total ₹249 Reorder")).toBe(true);
    expect(isReorderControlInReadableOrderText("Order Again Trending products Reorder")).toBe(false);
  });

  it("requires reorder controls to match the latest readable order when reordering last", () => {
    const latest = {
      id: "ZEP1234",
      status: "Delivered",
      total: "₹249",
      rawText: "Order #ZEP1234 Delivered Total ₹249"
    };

    expect(isReorderControlInReadableLatestOrderText("Order #ZEP1234 Delivered Total ₹249 Reorder", latest)).toBe(true);
    expect(isReorderControlInReadableLatestOrderText("Order #ZEP9999 Delivered Total ₹249 Reorder", latest)).toBe(false);
  });

  it("matches no-id latest-order reorder controls only when every readable identifying field matches", () => {
    const latest = {
      status: "Out for delivery",
      eta: "8 mins",
      total: "₹249",
      rawText: "Track order Out for delivery ETA: 8 mins Total ₹249"
    };

    expect(
      isReorderControlInReadableLatestOrderText("Track order Out for delivery ETA: 8 mins Total ₹249 Reorder", latest)
    ).toBe(true);
    expect(isReorderControlInReadableLatestOrderText("Track order Out for delivery ETA: 9 mins Total ₹249 Reorder", latest)).toBe(
      false
    );
    expect(isReorderControlInReadableLatestOrderText("Track order Out for delivery ETA: 8 mins Total ₹259 Reorder", latest)).toBe(
      false
    );
    expect(isReorderControlInReadableLatestOrderText("Track order Delivered ETA: 8 mins Total ₹249 Reorder", latest)).toBe(
      false
    );
  });

  it("allows no-id latest-order reorder matches with status plus total when ETA is not readable", () => {
    const latest = {
      status: "Delivered",
      total: "₹249",
      rawText: "Track order Delivered Total ₹249"
    };

    expect(isReorderControlInReadableLatestOrderText("Track order Delivered Total ₹249 Reorder", latest)).toBe(true);
    expect(isReorderControlInReadableLatestOrderText("Track order Delivered Total ₹259 Reorder", latest)).toBe(false);
  });

  it("uses role and aria-label reorder controls before generic text matching", async () => {
    const page = createAriaReorderPage();

    await expect(clickReorderActionButton(page as never)).resolves.toBe(true);

    expect(page.clicked).toBe(true);
  });

  it("does not click disabled order navigation controls", async () => {
    const page = createDisabledOrdersNavigationPage();

    await expect(clickOrdersNavigationControl(page as never)).resolves.toBe(false);

    expect(page.clicked).toBe(false);
  });

  it("does not click order navigation controls when any visible or accessible label is unsafe", async () => {
    for (const page of [
      createMixedLabelOrdersNavigationPage("Checkout", "My Orders"),
      createMixedLabelOrdersNavigationPage("Open", "My Orders"),
      createMixedLabelOrdersNavigationPage("UPI", "My Orders"),
      createMixedLabelOrdersNavigationPage("Order Now", "My Orders"),
      createMixedLabelOrdersNavigationPage("My Orders", "Checkout and Pay"),
      createMixedLabelOrdersNavigationPage("Customer Support", "My Orders"),
      createMixedLabelOrdersNavigationPage("Invoice", "My Orders"),
      createMixedLabelOrdersNavigationPage("Rating", "My Orders"),
      createMixedLabelOrdersNavigationPage("My Orders", "My Orders", { title: "Checkout" }),
      createMixedLabelOrdersNavigationPage("My Orders", "My Orders", { "aria-description": "Cash on Delivery" }),
      createMixedLabelOrdersNavigationPage("My Orders", "My Orders", { title: "Customer Support" }),
      createMixedLabelOrdersNavigationPage("My Orders", "My Orders", { "aria-description": "Invoice" }),
      createMixedLabelOrdersNavigationPage("My Orders", "Track Order")
    ]) {
      await expect(clickOrdersNavigationControl(page as never)).resolves.toBe(false);

      expect(page.clicked).toBe(false);
    }
  });

  it("skips unsafe order navigation matches before clicking a later safe control", async () => {
    const page = createOrdersNavigationCollectionPage();

    await expect(clickOrdersNavigationControl(page as never)).resolves.toBe(true);

    expect(page.clicks).toEqual(["safe"]);
  });

  it("revalidates order navigation controls after scrolling before clicking", async () => {
    const page = createScrollRerenderedOrdersNavigationPage("My Orders", "Checkout");

    await expect(clickOrdersNavigationControl(page as never)).resolves.toBe(false);

    expect(page.clicked).toBe(false);
  });

  it("does not click account menu controls when any visible or accessible label is unsafe", async () => {
    for (const page of [
      createMixedLabelAccountMenuPage("My Orders", "Account"),
      createMixedLabelAccountMenuPage("Open", "Account"),
      createMixedLabelAccountMenuPage("UPI", "Account"),
      createMixedLabelAccountMenuPage("Order Now", "Account"),
      createMixedLabelAccountMenuPage("Account", "Checkout and Pay"),
      createMixedLabelAccountMenuPage("Customer Support", "Account"),
      createMixedLabelAccountMenuPage("Invoice", "Account"),
      createMixedLabelAccountMenuPage("Rating", "Account"),
      createMixedLabelAccountMenuPage("Account", "Account", { title: "Cart" }),
      createMixedLabelAccountMenuPage("Account", "Account", { "aria-description": "Cash on Delivery" }),
      createMixedLabelAccountMenuPage("Account", "Account", { title: "Customer Support" }),
      createMixedLabelAccountMenuPage("Account", "Account", { "aria-description": "Invoice" }),
      createMixedLabelAccountMenuPage("Account", "Cart")
    ]) {
      await expect(clickAccountMenuControl(page as never)).resolves.toBe(false);

      expect(page.clicked).toBe(false);
    }
  });

  it("skips unsafe account menu matches before clicking a later safe control", async () => {
    const page = createAccountMenuCollectionPage();

    await expect(clickAccountMenuControl(page as never)).resolves.toBe(true);

    expect(page.clicks).toEqual(["safe"]);
  });

  it("revalidates account menu controls after scrolling before clicking", async () => {
    const page = createScrollRerenderedAccountMenuPage("Account", "Cart");

    await expect(clickAccountMenuControl(page as never)).resolves.toBe(false);

    expect(page.clicked).toBe(false);
  });

  it("opens orders through Zepto account controls without using a direct orders route", async () => {
    const page = createOrdersOpenViaAccountPage();

    await expect(openOrders(page as never)).resolves.toBeUndefined();

    expect(page.accountClicked).toBe(true);
    expect(page.ordersClicked).toBe(true);
    expect(page.urls.map((url) => new URL(url).pathname)).toEqual(["/"]);
    expect(page.urls.some((url) => new URL(url).pathname === "/orders")).toBe(false);
  });

  it("falls back to Zepto account surface without using a direct orders route", async () => {
    const page = createOrdersOpenViaAccountFallbackPage();

    await expect(openOrders(page as never)).resolves.toBeUndefined();

    expect(page.urls.map((url) => new URL(url).pathname)).toEqual(["/", "/account"]);
    expect(page.urls.some((url) => new URL(url).pathname === "/orders")).toBe(false);
  });

  it("waits briefly for account orders controls to render after profile opens", async () => {
    const page = createDelayedOrdersAccountMenuPage();

    await expect(openOrders(page as never)).resolves.toBeUndefined();

    expect(page.accountClicked).toBe(true);
    expect(page.waitedForAccountSurface).toBe(true);
    expect(page.ordersClicked).toBe(true);
    expect(page.urls.map((url) => new URL(url).pathname)).toEqual(["/"]);
    expect(page.urls.some((url) => new URL(url).pathname === "/orders")).toBe(false);
  });

  it("does not click disabled reorder controls", async () => {
    const page = createDisabledReorderPage();

    await expect(clickReorderActionButton(page as never)).resolves.toBe(false);

    expect(page.clicked).toBe(false);
  });

  it("does not click reorder controls when any visible or accessible label is unsafe", async () => {
    for (const page of [
      createMixedLabelReorderPage("Proceed to Pay", "Reorder"),
      createMixedLabelReorderPage("UPI", "Reorder"),
      createMixedLabelReorderPage("Cash on Delivery", "Reorder"),
      createMixedLabelReorderPage("Order Now", "Reorder"),
      createMixedLabelReorderPage("Reorder", "Checkout and Pay"),
      createMixedLabelReorderPage("Reorder", "Reorder", { title: "Pay with UPI" }),
      createMixedLabelReorderPage("Reorder", "Credit Card"),
      createMixedLabelReorderPage("Reorder", "Reorder", { title: "Payment Method" }),
      createMixedLabelReorderPage("Again", "Reorder"),
      createMixedLabelReorderPage("Reorder", "Reorder", { title: "Cancel Order" }),
      createMixedLabelReorderPage("Reorder", "Cancel Order"),
      createMixedLabelReorderPage("Reorder", "Reorder", { title: "Refund" }),
      createMixedLabelReorderPage("Reorder", "Return Order"),
      createMixedLabelReorderPage("Reorder", "Reorder", { title: "Support" }),
      createMixedLabelReorderPage("Reorder", "Invoice"),
      createMixedLabelReorderPage("Reorder", "Receipt"),
      createMixedLabelReorderPage("Reorder", "Rate Order"),
      createMixedLabelReorderPage("Reorder", "Rating"),
      createMixedLabelReorderPage("Reorder", "Review Order")
    ]) {
      await expect(clickReorderActionButton(page as never)).resolves.toBe(false);

      expect(page.clicked).toBe(false);
    }
  });

  it("skips older reorder controls before clicking the latest matching order", async () => {
    const page = createReorderCollectionPage();

    await expect(
      clickReorderActionButton(page as never, {
        id: "ZEP1234",
        status: "Delivered",
        total: "₹249",
        rawText: "Order #ZEP1234 Delivered Total ₹249"
      })
    ).resolves.toBe(true);

    expect(page.clicks).toEqual(["latest"]);
  });

  it("revalidates reorder controls after scrolling before clicking", async () => {
    const page = createScrollRerenderedReorderPage(
      "Order #ZEP1234 Delivered Total ₹249 Reorder",
      "Order #ZEP9999 Delivered Total ₹249 Reorder"
    );

    await expect(
      clickReorderActionButton(page as never, {
        id: "ZEP1234",
        status: "Delivered",
        total: "₹249",
        rawText: "Order #ZEP1234 Delivered Total ₹249"
      })
    ).resolves.toBe(false);

    expect(page.clicked).toBe(false);
  });

  it("does not click a reorder control for a different readable order when reordering last", async () => {
    const page = createReorderForOlderOrderPage();

    await expect(
      clickReorderActionButton(page as never, {
        id: "ZEP1234",
        status: "Delivered",
        total: "₹249",
        rawText: "Order #ZEP1234 Delivered Total ₹249"
      })
    ).resolves.toBe(false);

    expect(page.clicked).toBe(false);
  });

  it("does not click a reorder label outside a readable order card", async () => {
    const page = createReorderWithoutReadableOrderCardPage();

    await expect(clickReorderActionButton(page as never)).resolves.toBe(false);

    expect(page.clicked).toBe(false);
  });
});

function createAriaReorderPage() {
  const page = {
    clicked: false,
    getByRole: (role: string, options: { name?: RegExp | string } = {}) => {
      if (role === "link" && matchesLocatorName(options.name, "Order Again")) {
        return createVisibleLocator("", async () => {
          page.clicked = true;
        }, "Order Again", "Order #ZEP1234 Delivered Total ₹249 Order Again");
      }

      return createHiddenLocator();
    },
    locator: () => createHiddenLocator()
  };

  return page;
}

function createDisabledOrdersNavigationPage() {
  const page = {
    clicked: false,
    getByRole: (role: string, options: { name?: RegExp | string } = {}) => {
      if (role === "button" && matchesLocatorName(options.name, "My Orders")) {
        return createVisibleLocator("My Orders", async () => {
          page.clicked = true;
        }, undefined, "My Orders", { "aria-disabled": "true" });
      }

      return createHiddenLocator();
    },
    locator: () => createHiddenLocator()
  };

  return page;
}

function createMixedLabelOrdersNavigationPage(
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
        }, ariaLabel, text, attributes);
      }

      return createHiddenLocator();
    },
    locator: () => createHiddenLocator()
  };

  return page;
}

function createMixedLabelAccountMenuPage(
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
        }, ariaLabel, text, attributes);
      }

      return createHiddenLocator();
    },
    locator: () => createHiddenLocator()
  };

  return page;
}

function createOrdersNavigationCollectionPage() {
  const clicks: string[] = [];
  const locators = createLocatorCollection([
    createVisibleLocator("Checkout", async () => {
      clicks.push("unsafe");
    }, "My Orders"),
    createVisibleLocator("My Orders", async () => {
      clicks.push("safe");
    })
  ]);
  const page = {
    clicks,
    getByRole: (role: string, options: { name?: RegExp | string } = {}) =>
      role === "button" && matchesLocatorName(options.name, "My Orders") ? locators : createHiddenLocator(),
    locator: () => createHiddenLocator()
  };

  return page;
}

function createScrollRerenderedOrdersNavigationPage(textBeforeScroll: string, textAfterScroll: string) {
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
          () => text,
          () => text,
          {},
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

function createAccountMenuCollectionPage() {
  const clicks: string[] = [];
  const locators = createLocatorCollection([
    createVisibleLocator("My Orders", async () => {
      clicks.push("unsafe");
    }, "Account"),
    createVisibleLocator("Account", async () => {
      clicks.push("safe");
    })
  ]);
  const page = {
    clicks,
    getByRole: (role: string, options: { name?: RegExp | string } = {}) =>
      role === "button" && matchesLocatorName(options.name, "Account") ? locators : createHiddenLocator(),
    locator: () => createHiddenLocator()
  };

  return page;
}

function createScrollRerenderedAccountMenuPage(textBeforeScroll: string, textAfterScroll: string) {
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
          () => text,
          () => text,
          {},
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

function createOrdersOpenViaAccountPage() {
  let location = "blank";
  let bodyText = "";
  const page = {
    accountClicked: false,
    ordersClicked: false,
    urls: [] as string[],
    title: async () => "",
    goto: async (url: string) => {
      page.urls.push(String(url));
      location = "home";
      bodyText = "Welcome to Zepto Cart Profile";
      return createNavigationResponse(url);
    },
    waitForLoadState: async () => undefined,
    getByRole: (role: string, options: { name?: RegExp | string } = {}) => {
      if (location === "home" && role === "button" && matchesLocatorName(options.name, "Profile")) {
        return createVisibleLocator("Profile", async () => {
          page.accountClicked = true;
          location = "account";
          bodyText = "Settings Orders Saved Addresses Profile";
        });
      }

      if (location === "account" && role === "link" && matchesLocatorName(options.name, "Orders")) {
        return createVisibleLocator("Orders", async () => {
          page.ordersClicked = true;
          bodyText = "Orders Order delivered Placed at 26th May 2026 Total ₹128";
        });
      }

      return createHiddenLocator();
    },
    locator: (selector: string) =>
      selector === "body" ? createTextLocator(bodyText) : createHiddenLocator()
  };

  return page;
}

function createDelayedOrdersAccountMenuPage() {
  let location = "blank";
  let bodyText = "";
  let accountSurfaceSettled = false;
  const page = {
    accountClicked: false,
    ordersClicked: false,
    waitedForAccountSurface: false,
    urls: [] as string[],
    title: async () => "",
    goto: async (url: string) => {
      page.urls.push(String(url));
      location = "home";
      accountSurfaceSettled = false;
      bodyText = "Welcome to Zepto Cart Profile";
      return createNavigationResponse(url);
    },
    waitForLoadState: async () => undefined,
    waitForTimeout: async () => {
      if (location === "account") {
        page.waitedForAccountSurface = true;
        accountSurfaceSettled = true;
      }
    },
    getByRole: (role: string, options: { name?: RegExp | string } = {}) => {
      if (location === "home" && role === "button" && matchesLocatorName(options.name, "Profile")) {
        return createVisibleLocator("Profile", async () => {
          page.accountClicked = true;
          location = "account";
          bodyText = "Settings Saved Addresses Profile";
        });
      }

      if (
        location === "account" &&
        accountSurfaceSettled &&
        role === "link" &&
        matchesLocatorName(options.name, "Orders")
      ) {
        return createVisibleLocator("Orders", async () => {
          page.ordersClicked = true;
          bodyText = "Orders Order delivered Placed at 26th May 2026 Total ₹128";
        });
      }

      return createHiddenLocator();
    },
    locator: (selector: string) =>
      selector === "body" ? createTextLocator(bodyText) : createHiddenLocator()
  };

  return page;
}

function createOrdersOpenViaAccountFallbackPage() {
  let bodyText = "";
  const page = {
    urls: [] as string[],
    title: async () => "",
    goto: async (url: string) => {
      page.urls.push(String(url));
      const path = new URL(String(url)).pathname;
      bodyText =
        path === "/account"
          ? "Orders Order delivered Placed at 26th May 2026 Total ₹128"
          : "Welcome to Zepto Cart";
      return createNavigationResponse(url);
    },
    waitForLoadState: async () => undefined,
    getByRole: () => createHiddenLocator(),
    locator: (selector: string) =>
      selector === "body" ? createTextLocator(bodyText) : createHiddenLocator()
  };

  return page;
}

function createDisabledReorderPage() {
  const page = {
    clicked: false,
    getByRole: (role: string, options: { name?: RegExp | string } = {}) => {
      if (role === "button" && matchesLocatorName(options.name, "Reorder")) {
        return createVisibleLocator("Reorder", async () => {
          page.clicked = true;
        }, undefined, "Order #ZEP1234 Delivered Total ₹249 Reorder", { "data-disabled": "true" });
      }

      return createHiddenLocator();
    },
    locator: () => createHiddenLocator()
  };

  return page;
}

function createMixedLabelReorderPage(
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
        }, ariaLabel, "Order #ZEP1234 Delivered Total ₹249 Reorder", attributes);
      }

      return createHiddenLocator();
    },
    locator: () => createHiddenLocator()
  };

  return page;
}

function createReorderCollectionPage() {
  const clicks: string[] = [];
  const locators = createLocatorCollection([
    createVisibleLocator("Reorder", async () => {
      clicks.push("older");
    }, undefined, "Order #ZEP9999 Delivered Total ₹249 Reorder"),
    createVisibleLocator("Reorder", async () => {
      clicks.push("latest");
    }, undefined, "Order #ZEP1234 Delivered Total ₹249 Reorder")
  ]);
  const page = {
    clicks,
    getByRole: (role: string, options: { name?: RegExp | string } = {}) =>
      (role === "button" || role === "link") && matchesLocatorName(options.name, "Reorder")
        ? locators
        : createHiddenLocator(),
    locator: () => createHiddenLocator()
  };

  return page;
}

function createScrollRerenderedReorderPage(cardTextBeforeScroll: string, cardTextAfterScroll: string) {
  let cardText = cardTextBeforeScroll;
  const page = {
    clicked: false,
    getByRole: (role: string, options: { name?: RegExp | string } = {}) => {
      if ((role === "button" || role === "link") && matchesLocatorName(options.name, "Reorder")) {
        return createVisibleLocator("Reorder", async () => {
          page.clicked = true;
        }, undefined, () => cardText, {}, async () => {
          cardText = cardTextAfterScroll;
        });
      }

      return createHiddenLocator();
    },
    locator: () => createHiddenLocator()
  };

  return page;
}

function createReorderForOlderOrderPage() {
  const page = {
    clicked: false,
    getByRole: (role: string, options: { name?: RegExp | string } = {}) => {
      if ((role === "button" || role === "link") && matchesLocatorName(options.name, "Reorder")) {
        return createVisibleLocator("Reorder", async () => {
          page.clicked = true;
        }, undefined, "Order #ZEP9999 Delivered Total ₹249 Reorder");
      }

      return createHiddenLocator();
    },
    locator: () => createHiddenLocator()
  };

  return page;
}

function createReorderWithoutReadableOrderCardPage() {
  const page = {
    clicked: false,
    getByRole: (role: string, options: { name?: RegExp | string } = {}) => {
      if ((role === "button" || role === "link") && matchesLocatorName(options.name, "Reorder")) {
        return createVisibleLocator("Reorder", async () => {
          page.clicked = true;
        }, undefined, "Trending products Reorder");
      }

      return createHiddenLocator();
    },
    locator: () => createHiddenLocator()
  };

  return page;
}

function createUnreadableReorderPage() {
  const page = {
    clicked: false,
    goto: async () => undefined,
    waitForLoadState: async () => undefined,
    title: async () => "Zepto",
    getByRole: (role: string, options: { name?: RegExp | string } = {}) => {
      if ((role === "button" || role === "link") && matchesLocatorName(options.name, "Reorder")) {
        return createVisibleLocator("Reorder", async () => {
          page.clicked = true;
        });
      }

      return createHiddenLocator();
    },
    locator: (selector: string) => (selector === "body" ? createTextLocator("My Orders Reorder Order summary") : createHiddenLocator())
  };

  return page;
}

function createVisibleLocator(
  text: string | (() => string),
  click: () => Promise<void>,
  ariaLabel?: string | (() => string),
  cardText: string | (() => string) = text,
  attributes: Record<string, string | null> = {},
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
    getAttribute: async (name: string) =>
      name === "aria-label" ? resolveOptionalLocatorText(ariaLabel) : attributes[name] ?? null,
    evaluate: async (fn?: unknown) => {
      const source = String(fn ?? "");
      if (source.includes("HTMLButtonElement") || source.includes("aria-disabled")) {
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

function resolveOptionalLocatorText(text: string | (() => string) | undefined): string | undefined {
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
    evaluate: async () => "",
    scrollIntoViewIfNeeded: async () => undefined,
    click: async () => undefined
  };
}

function createTextLocator(text: string) {
  return {
    first() {
      return this;
    },
    filter() {
      return createHiddenLocator();
    },
    isVisible: async () => true,
    innerText: async () => text,
    getAttribute: async () => null,
    scrollIntoViewIfNeeded: async () => undefined,
    click: async () => undefined
  };
}

function createNavigationResponse(url: string) {
  return {
    status: () => 200,
    url: () => url
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
