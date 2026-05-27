import type { AppRuntime } from "../config/runtime.js";
import type { CartSnapshot, OrderSnapshot } from "../types.js";
import { BrowserAutomation } from "../automation/browser.js";
import { readOrders, reorderLast } from "../automation/orders.js";
import { UserFacingError } from "../utils/errors.js";

export class OrdersService {
  private readonly browser: BrowserAutomation;

  constructor(private readonly runtime: AppRuntime) {
    this.browser = new BrowserAutomation(runtime);
  }

  async history(): Promise<OrderSnapshot[]> {
    const orders = await this.browser.withPage({ requireSession: true }, (page) => readOrders(page));
    this.runtime.sqlite.saveOrders(orders);
    return orders;
  }

  async track(): Promise<OrderSnapshot[]> {
    const orders = await this.history();
    return [requireLatestOrder(orders)];
  }

  async reorderLast(): Promise<CartSnapshot> {
    const cart = await this.browser.withPage({ requireSession: true }, (page) => reorderLast(page));
    this.runtime.sqlite.saveCartSnapshot(cart);
    return cart;
  }
}

export function requireLatestOrder(orders: OrderSnapshot[]): OrderSnapshot {
  const latest = orders[0];
  if (latest) {
    return latest;
  }

  throw new UserFacingError("No Zepto order was detected to track.", {
    hint: "Use `zepo history` to inspect detected orders, or complete an order in Zepto before running `zepo track`."
  });
}
