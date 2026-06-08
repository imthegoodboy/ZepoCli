import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import * as QRCode from "qrcode";
import { describe, expect, it } from "vitest";

import {
  decodeUpiPayloadFromPngBase64,
  isUpiPaymentPayload,
  renderUpiTerminalQr,
  saveUpiQrPngFile,
  upiPaymentQrMetadata
} from "../src/utils/upi-qr.js";

describe("upi qr utilities", () => {
  it("decodes a UPI payload from a generated PNG QR", async () => {
    const payload = "upi://pay?pa=merchant@upi&pn=Zepto&am=32.00&cu=INR";
    const dataUrl = await QRCode.toDataURL(payload, { type: "image/png", width: 256, margin: 1 });
    const pngBase64 = dataUrl.split(",")[1] ?? "";

    expect(decodeUpiPayloadFromPngBase64(pngBase64)).toBe(payload);
    expect(await renderUpiTerminalQr({ pngBase64, payload })).toContain("█");
  });

  it("only terminal-renders UPI payment payloads", async () => {
    const checkoutLinkDataUrl = await QRCode.toDataURL("https://www.zepto.com/?cart=open", {
      type: "image/png",
      width: 256,
      margin: 1
    });
    const checkoutLinkPngBase64 = checkoutLinkDataUrl.split(",")[1] ?? "";

    expect(isUpiPaymentPayload("upi://pay?pa=merchant@upi&pn=Zepto&am=32.00&cu=INR")).toBe(true);
    expect(isUpiPaymentPayload("https://www.zepto.com/?cart=open")).toBe(false);
    await expect(renderUpiTerminalQr({ pngBase64: checkoutLinkPngBase64 })).rejects.toMatchObject({
      code: "upi_qr_decode_failed"
    });
  });

  it("saves a UPI QR PNG to disk", async () => {
    const payload = "upi://pay?pa=merchant@upi&pn=Zepto&am=32.00&cu=INR";
    const dataUrl = await QRCode.toDataURL(payload, { type: "image/png", width: 256, margin: 1 });
    const pngBase64 = dataUrl.split(",")[1] ?? "";
    const directory = await mkdtemp(join(tmpdir(), "zepo-upi-qr-"));
    const outputPath = join(directory, "payment.png");

    await expect(saveUpiQrPngFile(outputPath, pngBase64)).resolves.toBe(outputPath);
    const saved = await readFile(outputPath);
    expect(saved.length).toBeGreaterThan(100);
    expect(decodeUpiPayloadFromPngBase64(saved.toString("base64"))).toBe(payload);
  });

  it("builds payment QR metadata", () => {
    expect(upiPaymentQrMetadata({ terminal: true, fileSaved: true, payloadCaptured: true })).toEqual({
      format: "zepto_upi_payment_qr",
      payment: "handled_by_zepto",
      terminal: true,
      fileSaved: true,
      payloadCaptured: true,
      note: "Live Zepto UPI payment QR. Scan with any UPI app to pay. ZepoCli does not observe payment proof or place orders."
    });
  });
});
