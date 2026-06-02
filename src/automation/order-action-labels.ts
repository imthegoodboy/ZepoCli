export const ORDER_ACTION_LABEL_PATTERN_SOURCE =
  "\\b(customer support|help(?:\\s+(?:centre|center|desk))?|support(?:\\s+(?:centre|center|ticket|desk))?|contact support|invoice|receipt|refund(?:ed)?|return|cancel(?: order)?|rate(?: order| your order)?|rating|review order)\\b";

const ORDER_ACTION_LABEL_PATTERN = new RegExp(ORDER_ACTION_LABEL_PATTERN_SOURCE, "i");

export function isOrderActionLabelText(text: string): boolean {
  const normalized = text.replace(/\s+/g, " ").trim();
  return normalized.length > 0 && ORDER_ACTION_LABEL_PATTERN.test(normalized);
}
