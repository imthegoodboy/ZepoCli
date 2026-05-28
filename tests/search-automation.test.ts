import { describe, expect, it } from "vitest";

import {
  clickSearchTrigger,
  clickProductAdd,
  filterProductsForQuery,
  increaseProductQuantity,
  isLocationSetupRequiredText,
  isSearchTriggerClickText,
  searchProducts,
  SEARCH_TRIGGER_CLICK_LABELS,
  waitForProductAddSettled
} from "../src/automation/search.js";
import { ACCESS_CHALLENGE_COOLDOWN_MS } from "../src/automation/browser.js";
import { UserFacingError } from "../src/utils/errors.js";

describe("search automation helpers", () => {
  it("filters public homepage products by query terms before returning fallback results", () => {
    const products = [
      {
        index: 20,
        automationId: 20,
        name: "Daily Good Sona Masoori Raw Rice",
        price: "₹69",
        unit: "1 pack (1 kg)"
      },
      {
        index: 21,
        automationId: 21,
        name: "Rin Matic Top Load Detergent Liquid",
        price: "₹210",
        unit: "1 pack (2 kg)"
      },
      {
        index: 22,
        automationId: 22,
        name: "Daawat Rozana Super Basmati Rice",
        price: "₹363",
        unit: "1 pack (5 kg)"
      }
    ];

    expect(filterProductsForQuery(products, "rice")).toMatchObject([
      {
        index: 0,
        automationId: 20,
        name: "Daily Good Sona Masoori Raw Rice"
      },
      {
        index: 1,
        automationId: 22,
        name: "Daawat Rozana Super Basmati Rice"
      }
    ]);
    expect(filterProductsForQuery(products, "sona rice").map((product) => product.name)).toEqual([
      "Daily Good Sona Masoori Raw Rice"
    ]);
    expect(filterProductsForQuery(products, "milk")).toEqual([]);
  });

  it("filters public homepage fallback products with compact unit queries", () => {
    const products = [
      {
        index: 20,
        automationId: 20,
        name: "Amul Taaza Toned Milk",
        price: "₹32",
        unit: "1 pack (500 ml)"
      },
      {
        index: 21,
        automationId: 21,
        name: "Amul Gold Milk",
        price: "₹82",
        unit: "1 pack (1 L)"
      }
    ];

    expect(filterProductsForQuery(products, "milk 500ml").map((product) => product.name)).toEqual([
      "Amul Taaza Toned Milk"
    ]);
    expect(filterProductsForQuery(products, "milk 1l").map((product) => product.name)).toEqual(["Amul Gold Milk"]);
  });

  it("clicks only explicit homepage search trigger labels", () => {
    for (const label of ["Search", "Search Products", "Search for Products", "Search for Groceries"]) {
      expect(SEARCH_TRIGGER_CLICK_LABELS.some((pattern) => pattern.test(label))).toBe(true);
      expect(isSearchTriggerClickText(label)).toBe(true);
    }

    for (const label of ["Search milk Cart Account", "Popular Searches", "Research products", "Search results for milk"]) {
      expect(SEARCH_TRIGGER_CLICK_LABELS.some((pattern) => pattern.test(label))).toBe(false);
      expect(isSearchTriggerClickText(label)).toBe(false);
    }
  });

  it("does not click disabled search trigger controls", async () => {
    const page = createDisabledSearchTriggerPage();

    await expect(clickSearchTrigger(page as never)).resolves.toBe(false);

    expect(page.clicked).toBe(false);
  });

  it("detects delivery-location setup copy without treating normal search text as setup", () => {
    expect(isLocationSetupRequiredText("Select location to see products near you")).toBe(true);
    expect(isLocationSetupRequiredText("Enter delivery location to continue")).toBe(true);
    expect(isLocationSetupRequiredText("Where should we deliver your groceries?")).toBe(true);
    expect(isLocationSetupRequiredText("Search results for location tracker batteries")).toBe(false);
  });

  it("does not repeat direct search URL fallback when no search input is available", async () => {
    const page = createNoResultPage();

    await expect(searchProducts(page as never, "milk", 1)).resolves.toEqual([]);

    expect(page.gotoUrls.filter((url) => url.includes("/search?query=milk"))).toHaveLength(1);
  });

  it("does not type into a disabled search input after opening search", async () => {
    const page = createDisabledInputAfterSearchTriggerPage();

    await expect(searchProducts(page as never, "milk", 1)).resolves.toEqual([]);

    expect(page.searchClicked).toBe(true);
    expect(page.inputFilled).toBe(false);
    expect(page.inputTyped).toBe(false);
    expect(page.gotoUrls.filter((url) => url.includes("/search?query=milk"))).toHaveLength(1);
  });

  it("fails with a setup-specific error when Zepto asks for delivery location", async () => {
    const page = createLocationRequiredPage();

    await expect(searchProducts(page as never, "milk", 1)).rejects.toThrow(
      "Zepto needs a delivery location before search results are readable."
    );
  });

  it("includes retry timing when an empty Zepto page looks like access protection", async () => {
    const page = createEmptyPage();

    try {
      await searchProducts(page as never, "milk", 1);
      throw new Error("expected search to fail");
    } catch (error) {
      expect(error).toBeInstanceOf(UserFacingError);
      expect((error as UserFacingError).code).toBe("zepto_access_protection");
      expect((error as UserFacingError).retryAfterMs).toBe(ACCESS_CHALLENGE_COOLDOWN_MS);
    }
  });

  it("detects access challenges after a product add mutation settles", async () => {
    const page = createPostMutationChallengePage();

    await expect(waitForProductAddSettled(page as never, 0)).rejects.toThrow(
      "Zepto is asking for verification or blocking automated access."
    );

    expect(page.waited).toBe(true);
  });

  it("does not click disabled product ADD controls", async () => {
    const page = createDisabledAddButtonPage();

    await expect(
      clickProductAdd(page as never, {
        index: 0,
        automationId: 4,
        name: "Amul Milk"
      })
    ).rejects.toThrow("The ADD button for Amul Milk is disabled.");

    expect(page.clicked).toBe(false);
  });

  it("clicks product ADD controls only when the tagged card still matches the product", async () => {
    const page = createProductAddButtonPage("ADD\nAmul Milk\n500 ml\n₹32");

    await expect(
      clickProductAdd(page as never, {
        index: 0,
        automationId: 4,
        name: "Amul Milk",
        unit: "500 ml"
      })
    ).resolves.toBeUndefined();

    expect(page.clicked).toBe(true);
  });

  it("does not click stale product ADD controls that no longer match the product", async () => {
    const page = createProductAddButtonPage("ADD\nPotato Chips\n52 g\n₹20");

    await expect(
      clickProductAdd(page as never, {
        index: 0,
        automationId: 4,
        name: "Amul Milk",
        unit: "500 ml"
      })
    ).rejects.toThrow("The ADD button no longer matches Amul Milk.");

    expect(page.clicked).toBe(false);
  });

  it("detects access challenges after quantity plus clicks", async () => {
    const page = createQuantityChallengePage();

    await expect(
      increaseProductQuantity(
        page as never,
        {
          index: 0,
          automationId: 1,
          name: "Amul Milk"
        },
        2
      )
    ).rejects.toThrow("Zepto is asking for verification or blocking automated access.");

    expect(page.plusClicked).toBe(true);
  });

  it("does not click disabled quantity plus controls", async () => {
    const page = createDisabledQuantityPage();

    await expect(
      increaseProductQuantity(
        page as never,
        {
          index: 0,
          automationId: 1,
          name: "Amul Milk"
        },
        2
      )
    ).rejects.toThrow("Could not increase Amul Milk to quantity 2.");

    expect(page.plusClicked).toBe(false);
  });

  it("does not click stale quantity plus controls that no longer match the product", async () => {
    const page = createStaleQuantityPage();

    await expect(
      increaseProductQuantity(
        page as never,
        {
          index: 0,
          automationId: 1,
          name: "Amul Milk",
          unit: "500 ml"
        },
        2
      )
    ).rejects.toThrow("The quantity controls no longer match Amul Milk.");

    expect(page.plusClicked).toBe(false);
  });
});

function createPostMutationChallengePage() {
  let challenge = false;
  const page = {
    waited: false,
    waitForTimeout: async () => {
      page.waited = true;
      challenge = true;
    },
    waitForLoadState: async () => undefined,
    title: async () => (challenge ? "Security check" : "Zepto"),
    locator: (selector: string) =>
      selector === "body"
        ? {
            innerText: async () => (challenge ? "Verify you are human before continuing" : "Product added")
          }
        : createHiddenLocator()
  };

  return page;
}

function createQuantityChallengePage() {
  let challenge = false;
  const plusLocator = {
    last() {
      return this;
    },
    isVisible: async () => true,
    getAttribute: async () => null,
    evaluate: async () => false,
    click: async () => {
      page.plusClicked = true;
      challenge = true;
    }
  };
  const cardLocator = {
    locator: () => ({
      filter: () => plusLocator
    })
  };
  const addButtonLocator = {
    first() {
      return this;
    },
    evaluate: async () => "Amul Milk 500 ml ₹32",
    locator: () => cardLocator
  };
  const page = {
    plusClicked: false,
    locator: (selector: string) =>
      selector === "body"
        ? {
            innerText: async () => (challenge ? "Too many requests. Verify you are human." : "Product card")
          }
        : addButtonLocator,
    waitForTimeout: async () => undefined,
    waitForLoadState: async () => undefined,
    title: async () => (challenge ? "Security check" : "Zepto")
  };

  return page;
}

function createDisabledAddButtonPage() {
  const page = {
    clicked: false,
    locator: () =>
      createVisibleLocator("ADD", async () => {
        page.clicked = true;
      }, { "aria-disabled": "true" })
  };

  return page;
}

function createProductAddButtonPage(cardText: string) {
  const page = {
    clicked: false,
    locator: () => createProductAddLocator(cardText, async () => {
      page.clicked = true;
    })
  };

  return page;
}

function createProductAddLocator(cardText: string, click: () => Promise<void>) {
  return {
    first() {
      return this;
    },
    isVisible: async () => true,
    innerText: async () => "ADD",
    getAttribute: async () => null,
    evaluate: async (fn?: unknown) => {
      const source = String(fn ?? "");
      if (source.includes("hasDisabledState") || source.includes("HTMLButtonElement")) {
        return false;
      }

      return cardText;
    },
    scrollIntoViewIfNeeded: async () => undefined,
    click
  };
}

function createDisabledQuantityPage() {
  const plusLocator = {
    last() {
      return this;
    },
    isVisible: async () => true,
    getAttribute: async (name: string) => (name === "aria-disabled" ? "true" : null),
    evaluate: async () => false,
    click: async () => {
      page.plusClicked = true;
    }
  };
  const cardLocator = {
    locator: () => ({
      filter: () => plusLocator
    })
  };
  const addButtonLocator = {
    first() {
      return this;
    },
    evaluate: async () => "Amul Milk ₹32",
    locator: () => cardLocator
  };
  const page = {
    plusClicked: false,
    locator: () => addButtonLocator
  };

  return page;
}

function createStaleQuantityPage() {
  const plusLocator = {
    last() {
      return this;
    },
    isVisible: async () => true,
    getAttribute: async () => null,
    evaluate: async () => false,
    click: async () => {
      page.plusClicked = true;
    }
  };
  const cardLocator = {
    locator: () => ({
      filter: () => plusLocator
    })
  };
  const addButtonLocator = {
    first() {
      return this;
    },
    evaluate: async () => "Potato Chips 52 g ₹20",
    locator: () => cardLocator
  };
  const page = {
    plusClicked: false,
    locator: () => addButtonLocator
  };

  return page;
}

function createDisabledSearchTriggerPage() {
  const page = {
    clicked: false,
    getByRole: (role: string, options: { name?: RegExp | string } = {}) => {
      if (role === "button" && matchesLocatorName(options.name, "Search")) {
        return {
          ...createVisibleLocator("Search", async () => {
            page.clicked = true;
          }, { "aria-disabled": "true" }),
          filter() {
            return createHiddenLocator();
          }
        };
      }

      return createHiddenLocator();
    },
    locator: () => createHiddenLocator()
  };

  return page;
}

function createDisabledInputAfterSearchTriggerPage() {
  const gotoUrls: string[] = [];
  const page = {
    gotoUrls,
    searchClicked: false,
    inputFilled: false,
    inputTyped: false,
    goto: async (url: string | URL) => {
      gotoUrls.push(String(url));
    },
    waitForLoadState: async () => undefined,
    waitForFunction: async () => undefined,
    waitForTimeout: async () => undefined,
    title: async () => "",
    evaluate: async () => [],
    getByRole: (role: string, options: { name?: RegExp | string } = {}) => {
      if (role === "button" && matchesLocatorName(options.name, "Search")) {
        return {
          ...createVisibleLocator("Search", async () => {
            page.searchClicked = true;
          }),
          filter() {
            return createHiddenLocator();
          }
        };
      }

      return createHiddenLocator();
    },
    locator: (selector: string) => {
      if (selector === "body") {
        return {
          ...createHiddenLocator(),
          innerText: async () => "No results"
        };
      }

      if (selector.includes("input[type='search']")) {
        return page.searchClicked ? createDisabledSearchInput(page) : createHiddenLocator();
      }

      return createHiddenLocator();
    }
  };

  return page;
}

function createDisabledSearchInput(page: { inputFilled: boolean; inputTyped: boolean }) {
  return {
    first() {
      return this;
    },
    filter() {
      return createHiddenLocator();
    },
    isVisible: async () => true,
    innerText: async () => "",
    getAttribute: async (name: string) => (name === "aria-disabled" ? "true" : null),
    evaluate: async () => false,
    fill: async () => {
      page.inputFilled = true;
    },
    pressSequentially: async () => {
      page.inputTyped = true;
    },
    press: async () => undefined
  };
}

function createNoResultPage() {
  const gotoUrls: string[] = [];
  const hiddenLocator = {
    first() {
      return this;
    },
    filter() {
      return this;
    },
    isVisible: async () => false,
    innerText: async () => "",
    getAttribute: async () => null
  };

  return {
    gotoUrls,
    goto: async (url: string | URL) => {
      gotoUrls.push(String(url));
    },
    waitForLoadState: async () => undefined,
    waitForFunction: async () => undefined,
    title: async () => "",
    evaluate: async () => [],
    getByRole: () => hiddenLocator,
    locator: (selector: string) =>
      selector === "body"
        ? {
            ...hiddenLocator,
            innerText: async () => "No results"
          }
        : hiddenLocator
  };
}

function createLocationRequiredPage() {
  const page = createNoResultPage();
  return {
    ...page,
    locator: (selector: string) =>
      selector === "body"
        ? {
            first() {
              return this;
            },
            filter() {
              return this;
            },
            isVisible: async () => true,
            innerText: async () => "Select location to see products near you",
            getAttribute: async () => null
          }
        : createHiddenLocator()
  };
}

function createEmptyPage() {
  const page = createNoResultPage();
  return {
    ...page,
    locator: (selector: string) =>
      selector === "body"
        ? {
            first() {
              return this;
            },
            filter() {
              return this;
            },
            isVisible: async () => true,
            innerText: async () => "",
            getAttribute: async () => null
          }
        : createHiddenLocator()
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
    evaluate: async () => false
  };
}

function createVisibleLocator(text: string, click: () => Promise<void>, attributes: Record<string, string | null> = {}) {
  return {
    first() {
      return this;
    },
    isVisible: async () => true,
    innerText: async () => text,
    getAttribute: async (name: string) => attributes[name] ?? null,
    evaluate: async () => false,
    scrollIntoViewIfNeeded: async () => undefined,
    click
  };
}

function matchesLocatorName(name: RegExp | string | undefined, text: string): boolean {
  if (name instanceof RegExp) {
    return name.test(text);
  }

  return name === text;
}
