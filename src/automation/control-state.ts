import type { Locator } from "playwright";

export async function isDisabledControl(locator: Locator): Promise<boolean> {
  const disabled = await locator.getAttribute("disabled").catch(() => null);
  const ariaDisabled = await locator.getAttribute("aria-disabled").catch(() => null);
  const dataDisabled = await locator.getAttribute("data-disabled").catch(() => null);
  if (disabled !== null || isTrueAttribute(ariaDisabled) || isDisabledDataAttribute(dataDisabled)) {
    return true;
  }

  return locator
    .evaluate((element) => {
      const hasDisabledState = (target: Element) => {
        const ariaDisabledValue = target.getAttribute("aria-disabled");
        const dataDisabledValue = target.getAttribute("data-disabled");
        return (
          target.hasAttribute("disabled") ||
          ariaDisabledValue?.toLowerCase() === "true" ||
          (dataDisabledValue !== null && dataDisabledValue.toLowerCase() !== "false")
        );
      };

      if (
        element instanceof HTMLButtonElement ||
        element instanceof HTMLInputElement ||
        element instanceof HTMLSelectElement ||
        element instanceof HTMLTextAreaElement ||
        element instanceof HTMLOptGroupElement ||
        element instanceof HTMLOptionElement
      ) {
        if (element.disabled) {
          return true;
        }
      }

      for (let current = element.parentElement; current; current = current.parentElement) {
        if (hasDisabledState(current)) {
          return true;
        }
      }

      return false;
    })
    .catch(() => false);
}

function isTrueAttribute(value: string | null): boolean {
  return value?.toLowerCase() === "true";
}

function isDisabledDataAttribute(value: string | null): boolean {
  return value !== null && value.toLowerCase() !== "false";
}
