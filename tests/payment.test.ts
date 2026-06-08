import { describe, expect, it } from "vitest";

import { emptyCartPaymentOutput, paymentQrOutput } from "../src/commands/payment.js";
import { upiPaymentQrMetadata } from "../src/utils/upi-qr.js";

describe("payment command output", () => {
  it("reports a terminal UPI payment QR without claiming payment or order placement", () => {
    expect(
      paymentQrOutput(
        {
          amount: "₹32",
          payload: "upi://pay?pa=merchant@upi&pn=Zepto&am=32.00&cu=INR",
          pngBase64: "abc"
        },
        {
          paymentQr: upiPaymentQrMetadata({ terminal: true, fileSaved: true, payloadCaptured: true }),
          cart: {
            items: [
              {
                name: "Amul Milk",
                unit: "500 ml",
                quantity: "1",
                price: "₹32"
              }
            ],
            total: "₹32"
          }
        }
      )
    ).toEqual({
      status: "payment_qr_ready",
      payment: "handled_by_zepto",
      humanActionRequired: true,
      automationBoundary: "zepocli_did_not_click_payment_or_order_controls",
      handoffSurface: "terminal_upi_payment_qr",
      browserOpenAfterReturn: false,
      cartPrecondition: "non_empty_cart_verified",
      cart: {
        itemCount: 1,
        hasTotal: true,
        total: "₹32"
      },
      paymentQr: {
        format: "zepto_upi_payment_qr",
        payment: "handled_by_zepto",
        terminal: true,
        fileSaved: true,
        payloadCaptured: true,
        note: "Live Zepto UPI payment QR. Scan with any UPI app to pay. ZepoCli does not observe payment proof or place orders."
      },
      paymentStatus: "not_observed_by_zepocli",
      orderPlacement: "not_confirmed_by_zepocli",
      orderStatusCommand: "zepo track",
      next: "Scan the terminal QR or saved PNG with a UPI app to pay. After Zepto confirms payment, run `zepo track`."
    });
  });

  it("reports an empty cart without QR metadata", () => {
    expect(emptyCartPaymentOutput()).toEqual({
      status: "cart_empty",
      payment: "handled_by_zepto",
      humanActionRequired: false,
      automationBoundary: "zepocli_did_not_click_payment_or_order_controls",
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
    });
  });

  it("reports verified cart evidence from the payment QR capture when no cart snapshot is supplied", () => {
    expect(
      paymentQrOutput(
        {
          amount: "₹104",
          itemCount: 1,
          payload: "upi://pay?pa=merchant@upi&pn=Zepto&am=104.00&cu=INR"
        },
        {
          paymentQr: upiPaymentQrMetadata({ terminal: false, fileSaved: true, payloadCaptured: true })
        }
      ).cart
    ).toEqual({
      itemCount: 1,
      hasTotal: true,
      total: "₹104"
    });
  });

  it("prefers verified payment capture item count over a stale empty cart snapshot", () => {
    expect(
      paymentQrOutput(
        {
          amount: "₹104",
          itemCount: 1,
          payload: "upi://pay?pa=merchant@upi&pn=Zepto&am=104.00&cu=INR"
        },
        {
          paymentQr: upiPaymentQrMetadata({ terminal: false, fileSaved: true, payloadCaptured: true }),
          cart: {
            items: [],
            total: undefined
          }
        }
      ).cart
    ).toEqual({
      itemCount: 1,
      hasTotal: true,
      total: "₹104"
    });
  });

  it("can include one-shot address and product evidence without changing payment boundary", () => {
    expect(
      paymentQrOutput(
        {
          amount: "₹104",
          itemCount: 1,
          payload: "upi://pay?pa=merchant@upi&pn=Zepto&am=104.00&cu=INR"
        },
        {
          paymentQr: upiPaymentQrMetadata({ terminal: false, fileSaved: true, payloadCaptured: true }),
          address: {
            label: "Other",
            text: "Other - Study Home PG, Ramakrishna Ashrama Road, Bengaluru, Karnataka 560001 India",
            selected: true
          },
          product: {
            index: 0,
            automationId: 3,
            name: "Monster Energy Ultra Zero Sugar | Carbonated Caffeinated Beverage",
            unit: "1 pc (350 ml)",
            price: "₹104"
          }
        }
      )
    ).toMatchObject({
      status: "payment_qr_ready",
      address: {
        selected: true,
        text: "Other - Study Home PG, Ramakrishna Ashrama Road, Bengaluru, Karnataka 560001 India"
      },
      product: {
        name: "Monster Energy Ultra Zero Sugar | Carbonated Caffeinated Beverage",
        unit: "1 pc (350 ml)",
        price: "₹104"
      },
      paymentStatus: "not_observed_by_zepocli",
      orderPlacement: "not_confirmed_by_zepocli"
    });
  });
});
