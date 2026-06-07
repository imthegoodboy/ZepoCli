import type { Command } from "commander";

import {
  checkoutLinkQrMetadata,
  renderCheckoutLinkTerminalQr,
  saveCheckoutLinkQrFile
} from "../utils/checkout-qr.js";
import { printCart, printCartRemoveResult } from "../utils/output.js";
import { joinQuery, wantsJson, withCommandSpinner, withRuntime } from "./shared.js";

export function registerCartCommands(program: Command): void {
  program
    .command("cart")
    .description("Show Zepto cart")
    .option("--remove-limit-items", "click Zepto's Remove Items action for item-limit warnings before reading")
    .option("--json", "print machine-readable JSON")
    .option("--qr", "print a terminal QR code for the Zepto checkout link after reading a non-empty cart")
    .option("--qr-file <path>", "save a PNG QR code for the Zepto checkout link after reading a non-empty cart")
    .action((options: { json?: boolean; removeLimitItems?: boolean; qr?: boolean; qrFile?: string }, command: Command) =>
      withRuntime(command, async (runtime) => {
        const { ZeptoService } = await import("../services/zepto.js");
        const json = wantsJson(command, options);
        const service = new ZeptoService(runtime).cart;
        const readOptions = { removeLimitItems: Boolean(options.removeLimitItems) };
        const cart = json
          ? await service.read(readOptions)
          : await withCommandSpinner(
              options.removeLimitItems ? "Resolving Zepto cart limit warning" : "Reading Zepto cart",
              "Cart loaded.",
              () => service.read(readOptions)
            );
        const qrFileRequested = typeof options.qrFile === "string";
        const qrRequested = options.qr === true || qrFileRequested;
        const shouldEmitQr = qrRequested && cart.items.length > 0;
        const savedQrPath = shouldEmitQr && qrFileRequested ? await saveCheckoutLinkQrFile(options.qrFile ?? "") : undefined;
        const checkoutLinkQr = shouldEmitQr
          ? checkoutLinkQrMetadata({ terminal: options.qr === true, fileSaved: savedQrPath !== undefined })
          : undefined;

        if (json) {
          if (shouldEmitQr && options.qr === true) {
            console.error(await renderCheckoutLinkTerminalQr());
            console.error("Scan to open Zepto checkout in the user's Zepto session. This is not a UPI QR.");
          }
          if (savedQrPath) {
            console.error(`Checkout link QR saved: ${savedQrPath}`);
          }
          printCart(cart, true, { checkoutLinkQr });
          return;
        }

        printCart(cart, false, { checkoutLinkQr });
        if (!shouldEmitQr) {
          if (qrRequested) {
            console.log("Checkout QR omitted because the cart is empty.");
          }
          return;
        }

        if (options.qr === true) {
          console.log(await renderCheckoutLinkTerminalQr());
          console.log("Scan to open Zepto checkout in the user's Zepto session. This is not a UPI QR.");
        }
        if (savedQrPath) {
          console.log(`Checkout link QR saved: ${savedQrPath}`);
        }
      })
    );

  program
    .command("remove")
    .description("Remove a matching item from the Zepto cart")
    .argument("<query...>", "cart item query")
    .option("--json", "print machine-readable JSON")
    .action((queryParts: string[], options: { json?: boolean }, command: Command) =>
      withRuntime(command, async (runtime) => {
        const { ZeptoService } = await import("../services/zepto.js");
        const json = wantsJson(command, options);
        const query = joinQuery(queryParts);
        const service = new ZeptoService(runtime).cart;
        const result = json
          ? await service.remove(query)
          : await withCommandSpinner(`Removing "${query}"`, `Removed matching item for "${query}".`, () =>
              service.remove(query)
            );
        if (json) {
          printCartRemoveResult(result);
          return;
        }

        printCart(result.cart);
      })
    );

  program
    .command("clear")
    .description("Remove all detected items from the Zepto cart")
    .option("--json", "print machine-readable JSON")
    .action((options: { json?: boolean }, command: Command) =>
      withRuntime(command, async (runtime) => {
        const { ZeptoService } = await import("../services/zepto.js");
        const json = wantsJson(command, options);
        const service = new ZeptoService(runtime).cart;
        const cart = json
          ? await service.clear()
          : await withCommandSpinner("Clearing Zepto cart", "Cart cleared.", () => service.clear());
        printCart(cart, json);
      })
    );

}
