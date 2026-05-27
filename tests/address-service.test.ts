import { describe, expect, it } from "vitest";

import { requireDetectedAddressesAfterAddressFlow } from "../src/services/addresses.js";

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
});
