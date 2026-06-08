import chalk from "chalk";
import type { Command } from "commander";

import { CHECKOUT_AUTOMATION_BOUNDARY } from "../config/constants.js";
import type { Address, CartSnapshot, Product } from "../types.js";
import {
  renderUpiTerminalQr,
  saveUpiQrPngFile,
  upiPaymentQrMetadata,
  type UpiPaymentQrMetadata
} from "../utils/upi-qr.js";
import { isUserFacingError } from "../utils/errors.js";
import { printJson } from "../utils/output.js";
import { wantsJson, withCommandSpinner, withRuntime } from "./shared.js";

export function registerPaymentCommand(program: Command): void {
  program
    .command("payment")
    .description("Show Zepto's live UPI payment QR in the terminal for the current cart")
    .option("--address <query>", "select a saved delivery address before preparing payment")
    .option("--add <query>", "add a product before preparing payment")
    .option("-q, --quantity <number>", "quantity to add when --add is used, maximum 12", "1")
    .option("--remove-limit-items", "click Zepto's Remove Items action for item-limit warnings before reading")
    .option("--json", "print machine-readable JSON")
    .option("--qr", "print the terminal QR even when JSON output is requested")
    .option("--no-qr", "skip terminal QR output")
    .option("--qr-file <path>", "save Zepto's UPI payment QR as a PNG")
    .action(
      (
        options: {
          removeLimitItems?: boolean;
          address?: string;
          add?: string;
          quantity: string;
          json?: boolean;
          qr?: boolean;
          qrFile?: string;
        },
        command: Command
      ) =>
        withRuntime(command, async (runtime) => {
          const { ZeptoService } = await import("../services/zepto.js");
          const json = wantsJson(command, options);
          const readOptions = { removeLimitItems: options.removeLimitItems === true };
          const service = new ZeptoService(runtime);
          const prepareRequested = typeof options.address === "string" || typeof options.add === "string";
          const preparedCapture = prepareRequested
            ? json
              ? await service.payment.prepareUpiQr({
                  ...readOptions,
                  address: options.address,
                  add: options.add,
                  quantity: options.quantity
                })
              : await withCommandSpinner(
                  "Preparing Zepto cart and UPI payment QR",
                  "UPI payment QR ready.",
                  () =>
                    service.payment.prepareUpiQr({
                      ...readOptions,
                      address: options.address,
                      add: options.add,
                      quantity: options.quantity
                    })
                )
            : undefined;

          const cart = preparedCapture
            ? preparedCapture.cart
            : json
              ? await service.cart.read(readOptions)
              : await withCommandSpinner(
                  options.removeLimitItems ? "Resolving Zepto cart limit warning" : "Reading Zepto cart",
                  "Cart loaded.",
                  () => service.cart.read(readOptions)
                );

          const capture =
            preparedCapture ??
            (cart && cart.items.length === 0
              ? await service.payment.fetchUpiQr(readOptions).catch((error: unknown) => {
                  if (isUserFacingError(error) && error.code === "checkout_cart_unreadable") {
                    return undefined;
                  }

                  throw error;
                })
              : json
                ? await service.payment.fetchUpiQr(readOptions)
                : await withCommandSpinner(
                    "Preparing Zepto UPI payment QR",
                    "UPI payment QR ready.",
                    () => service.payment.fetchUpiQr(readOptions)
                  ));

          if (!capture) {
            if (json) {
              printJson(emptyCartPaymentOutput());
              return;
            }

            console.log(chalk.yellow("Cart is empty."));
            console.log(chalk.dim("Add items before requesting a Zepto UPI payment QR."));
            return;
          }

          const showTerminalQr = options.qr !== false && (!json || options.qr === true);
          const savedQrPath =
            typeof options.qrFile === "string" ? await saveUpiQrPngFile(options.qrFile, capture.pngBase64) : undefined;
          const qrMetadata = upiPaymentQrMetadata({
            terminal: showTerminalQr,
            fileSaved: savedQrPath !== undefined,
            payloadCaptured: true
          });
          const output = paymentQrOutput(capture, {
            paymentQr: qrMetadata,
            cart,
            address: preparedCapture?.address,
            product: preparedCapture?.product
          });

          if (json) {
            if (showTerminalQr) {
              console.error(await renderUpiTerminalQr(capture));
              console.error("Scan with any UPI app to pay. ZepoCli does not observe payment proof.");
            }
            if (savedQrPath) {
              console.error(`UPI payment QR saved: ${savedQrPath}`);
            }
            printJson(output);
            return;
          }

          console.log(chalk.green("UPI payment QR ready."));
          if (output.address) {
            console.log(chalk.dim(`Address: ${output.address.text}`));
          }
          if (output.product) {
            const unit = output.product.unit ? ` - ${output.product.unit}` : "";
            console.log(chalk.dim(`Added: ${output.product.name}${unit}`));
          }
          if (output.cart.total) {
            console.log(chalk.bold(`Total: ${output.cart.total}`));
          }
          if (showTerminalQr) {
            console.log(await renderUpiTerminalQr(capture));
          }
          console.log(chalk.dim("Scan with any UPI app to pay. ZepoCli does not observe payment proof or place orders."));
          if (savedQrPath) {
            console.log(chalk.dim(`UPI payment QR saved: ${savedQrPath}`));
          }
          console.log(chalk.dim("After payment completes in Zepto, run `zepo track`."));
        })
    );
}

export interface EmptyCartPaymentOutput {
  status: "cart_empty";
  payment: "handled_by_zepto";
  humanActionRequired: false;
  automationBoundary: typeof CHECKOUT_AUTOMATION_BOUNDARY;
  handoffSurface: "terminal_upi_payment_qr";
  browserOpenAfterReturn: false;
  cartPrecondition: "empty_cart_detected";
  cart: {
    itemCount: 0;
    hasTotal: false;
  };
  paymentStatus: "not_observed_by_zepocli";
  orderPlacement: "not_confirmed_by_zepocli";
  orderStatusCommand: "zepo track";
  next: string;
}

export interface PaymentQrOutput {
  status: "payment_qr_ready";
  payment: "handled_by_zepto";
  humanActionRequired: true;
  automationBoundary: typeof CHECKOUT_AUTOMATION_BOUNDARY;
  handoffSurface: "terminal_upi_payment_qr";
  browserOpenAfterReturn: false;
  cartPrecondition: "non_empty_cart_verified";
  cart: {
    itemCount?: number;
    hasTotal: boolean;
    total?: string;
  };
  address?: Address;
  product?: Product;
  paymentQr: UpiPaymentQrMetadata;
  paymentStatus: "not_observed_by_zepocli";
  orderPlacement: "not_confirmed_by_zepocli";
  orderStatusCommand: "zepo track";
  next: string;
}

export function paymentQrOutput(
  capture: { amount?: string; payload?: string; itemCount?: number },
  options: { paymentQr: UpiPaymentQrMetadata; cart?: CartSnapshot; address?: Address; product?: Product } = {
    paymentQr: upiPaymentQrMetadata()
  }
): PaymentQrOutput {
  const total = capture.amount ?? options.cart?.total;
  const cartItemCount = options.cart?.items.length;
  const itemCount = cartItemCount && cartItemCount > 0 ? cartItemCount : capture.itemCount ?? cartItemCount;

  return {
    status: "payment_qr_ready",
    payment: "handled_by_zepto",
    humanActionRequired: true,
    automationBoundary: CHECKOUT_AUTOMATION_BOUNDARY,
    handoffSurface: "terminal_upi_payment_qr",
    browserOpenAfterReturn: false,
    cartPrecondition: "non_empty_cart_verified",
    cart: {
      ...(typeof itemCount === "number" ? { itemCount } : {}),
      hasTotal: total !== undefined,
      ...(total ? { total } : {})
    },
    ...(options.address ? { address: options.address } : {}),
    ...(options.product ? { product: options.product } : {}),
    paymentQr: options.paymentQr,
    paymentStatus: "not_observed_by_zepocli",
    orderPlacement: "not_confirmed_by_zepocli",
    orderStatusCommand: "zepo track",
    next: "Scan the terminal QR or saved PNG with a UPI app to pay. After Zepto confirms payment, run `zepo track`."
  };
}

export function emptyCartPaymentOutput(): EmptyCartPaymentOutput {
  return {
    status: "cart_empty",
    payment: "handled_by_zepto",
    humanActionRequired: false,
    automationBoundary: CHECKOUT_AUTOMATION_BOUNDARY,
    handoffSurface: "terminal_upi_payment_qr",
    browserOpenAfterReturn: false,
    cartPrecondition: "empty_cart_detected",
    cart: {
      itemCount: 0,
      hasTotal: false
    },
    paymentStatus: "not_observed_by_zepocli",
    orderPlacement: "not_confirmed_by_zepocli",
    orderStatusCommand: "zepo track",
    next: "Add items with `zepo add <query>` or inspect the cart with `zepo cart` before requesting payment."
  };
}
