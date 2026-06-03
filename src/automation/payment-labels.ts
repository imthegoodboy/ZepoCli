export const PAYMENT_METHOD_LABEL_PATTERN_SOURCE =
  "\\b(payment methods?|payment options?|payment mode|select payment|choose payment|upi|cards?|credit\\s*(?:/|&|and)?\\s*debit|debit\\s*(?:/|&|and)?\\s*credit|credit card|debit card|saved cards?|card offers?|card ending|ending in|wallet|net\\s*banking|netbanking|cash on delivery|cod|pay on delivery|pay\\s*later|lazy\\s*pay|lazypay|simpl|emi|rupay|visa|mastercard|maestro|amex|american\\s+express|diners\\s+club|phonepe|google pay|gpay|paytm|bhim|cred\\s+pay|amazon\\s+pay|mobikwik|freecharge|sodexo|meal cards?)\\b";
export const PAYMENT_HANDOFF_SURFACE_PATTERN_SOURCE =
  "\\b(payment methods?|payment options?|payment mode|select payment|choose payment)\\b";
export const PAYMENT_SELECTION_PROMPT_PATTERN_SOURCE =
  "\\b(payment options?|payment mode|select payment|choose payment)\\b";
export const PAYMENT_UI_SURFACE_PATTERN_SOURCE =
  "\\b(payment methods?|payment options?|payment mode|select payment|choose payment|pay with|make payment|cash on delivery|cod|card offers?|saved cards?|card ending|ending in|upi (?:cashback|offers?|payment)|wallet (?:cashback|offers?))\\b|^(?:upi|cards?|credit\\s*(?:/|&|and)?\\s*debit|debit\\s*(?:/|&|and)?\\s*credit|credit card|debit card|wallet|net\\s*banking|netbanking|pay on delivery|pay\\s*later|lazy\\s*pay|lazypay|simpl|emi|rupay|visa|mastercard|maestro|amex|american\\s+express|diners\\s+club|phonepe|google pay|gpay|paytm|bhim|cred\\s+pay|amazon\\s+pay|mobikwik|freecharge|sodexo|meal cards?)$";

export const PAYMENT_METHOD_LABEL_PATTERN = new RegExp(PAYMENT_METHOD_LABEL_PATTERN_SOURCE, "i");
export const PAYMENT_HANDOFF_SURFACE_PATTERN = new RegExp(PAYMENT_HANDOFF_SURFACE_PATTERN_SOURCE, "i");
export const PAYMENT_SELECTION_PROMPT_PATTERN = new RegExp(PAYMENT_SELECTION_PROMPT_PATTERN_SOURCE, "i");
export const PAYMENT_UI_SURFACE_PATTERN = new RegExp(PAYMENT_UI_SURFACE_PATTERN_SOURCE, "i");

export function isPaymentMethodLabelText(text: string): boolean {
  const normalized = text.replace(/\s+/g, " ").trim();
  return normalized.length > 0 && PAYMENT_METHOD_LABEL_PATTERN.test(normalized);
}

export function isPaymentHandoffSurfaceText(text: string): boolean {
  const normalized = text.replace(/\s+/g, " ").trim();
  return normalized.length > 0 && PAYMENT_HANDOFF_SURFACE_PATTERN.test(normalized);
}

export function isPaymentSelectionPromptText(text: string): boolean {
  const normalized = text.replace(/\s+/g, " ").trim();
  return normalized.length > 0 && PAYMENT_SELECTION_PROMPT_PATTERN.test(normalized);
}

export function isPaymentUiSurfaceText(text: string): boolean {
  const normalized = text.replace(/\s+/g, " ").trim();
  return normalized.length > 0 && PAYMENT_UI_SURFACE_PATTERN.test(normalized);
}
