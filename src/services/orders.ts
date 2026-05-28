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
    const orders = await this.browser.withPage({ captureFailures: false, requireSession: true }, (page) => readOrders(page));
    this.runtime.sqlite.saveOrders(orders);
    return orders;
  }

  async track(): Promise<OrderSnapshot[]> {
    const orders = await this.history();
    return [requireLatestOrder(orders)];
  }

  async reorderLast(): Promise<CartSnapshot> {
    const cart = await this.browser.withPage({ captureFailures: false, requireSession: true }, (page) => reorderLast(page));
    this.runtime.sqlite.saveCartSnapshot(cart);
    return cart;
  }
}

export function requireLatestOrder(orders: OrderSnapshot[]): OrderSnapshot {
  const latest = orders[0];
  if (!latest) {
    throw new UserFacingError("No Zepto order was detected to track.", {
      code: "order_not_found",
      hint: "Use `zepo history` to inspect detected orders, or complete an order in Zepto before running `zepo track`."
    });
  }

  if (latest.status || latest.eta) {
    return latest;
  }

  throw new UserFacingError("Latest Zepto order did not expose a status or ETA.", {
    code: "order_status_unreadable",
    hint: "Use `zepo history` to inspect detected order details, or rerun `zepo track --visible` after Zepto updates tracking."
  });
}
