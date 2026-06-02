export const FINAL_PAYMENT_OR_ORDER_ACTION_PATTERN_SOURCE =
  "\\b(place\\s+order|confirm\\s+order|pay\\s+now|make\\s+payment|complete\\s+payment|confirm\\s+payment|pay\\s+securely|pay\\s+(?:with|using|via|by)|order\\s+now|review\\s+order|checkout\\s*(?:&|and)\\s*pay)\\b|\\bpay\\s*(?:₹\\s*\\d|rs\\.?\\s*\\d|inr\\s*\\d|\\d)";
export const FINAL_CHECKOUT_SURFACE_PATTERN_SOURCE =
  "\\b(place\\s+order|confirm\\s+order|pay\\s+now|make\\s+payment|complete\\s+payment|confirm\\s+payment)\\b";

export const FINAL_PAYMENT_OR_ORDER_ACTION_PATTERN = new RegExp(
  FINAL_PAYMENT_OR_ORDER_ACTION_PATTERN_SOURCE,
  "i"
);
export const FINAL_CHECKOUT_SURFACE_PATTERN = new RegExp(FINAL_CHECKOUT_SURFACE_PATTERN_SOURCE, "i");

export function isFinalPaymentOrOrderActionText(text: string): boolean {
  const normalized = text.replace(/\s+/g, " ").trim();
  return normalized.length > 0 && FINAL_PAYMENT_OR_ORDER_ACTION_PATTERN.test(normalized);
}

export function isFinalCheckoutSurfaceText(text: string): boolean {
  const normalized = text.replace(/\s+/g, " ").trim();
  return normalized.length > 0 && FINAL_CHECKOUT_SURFACE_PATTERN.test(normalized);
}
