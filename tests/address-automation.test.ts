import { describe, expect, it } from "vitest";

import { addressMatchesQuery, isLikelyAddressText, requireSelectedAddress } from "../src/automation/address.js";

describe("address automation helpers", () => {
  it("matches addresses by label or visible text", () => {
    const address = {
      label: "Home",
      text: "221B Baker Street, Bengaluru, India"
    };

    expect(addressMatchesQuery(address, "home")).toBe(true);
    expect(addressMatchesQuery(address, "Baker Street")).toBe(true);
    expect(addressMatchesQuery(address, "work")).toBe(false);
  });

  it("returns a selected address matching the requested query", () => {
    const selected = {
      label: "Home",
      text: "Delivering to Home 221B Baker Street, Bengaluru, India",
      selected: true
    };

    expect(requireSelectedAddress([selected], "home")).toBe(selected);
  });

  it("rejects matching addresses that are not selected", () => {
    expect(() =>
      requireSelectedAddress(
        [
          {
            label: "Home",
            text: "221B Baker Street, Bengaluru, India",
            selected: false
          }
        ],
        "home"
      )
    ).toThrow('Zepto did not show a selected address matching "home" after the selection click.');
  });

  it("rejects selected addresses that do not match the requested query", () => {
    expect(() =>
      requireSelectedAddress(
        [
          {
            label: "Work",
            text: "Selected Work address, Bengaluru, India",
            selected: true
          }
        ],
        "home"
      )
    ).toThrow('Zepto did not show a selected address matching "home" after the selection click.');
  });

  it("accepts saved address text with location detail", () => {
    expect(isLikelyAddressText("Home 221B Baker Street, Bengaluru, Karnataka 560001 India")).toBe(true);
    expect(isLikelyAddressText("Work Flat 42, Tower B, MG Road, Bengaluru")).toBe(true);
  });

  it("rejects address placeholders without saved address detail", () => {
    expect(isLikelyAddressText("Delivery Address")).toBe(false);
    expect(isLikelyAddressText("Add address")).toBe(false);
    expect(isLikelyAddressText("Select location")).toBe(false);
  });
});
