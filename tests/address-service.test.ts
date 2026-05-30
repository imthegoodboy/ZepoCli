import { describe, expect, it } from "vitest";

import { AddressService, requireDetectedAddressesAfterAddressFlow } from "../src/services/addresses.js";

describe("address service verification helpers", () => {
  it("returns detected addresses", () => {
    const addresses = [
      {
        label: "Home",
        text: "Home: 221B Baker Street, Bengaluru, India",
        selected: true
      }
    ];

    expect(requireDetectedAddressesAfterAddressFlow(addresses)).toBe(addresses);
  });

  it("rejects address flow success without detected addresses", () => {
    expect(() => requireDetectedAddressesAfterAddressFlow([])).toThrow(
      "No Zepto addresses were detected after the address flow."
    );
  });

  it("rejects blank address-use queries before browser work", async () => {
    const service = new AddressService(createNoBrowserRuntime());

    await expect(service.use("   ")).rejects.toMatchObject({
      code: "invalid_input",
      message: "Address query is required."
    });
  });
});

function createNoBrowserRuntime() {
  return {
    preferences: {
      saveAddresses: () => {
        throw new Error("browser work should not reach preference writes");
      }
    }
  } as never;
}
