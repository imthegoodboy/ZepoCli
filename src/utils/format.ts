const PRICE_PATTERN = /₹\s?[\d,]+(?:\.\d+)?|\b(?:rs\.?|inr)\s?[\d,]+(?:\.\d+)?/gi;

export function normalizeText(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

export function splitVisibleLines(value: string): string[] {
  return value
    .split(/\r?\n| {2,}/)
    .map((line) => normalizeText(line))
    .filter(Boolean);
}

export function extractPrices(value: string): string[] {
  return Array.from(value.matchAll(PRICE_PATTERN), (match) => normalizePrice(match[0]));
}

export function looksLikePrice(value: string): boolean {
  return extractPrices(value).length > 0;
}

export function looksLikeUnit(value: string): boolean {
  return /\b\d+(?:\.\d+)?\s?(?:ml|l|ltr|litre|litres|liter|liters|g|gm|gms|gram|grams|kg|kgs|pc|pcs|piece|pieces|pack|packs|packet|packets|bottle|bottles|box|boxes|can|cans|jar|jars|pouch|pouches|sachet|sachets|dozen|tablet|tablets|tabs|capsule|capsules)\b/i.test(value);
}

export function looksLikeRating(value: string): boolean {
  return /^\d(?:\.\d)?\s?\([\d,.]+[km]?\)$/i.test(value) || /^\d(?:\.\d)?$/.test(value);
}

export function stripImagePrefix(value: string): string {
  return normalizeText(value.replace(/^image:\s*/i, ""));
}

function normalizePrice(value: string): string {
  const compact = value.replace(/\s+/g, "");
  if (compact.startsWith("₹")) {
    return compact;
  }

  return `₹${compact.replace(/^(?:rs\.?|inr)/i, "")}`;
}
