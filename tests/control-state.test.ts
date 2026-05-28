import { afterEach, describe, expect, it, vi } from "vitest";

import { isDisabledControl } from "../src/automation/control-state.js";

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
});

function createLocator(attributes: Record<string, string | null>, domState: boolean | TestElement = false) {
  return {
    getAttribute: async (name: string) => attributes[name] ?? null,
    evaluate: async (callback: (element: TestElement) => boolean) =>
      typeof domState === "boolean" ? domState : callback(domState)
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
