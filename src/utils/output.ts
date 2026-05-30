import chalk from "chalk";

import type { Address, CartItem, CartSnapshot, OrderSnapshot, Product } from "../types.js";
import { redactSensitiveText } from "./redaction.js";

export { redactSensitiveText } from "./redaction.js";

export interface JsonError {
  type: "user_error" | "invalid_input" | "unexpected_error";
  code: string;
  message: string;
  hint?: string;
  exitCode: number;
  retryAfterMs?: number;
  issues?: Array<{
    path: string;
    message: string;
  }>;
}

export function printJson(value: unknown): void {
  console.log(JSON.stringify(toPublicJsonValue(value), null, 2));
}

export function printJsonError(error: JsonError): void {
  console.error(
    JSON.stringify(
      toPublicJsonValue({
        ok: false,
        error
      }, { redactStrings: true }),
      null,
      2
    )
  );
}

export function printProducts(products: Product[], json = false): void {
  if (json) {
    printJson(products.map(toPublicProduct));
    return;
  }

  if (products.length === 0) {
    console.log(chalk.yellow("No products found."));
    return;
  }

  for (const product of products) {
    const price = product.price ? chalk.green(product.price) : chalk.gray("price unavailable");
    const unit = product.unit ? chalk.gray(` - ${product.unit}`) : "";
    console.log(`${product.index + 1}. ${product.name}${unit} ${price}`);
  }
}

export function printAddResult(result: { product: Product; cart: CartSnapshot }): void {
  printJson({
    product: toPublicProduct(result.product),
    cart: toPublicCartSnapshot(result.cart)
  });
}

export function printCart(cart: CartSnapshot, json = false): void {
  if (json) {
    printJson(toPublicCartSnapshot(cart));
    return;
  }

  if (cart.items.length === 0) {
    console.log(chalk.yellow("Cart is empty."));
    return;
  }

  for (const [index, item] of cart.items.entries()) {
    const quantity = item.quantity ? chalk.gray(` x ${item.quantity}`) : "";
    const unit = item.unit ? chalk.gray(` - ${item.unit}`) : "";
    const price = item.price ? chalk.green(` ${item.price}`) : "";
    console.log(`${index + 1}. ${item.name}${unit}${quantity}${price}`);
  }

  if (cart.total) {
    console.log(chalk.bold(`Total: ${cart.total}`));
  }
}

export function printAddresses(addresses: Address[], json = false): void {
  if (json) {
    printJson(addresses.map(toPublicAddress));
    return;
  }

  if (addresses.length === 0) {
    console.log(chalk.yellow("No saved addresses were detected."));
    return;
  }

  for (const [index, address] of addresses.entries()) {
    const marker = address.selected ? chalk.green("*") : " ";
    const label = address.label ? `${address.label}: ` : "";
    console.log(`${marker} ${index + 1}. ${label}${address.text}`);
  }
}

export function printAddress(address: Address): void {
  printJson(toPublicAddress(address));
}

export function printOrders(orders: OrderSnapshot[], json = false): void {
  if (json) {
    printJson(orders.map(toPublicOrderSnapshot));
    return;
  }

  if (orders.length === 0) {
    console.log(chalk.yellow("No orders were detected."));
    return;
  }

  for (const [index, order] of orders.entries()) {
    const id = order.id ? chalk.gray(` ${order.id}`) : "";
    const status = order.status ?? "status unavailable";
    const eta = order.eta ? chalk.cyan(` ETA: ${order.eta}`) : "";
    const total = order.total ? chalk.green(` ${order.total}`) : "";
    console.log(`${index + 1}. ${status}${id}${eta}${total}`);
  }
}

function toPublicProduct(product: Product): Omit<Product, "automationId"> {
  return {
    index: product.index,
    name: product.name,
    ...(product.price ? { price: product.price } : {}),
    ...(product.mrp ? { mrp: product.mrp } : {}),
    ...(product.unit ? { unit: product.unit } : {}),
    ...(product.rating ? { rating: product.rating } : {}),
    ...(product.url ? { url: product.url } : {})
  };
}

function toPublicCartSnapshot(cart: CartSnapshot): Omit<CartSnapshot, "rawText"> {
  return {
    items: cart.items.map(toPublicCartItem),
    ...(cart.total ? { total: cart.total } : {})
  };
}

function toPublicCartItem(item: CartItem): CartItem {
  return {
    name: item.name,
    ...(item.quantity ? { quantity: item.quantity } : {}),
    ...(item.price ? { price: item.price } : {}),
    ...(item.unit ? { unit: item.unit } : {})
  };
}

function toPublicAddress(address: Address): Address {
  return {
    ...(address.label ? { label: address.label } : {}),
    text: address.text,
    ...(address.selected !== undefined ? { selected: address.selected } : {})
  };
}

function toPublicOrderSnapshot(order: OrderSnapshot): Omit<OrderSnapshot, "rawText"> {
  return {
    ...(order.id ? { id: order.id } : {}),
    ...(order.status ? { status: order.status } : {}),
    ...(order.eta ? { eta: order.eta } : {}),
    ...(order.total ? { total: order.total } : {}),
    ...(order.placedAt ? { placedAt: order.placedAt } : {})
  };
}

interface PublicJsonOptions {
  redactStrings?: boolean;
}

function toPublicJsonValue(value: unknown, options: PublicJsonOptions = {}): unknown {
  if (Array.isArray(value)) {
    return value.map((child) => toPublicJsonValue(child, options));
  }

  if (typeof value === "string") {
    return options.redactStrings ? redactSensitiveText(value) : value;
  }

  if (!isPlainObject(value)) {
    return value;
  }

  const output: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(value)) {
    if (key === "rawText" || key === "automationId") {
      continue;
    }
    output[key] = toPublicJsonValue(child, options);
  }

  return output;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== "object") {
    return false;
  }

  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}
