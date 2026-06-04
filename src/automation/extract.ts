import type { CartItem, OrderSnapshot, Product } from "../types.js";
import { BASE_URL } from "../config/constants.js";
import {
  extractPrices,
  looksLikePrice,
  looksLikeRating,
  looksLikeUnit,
  normalizeText,
  splitVisibleLines,
  stripImagePrefix
} from "../utils/format.js";
import { FINAL_PAYMENT_OR_ORDER_ACTION_PATTERN_SOURCE } from "./final-action-labels.js";
import { ORDER_ACTION_LABEL_PATTERN_SOURCE, isOrderActionLabelText } from "./order-action-labels.js";
import { isPaymentUiSurfaceText } from "./payment-labels.js";

const ORDER_ETA_TRAILING_ACTION_PATTERN = new RegExp(
  `(?:\\b(reorder|order again|repeat order|track order|order summary|payment|paid)\\b|${FINAL_PAYMENT_OR_ORDER_ACTION_PATTERN_SOURCE}|${ORDER_ACTION_LABEL_PATTERN_SOURCE}).*$`,
  "i"
);
const INACTIVE_CART_SECTION_COUNT_SUFFIX = String.raw`(?:\s*[\(\[]?\d+\s*items?[\)\]]?|\s*[\(\[]\d+[\)\]])?`;
const INACTIVE_CART_SECTION_HEADER_PATTERN = new RegExp(
  `^(?:saved\\s+(?:items?|for\\s+later)|save\\s+for\\s+later|items?\\s+saved\\s+for\\s+later|unavailable(?:\\s+items?)?|currently\\s+unavailable|out\\s+of\\s+stock(?:\\s+items?)?|sold\\s+out(?:\\s+items?)?|not\\s+available(?:\\s+items?)?)${INACTIVE_CART_SECTION_COUNT_SUFFIX}$`,
  "i"
);

export interface RawProductCard {
  automationId?: number;
  text: string;
  imageAlt?: string;
  href?: string;
  ignoredText?: string[];
}

const PUBLIC_PRODUCT_HOSTS = [new URL(BASE_URL).hostname.replace(/^www\./, ""), "zeptonow.com"];

export function parseProductCard(raw: RawProductCard, outputIndex: number): Product | undefined {
  const lines = splitVisibleLines(raw.text);
  const ignoredLines = ignoredProductLinesFrom(raw.ignoredText);
  const { price, mrp } = productPricesFrom(lines);
  const unit = lines.find((line) => isLikelyProductUnitLine(line));
  const name = productNameFrom(raw.imageAlt, lines, ignoredLines);

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
    url: publicProductUrl(raw.href)
  };
}

function publicProductUrl(value: string | undefined): string | undefined {
  if (!value) {
    return undefined;
  }

  try {
    const url = new URL(value, BASE_URL);
    if (url.protocol !== "https:" && url.protocol !== "http:") {
      return undefined;
    }

    if (!isPublicProductHost(url.hostname)) {
      return undefined;
    }

    url.protocol = "https:";
    url.search = "";
    url.hash = "";

    return url.toString();
  } catch {
    return undefined;
  }
}

function isPublicProductHost(hostname: string): boolean {
  const normalizedHostname = hostname.toLowerCase().replace(/^www\./, "");

  return PUBLIC_PRODUCT_HOSTS.some(
    (allowedHost) => normalizedHostname === allowedHost || normalizedHostname.endsWith(`.${allowedHost}`)
  );
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
    if (isCartNonActiveContextLine(lines, index) || isCartSuggestedProductWindow(window)) {
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
    const eta = extractOrderEta(block, status);
    const id = block.match(/\bOrder\s?#?\s?((?=[A-Z0-9-]*\d)[A-Z0-9-]{4,})\b/i)?.[1];
    const total = extractOrderTotal(block);

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
  const matches: Array<{ status: string; index: number }> = [];
  for (const status of statuses) {
    const match = block.match(new RegExp(`\\b${status}\\b`, "i"));
    if (!match || match.index === undefined) {
      continue;
    }

    if (status === "Delivered" && isDeliveryMarketingStatusMatch(block, match.index)) {
      continue;
    }

    if (status === "Arriving" && isArrivingMarketingStatusMatch(block, match.index)) {
      continue;
    }

    matches.push({ status, index: match.index });
  }

  const terminalMatch = matches
    .filter((match) => isTerminalOrderStatus(match.status))
    .sort((first, second) => second.index - first.index)[0];

  return terminalMatch?.status ?? matches[0]?.status;
}

function isTerminalOrderStatus(status: string): boolean {
  return status === "Cancelled" || status === "Refunded";
}

function extractOrderEta(block: string, status: string | undefined): string | undefined {
  const labeledEta = cleanOrderEta(
    block.match(/\bETA[:\s]+(.+?)(?=\s+(?:Total|₹|Order|Delivered|Confirmed|Packed|Out|Cancelled)\b|$)/i)?.[1]
  );
  if (labeledEta) {
    return labeledEta;
  }

  if (!isActiveOrderStatus(status)) {
    return undefined;
  }

  return cleanOrderEta(block.match(/\b(?:arriving|delivery)\s+in\s+(\d+\s*(?:mins?|minutes?|hrs?|hours?))\b/i)?.[1]);
}

function cleanOrderEta(value: string | undefined): string | undefined {
  const cleaned = normalizeText(value ?? "").replace(ORDER_ETA_TRAILING_ACTION_PATTERN, "").trim();
  const timeValue = cleaned.match(/\b\d+\s*(?:mins?|minutes?|hrs?|hours?)\b/i)?.[0];

  if (!timeValue) {
    return undefined;
  }

  return timeValue;
}

function isActiveOrderStatus(status: string | undefined): boolean {
  return status !== undefined && status !== "Delivered" && !isTerminalOrderStatus(status);
}

function extractOrderTotal(block: string): string | undefined {
  const lines = splitVisibleLines(block);
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? "";
    const labelEndIndex = findOrderTotalLabelEndIndex(line);
    if (labelEndIndex === undefined) {
      continue;
    }

    const suffix = line
      .slice(labelEndIndex)
      .replace(/^[:=\-–—]+/, "")
      .trim();
    const sameLineTotal = startsWithPrice(suffix) ? extractPrices(suffix)[0] : undefined;
    if (sameLineTotal) {
      return sameLineTotal;
    }

    if (suffix.length > 0) {
      continue;
    }

    for (let offset = 1; offset <= 2; offset += 1) {
      const candidate = lines[index + offset] ?? "";
      if (!candidate || isOrderTotalStopLine(candidate)) {
        break;
      }

      const prices = extractPrices(candidate);
      if (prices.length > 0) {
        return prices.at(-1);
      }
    }
  }

  return undefined;
}

function startsWithPrice(value: string): boolean {
  return /^(₹\s?[\d,]+(?:\.\d+)?|(?:rs\.?|inr)\s?[\d,]+(?:\.\d+)?)/i.test(value);
}

function findOrderTotalLabelEndIndex(line: string): number | undefined {
  const labelPattern = /\b(grand total|order total|amount paid|paid|to pay|payable|bill total|total)\b/gi;
  for (const match of line.matchAll(labelPattern)) {
    if (match.index === undefined) {
      continue;
    }

    const before = line.slice(Math.max(0, match.index - 16), match.index);
    if (/\b(item|items|sub|subtotal)\s*$/i.test(before)) {
      continue;
    }

    const after = line.slice(match.index + match[0].length, match.index + match[0].length + 24);
    if (/^\s*(saving|savings|discount|coupon|refund|cashback)\b/i.test(after)) {
      continue;
    }

    return match.index + match[0].length;
  }

  return undefined;
}

function isOrderTotalStopLine(line: string): boolean {
  return /\b(order|track order|status|eta|confirmed|packed|out for delivery|on the way|arriving|delivered|cancelled|refunded|items?\s+total|sub\s+total|subtotal|item|delivery|handling|platform|fee|charge|discount|coupon|tax|address|reorder|order again)\b/i.test(
    line
  );
}

function productPricesFrom(lines: string[]): { price?: string; mrp?: string } {
  const priceLines = lines
    .map((line) => ({
      line,
      prices: extractPrices(line)
    }))
    .filter((item) => item.prices.length > 0 && !isDiscountOnlyPriceLine(item.line, item.prices));

  const labeledMrp = priceLines.find((item) => isLabeledMrpLine(item.line))?.prices[0];
  const firstNonMrpPrice = priceLines.find((item) => !isLabeledMrpLine(item.line))?.prices[0];
  const allPrices = priceLines.flatMap((item) => item.prices);
  const sellingPrice = firstNonMrpPrice ?? (labeledMrp ? undefined : allPrices[0]);

  return {
    price: sellingPrice,
    mrp: labeledMrp ?? allPrices.find((price) => price !== sellingPrice)
  };
}

function firstNonDiscountOnlyPrice(lines: string[]): string | undefined {
  return lines
    .map((line) => ({
      line,
      prices: extractPrices(line)
    }))
    .filter((item) => item.prices.length > 0 && !isDiscountOnlyPriceLine(item.line, item.prices) && !isLabeledMrpLine(item.line))
    .flatMap((item) => item.prices)[0];
}

function isLabeledMrpLine(line: string): boolean {
  return /\b(mrp|maximum retail price)\b/i.test(line);
}

function isDiscountOnlyPriceLine(line: string, prices: string[]): boolean {
  return (
    prices.length === 1 &&
    /\b(off|discount|save|savings?)\b/i.test(line) &&
    !isLabeledMrpLine(line)
  );
}

function productNameFrom(imageAlt: string | undefined, lines: string[], ignoredLines: ReadonlySet<string>): string | undefined {
  if (imageAlt) {
    const alt = stripImagePrefix(imageAlt);
    if (alt && !isGenericImageAlt(alt) && !isIgnoredProductLine(alt, ignoredLines)) {
      return alt;
    }
  }

  return lines.find((line) => !isIgnoredProductLine(line, ignoredLines));
}

function isGenericImageAlt(value: string): boolean {
  const normalized = normalizeText(value);
  return (
    !/[a-z0-9]/i.test(normalized) ||
    /^(zepto|image|product|product image|item|item image|thumbnail|placeholder|banner|popular searches|search|searches|category|categories|shop by category)$/i.test(
      normalized
    ) || /(?:^|[\\/])[\w.-]+\.(?:png|jpe?g|webp|gif|svg)$/i.test(normalized)
  );
}

function isIgnoredProductLine(line: string, ignoredLines: ReadonlySet<string>): boolean {
  return (
    !/[a-z0-9]/i.test(line) ||
    isCommerceUiOrPromoLine(line) ||
    isProductCardControlLabel(line) ||
    isProductAddControlLine(line) ||
    ignoredLines.has(normalizedIgnoredProductLine(line)) ||
    /^(sponsored|ad|advertisement|best\s?seller|popular|trending|recommended|featured)$/i.test(line) ||
    /^(?:\d+\s*(?:mins?|minutes?)|delivery\s+in\s+\d+\s*(?:mins?|minutes?)|arrives?\s+in\s+\d+\s*(?:mins?|minutes?)|fast delivery|free delivery|super saver|lowest price|low price|deal|offer|new)$/i.test(line) ||
    isRecommendationHeaderLine(line) ||
    /^(limited time deal|deal of the day|only \d+ left|in stock)$/i.test(line) ||
    isStandaloneRatingCountLine(line) ||
    looksLikePrice(line) ||
    /off$/i.test(line) ||
    looksLikeRating(line) ||
    isLikelyProductUnitLine(line)
  );
}

function isProductAddControlLine(line: string): boolean {
  return /^add(?:ed(?:\s+to\s+cart)?|\s+to\s+cart|\s+.+\s+to\s+cart)?$/i.test(normalizeText(line));
}

function isProductCardControlLabel(line: string): boolean {
  return /^(?:notify me|notify when available|sold out|temporarily out of stock|currently unavailable|out of stock|view similar|see similar products|select options|choose product options|add item|add more)$/i.test(
    normalizeText(line)
  );
}

function isCommerceUiOrPromoLine(line: string): boolean {
  const normalized = normalizeText(line);
  if (!normalized) {
    return false;
  }

  return (
    isCartOrCheckoutServiceLine(normalized) ||
    isAccountLocationOrVerificationUiLine(normalized) ||
    /^(checkout|payment methods?|payments?|upi|cards?|wallets?|net banking|cash on delivery|cod|free gift|zepto pass|membership|subscription|unlocked at checkout|unlock at checkout|gift unlocked|reward|rewards|cashback|offer zone|offers?|deals?|deals for you|buy more save more|save more|sale|sale zone|promo|promos?|voucher|coupons?)$/i.test(
      normalized
    ) ||
    /^\d+\s*(?:days?|months?|years?)$/i.test(normalized) ||
    /\b(checkout|payment methods?|place order|confirm order|pay now|to pay|zepto pass|free gift|unlocked at checkout|unlock at checkout|offer zone|deals for you|buy more save more|save more|sale zone|promo|voucher|coupon)\b/i.test(
      normalized
    ) ||
    isPaymentUiSurfaceText(normalized)
  );
}

function isAccountLocationOrVerificationUiLine(line: string): boolean {
  return (
    /^(?:account|my account|profile|login|log in|sign in|sign up|login\s*\/\s*sign\s*up|login\/sign up|continue with (?:phone|mobile)|enter (?:phone|mobile)(?: number)?|verify otp|otp verification)$/i.test(
      line
    ) ||
    /^(?:delivery location|select location|select delivery location|choose delivery location|set delivery location|change delivery location|add location|add delivery location|delivery address|select delivery address|add delivery address|saved addresses?|deliver(?:ing)? to)$/i.test(
      line
    )
  );
}

function isCartOrCheckoutServiceLine(line: string): boolean {
  return (
    /\b(clear cart|minimum (?:order|cart|basket) value|small cart fee|delivery partner tip|delivery instructions|add (?:delivery|cooking) instructions|order summary|bill summary|view bill|cancellation policy|refund policy|return policy)\b/i.test(
      line
    ) ||
    /\b(delivery|handling|platform|convenience|surge|packing|packaging|service)\s+(?:fees?|charges?)\b/i.test(
      line
    ) ||
    /\b(rain|high demand|peak demand|long distance|distance|late night|priority)\s+(?:fees?|charges?)\b/i.test(
      line
    ) ||
    /\b(tip your delivery partner|partner tip|delivery partner tip|delivery tip|rider tip)\b/i.test(line) ||
    /\b(donation|charity|round off|rounding adjustment|wallet discount|coupon discount|promo discount|voucher discount)\b/i.test(
      line
    ) ||
    /\b(gst|tax(?:es)?|tax(?:es)?\s*(?:&|and)\s*charges?|charges?\s*(?:&|and)\s*tax(?:es)?|fees?\s*(?:&|and)\s*tax(?:es)?|tax(?:es)?\s*(?:&|and)\s*fees?)\b/i.test(
      line
    )
  );
}

function ignoredProductLinesFrom(values: string[] | undefined): ReadonlySet<string> {
  const ignored = new Set<string>();
  for (const value of values ?? []) {
    for (const line of splitVisibleLines(value)) {
      const normalized = normalizedIgnoredProductLine(stripImagePrefix(line));
      if (
        normalized &&
        normalized.length <= 120 &&
        !looksLikePrice(normalized) &&
        !looksLikeRating(normalized) &&
        !looksLikeUnit(normalized)
      ) {
        ignored.add(normalized);
      }
    }
  }

  return ignored;
}

function normalizedIgnoredProductLine(line: string): string {
  return normalizeText(line).toLowerCase();
}

function isLikelyProductUnitLine(line: string): boolean {
  const normalized = normalizeText(line);
  return (
    normalized.length <= 80 &&
    normalized.split(/\s+/).length <= 8 &&
    !normalized.includes("|") &&
    looksLikeUnit(normalized) &&
    !looksLikePrice(normalized) &&
    !/\b(add|off)\b/i.test(normalized)
  );
}

function isStandaloneRatingCountLine(line: string): boolean {
  return /^\(?\d+(?:\.\d+)?\s*[km]?\)?$/i.test(normalizeText(line));
}

function isLikelyCartProductName(line: string): boolean {
  if (line.length < 3 || line.length > 120) {
    return false;
  }

  if (
    isCommerceUiOrPromoLine(line) ||
    /^(cart|checkout|view bill|apply coupon|add|add to cart|added|add more|out of stock|saved|save for later|address|remove|remove item|delete|delete item|decrease|decrease quantity|increase|increase quantity)$/i.test(
      line
    ) ||
    isCartSummaryLine(line) ||
    isRecommendationHeaderLine(line) ||
    isInactiveCartSectionHeaderLine(line)
  ) {
    return false;
  }

  if (
    /^\d+\s+items?$/i.test(line) ||
    /^(?:total|grand total|to pay)$/i.test(line) ||
    /^(?:qty|quantity)(?:\s*:?\s*\d+)?$/i.test(line)
  ) {
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
  const thirdPreviousLine = normalizeText(lines[index - 3] ?? "");
  const nextLine = normalizeText(lines[index + 1] ?? "");
  const secondNextLine = normalizeText(lines[index + 2] ?? "");

  if (isCartAddressHeaderLine(line)) {
    return true;
  }

  const hasNearbyAddressHeader =
    isCartAddressHeaderLine(previousLine) ||
    isCartAddressHeaderLine(secondPreviousLine) ||
    isCartAddressHeaderLine(thirdPreviousLine);

  if (isAddressDetailLine(line)) {
    return (
      hasNearbyAddressHeader ||
      (isLikelyAddressLabelLine(previousLine) && isCartAddressHeaderLine(secondPreviousLine)) ||
      (isAddressDetailLine(previousLine) &&
        (hasNearbyAddressHeader ||
          (isLikelyAddressLabelLine(secondPreviousLine) && isCartAddressHeaderLine(thirdPreviousLine))))
    );
  }

  if (isLikelyAddressLabelLine(line)) {
    return (
      (isCartAddressHeaderLine(previousLine) || isCartAddressHeaderLine(secondPreviousLine)) &&
      (isAddressDetailLine(nextLine) || isAddressDetailLine(secondNextLine))
    );
  }

  return false;
}

function isCartNonActiveContextLine(lines: string[], index: number): boolean {
  const lookbackLimit = Math.max(0, index - 8);
  for (let candidateIndex = index - 1; candidateIndex >= lookbackLimit; candidateIndex -= 1) {
    const candidate = normalizeText(lines[candidateIndex] ?? "");
    if (!candidate) {
      continue;
    }

    if (isCartSummaryLine(candidate) || isCartAddressHeaderLine(candidate) || /^cart$/i.test(candidate)) {
      return false;
    }

    if (isRecommendationHeaderLine(candidate) || isInactiveCartSectionHeaderLine(candidate)) {
      return true;
    }
  }

  return false;
}

function isCartSuggestedProductWindow(lines: string[]): boolean {
  return lines.some((line) =>
    /^(add|add to cart|added|out of stock|move to cart|move to bag|notify me|notify when available)$/i.test(
      normalizeText(line)
    )
  );
}

function isRecommendationHeaderLine(line: string): boolean {
  return /\b(you may also like|similar products|recommended|frequently bought|popular picks|top picks|best offers?|offers for you|trending deals?|best sellers?|sponsored|before you checkout|complete your cart|customers also bought|add more items?)\b/i.test(
    line
  );
}

function isInactiveCartSectionHeaderLine(line: string): boolean {
  return INACTIVE_CART_SECTION_HEADER_PATTERN.test(normalizeText(line));
}

function isCartAddressHeaderLine(line: string): boolean {
  return /\b(delivery address|deliver(?:ing)? to|selected address|saved addresses?)\b/i.test(line);
}

function isLikelyAddressLabelLine(line: string): boolean {
  const normalized = normalizeText(line);
  if (normalized.length === 0 || normalized.length > 48) {
    return false;
  }

  if (
    looksLikePrice(normalized) ||
    looksLikeRating(normalized) ||
    looksLikeUnit(normalized) ||
    isCartAddressHeaderLine(normalized) ||
    isCartSummaryLine(normalized) ||
    isRecommendationHeaderLine(normalized)
  ) {
    return false;
  }

  return /^[a-z0-9][a-z0-9 .,'&()/-]*$/i.test(normalized);
}

function isAddressDetailLine(line: string): boolean {
  const normalized = normalizeText(line);
  if (
    !normalized ||
    looksLikePrice(normalized) ||
    looksLikeRating(normalized) ||
    looksLikeUnit(normalized) ||
    isCartSummaryLine(normalized) ||
    isRecommendationHeaderLine(normalized)
  ) {
    return false;
  }

  return (
    /\b(house|flat|road|street|lane|layout|sector|phase|apartment|building|floor|tower|block|wing|society|colony|landmark|near|opposite|pin|pincode|postal\s+code|india)\b/i.test(
      normalized
    ) ||
    /\b[a-z]\s*[-/]\s*\d{2,}\b/i.test(normalized) ||
    /\b\d{3,}\b/.test(normalized)
  );
}

function cartItemDetailWindow(lines: string[], index: number): string[] {
  const window = lines.slice(index, index + 5);
  const summaryIndex = window.findIndex((line, offset) => offset > 0 && isCartSummaryLine(line));
  return summaryIndex === -1 ? window : window.slice(0, summaryIndex);
}

function isCartSummaryLine(line: string): boolean {
  return (
    isCartOrCheckoutServiceLine(normalizeText(line)) ||
    /\b(subtotal|grand total|item total|to pay|payable|delivery|handling|platform|convenience|surge|small cart|fees?|charges?|coupon|discount|saving|wallet|tip|donation|round off|tax(?:es)?|gst|packing|packaging|bill total)\b/i.test(
      line
    )
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
  if (!order.status && hasDeliveryMarketingCopy(order.rawText)) {
    return false;
  }

  if (!order.id && hasNoIdOrderActionOnlyContext(order) && !hasNoIdTrackingContext(order.rawText)) {
    return false;
  }

  if (order.id && (order.status || order.eta)) {
    return true;
  }

  if (!order.status) {
    return false;
  }

  if (hasExplicitOrderStatusPhrase(order.rawText)) {
    return true;
  }

  if (/\b(track order|tracking)\b/i.test(order.rawText)) {
    return true;
  }

  if (/\b(my orders|order history|past orders)\b/i.test(order.rawText)) {
    return order.eta !== undefined || order.total !== undefined;
  }

  return false;
}

function hasExplicitOrderStatusPhrase(text: string): boolean {
  for (const match of text.matchAll(/\border\s+(?:delivered|confirmed|packed|out for delivery|on the way|arriving|preparing|processing|placed|cancelled|refunded)\b/gi)) {
    const prefix = normalizeText(text.slice(Math.max(0, (match.index ?? 0) - 32), match.index ?? 0));
    if (isOrderActionLabelText(`${prefix} order`)) {
      continue;
    }

    return true;
  }

  return false;
}

function hasNoIdOrderActionOnlyContext(order: OrderSnapshot): boolean {
  if (hasNoIdOrderSummaryContext(order.rawText)) {
    return true;
  }

  return isOrderActionLabelText(removeOrderStatusText(order.rawText, order.status));
}

function hasNoIdOrderSummaryContext(text: string): boolean {
  return /\b(order summary|bill summary|view bill)\b/i.test(text);
}

function removeOrderStatusText(text: string, status: string | undefined): string {
  if (!status) {
    return text;
  }

  return text.replace(new RegExp(`\\b${escapeRegExp(status)}\\b`, "gi"), " ");
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function hasNoIdTrackingContext(text: string): boolean {
  return /\b(track order|tracking)\b/i.test(text);
}

function isDeliveryMarketingStatusMatch(block: string, matchIndex: number): boolean {
  const suffix = normalizeText(block.slice(matchIndex, matchIndex + 80));
  return /^delivered\s+(?:in|within)\s+(?:\d+\s*)?(?:mins?|minutes?|hrs?|hours?)\b/i.test(suffix);
}

function isArrivingMarketingStatusMatch(block: string, matchIndex: number): boolean {
  if (hasLocalOrderTrackingContext(block, matchIndex)) {
    return false;
  }

  const suffix = normalizeText(block.slice(matchIndex, matchIndex + 80));
  return /^arriving\s+(?:in|within)\s+(?:\d+\s*)?(?:mins?|minutes?|hrs?|hours?)\b/i.test(suffix);
}

function hasDeliveryMarketingCopy(text: string): boolean {
  return (
    /\bdelivered\s+(?:in|within)\s+(?:\d+\s*)?(?:mins?|minutes?|hrs?|hours?)\b/i.test(text) ||
    /\b(?:groceries|snacks|daily essentials|essentials|items?|products?)\s+arriving\s+(?:in|within)\s+(?:\d+\s*)?(?:mins?|minutes?|hrs?|hours?)\b/i.test(
      text
    )
  );
}

function hasLocalOrderTrackingContext(text: string, matchIndex: number): boolean {
  const prefix = normalizeText(text.slice(Math.max(0, matchIndex - 140), matchIndex));
  return (
    /\b(?:track order|tracking)\b(?:\s+(?:status|confirmed|packed|out for delivery|on the way|preparing|processing|placed))*\s*$/i.test(
      prefix
    ) ||
    /\bOrder\s?#?\s?(?=[A-Z0-9-]*\d)[A-Z0-9-]{4,}\b(?:\s+(?:status|confirmed|packed|out for delivery|on the way|preparing|processing|placed))*\s*$/i.test(
      prefix
    ) ||
    /\border\s+(?:status|is)\s*$/i.test(prefix)
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
