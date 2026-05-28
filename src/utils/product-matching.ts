const SIZE_UNIT_PATTERN =
  "ml|l|ltr|litre|litres|liter|liters|g|gm|gms|gram|grams|kg|kgs|pc|pcs|piece|pieces|pack|packs|packet|packets|bottle|bottles|box|boxes|can|cans|jar|jars|pouch|pouches|sachet|sachets|dozen|tablet|tablets|tabs|capsule|capsules";

export function textMatchesProductQuery(text: string, query: string): boolean {
  const searchable = normalizeProductMatchText(text);
  const queryText = normalizeProductMatchText(query);
  if (!searchable || !queryText) {
    return false;
  }

  const compactSearchable = compactProductMatchText(searchable);
  const compactQuery = compactProductMatchText(queryText);
  if (searchable.includes(queryText) || (compactQuery.length > 1 && compactSearchable.includes(compactQuery))) {
    return true;
  }

  const terms = productMatchTerms(queryText);
  return terms.length > 0 && terms.every((term) => productMatchTermMatches(searchable, compactSearchable, term));
}

export function queryHasSpecificSizeTerm(query: string): boolean {
  return productMatchTerms(query).some((term) => new RegExp(`^\\d+(?:\\.\\d+)?(?:${SIZE_UNIT_PATTERN})$`, "i").test(term));
}

export function normalizeProductMatchText(value: string): string {
  return value
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase()
    .replace(new RegExp(`(\\d+(?:\\.\\d+)?)\\s+(?=(?:${SIZE_UNIT_PATTERN})\\b)`, "gi"), "$1")
    .replace(/(\d+(?:\.\d+)?)(?:litres?|liters?|ltr)\b/gi, "$1l")
    .replace(/(\d+(?:\.\d+)?)(?:grams?|gms?|gm)\b/gi, "$1g")
    .replace(/(\d+(?:\.\d+)?)kgs\b/gi, "$1kg")
    .replace(/(\d+(?:\.\d+)?)(?:pieces?|pcs?)\b/gi, "$1pc")
    .replace(/\s+/g, " ")
    .trim();
}

function productMatchTerms(value: string): string[] {
  return normalizeProductMatchText(value)
    .split(/[^a-z0-9.]+/i)
    .filter((term) => term.length > 1);
}

function productMatchTermMatches(searchable: string, compactSearchable: string, term: string): boolean {
  return productMatchTermVariants(term).some(
    (variant) => searchable.includes(variant) || compactSearchable.includes(variant)
  );
}

function productMatchTermVariants(term: string): string[] {
  const variants = [term];

  if (/^[a-z]{4,}ies$/i.test(term)) {
    variants.push(`${term.slice(0, -3)}y`);
  } else if (/^[a-z]{4,}s$/i.test(term)) {
    variants.push(term.slice(0, -1));
  }

  return variants;
}

function compactProductMatchText(value: string): string {
  return value.replace(/[^a-z0-9.]+/gi, "");
}
