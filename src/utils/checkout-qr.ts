import { mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";

import * as QRCode from "qrcode";

import {
  CHECKOUT_PAYMENT_LINK_SESSION,
  ZEPTO_CHECKOUT_HANDOFF_URL
} from "../config/constants.js";
import { UserFacingError } from "./errors.js";

export interface CheckoutLinkQrMetadata {
  payload: typeof ZEPTO_CHECKOUT_HANDOFF_URL;
  payloadSession: typeof CHECKOUT_PAYMENT_LINK_SESSION;
  format: "zepto_checkout_link_qr";
  payment: "handled_by_zepto";
  terminal: boolean;
  fileSaved: boolean;
  note: "QR opens Zepto checkout in the user's Zepto session; it is not a UPI QR, payment credential, payment proof, or order proof.";
}

export function checkoutLinkQrMetadata(options: { terminal?: boolean; fileSaved?: boolean } = {}): CheckoutLinkQrMetadata {
  return {
    payload: ZEPTO_CHECKOUT_HANDOFF_URL,
    payloadSession: CHECKOUT_PAYMENT_LINK_SESSION,
    format: "zepto_checkout_link_qr",
    payment: "handled_by_zepto",
    terminal: options.terminal === true,
    fileSaved: options.fileSaved === true,
    note: "QR opens Zepto checkout in the user's Zepto session; it is not a UPI QR, payment credential, payment proof, or order proof."
  };
}

export async function renderCheckoutLinkTerminalQr(): Promise<string> {
  return QRCode.toString(ZEPTO_CHECKOUT_HANDOFF_URL, {
    type: "terminal",
    small: true,
    margin: 1,
    errorCorrectionLevel: "M"
  });
}

export async function saveCheckoutLinkQrFile(filePath: string): Promise<string> {
  const trimmedPath = filePath.trim();
  if (!trimmedPath) {
    throw new UserFacingError("QR file path cannot be blank.", {
      code: "invalid_input",
      hint: "Pass a writable PNG path, for example `zepo cart --qr-file checkout-link.png`."
    });
  }

  const outputPath = resolve(trimmedPath);
  try {
    await mkdir(dirname(outputPath), { recursive: true });
    await QRCode.toFile(outputPath, ZEPTO_CHECKOUT_HANDOFF_URL, {
      type: "png",
      width: 512,
      margin: 2,
      errorCorrectionLevel: "M"
    });
  } catch (error) {
    throw new UserFacingError("Could not save checkout QR file.", {
      code: "qr_write_failed",
      hint: error instanceof Error ? error.message : "Check that the target directory is writable."
    });
  }

  return outputPath;
}
