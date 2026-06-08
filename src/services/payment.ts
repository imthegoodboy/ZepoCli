import type { AppRuntime } from "../config/runtime.js";
import { assertConfirmedSession, BrowserAutomation } from "../automation/browser.js";
import { useAddress } from "../automation/address.js";
import { clickProductAdd, increaseProductQuantity, searchProducts, waitForProductAddSettled } from "../automation/search.js";
import { captureUpiPaymentQr, type UpiPaymentQrCapture, type UpiPaymentOptions } from "../automation/upi-payment.js";
import type { Address, Product } from "../types.js";
import { requireNonEmpty } from "../utils/errors.js";
import { assertCartContainsProduct, parseAddQuantity, requireAddableProducts, requireBestMatch } from "./cart.js";

export interface PreparedUpiPaymentOptions extends UpiPaymentOptions {
  add?: string;
  address?: string;
  quantity?: unknown;
}

export interface PreparedUpiPaymentQrCapture extends UpiPaymentQrCapture {
  address?: Address;
  product?: Product;
}

export class PaymentService {
  private readonly browser: BrowserAutomation;

  constructor(private readonly runtime: AppRuntime) {
    this.browser = new BrowserAutomation(runtime);
  }

  async fetchUpiQr(options: UpiPaymentOptions = {}): Promise<UpiPaymentQrCapture> {
    assertConfirmedSession(this.runtime);

    return this.browser.withPage({ captureFailures: false, requireSession: true }, async (page) =>
      captureUpiPaymentQr(page, options)
    );
  }

  async prepareUpiQr(options: PreparedUpiPaymentOptions = {}): Promise<PreparedUpiPaymentQrCapture> {
    assertConfirmedSession(this.runtime);

    const addQuery = typeof options.add === "string" ? requireNonEmpty(options.add, "Product query") : undefined;
    const addressQuery =
      typeof options.address === "string" ? requireNonEmpty(options.address, "Address query") : undefined;
    const quantity = addQuery ? parseAddQuantity(options.quantity ?? 1) : undefined;
    const removeLimitItems = options.removeLimitItems === true;

    return this.browser.withPage({ captureFailures: false, requireSession: true }, async (page) => {
      const address = addressQuery ? await useAddress(page, addressQuery) : undefined;
      const product = addQuery ? await addProductOnPage(page, addQuery, quantity ?? 1) : undefined;
      const capture = await captureUpiPaymentQr(page, { removeLimitItems });

      if (product) {
        assertCartContainsProduct(capture.cart ?? { items: [], total: capture.amount }, product, quantity);
      }

      if (capture.cart) {
        this.runtime.sqlite.saveCartSnapshot(capture.cart);
      }
      if (address) {
        this.runtime.preferences.saveAddresses([address]);
      }

      return {
        ...capture,
        ...(address ? { address } : {}),
        ...(product ? { product } : {})
      };
    });
  }
}

async function addProductOnPage(page: Parameters<typeof searchProducts>[0], query: string, quantity: number): Promise<Product> {
  const products = await searchProducts(page, query, 5);
  const product = requireBestMatch(requireAddableProducts(products, query), query);
  await clickProductAdd(page, product);
  await waitForProductAddSettled(page);
  await increaseProductQuantity(page, product, quantity);
  return product;
}
