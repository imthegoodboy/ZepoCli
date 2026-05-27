import type { AppRuntime } from "../config/runtime.js";
import type { CartSnapshot, OrderSnapshot } from "../types.js";
import { BrowserAutomation } from "../automation/browser.js";
import { readOrders, reorderLast } from "../automation/orders.js";

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
    return orders.slice(0, 1);
  }

  async reorderLast(): Promise<CartSnapshot> {
    const cart = await this.browser.withPage({ requireSession: true }, (page) => reorderLast(page));
    this.runtime.sqlite.saveCartSnapshot(cart);
    return cart;
  }
}
