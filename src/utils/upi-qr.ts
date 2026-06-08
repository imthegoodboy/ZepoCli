import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

import jsQR from "jsqr";
import { PNG } from "pngjs";
import * as QRCode from "qrcode";

import { UserFacingError } from "./errors.js";

export interface UpiPaymentQrMetadata {
  format: "zepto_upi_payment_qr";
  payment: "handled_by_zepto";
  terminal: boolean;
  fileSaved: boolean;
  payloadCaptured: boolean;
  note: "Live Zepto UPI payment QR. Scan with any UPI app to pay. ZepoCli does not observe payment proof or place orders.";
}

export interface UpiQrRenderInput {
  pngBase64: string;
  payload?: string;
}

export function upiPaymentQrMetadata(options: {
  terminal?: boolean;
  fileSaved?: boolean;
  payloadCaptured?: boolean;
} = {}): UpiPaymentQrMetadata {
  return {
    format: "zepto_upi_payment_qr",
    payment: "handled_by_zepto",
    terminal: options.terminal === true,
    fileSaved: options.fileSaved === true,
    payloadCaptured: options.payloadCaptured === true,
    note: "Live Zepto UPI payment QR. Scan with any UPI app to pay. ZepoCli does not observe payment proof or place orders."
  };
}

export function decodeUpiPayloadFromPngBase64(pngBase64: string): string | undefined {
  try {
    const buffer = Buffer.from(pngBase64, "base64");
    const png = PNG.sync.read(buffer);
    const code = jsQR(new Uint8ClampedArray(png.data.buffer, png.data.byteOffset, png.data.byteLength), png.width, png.height);
    const payload = code?.data?.trim();
    return payload && payload.length > 0 ? payload : undefined;
  } catch {
    return undefined;
  }
}

export function isUpiPaymentPayload(payload: string): boolean {
  return /^upi:\/\/pay(?:\?|$)/i.test(payload.trim());
}

export async function renderUpiTerminalQr(input: UpiQrRenderInput): Promise<string> {
  const payload = input.payload ?? decodeUpiPayloadFromPngBase64(input.pngBase64);
  if (payload && isUpiPaymentPayload(payload)) {
    return QRCode.toString(payload, {
      type: "terminal",
      small: true,
      margin: 1,
      errorCorrectionLevel: "M"
    });
  }

  throw new UserFacingError("Could not decode the Zepto UPI QR for terminal rendering.", {
    code: "upi_qr_decode_failed",
    hint: "Save the QR with `--qr-file <path>` and scan the PNG with a UPI app."
  });
}

export async function saveUpiQrPngFile(filePath: string, pngBase64: string): Promise<string> {
  const trimmedPath = filePath.trim();
  if (!trimmedPath) {
    throw new UserFacingError("QR file path cannot be blank.", {
      code: "invalid_input",
      hint: "Pass a writable PNG path, for example `zepo payment --qr-file upi-payment.png`."
    });
  }

  const outputPath = resolve(trimmedPath);
  try {
    await mkdir(dirname(outputPath), { recursive: true });
    await writeFile(outputPath, Buffer.from(pngBase64, "base64"));
  } catch (error) {
    throw new UserFacingError("Could not save UPI QR file.", {
      code: "qr_write_failed",
      hint: error instanceof Error ? error.message : "Check that the target directory is writable."
    });
  }

  return outputPath;
}
