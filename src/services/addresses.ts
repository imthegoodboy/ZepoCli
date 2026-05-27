import { input } from "@inquirer/prompts";

import type { AppRuntime } from "../config/runtime.js";
import type { Address } from "../types.js";
import { BrowserAutomation } from "../automation/browser.js";
import { listAddresses, startAddAddress, useAddress } from "../automation/address.js";
import { UserFacingError, requireNonEmpty } from "../utils/errors.js";

export class AddressService {
  private readonly browser: BrowserAutomation;

  constructor(private readonly runtime: AppRuntime) {
    this.browser = new BrowserAutomation(runtime);
  }

  async list(): Promise<Address[]> {
    const addresses = await this.browser.withPage({ requireSession: true }, (page) => listAddresses(page));
    this.runtime.preferences.saveAddresses(addresses);
    return addresses;
  }

  async use(query: string): Promise<Address> {
    const cleanQuery = requireNonEmpty(query, "Address query");
    const address = await this.browser.withPage({ requireSession: true }, (page) => useAddress(page, cleanQuery));
    this.runtime.preferences.saveAddresses([address]);
    return address;
  }

  async add(): Promise<Address[]> {
    const addresses = await this.browser.withPage({ requireSession: true, headless: false }, async (page) => {
      await startAddAddress(page);
      await input({
        message: "Add or edit the address in the browser, then press Enter here"
      });
      const detectedAddresses = await listAddresses(page);
      return requireDetectedAddressesAfterAddressFlow(detectedAddresses);
    });

    this.runtime.preferences.saveAddresses(addresses);
    return addresses;
  }
}

export function requireDetectedAddressesAfterAddressFlow(addresses: Address[]): Address[] {
  if (addresses.length > 0) {
    return addresses;
  }

  throw new UserFacingError("No Zepto addresses were detected after the address flow.", {
    hint: "Add or select an address in the visible browser before pressing Enter. Rerun with `--debug` if Zepto changed its address UI."
  });
}
