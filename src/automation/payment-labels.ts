export const PAYMENT_METHOD_LABEL_PATTERN_SOURCE =
  "\\b(payment methods?|payment options?|payment mode|select payment|choose payment|upi|cards?|credit\\s*(?:/|and)?\\s*debit|debit\\s*(?:/|and)?\\s*credit|credit card|debit card|wallet|net\\s*banking|netbanking|cash on delivery|cod|pay on delivery|phonepe|google pay|gpay|paytm|bhim)\\b";

export const PAYMENT_METHOD_LABEL_PATTERN = new RegExp(PAYMENT_METHOD_LABEL_PATTERN_SOURCE, "i");

export function isPaymentMethodLabelText(text: string): boolean {
  const normalized = text.replace(/\s+/g, " ").trim();
  return normalized.length > 0 && PAYMENT_METHOD_LABEL_PATTERN.test(normalized);
}
