const PRICE_PATTERN = /₹\s?[\d,]+(?:\.\d+)?/g;

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
  return Array.from(value.matchAll(PRICE_PATTERN), (match) => match[0].replace(/\s+/g, ""));
}

export function looksLikeUnit(value: string): boolean {
  return /\b\d+(?:\.\d+)?\s?(?:ml|l|litre|liter|g|kg|pc|pcs|piece|pieces|pack|packs|tablet|tabs|capsule|capsules)\b/i.test(
    value
  );
}

export function looksLikeRating(value: string): boolean {
  return /^\d(?:\.\d)?\s?\([\d,.]+[km]?\)$/i.test(value) || /^\d(?:\.\d)?$/.test(value);
}

export function stripImagePrefix(value: string): string {
  return normalizeText(value.replace(/^image:\s*/i, ""));
}
