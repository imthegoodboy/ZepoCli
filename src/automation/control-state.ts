import type { Locator } from "playwright";

export async function readControlLabels(locator: Locator): Promise<string[]> {
  const [text, ariaLabel, title, placeholder, ariaDescription, referencedLabels] = await Promise.all([
    locator.innerText().catch(() => ""),
    locator.getAttribute("aria-label").catch(() => ""),
    locator.getAttribute("title").catch(() => ""),
    locator.getAttribute("placeholder").catch(() => ""),
    locator.getAttribute("aria-description").catch(() => ""),
    readReferencedControlLabels(locator)
  ]);

  return [text, ariaLabel ?? "", title ?? "", placeholder ?? "", ariaDescription ?? "", ...referencedLabels].filter(
    (label) => label.replace(/\s+/g, " ").trim().length > 0
  );
}

async function readReferencedControlLabels(locator: Locator): Promise<string[]> {
  const evaluatable = locator as {
    evaluate?: (callback: (element: Element) => string[]) => Promise<unknown>;
  };
  if (typeof evaluatable.evaluate !== "function") {
    return [];
  }

  const labels = await evaluatable
    .evaluate((element) => {
      const normalize = (value: string) => value.replace(/\s+/g, " ").trim();
      const ids = `${element.getAttribute("aria-labelledby") ?? ""} ${
        element.getAttribute("aria-describedby") ?? ""
      }`
        .split(/\s+/)
        .map((id) => id.trim())
        .filter(Boolean);

      return ids
        .map((id) => element.ownerDocument.getElementById(id)?.textContent ?? "")
        .map(normalize)
        .filter(Boolean);
    })
    .catch(() => []);

  return Array.isArray(labels) ? labels.filter((label): label is string => typeof label === "string") : [];
}

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

export async function isEditableTextInput(locator: Locator): Promise<boolean> {
  if (await isDisabledControl(locator)) {
    return false;
  }

  const readOnly = await locator.getAttribute("readonly").catch(() => null);
  const ariaReadOnly = await locator.getAttribute("aria-readonly").catch(() => null);
  if (readOnly !== null || isTrueAttribute(ariaReadOnly)) {
    return false;
  }

  return locator
    .evaluate((element) => {
      if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) {
        return !element.disabled && !element.readOnly;
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
