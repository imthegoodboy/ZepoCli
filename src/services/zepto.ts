import type { AppRuntime } from "../config/runtime.js";
import { AddressService } from "./addresses.js";
import { AuthService } from "./auth.js";
import { CartService } from "./cart.js";
import { CheckoutService } from "./checkout.js";
import { OrdersService } from "./orders.js";
import { SearchService } from "./search.js";

export class ZeptoService {
  readonly auth: AuthService;
  readonly search: SearchService;
  readonly cart: CartService;
  readonly addresses: AddressService;
  readonly checkout: CheckoutService;
  readonly orders: OrdersService;

  constructor(runtime: AppRuntime) {
    this.auth = new AuthService(runtime);
    this.search = new SearchService(runtime);
    this.cart = new CartService(runtime);
    this.addresses = new AddressService(runtime);
    this.checkout = new CheckoutService(runtime);
    this.orders = new OrdersService(runtime);
  }
}
