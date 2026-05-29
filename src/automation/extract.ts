import type { CartItem, OrderSnapshot, Product } from "../types.js";
import {
  extractPrices,
  looksLikePrice,
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
  const { price, mrp } = productPricesFrom(lines);
  const unit = lines.find((line) => isLikelyProductUnitLine(line));
  const name = productNameFrom(raw.imageAlt, lines);

  if (!name) {
    return undefined;
  }

  if (!price && !unit) {
    return undefined;
  }

  return {
    index: outputIndex,
    automationId: raw.automationId,
    name,
    price,
    mrp,
    unit,
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
    if (!line || isCartAddressContextLine(lines, index) || !isLikelyCartProductName(line)) {
      continue;
    }

    const window = cartItemDetailWindow(lines, index);
    if (isCartRecommendationContextLine(lines, index) || isCartSuggestedProductWindow(window)) {
      continue;
    }

    const price = firstNonDiscountOnlyPrice(window);
    const unit = window.find((candidate) => looksLikeUnit(candidate));
    const quantity = extractCartQuantityFromWindow(window);

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
    .split(/(?=\bOrder\s?#?\s?(?=[A-Z0-9-]*\d)[A-Z0-9-]{4,})/i)
    .map(normalizeText)
    .filter((block) => block.length > 20);

  const parseBlocks = blocks.length > 0 ? blocks : [normalizedText];
  const orders = parseBlocks.map((block) => {
    const status = extractOrderStatus(block);
    const eta = extractOrderEta(block);
    const id = block.match(/\bOrder\s?#?\s?((?=[A-Z0-9-]*\d)[A-Z0-9-]{4,})\b/i)?.[1];
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

function extractOrderStatus(block: string): string | undefined {
  const statuses = [
    "Delivered",
    "Out for delivery",
    "On the way",
    "Arriving",
    "Packed",
    "Confirmed",
    "Preparing",
    "Processing",
    "Placed",
    "Cancelled",
    "Refunded"
  ];
  const matched = statuses.filter((status) => new RegExp(`\\b${status}\\b`, "i").test(block));
  return matched[0];
}

function extractOrderEta(block: string): string | undefined {
  return (
    block.match(/\bETA[:\s]+(.+?)(?=\s+(?:Total|₹|Order|Delivered|Confirmed|Packed|Out|Cancelled)\b|$)/i)?.[1] ??
    block.match(/\b(?:arriving|delivery)\s+in\s+(\d+\s*(?:mins?|minutes?|hrs?|hours?))\b/i)?.[1]
  );
}

function productPricesFrom(lines: string[]): { price?: string; mrp?: string } {
  const priceLines = lines
    .map((line) => ({
      line,
      prices: extractPrices(line)
    }))
    .filter((item) => item.prices.length > 0 && !isDiscountOnlyPriceLine(item.line, item.prices));

  const labeledMrp = priceLines.find((item) => /\b(mrp|maximum retail price)\b/i.test(item.line))?.prices[0];
  const firstNonMrpPrice = priceLines.find((item) => !/\b(mrp|maximum retail price)\b/i.test(item.line))?.prices[0];
  const allPrices = priceLines.flatMap((item) => item.prices);

  return {
    price: firstNonMrpPrice ?? allPrices[0],
    mrp: labeledMrp ?? allPrices.find((price) => price !== (firstNonMrpPrice ?? allPrices[0]))
  };
}

function firstNonDiscountOnlyPrice(lines: string[]): string | undefined {
  return lines
    .map((line) => ({
      line,
      prices: extractPrices(line)
    }))
    .filter((item) => item.prices.length > 0 && !isDiscountOnlyPriceLine(item.line, item.prices))
    .flatMap((item) => item.prices)[0];
}

function isDiscountOnlyPriceLine(line: string, prices: string[]): boolean {
  return (
    prices.length === 1 &&
    /\b(off|discount|save|savings?)\b/i.test(line) &&
    !/\b(mrp|maximum retail price)\b/i.test(line)
  );
}

function productNameFrom(imageAlt: string | undefined, lines: string[]): string | undefined {
  if (imageAlt) {
    const alt = stripImagePrefix(imageAlt);
    if (alt && !isGenericImageAlt(alt)) {
      return alt;
    }
  }

  return lines.find((line) => !isIgnoredProductLine(line));
}

function isGenericImageAlt(value: string): boolean {
  return /^(zepto|image|product|product image|item|item image|thumbnail|placeholder|banner|popular searches|search|searches|category|categories|shop by category)$/i.test(
    value
  );
}

function isIgnoredProductLine(line: string): boolean {
  return (
    /^add$/i.test(line) ||
    /^added$/i.test(line) ||
    /^out of stock$/i.test(line) ||
    /^(sponsored|ad|advertisement|best\s?seller|popular|trending|recommended|featured)$/i.test(line) ||
    isRecommendationHeaderLine(line) ||
    /^(limited time deal|deal of the day|only \d+ left|in stock)$/i.test(line) ||
    looksLikePrice(line) ||
    /off$/i.test(line) ||
    looksLikeRating(line) ||
    looksLikeUnit(line)
  );
}

function isLikelyProductUnitLine(line: string): boolean {
  return line.length <= 80 && looksLikeUnit(line) && !looksLikePrice(line) && !/\b(add|off)\b/i.test(line);
}

function isLikelyCartProductName(line: string): boolean {
  if (line.length < 3 || line.length > 120) {
    return false;
  }

  if (
    /^(cart|checkout|view bill|apply coupon|add|added|add more|out of stock|saved|address)$/i.test(line) ||
    isCartSummaryLine(line) ||
    isRecommendationHeaderLine(line)
  ) {
    return false;
  }

  if (/^\d+\s+items?$/i.test(line) || /\b(total|grand total|to pay|qty|quantity)\b/i.test(line)) {
    return false;
  }

  if (looksLikePrice(line) || looksLikeRating(line) || looksLikeUnit(line)) {
    return false;
  }

  return /[a-z]/i.test(line);
}

function isCartAddressContextLine(lines: string[], index: number): boolean {
  const line = normalizeText(lines[index] ?? "");
  if (!line) {
    return false;
  }

  const previousLine = normalizeText(lines[index - 1] ?? "");
  const secondPreviousLine = normalizeText(lines[index - 2] ?? "");

  if (isAddressLabelLine(line)) {
    return isCartAddressHeaderLine(previousLine) || isCartAddressHeaderLine(secondPreviousLine);
  }

  if (!isAddressDetailLine(line)) {
    return false;
  }

  return (
    isCartAddressHeaderLine(previousLine) ||
    isCartAddressHeaderLine(secondPreviousLine) ||
    isAddressLabelLine(previousLine) ||
    (isAddressDetailLine(previousLine) && isAddressLabelLine(secondPreviousLine))
  );
}

function isCartRecommendationContextLine(lines: string[], index: number): boolean {
  const lookbackLimit = Math.max(0, index - 8);
  for (let candidateIndex = index - 1; candidateIndex >= lookbackLimit; candidateIndex -= 1) {
    const candidate = normalizeText(lines[candidateIndex] ?? "");
    if (!candidate) {
      continue;
    }

    if (isCartSummaryLine(candidate) || isCartAddressHeaderLine(candidate) || /^cart$/i.test(candidate)) {
      return false;
    }

    if (isRecommendationHeaderLine(candidate)) {
      return true;
    }
  }

  return false;
}

function isCartSuggestedProductWindow(lines: string[]): boolean {
  return lines.some((line) => /^(add|added|out of stock)$/i.test(normalizeText(line)));
}

function isRecommendationHeaderLine(line: string): boolean {
  return /\b(you may also like|similar products|recommended|frequently bought|popular picks|sponsored|before you checkout|complete your cart|customers also bought|add more items?)\b/i.test(
    line
  );
}

function isCartAddressHeaderLine(line: string): boolean {
  return /\b(delivery address|deliver(?:ing)? to|selected address|saved addresses?)\b/i.test(line);
}

function isAddressLabelLine(line: string): boolean {
  return /^(home|work|other)$/i.test(line);
}

function isAddressDetailLine(line: string): boolean {
  return (
    /\b(house|flat|road|street|sector|phase|apartment|building|floor|tower|block|pin|pincode|bengaluru|bangalore|mumbai|delhi|pune|hyderabad|chennai|kolkata|ahmedabad|gurugram|gurgaon|noida)\b/i.test(
      line
    ) || /\b\d{3,}\b/.test(line)
  );
}

function cartItemDetailWindow(lines: string[], index: number): string[] {
  const window = lines.slice(index, index + 5);
  const summaryIndex = window.findIndex((line, offset) => offset > 0 && isCartSummaryLine(line));
  return summaryIndex === -1 ? window : window.slice(0, summaryIndex);
}

function isCartSummaryLine(line: string): boolean {
  return /\b(subtotal|grand total|item total|to pay|payable|delivery|handling|platform|convenience|surge|small cart|fee|charge|coupon|discount|saving|wallet|tip|donation|tax|packing|packaging|bill total)\b/i.test(
    line
  );
}

function extractCartQuantityFromWindow(lines: string[]): string | undefined {
  for (const line of lines) {
    const quantity = extractExplicitCartQuantity(line);
    if (quantity !== undefined) {
      return quantity;
    }
  }

  for (let index = 0; index < lines.length; index += 1) {
    const quantity = lines[index]?.match(/^(\d{1,2})$/)?.[1];
    if (quantity && hasAdjacentQuantityStepper(lines, index)) {
      return quantity;
    }
  }

  return undefined;
}

function extractExplicitCartQuantity(line: string): string | undefined {
  return (
    line.match(/^(?:qty|quantity)\s*:?\s*(\d+)$/i)?.[1] ??
    line.match(/^x\s*(\d+)$/i)?.[1] ??
    line.match(/^(\d+)\s*x$/i)?.[1]
  );
}

function hasAdjacentQuantityStepper(lines: string[], index: number): boolean {
  const previous = normalizeText(lines[index - 1] ?? "");
  const next = normalizeText(lines[index + 1] ?? "");
  return isQuantityStepperControl(previous) || isQuantityStepperControl(next);
}

function isQuantityStepperControl(line: string): boolean {
  return /^([+\-−]|remove|delete|decrease|increase)$/i.test(line);
}

function isLikelyOrderSnapshot(order: OrderSnapshot): boolean {
  if (order.id && (order.status || order.eta)) {
    return true;
  }

  if (!order.status) {
    return false;
  }

  if (/\b(track order|tracking|my orders|order history|past orders)\b/i.test(order.rawText)) {
    return true;
  }

  return /\border\s+(?:confirmed|packed|out for delivery|on the way|arriving|preparing|processing|placed|cancelled|refunded)\b/i.test(
    order.rawText
  );
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
