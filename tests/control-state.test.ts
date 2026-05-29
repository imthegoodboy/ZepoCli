import { afterEach, describe, expect, it, vi } from "vitest";

import { isDisabledControl, isEditableTextInput, readControlLabels } from "../src/automation/control-state.js";

describe("automation control state", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("treats disabled, aria-disabled, and data-disabled attributes as disabled controls", async () => {
    await expect(isDisabledControl(createLocator({ disabled: "" }) as never)).resolves.toBe(true);
    await expect(isDisabledControl(createLocator({ "aria-disabled": "TRUE" }) as never)).resolves.toBe(true);
    await expect(isDisabledControl(createLocator({ "data-disabled": "" }) as never)).resolves.toBe(true);
    await expect(isDisabledControl(createLocator({ "data-disabled": "true" }) as never)).resolves.toBe(true);
  });

  it("does not treat data-disabled=false as disabled unless the DOM state is disabled", async () => {
    await expect(isDisabledControl(createLocator({ "data-disabled": "false" }) as never)).resolves.toBe(false);
    await expect(isDisabledControl(createLocator({ "data-disabled": "false" }, true) as never)).resolves.toBe(true);
  });

  it("treats disabled ancestor DOM state as disabled", async () => {
    installDomConstructors();
    const parent = createElement({ "data-disabled": "" });
    const child = createElement({}, parent);

    await expect(isDisabledControl(createLocator({}, child) as never)).resolves.toBe(true);
  });

  it("treats enabled text inputs as editable", async () => {
    await expect(isEditableTextInput(createTextInputLocator() as never)).resolves.toBe(true);
  });

  it("treats readonly text inputs as not editable", async () => {
    await expect(isEditableTextInput(createTextInputLocator({ readonly: "" }) as never)).resolves.toBe(false);
    await expect(isEditableTextInput(createTextInputLocator({ "aria-readonly": "TRUE" }) as never)).resolves.toBe(false);
  });

  it("treats non-text controls as not editable", async () => {
    await expect(isEditableTextInput(createTextInputLocator({}, false) as never)).resolves.toBe(false);
  });

  it("reads visible, aria, title, and placeholder labels for safety checks", async () => {
    await expect(
      readControlLabels(
        createLabelLocator(" Checkout ", {
          "aria-label": "Proceed to Pay",
          title: "Payment Method",
          placeholder: "Search products"
        }) as never
      )
    ).resolves.toEqual([" Checkout ", "Proceed to Pay", "Payment Method", "Search products"]);
  });

  it("reads aria description and referenced labels for click safety checks", async () => {
    await expect(
      readControlLabels(
        createReferencedLabelLocator("Checkout", {
          "aria-description": "Checkout handoff",
          "aria-labelledby": "safe-label",
          "aria-describedby": "unsafe-label"
        })
      )
    ).resolves.toEqual(["Checkout", "Checkout handoff", "Proceed to Checkout", "Pay Now"]);
  });
});

function createLocator(attributes: Record<string, string | null>, domState: boolean | TestElement = false) {
  return {
    getAttribute: async (name: string) => attributes[name] ?? null,
    evaluate: async (callback: (element: TestElement) => boolean) =>
      typeof domState === "boolean" ? domState : callback(domState)
  };
}

function createTextInputLocator(attributes: Record<string, string | null> = {}, editableDomState = true) {
  let evaluateCalls = 0;
  return {
    getAttribute: async (name: string) => attributes[name] ?? null,
    evaluate: async () => {
      evaluateCalls += 1;
      return evaluateCalls === 1 ? false : editableDomState;
    }
  };
}

function createLabelLocator(text: string, attributes: Record<string, string | null> = {}) {
  return {
    innerText: async () => text,
    getAttribute: async (name: string) => attributes[name] ?? null
  };
}

function createReferencedLabelLocator(text: string, attributes: Record<string, string | null> = {}) {
  const labels: Record<string, string> = {
    "safe-label": "Proceed to Checkout",
    "unsafe-label": "Pay Now"
  };
  const element = {
    getAttribute: (name: string) => attributes[name] ?? null,
    ownerDocument: {
      getElementById: (id: string) => ({
        textContent: labels[id] ?? ""
      })
    }
  };

  return {
    innerText: async () => text,
    getAttribute: async (name: string) => attributes[name] ?? null,
    evaluate: async (callback: (target: Element) => string[]) => callback(element as unknown as Element)
  };
}

interface TestElement {
  parentElement: TestElement | null;
  hasAttribute(name: string): boolean;
  getAttribute(name: string): string | null;
}

function createElement(attributes: Record<string, string | null>, parentElement: TestElement | null = null): TestElement {
  return {
    parentElement,
    hasAttribute: (name) => attributes[name] !== undefined,
    getAttribute: (name) => attributes[name] ?? null
  };
}

function installDomConstructors(): void {
  class TestHtmlElement {}

  vi.stubGlobal("HTMLButtonElement", TestHtmlElement);
  vi.stubGlobal("HTMLInputElement", TestHtmlElement);
  vi.stubGlobal("HTMLSelectElement", TestHtmlElement);
  vi.stubGlobal("HTMLTextAreaElement", TestHtmlElement);
  vi.stubGlobal("HTMLOptGroupElement", TestHtmlElement);
  vi.stubGlobal("HTMLOptionElement", TestHtmlElement);
}
