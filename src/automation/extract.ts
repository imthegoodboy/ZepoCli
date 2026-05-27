import type { CartItem, OrderSnapshot, Product } from "../types.js";
import {
  extractPrices,
  looksLikeRating,
  looksLikeUnit,
  normalizeText,
  splitVisibleLines,
  stripImagePrefix
} from "../utils/format.js";

export interface RawProductCard {
  automationId?: number;
  text: string;
  imageAlt?: string;
  href?: string;
}

export function parseProductCard(raw: RawProductCard, outputIndex: number): Product | undefined {
  const lines = splitVisibleLines(raw.text);
  const prices = extractPrices(raw.text);
  const name = productNameFrom(raw.imageAlt, lines);

  if (!name) {
    return undefined;
  }

  return {
    index: outputIndex,
    automationId: raw.automationId,
    name,
    price: prices[0],
    mrp: prices[1],
    unit: lines.find((line) => looksLikeUnit(line)),
    rating: lines.find((line) => looksLikeRating(line)),
    url: raw.href
  };
}

export function dedupeProducts(products: Product[]): Product[] {
  const seen = new Set<string>();
  const deduped: Product[] = [];

  for (const product of products) {
    const key = `${product.name.toLowerCase()}|${product.unit ?? ""}|${product.price ?? ""}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    deduped.push({
      ...product,
      index: deduped.length
    });
  }

  return deduped;
}

export function parseCartItemsFromText(rawText: string): CartItem[] {
  const lines = splitVisibleLines(rawText);
  const items: CartItem[] = [];

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (!line || !isLikelyCartProductName(line)) {
      continue;
    }

    const window = lines.slice(index, index + 5);
    const price = window.flatMap(extractPrices)[0];
    const unit = window.find((candidate) => looksLikeUnit(candidate));
    const quantityLine = window.find((candidate) => /^(?:qty|quantity)?\s*\d+$/i.test(candidate));
    const quantity = quantityLine?.match(/\d+/)?.[0];

    if (price || unit) {
      items.push({
        name: line,
        price,
        unit,
        quantity
      });
    }
  }

  return dedupeCartItems(items);
}

export function parseOrdersFromText(rawText: string): OrderSnapshot[] {
  const normalizedText = normalizeText(rawText);
  const blocks = normalizedText
    .split(/(?=Order\s?#?\s?[A-Z0-9-]{4,})/i)
    .map(normalizeText)
    .filter((block) => block.length > 20);

  const parseBlocks = blocks.length > 0 ? blocks : [normalizedText];
  const orders = parseBlocks.map((block) => {
    const status = block.match(/\b(Delivered|Confirmed|Packed|Out for delivery|Placed|Cancelled|Refunded)\b/i)?.[1];
    const eta = block.match(/\bETA[:\s]+(.+?)(?=\s+(?:Total|₹|Order|Delivered|Confirmed|Packed|Out|Cancelled)\b|$)/i)?.[1];
    const id = block.match(/\bOrder\s?#?\s?([A-Z0-9-]{4,})\b/i)?.[1];
    const total = extractPrices(block).at(-1);

    return {
      id,
      status,
      eta,
      total,
      rawText: block
    };
  });

  return orders.filter((order) => isLikelyOrderSnapshot(order));
}

function productNameFrom(imageAlt: string | undefined, lines: string[]): string | undefined {
  if (imageAlt) {
    const alt = stripImagePrefix(imageAlt);
    if (alt && !/^zepto$/i.test(alt)) {
      return alt;
    }
  }

  return lines.find((line) => !isIgnoredProductLine(line));
}

function isIgnoredProductLine(line: string): boolean {
  return (
    /^add$/i.test(line) ||
    /^added$/i.test(line) ||
    /^out of stock$/i.test(line) ||
    /^₹/.test(line) ||
    /off$/i.test(line) ||
    looksLikeRating(line) ||
    looksLikeUnit(line)
  );
}

function isLikelyCartProductName(line: string): boolean {
  if (line.length < 3 || line.length > 120) {
    return false;
  }

  if (/^(cart|checkout|subtotal|delivery|handling|view bill|apply coupon|add more|saved|address)$/i.test(line)) {
    return false;
  }

  if (/\b(total|grand total|to pay|qty|quantity)\b/i.test(line)) {
    return false;
  }

  if (/^₹/.test(line) || looksLikeRating(line) || looksLikeUnit(line)) {
    return false;
  }

  return /[a-z]/i.test(line);
}

function isLikelyOrderSnapshot(order: OrderSnapshot): boolean {
  if (order.id) {
    return true;
  }

  if (!order.status) {
    return false;
  }

  return /\b(order|orders|track|tracking)\b/i.test(order.rawText);
}

function dedupeCartItems(items: CartItem[]): CartItem[] {
  const seen = new Set<string>();
  const deduped: CartItem[] = [];

  for (const item of items) {
    const key = `${item.name.toLowerCase()}|${item.unit ?? ""}|${item.price ?? ""}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    deduped.push(item);
  }

  return deduped;
}
