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
    expect(isOrdersOpenClickText("Track Order")).toBe(false);
    expect(isUnsafeOrdersOpenClickText("Track Order")).toBe(true);
    expect(isAccountMenuClickText("Account")).toBe(true);
    expect(isUnsafeAccountMenuClickText("Account")).toBe(false);
    expect(isAccountMenuClickText("Account settings are secure")).toBe(false);
    expect(isAccountMenuClickText("My Orders")).toBe(false);
    expect(isUnsafeAccountMenuClickText("My Orders")).toBe(true);
  });

  it("clicks only explicit reorder action labels", () => {
    for (const label of ["Reorder", "Order Again", "Repeat Order"]) {
      expect(REORDER_ACTION_CLICK_LABELS.some((pattern) => pattern.test(label))).toBe(true);
      expect(isReorderActionClickText(label)).toBe(true);
    }

    for (const label of ["No orders to reorder", "Order Summary", "Track Order", "Proceed to Pay"]) {
      expect(REORDER_ACTION_CLICK_LABELS.some((pattern) => pattern.test(label))).toBe(false);
      expect(isReorderActionClickText(label)).toBe(false);
    }

    expect(isUnsafeReorderActionClickText("Reorder")).toBe(false);
    expect(isUnsafeReorderActionClickText("Proceed to Pay")).toBe(true);
    expect(isUnsafeReorderActionClickText("Cancel Order")).toBe(true);
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

  it("matches latest-order reorder controls without an order id using status plus ETA or total", () => {
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
      true
    );
    expect(isReorderControlInReadableLatestOrderText("Track order Delivered ETA: 8 mins Total ₹249 Reorder", latest)).toBe(
      false
    );
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
    for (const page of [createMixedLabelOrdersNavigationPage("Checkout", "My Orders"), createMixedLabelOrdersNavigationPage("My Orders", "Track Order")]) {
      await expect(clickOrdersNavigationControl(page as never)).resolves.toBe(false);

      expect(page.clicked).toBe(false);
    }
  });

  it("does not click account menu controls when any visible or accessible label is unsafe", async () => {
    for (const page of [createMixedLabelAccountMenuPage("My Orders", "Account"), createMixedLabelAccountMenuPage("Account", "Cart")]) {
      await expect(clickAccountMenuControl(page as never)).resolves.toBe(false);

      expect(page.clicked).toBe(false);
    }
  });

  it("does not click disabled reorder controls", async () => {
    const page = createDisabledReorderPage();

    await expect(clickReorderActionButton(page as never)).resolves.toBe(false);

    expect(page.clicked).toBe(false);
  });

  it("does not click reorder controls when any visible or accessible label is unsafe", async () => {
    for (const page of [createMixedLabelReorderPage("Proceed to Pay", "Reorder"), createMixedLabelReorderPage("Reorder", "Cancel Order")]) {
      await expect(clickReorderActionButton(page as never)).resolves.toBe(false);

      expect(page.clicked).toBe(false);
    }
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

function createMixedLabelOrdersNavigationPage(text: string, ariaLabel: string) {
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

function createMixedLabelAccountMenuPage(text: string, ariaLabel: string) {
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

function createMixedLabelReorderPage(text: string, ariaLabel: string) {
  const page = {
    clicked: false,
    getByRole: (role: string, options: { name?: RegExp | string } = {}) => {
      if (
        role === "button" &&
        (matchesLocatorName(options.name, text) || matchesLocatorName(options.name, ariaLabel))
      ) {
        return createVisibleLocator(text, async () => {
          page.clicked = true;
        }, ariaLabel, "Order #ZEP1234 Delivered Total ₹249 Reorder");
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
  text: string,
  click: () => Promise<void>,
  ariaLabel?: string,
  cardText = text,
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
    evaluate: async (fn?: unknown) => {
      const source = String(fn ?? "");
      if (source.includes("HTMLButtonElement") || source.includes("aria-disabled")) {
        return false;
      }

      return cardText;
    },
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
    evaluate: async () => "",
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
    click: async () => undefined
  };
}

function matchesLocatorName(name: RegExp | string | undefined, text: string): boolean {
  if (name instanceof RegExp) {
    return name.test(text);
  }

  return name === text;
}
