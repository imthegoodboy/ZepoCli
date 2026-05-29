import { describe, expect, it } from "vitest";

import {
  ADD_ADDRESS_CLICK_LABELS,
  ADDRESS_MANAGER_CLICK_LABELS,
  addressMatchesQuery,
  chooseAddressSelectionCandidate,
  clickAddAddressButton,
  clickAddressManagerButton,
  clickTaggedAddressSelection,
  filterAddressTexts,
  isAddAddressClickText,
  isAddAddressFlowText,
  isAddressManagerClickText,
  isUnsafeAddressAutomationClickText,
  isUserLocationConsentText,
  isLikelyAddressText,
  requireSelectedAddress,
  startAddAddress
} from "../src/automation/address.js";

describe("address automation helpers", () => {
  it("matches addresses by label or visible text", () => {
    const address = {
      label: "Home",
      text: "221B Baker Street, Bengaluru, India"
    };

    expect(addressMatchesQuery(address, "home")).toBe(true);
    expect(addressMatchesQuery(address, "Baker Street")).toBe(true);
    expect(addressMatchesQuery(address, "work")).toBe(false);
  });

  it("returns a selected address matching the requested query", () => {
    const selected = {
      label: "Home",
      text: "Delivering to Home 221B Baker Street, Bengaluru, India",
      selected: true
    };

    expect(requireSelectedAddress([selected], "home")).toBe(selected);
  });

  it("rejects matching addresses that are not selected", () => {
    expect(() =>
      requireSelectedAddress(
        [
          {
            label: "Home",
            text: "221B Baker Street, Bengaluru, India",
            selected: false
          }
        ],
        "home"
      )
    ).toThrow('Zepto did not show a selected address matching "home" after the selection click.');
  });

  it("rejects selected addresses that do not match the requested query", () => {
    expect(() =>
      requireSelectedAddress(
        [
          {
            label: "Work",
            text: "Selected Work address, Bengaluru, India",
            selected: true
          }
        ],
        "home"
      )
    ).toThrow('Zepto did not show a selected address matching "home" after the selection click.');
  });

  it("chooses a unique saved-address candidate by specific visible text", () => {
    expect(
      chooseAddressSelectionCandidate(
        [
          {
            index: 3,
            label: "Home",
            text: "Home 221B Baker Street, Bengaluru, Karnataka 560001 India"
          },
          {
            index: 7,
            label: "Work",
            text: "Work Flat 42, Tower B, MG Road, Bengaluru, Karnataka 560002 India"
          }
        ],
        "MG Road"
      )?.index
    ).toBe(7);
  });

  it("rejects ambiguous saved-address matches instead of picking the first row", () => {
    expect(() =>
      chooseAddressSelectionCandidate(
        [
          {
            index: 3,
            label: "Home",
            text: "Home 221B Baker Street, Bengaluru, Karnataka 560001 India"
          },
          {
            index: 7,
            label: "Home",
            text: "Home Flat 12, Indiranagar, Bengaluru, Karnataka 560038 India"
          }
        ],
        "home"
      )
    ).toThrow('Multiple saved addresses matched "home".');
  });

  it("rejects broad city matches when multiple saved addresses fit", () => {
    expect(() =>
      chooseAddressSelectionCandidate(
        [
          {
            index: 3,
            label: "Home",
            text: "Home 221B Baker Street, Bengaluru, Karnataka 560001 India"
          },
          {
            index: 7,
            label: "Work",
            text: "Work Flat 42, Tower B, MG Road, Bengaluru, Karnataka 560002 India"
          }
        ],
        "Bengaluru"
      )
    ).toThrow('Multiple saved addresses matched "Bengaluru".');
  });

  it("ignores broad saved-address containers during address selection", () => {
    expect(
      chooseAddressSelectionCandidate(
        [
          {
            index: 1,
            text: "Saved Addresses Home 221B Baker Street, Bengaluru, India Work Flat 42, Tower B, MG Road, Bengaluru, India"
          },
          {
            index: 2,
            label: "Home",
            text: "Home 221B Baker Street, Bengaluru, India"
          },
          {
            index: 3,
            label: "Work",
            text: "Work Flat 42, Tower B, MG Road, Bengaluru, India"
          }
        ],
        "MG Road"
      )?.index
    ).toBe(3);
  });

  it("accepts saved address text with location detail", () => {
    expect(isLikelyAddressText("Home 221B Baker Street, Bengaluru, Karnataka 560001 India")).toBe(true);
    expect(isLikelyAddressText("Work Flat 42, Tower B, MG Road, Bengaluru")).toBe(true);
  });

  it("rejects address placeholders without saved address detail", () => {
    expect(isLikelyAddressText("Delivery Address")).toBe(false);
    expect(isLikelyAddressText("Add address")).toBe(false);
    expect(isLikelyAddressText("Select location")).toBe(false);
  });

  it("rejects product, cart, and promo copy as saved addresses", () => {
    expect(isLikelyAddressText("India Gate Basmati Rice 1 kg ₹249 ADD")).toBe(false);
    expect(isLikelyAddressText("Cart Bill Summary Item Total ₹249 To Pay ₹279 Bengaluru")).toBe(false);
    expect(isLikelyAddressText("Popular picks delivered across India 500 g pack")).toBe(false);
  });

  it("rejects label-only navigation or category text as saved addresses", () => {
    expect(isLikelyAddressText("Home Toys Fresh Electronics Beauty Fashion")).toBe(false);
    expect(isLikelyAddressText("Work Orders Wallet Profile Account")).toBe(false);
    expect(isLikelyAddressText("Other saved location")).toBe(false);
  });

  it("filters broad address containers while preserving saved address rows", () => {
    expect(
      filterAddressTexts([
        "Saved Addresses Home 221B Baker Street, Bengaluru, India Work Flat 42, Tower B, Bengaluru, India",
        "Home 221B Baker Street, Bengaluru, India",
        "Work Flat 42, Tower B, Bengaluru, India",
        "Add address",
        "Home 221B Baker Street, Bengaluru, India"
      ])
    ).toEqual(["Home 221B Baker Street, Bengaluru, India", "Work Flat 42, Tower B, Bengaluru, India"]);
  });

  it("filters a saved-address wrapper even when it contains one address label", () => {
    expect(
      filterAddressTexts([
        "Saved Addresses Home 221B Baker Street, Bengaluru, India",
        "Home 221B Baker Street, Bengaluru, India"
      ])
    ).toEqual(["Home 221B Baker Street, Bengaluru, India"]);
  });

  it("does not automate user location-consent controls during address add", () => {
    for (const consentText of [
      "Use current location",
      "Use my current location",
      "Allow browser location",
      "Share my location",
      "Detect location",
      "Detect my location",
      "Locate me",
      "Enter current location"
    ]) {
      expect(isUserLocationConsentText(consentText)).toBe(true);
      expect(ADDRESS_MANAGER_CLICK_LABELS.some((label) => label.test(consentText))).toBe(false);
      expect(ADD_ADDRESS_CLICK_LABELS.some((label) => label.test(consentText))).toBe(false);
      expect(isAddressManagerClickText(consentText)).toBe(false);
      expect(isAddAddressClickText(consentText)).toBe(false);
    }

    expect(isUserLocationConsentText("Enter Delivery Location")).toBe(false);
    expect(isAddAddressClickText("Enter Delivery Location")).toBe(true);
  });

  it("treats final address confirmation labels as unsafe automation clicks", () => {
    for (const unsafeText of [
      "Save Address",
      "Confirm Address",
      "Confirm Location",
      "Save and Continue",
      "Continue",
      "Proceed",
      "Done",
      "Submit",
      "Use this address",
      "Deliver Here",
      "Select this location"
    ]) {
      expect(isUnsafeAddressAutomationClickText(unsafeText)).toBe(true);
      expect(isAddressManagerClickText(unsafeText)).toBe(false);
      expect(isAddAddressClickText(unsafeText)).toBe(false);
    }
  });

  it("clicks only explicit address-manager labels", () => {
    for (const label of ["Delivering to Home", "Select Location", "Delivery Address", "Saved Addresses"]) {
      expect(isAddressManagerClickText(label)).toBe(true);
    }

    for (const label of ["Add Address", "Confirm Address", "Save Address", "Address selected", "Current location"]) {
      expect(isAddressManagerClickText(label)).toBe(false);
    }
  });

  it("does not click disabled address-manager controls", async () => {
    const page = createDisabledAddressManagerPage();

    await expect(clickAddressManagerButton(page as never)).resolves.toBe(false);

    expect(page.managerClicked).toBe(false);
  });

  it("does not click address-manager controls when any label is unsafe", async () => {
    for (const page of [
      createMixedLabelAddressManagerPage("Use current location", "Delivery Address"),
      createMixedLabelAddressManagerPage("Delivery Address", "Use current location"),
      createMixedLabelAddressManagerPage("Confirm Address", "Delivery Address"),
      createMixedLabelAddressManagerPage("Continue", "Delivery Address")
    ]) {
      await expect(clickAddressManagerButton(page as never)).resolves.toBe(false);

      expect(page.managerClicked).toBe(false);
    }
  });

  it("clicks only explicit add-address action labels", () => {
    for (const label of ["Add New", "Add Address", "Add New Address", "Enter Delivery Location"]) {
      expect(isAddAddressClickText(label)).toBe(true);
    }

    for (const label of ["Save Address", "Confirm Address", "Use Current Location", "Address selected"]) {
      expect(isAddAddressClickText(label)).toBe(false);
    }
  });

  it("does not click disabled add-address controls", async () => {
    const page = createDisabledAddAddressPage();

    await expect(clickAddAddressButton(page as never)).resolves.toBe(false);

    expect(page.addAddressClicked).toBe(false);
  });

  it("does not click add-address controls when any label is unsafe", async () => {
    for (const page of [
      createMixedLabelAddAddressPage("Use current location", "Add Address"),
      createMixedLabelAddAddressPage("Add Address", "Use current location"),
      createMixedLabelAddAddressPage("Save Address", "Add Address"),
      createMixedLabelAddAddressPage("Use this address", "Add Address")
    ]) {
      await expect(clickAddAddressButton(page as never)).resolves.toBe(false);

      expect(page.addAddressClicked).toBe(false);
    }
  });

  it("clicks a tagged saved-address row only after it is revalidated", async () => {
    const page = createTaggedAddressSelectionPage();

    await expect(
      clickTaggedAddressSelection(page as never, {
        index: 4,
        label: "Home",
        text: "Home 221B Baker Street, Bengaluru, India"
      })
    ).resolves.toBeUndefined();

    expect(page.clicked).toBe(true);
  });

  it("does not click a stale tagged saved-address row", async () => {
    const page = createTaggedAddressSelectionPage({}, { tagged: false });

    await expect(
      clickTaggedAddressSelection(page as never, {
        index: 4,
        label: "Home",
        text: "Home 221B Baker Street, Bengaluru, India"
      })
    ).rejects.toThrow("Zepto address list changed before the selected address could be clicked.");

    expect(page.clicked).toBe(false);
  });

  it("does not click a hidden tagged saved-address row", async () => {
    const page = createTaggedAddressSelectionPage({}, { visible: false });

    await expect(
      clickTaggedAddressSelection(page as never, {
        index: 4,
        label: "Home",
        text: "Home 221B Baker Street, Bengaluru, India"
      })
    ).rejects.toThrow("Zepto address selection control changed before it could be clicked.");

    expect(page.clicked).toBe(false);
  });

  it("does not click a disabled tagged saved-address row", async () => {
    const page = createTaggedAddressSelectionPage({ "aria-disabled": "true" });

    await expect(
      clickTaggedAddressSelection(page as never, {
        index: 4,
        label: "Home",
        text: "Home 221B Baker Street, Bengaluru, India"
      })
    ).rejects.toThrow("Zepto address selection control is disabled.");

    expect(page.clicked).toBe(false);
  });

  it("detects visible add-address form pages without treating location consent as the form", () => {
    expect(isAddAddressFlowText("Enter complete address House / Flat Floor Receiver Name Save Address")).toBe(true);
    expect(isAddAddressFlowText("Pin your location Add new address Mark as Home")).toBe(true);
    expect(isAddAddressFlowText("Use current location Detect my location Select location")).toBe(false);
    expect(isAddAddressFlowText("Saved Addresses Home 221B Baker Street Bengaluru")).toBe(false);
  });

  it("accepts direct add-address handoff without treating it as manager navigation", async () => {
    const page = createDirectAddressAddFlowPage();

    await expect(startAddAddress(page as never)).resolves.toBeUndefined();

    expect(page.managerClicked).toBe(false);
    expect(page.addAddressClicked).toBe(true);
  });

  it("checks for access challenges after opening the add-address handoff", async () => {
    const page = createAddressAddChallengePage();

    await expect(startAddAddress(page as never)).rejects.toThrow(
      "Zepto is asking for verification or blocking automated access."
    );

    expect(page.addAddressClicked).toBe(true);
    expect(page.waitForLoadStateCalls).toBeGreaterThanOrEqual(2);
  });

  it("rejects add-address handoff when Zepto does not expose the address form after clicking", async () => {
    const page = createAddAddressNoFormPage();

    await expect(startAddAddress(page as never)).rejects.toThrow(
      "Zepto did not expose the add-address flow after clicking add address."
    );

    expect(page.addAddressClicked).toBe(true);
  });
});

function createMixedLabelAddressManagerPage(text: string, ariaLabel: string) {
  const page = {
    managerClicked: false,
    getByRole: (role: string, options: { name?: RegExp | string } = {}) => {
      if (role === "button" && (matchesLocatorName(options.name, text) || matchesLocatorName(options.name, ariaLabel))) {
        return createVisibleLocatorWithAria(text, ariaLabel, async () => {
          page.managerClicked = true;
        });
      }

      return createHiddenLocator();
    },
    locator: () => createHiddenLocator()
  };

  return page;
}

function createMixedLabelAddAddressPage(text: string, ariaLabel: string) {
  const page = {
    addAddressClicked: false,
    getByRole: (role: string, options: { name?: RegExp | string } = {}) => {
      if (role === "button" && (matchesLocatorName(options.name, text) || matchesLocatorName(options.name, ariaLabel))) {
        return createVisibleLocatorWithAria(text, ariaLabel, async () => {
          page.addAddressClicked = true;
        });
      }

      return createHiddenLocator();
    },
    locator: () => createHiddenLocator()
  };

  return page;
}

function createDirectAddressAddFlowPage() {
  let stage: "home" | "add-flow" = "home";
  const page = {
    managerClicked: false,
    addAddressClicked: false,
    goto: async () => {
      stage = "home";
    },
    waitForLoadState: async () => undefined,
    waitForTimeout: async () => undefined,
    title: async () => "Zepto",
    locator: (selector: string) =>
      selector === "body"
        ? {
            innerText: async () =>
              stage === "add-flow" ? "Enter complete address House / Flat Floor Receiver Name" : "Zepto home"
          }
        : createHiddenLocator(),
    getByRole: (_role: string, options: { name?: RegExp | string } = {}) => {
      if (matchesLocatorName(options.name, "Add Address")) {
        return createVisibleLocator("Add Address", async () => {
          page.addAddressClicked = true;
          stage = "add-flow";
        });
      }

      return createHiddenLocator();
    }
  };

  return page;
}

function createAddressAddChallengePage() {
  let stage: "home" | "address-manager" | "challenge" = "home";
  const page = {
    addAddressClicked: false,
    waitForLoadStateCalls: 0,
    goto: async () => {
      stage = "home";
    },
    waitForLoadState: async () => {
      page.waitForLoadStateCalls += 1;
    },
    waitForTimeout: async () => undefined,
    title: async () => (stage === "challenge" ? "Security check" : "Zepto"),
    locator: (selector: string) =>
      selector === "body"
        ? {
            innerText: async () =>
              stage === "challenge" ? "Verify you are human before continuing" : "Zepto address page"
          }
        : createHiddenLocator(),
    getByRole: (_role: string, options: { name?: RegExp | string } = {}) => {
      if (matchesLocatorName(options.name, "Add Address")) {
        return createVisibleLocator("Add Address", async () => {
          page.addAddressClicked = true;
          stage = "challenge";
        });
      }

      return createHiddenLocator();
    }
  };

  return page;
}

function createAddAddressNoFormPage() {
  const page = {
    addAddressClicked: false,
    goto: async () => undefined,
    waitForLoadState: async () => undefined,
    waitForTimeout: async () => undefined,
    title: async () => "Zepto",
    locator: (selector: string) =>
      selector === "body"
        ? {
            innerText: async () => "Zepto address page Saved Addresses"
          }
        : createHiddenLocator(),
    getByRole: (_role: string, options: { name?: RegExp | string } = {}) => {
      if (matchesLocatorName(options.name, "Add Address")) {
        return createVisibleLocator("Add Address", async () => {
          page.addAddressClicked = true;
        });
      }

      return createHiddenLocator();
    }
  };

  return page;
}

function createDisabledAddressManagerPage() {
  const page = {
    managerClicked: false,
    getByRole: (_role: string, options: { name?: RegExp | string } = {}) => {
      if (matchesLocatorName(options.name, "Delivery Address")) {
        return createVisibleLocator(
          "Delivery Address",
          async () => {
            page.managerClicked = true;
          },
          { "aria-disabled": "true" }
        );
      }

      return createHiddenLocator();
    },
    locator: () => createHiddenLocator()
  };

  return page;
}

function createDisabledAddAddressPage() {
  const page = {
    addAddressClicked: false,
    getByRole: (_role: string, options: { name?: RegExp | string } = {}) => {
      if (matchesLocatorName(options.name, "Add Address")) {
        return createVisibleLocator(
          "Add Address",
          async () => {
            page.addAddressClicked = true;
          },
          { "data-disabled": "true" }
        );
      }

      return createHiddenLocator();
    },
    locator: () => createHiddenLocator()
  };

  return page;
}

function createTaggedAddressSelectionPage(
  attributes: Record<string, string | null> = {},
  options: { tagged?: boolean; visible?: boolean } = {}
) {
  const page = {
    clicked: false,
    evaluate: async () => options.tagged ?? true,
    locator: () =>
      createVisibleLocator(
        "Home 221B Baker Street, Bengaluru, India",
        async () => {
          page.clicked = true;
        },
        attributes,
        options.visible ?? true
      )
  };

  return page;
}

function createVisibleLocatorWithAria(text: string, ariaLabel: string, click: () => Promise<void>) {
  return {
    first() {
      return this;
    },
    filter() {
      return createHiddenLocator();
    },
    isVisible: async () => true,
    innerText: async () => text,
    getAttribute: async (name: string) => (name === "aria-label" ? ariaLabel : null),
    evaluate: async () => false,
    click
  };
}

function createVisibleLocator(
  text: string,
  click: () => Promise<void>,
  attributes: Record<string, string | null> = {},
  visible = true
) {
  return {
    first() {
      return this;
    },
    filter() {
      return createHiddenLocator();
    },
    isVisible: async () => visible,
    innerText: async () => text,
    getAttribute: async (name: string) => attributes[name] ?? null,
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
