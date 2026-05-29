import { afterEach, describe, expect, it, vi } from "vitest";

import {
  clickSearchTrigger,
  clickProductAdd,
  extractProducts,
  findSearchInput,
  filterProductsForQuery,
  increaseProductQuantity,
  isProductAddControlText,
  isQuantityIncreaseControlText,
  isLocationSetupRequiredText,
  isSearchInputText,
  isSearchTriggerClickText,
  isUnsafeProductAddControlText,
  isUnsafeSearchInputText,
  isUnsafeSearchTriggerClickText,
  searchProducts,
  SEARCH_TRIGGER_CLICK_LABELS,
  waitForProductAddSettled
} from "../src/automation/search.js";
import { ACCESS_CHALLENGE_COOLDOWN_MS } from "../src/automation/browser.js";
import { UserFacingError } from "../src/utils/errors.js";

describe("search automation helpers", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

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

    for (const label of [
      "Search milk Cart Account",
      "Popular Searches",
      "Research products",
      "Search results for milk",
      "Go",
      "Submit",
      "Next",
      "Continue"
    ]) {
      expect(SEARCH_TRIGGER_CLICK_LABELS.some((pattern) => pattern.test(label))).toBe(false);
      expect(isSearchTriggerClickText(label)).toBe(false);
      expect(isUnsafeSearchTriggerClickText(label)).toBe(label !== "Research products");
    }
  });

  it("recognizes safe search input labels and rejects unrelated workflow labels", () => {
    for (const label of ["Search", "Search Products", "Search for products", "Search groceries"]) {
      expect(isSearchInputText(label)).toBe(true);
      expect(isUnsafeSearchInputText(label)).toBe(false);
    }

    for (const label of ["Search results", "Search address", "Search phone", "Search coupon", "Popular searches"]) {
      expect(isSearchInputText(label)).toBe(false);
      expect(isUnsafeSearchInputText(label)).toBe(true);
    }
  });

  it("finds editable search inputs from title or referenced accessible labels", async () => {
    const titledPage = createSearchInputDiscoveryPage([
      createSearchInputCandidate({
        title: "Search products"
      })
    ]);
    const referencedPage = createSearchInputDiscoveryPage([
      createSearchInputCandidate({
        "aria-labelledby": "search-label"
      }, {
        "search-label": "Search groceries"
      })
    ]);

    await expect(findSearchInput(titledPage as never)).resolves.toBe(titledPage.inputs[0]);
    await expect(findSearchInput(referencedPage as never)).resolves.toBe(referencedPage.inputs[0]);
  });

  it("does not find unsafe or readonly search inputs", async () => {
    const unsafePage = createSearchInputDiscoveryPage([
      createSearchInputCandidate({
        placeholder: "Search address"
      }),
      createSearchInputCandidate({
        type: "search",
        title: "Search phone"
      })
    ]);
    const readonlyPage = createSearchInputDiscoveryPage([
      createSearchInputCandidate({
        placeholder: "Search products",
        readonly: ""
      })
    ]);

    await expect(findSearchInput(unsafePage as never)).resolves.toBeUndefined();
    await expect(findSearchInput(readonlyPage as never)).resolves.toBeUndefined();
  });

  it("recognizes only explicit product add control labels", () => {
    for (const label of ["ADD", "Add", "Add to Cart", " add to cart "]) {
      expect(isProductAddControlText(label)).toBe(true);
      expect(isUnsafeProductAddControlText(label)).toBe(false);
    }

    for (const label of ["Add Address", "Add more", "Add coupon", "Add one", "Added", "Out of stock", ""]) {
      expect(isProductAddControlText(label)).toBe(false);
      expect(isUnsafeProductAddControlText(label)).toBe(label !== "");
    }
  });

  it("extracts product ADD controls from referenced accessible labels", async () => {
    const page = createProductExtractionPage({
      buttonText: "",
      buttonAttributes: {
        "aria-labelledby": "add-label",
        "aria-description": "Product add action"
      },
      referencedLabels: {
        "add-label": "Add to Cart"
      }
    });

    await expect(extractProducts(page as never, 5)).resolves.toMatchObject([
      {
        automationId: 0,
        name: "Amul Milk",
        price: "₹32",
        unit: "500 ml"
      }
    ]);

    expect(page.button.getAttribute("data-zepo-add-id")).toBe("0");
  });

  it("does not map mixed-label product controls that expose unsafe add state", async () => {
    const page = createProductExtractionPage({
      buttonText: "Added",
      buttonAttributes: {
        "aria-labelledby": "add-label"
      },
      referencedLabels: {
        "add-label": "Add to Cart"
      }
    });

    await expect(extractProducts(page as never, 5)).resolves.toEqual([]);
  });

  it("recognizes explicit quantity increase controls without accepting broad add labels", () => {
    for (const label of ["+", "Increase quantity", "Increment qty", "Add one", "Qty +"]) {
      expect(isQuantityIncreaseControlText(label)).toBe(true);
    }

    for (const label of ["Add", "Add to Cart", "Add more", "Continue", ""]) {
      expect(isQuantityIncreaseControlText(label)).toBe(false);
    }
  });

  it("does not click disabled search trigger controls", async () => {
    const page = createDisabledSearchTriggerPage();

    await expect(clickSearchTrigger(page as never)).resolves.toBe(false);

    expect(page.clicked).toBe(false);
  });

  it("does not click search controls when any visible or accessible label is unsafe", async () => {
    for (const page of [
      createMixedLabelSearchTriggerPage("Cart", "Search"),
      createMixedLabelSearchTriggerPage("Go", "Search"),
      createMixedLabelSearchTriggerPage("Search", "Search", { title: "Cart" }),
      createMixedLabelSearchTriggerPage("Search", "Search results for milk")
    ]) {
      await expect(clickSearchTrigger(page as never)).resolves.toBe(false);

      expect(page.clicked).toBe(false);
    }
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

  it("does not type into a readonly search input after opening search", async () => {
    const page = createReadonlyInputAfterSearchTriggerPage();

    await expect(searchProducts(page as never, "milk", 1)).resolves.toEqual([]);

    expect(page.searchClicked).toBe(true);
    expect(page.inputFilled).toBe(false);
    expect(page.inputTyped).toBe(false);
    expect(page.gotoUrls.filter((url) => url.includes("/search?query=milk"))).toHaveLength(1);
  });

  it("does not type into a readonly direct search input", async () => {
    const page = createReadonlyDirectSearchInputPage();

    await expect(searchProducts(page as never, "milk", 1)).resolves.toEqual([]);

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

  it("does not click tagged product controls that no longer expose an ADD label", async () => {
    const page = createProductAddButtonPage("Added\nAmul Milk\n500 ml\n₹32", "Added");

    await expect(
      clickProductAdd(page as never, {
        index: 0,
        automationId: 4,
        name: "Amul Milk",
        unit: "500 ml"
      })
    ).rejects.toThrow("The ADD button no longer appears available for Amul Milk.");

    expect(page.clicked).toBe(false);
  });

  it("does not click tagged product controls when any label shows unsafe add state", async () => {
    const page = createProductAddButtonPage("Added\nAmul Milk\n500 ml\n₹32", "Added", {
      "aria-label": "Add to Cart"
    });

    await expect(
      clickProductAdd(page as never, {
        index: 0,
        automationId: 4,
        name: "Amul Milk",
        unit: "500 ml"
      })
    ).rejects.toThrow("The ADD button no longer appears available for Amul Milk.");

    expect(page.clicked).toBe(false);
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

  it("clicks accessible quantity increase controls without visible plus text", async () => {
    const page = createAccessibleQuantityPage();

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
    ).resolves.toBeUndefined();

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
    innerText: async () => "+",
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

function createAccessibleQuantityPage() {
  const hiddenTextPlus = {
    last() {
      return this;
    },
    isVisible: async () => false,
    innerText: async () => "",
    getAttribute: async () => null,
    evaluate: async () => false
  };
  const accessiblePlus = {
    isVisible: async () => true,
    innerText: async () => "",
    getAttribute: async (name: string) => (name === "aria-label" ? "Increase quantity" : null),
    evaluate: async () => false,
    click: async () => {
      page.plusClicked = true;
    }
  };
  const controls = {
    filter: () => hiddenTextPlus,
    count: async () => 1,
    nth: () => accessiblePlus
  };
  const cardLocator = {
    locator: () => controls
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
            innerText: async () => "Product added"
          }
        : addButtonLocator,
    waitForTimeout: async () => undefined,
    waitForLoadState: async () => undefined,
    title: async () => "Zepto"
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

function createProductAddButtonPage(
  cardText: string,
  buttonText = "ADD",
  attributes: Record<string, string | null> = {}
) {
  const page = {
    clicked: false,
    locator: () => createProductAddLocator(cardText, buttonText, attributes, async () => {
      page.clicked = true;
    })
  };

  return page;
}

function createProductAddLocator(
  cardText: string,
  buttonText: string,
  attributes: Record<string, string | null>,
  click: () => Promise<void>
) {
  return {
    first() {
      return this;
    },
    isVisible: async () => true,
    innerText: async () => buttonText,
    getAttribute: async (name: string) => attributes[name] ?? null,
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

function createSearchInputDiscoveryPage(inputs: ReturnType<typeof createSearchInputCandidate>[]) {
  return {
    inputs,
    locator: (selector: string) => {
      const directSearchInputs = inputs.filter((input) => input.direct);
      if (selector.includes("placeholder*='Search'")) {
        return createLocatorCollection(directSearchInputs);
      }

      if (selector.includes("input:not([type])")) {
        return createLocatorCollection(inputs);
      }

      return createLocatorCollection([]);
    }
  };
}

function createLocatorCollection<T>(items: T[]) {
  return {
    count: async () => items.length,
    nth: (index: number) => items[index]
  };
}

function createSearchInputCandidate(
  attributes: Record<string, string | null>,
  referencedLabels: Record<string, string> = {}
) {
  const direct =
    attributes.type === "search" ||
    /search/i.test(attributes.placeholder ?? "") ||
    /search/i.test(attributes["aria-label"] ?? "");

  return {
    direct,
    isVisible: async () => true,
    innerText: async () => "",
    getAttribute: async (name: string) => attributes[name] ?? null,
    evaluate: async (fn?: unknown) => {
      const source = String(fn ?? "");
      if (source.includes("aria-labelledby") || source.includes("aria-describedby")) {
        return `${attributes["aria-labelledby"] ?? ""} ${attributes["aria-describedby"] ?? ""}`
          .split(/\s+/)
          .map((id) => id.trim())
          .filter(Boolean)
          .map((id) => referencedLabels[id] ?? "")
          .filter(Boolean);
      }

      if (source.includes("hasDisabledState") || source.includes("HTMLButtonElement")) {
        return false;
      }

      if (source.includes("HTMLInputElement")) {
        return attributes.readonly === undefined && attributes["aria-readonly"]?.toLowerCase() !== "true";
      }

      return false;
    },
    fill: async () => undefined,
    pressSequentially: async () => undefined,
    press: async () => undefined
  };
}

function createProductExtractionPage(options: {
  buttonText: string;
  buttonAttributes?: Record<string, string>;
  referencedLabels?: Record<string, string>;
}) {
  const labels = Object.fromEntries(
    Object.entries(options.referencedLabels ?? {}).map(([id, text]) => [id, new FakeElement(text)])
  );
  const document = {
    buttons: [] as FakeElement[],
    querySelectorAll: (selector: string) => (selector === "button, [role='button']" ? document.buttons : []),
    getElementById: (id: string) => labels[id] ?? null
  };
  const card = new FakeElement("Amul Milk\n500 ml\n₹32", {}, document);
  const button = new FakeElement(options.buttonText, options.buttonAttributes ?? {}, document);
  card.appendChild(button);
  document.buttons = [button];

  return {
    button,
    evaluate: async (callback: (input: unknown) => unknown, input: unknown) => {
      installFakeDomGlobals(document);
      return callback(input);
    }
  };
}

class FakeElement {
  parentElement: FakeElement | null = null;
  readonly children: FakeElement[] = [];
  disabled = false;

  constructor(
    public textContent: string,
    private readonly attributes: Record<string, string> = {},
    public readonly ownerDocument: { getElementById(id: string): FakeElement | null } = {
      getElementById: () => null
    }
  ) {}

  get innerText(): string {
    return this.textContent;
  }

  appendChild(child: FakeElement): void {
    child.parentElement = this;
    this.children.push(child);
  }

  getAttribute(name: string): string | null {
    return this.attributes[name] ?? null;
  }

  setAttribute(name: string, value: string): void {
    this.attributes[name] = value;
  }

  hasAttribute(name: string): boolean {
    return this.attributes[name] !== undefined;
  }

  getBoundingClientRect(): { width: number; height: number } {
    return {
      width: 24,
      height: 24
    };
  }

  querySelector(selector: string): FakeElement | null {
    return this.querySelectorAll(selector)[0] ?? null;
  }

  querySelectorAll(selector: string): FakeElement[] {
    if (selector !== "img[alt]") {
      return [];
    }

    return this.children.filter((child) => child.getAttribute("alt") !== null);
  }

  closest(): FakeElement | null {
    return null;
  }
}

function installFakeDomGlobals(document: { querySelectorAll(selector: string): FakeElement[] }): void {
  vi.stubGlobal("document", document);
  vi.stubGlobal("window", {
    getComputedStyle: () => ({
      display: "block",
      visibility: "visible"
    })
  });
  vi.stubGlobal("HTMLElement", FakeElement);
  vi.stubGlobal("HTMLButtonElement", FakeElement);
  vi.stubGlobal("HTMLInputElement", FakeElement);
  vi.stubGlobal("HTMLSelectElement", FakeElement);
  vi.stubGlobal("HTMLTextAreaElement", FakeElement);
  vi.stubGlobal("HTMLAnchorElement", FakeElement);
}

function createDisabledQuantityPage() {
  const plusLocator = {
    last() {
      return this;
    },
    isVisible: async () => true,
    innerText: async () => "+",
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
    innerText: async () => "+",
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

function createMixedLabelSearchTriggerPage(
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
        return {
          ...createVisibleLocator(text, async () => {
            page.clicked = true;
          }, { "aria-label": ariaLabel, ...attributes }),
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
  return createInputAfterSearchTriggerPage({ "aria-disabled": "true" });
}

function createReadonlyInputAfterSearchTriggerPage() {
  return createInputAfterSearchTriggerPage({ readonly: "" });
}

function createInputAfterSearchTriggerPage(attributes: Record<string, string | null>) {
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
        return page.searchClicked ? createSearchInput(page, attributes) : createHiddenLocator();
      }

      return createHiddenLocator();
    }
  };

  return page;
}

function createReadonlyDirectSearchInputPage() {
  const gotoUrls: string[] = [];
  const page = {
    gotoUrls,
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
    getByRole: () => createHiddenLocator(),
    locator: (selector: string) => {
      if (selector === "body") {
        return {
          ...createHiddenLocator(),
          innerText: async () => "No results"
        };
      }

      if (selector.includes("input[type='search']")) {
        return createSearchInput(page, { readonly: "" });
      }

      return createHiddenLocator();
    }
  };

  return page;
}

function createSearchInput(
  page: { inputFilled: boolean; inputTyped: boolean },
  attributes: Record<string, string | null>
) {
  return {
    first() {
      return this;
    },
    filter() {
      return createHiddenLocator();
    },
    isVisible: async () => true,
    innerText: async () => "",
    getAttribute: async (name: string) => attributes[name] ?? null,
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
