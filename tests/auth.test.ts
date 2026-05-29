import { describe, expect, it } from "vitest";

import {
  ACCOUNT_SURFACE_CLICK_LABELS,
  PHONE_PREFILL_INPUT_SELECTOR,
  clickAccountSurfaceButton,
  detectLoginState,
  findPhonePrefillInput,
  hasVisibleLoginFormInput,
  inferLoginStateFromText,
  isAccountSurfaceClickText,
  isPhonePrefillInputText,
  isUnsafeAccountSurfaceClickText,
  isUnsafePhonePrefillInputText,
  openLoginFlow
} from "../src/automation/auth.js";
import { loginOutput } from "../src/commands/login.js";
import {
  assertNoActiveBrowserRunLockForLogout,
  assertSavedLoginSession,
  liveSessionStatusFromLoginState,
  normalizeLoginPhone,
  shouldPreserveExistingSessionAfterLoginFailure
} from "../src/services/auth.js";

describe("login state inference", () => {
  it("detects obvious login prompts", () => {
    expect(inferLoginStateFromText("Login Enter mobile number Verify OTP")).toBe("login-required");
    expect(inferLoginStateFromText("Log in to continue Checkout")).toBe("login-required");
    expect(inferLoginStateFromText("Login / Sign Up Continue with phone")).toBe("login-required");
    expect(inferLoginStateFromText("Verify mobile number to continue")).toBe("login-required");
  });

  it("detects logged-in account text when login text is absent", () => {
    expect(inferLoginStateFromText("Account My Orders Wallet")).toBe("logged-in");
    expect(inferLoginStateFromText("Profile Wallet")).toBe("logged-in");
    expect(inferLoginStateFromText("Account My Orders Wallet Phone number")).toBe("logged-in");
    expect(inferLoginStateFromText("Profile Wallet Mobile number")).toBe("logged-in");
    expect(inferLoginStateFromText("Log out")).toBe("logged-in");
  });

  it("returns unknown for ambiguous page text", () => {
    expect(inferLoginStateFromText("Search for milk Cart")).toBe("unknown");
  });

  it("does not accept generic account navigation as logged in", () => {
    expect(inferLoginStateFromText("Search for milk Cart Account Profile")).toBe("unknown");
    expect(inferLoginStateFromText("My Orders")).toBe("unknown");
    expect(inferLoginStateFromText("Order History")).toBe("unknown");
  });

  it("does not accept account-only words when login prompts are still visible", () => {
    expect(inferLoginStateFromText("Account Wallet Login to continue")).toBe("login-required");
    expect(inferLoginStateFromText("Profile My Orders Verify OTP")).toBe("login-required");
  });

  it("does not treat logged-in account pages with phone fields as login-required", async () => {
    const page = createLoginStatePage({
      bodyText: "Account My Orders Wallet Profile Phone number",
      phoneInputVisible: true
    });

    await expect(detectLoginState(page as never)).resolves.toBe("logged-in");
  });

  it("uses visible phone or numeric inputs as login-required evidence only when page text is ambiguous", async () => {
    const page = createLoginStatePage({
      bodyText: "Zepto",
      phoneInputVisible: true
    });

    await expect(detectLoginState(page as never)).resolves.toBe("login-required");
  });

  it("clicks only explicit account or login controls", () => {
    for (const label of ["Account", "Profile", "Login", "Log In", "Sign In", "Login / Sign Up"]) {
      expect(ACCOUNT_SURFACE_CLICK_LABELS.some((pattern) => pattern.test(label))).toBe(true);
      expect(isAccountSurfaceClickText(label)).toBe(true);
    }

    for (const label of ["Login to continue checkout", "Account settings are secure", "My Orders", "Search account products"]) {
      expect(ACCOUNT_SURFACE_CLICK_LABELS.some((pattern) => pattern.test(label))).toBe(false);
      expect(isAccountSurfaceClickText(label)).toBe(false);
    }

    for (const label of [
      "Login to continue checkout",
      "Continue with phone",
      "Verify OTP",
      "Next",
      "Submit",
      "My Orders",
      "Cart",
      "Delivering to Home",
      "UPI",
      "Credit Card",
      "Cash on Delivery",
      "COD",
      "PhonePe",
      "Google Pay",
      "BHIM",
      "Wallet"
    ]) {
      expect(isUnsafeAccountSurfaceClickText(label)).toBe(true);
    }
  });

  it("does not click disabled account or login controls", async () => {
    const page = createDisabledAccountSurfacePage();

    await expect(clickAccountSurfaceButton(page as never)).resolves.toBe(false);

    expect(page.clicked).toBe(false);
  });

  it("does not click account or login controls when any visible or accessible label is unsafe", async () => {
    for (const page of [
      createMixedLabelAccountSurfacePage("Checkout", "Login"),
      createMixedLabelAccountSurfacePage("Continue", "Login"),
      createMixedLabelAccountSurfacePage("UPI", "Login"),
      createMixedLabelAccountSurfacePage("Login", "Login", { title: "Checkout" }),
      createMixedLabelAccountSurfacePage("Account", "Account", { "aria-description": "Cash on Delivery" }),
      createMixedLabelAccountSurfacePage("Account", "My Orders")
    ]) {
      await expect(clickAccountSurfaceButton(page as never)).resolves.toBe(false);

      expect(page.clicked).toBe(false);
    }
  });

  it("prefills phone only into explicit phone or mobile fields", () => {
    expect(PHONE_PREFILL_INPUT_SELECTOR).toContain("input[type='tel']");
    expect(PHONE_PREFILL_INPUT_SELECTOR).toContain("autocomplete='tel'");
    expect(PHONE_PREFILL_INPUT_SELECTOR).toContain("phone");
    expect(PHONE_PREFILL_INPUT_SELECTOR).toContain("mobile");
    expect(PHONE_PREFILL_INPUT_SELECTOR).not.toContain("input[inputmode='numeric']");
    expect(PHONE_PREFILL_INPUT_SELECTOR).not.toContain("otp");

    for (const label of ["Phone number", "Mobile", "MobileNumber", "Telephone"]) {
      expect(isPhonePrefillInputText(label)).toBe(true);
      expect(isUnsafePhonePrefillInputText(label)).toBe(false);
    }

    for (const label of [
      "Verify OTP",
      "One time code",
      "Search phone",
      "Payment phone",
      "UPI phone",
      "Phone UPI",
      "Credit Card Phone",
      "Cash on Delivery phone",
      "COD phone",
      "Wallet phone"
    ]) {
      expect(isUnsafePhonePrefillInputText(label)).toBe(true);
    }
  });

  it("prefills phone only when the explicit phone field is editable", async () => {
    const editable = createLoginFlowPage();
    await openLoginFlow(editable.page as never, "9876543210");

    expect(editable.phone.fillValues).toEqual([""]);
    expect(editable.phone.typedValues).toEqual(["9876543210"]);

    const disabled = createLoginFlowPage({ disabled: "" });
    await openLoginFlow(disabled.page as never, "9876543210");

    expect(disabled.phone.fillValues).toEqual([]);
    expect(disabled.phone.typedValues).toEqual([]);

    const readonly = createLoginFlowPage({ readonly: "" });
    await openLoginFlow(readonly.page as never, "9876543210");

    expect(readonly.phone.fillValues).toEqual([]);
    expect(readonly.phone.typedValues).toEqual([]);
  });

  it("finds phone prefill fields from referenced accessible labels", async () => {
    const referenced = createLoginInputDiscoveryPage([
      createPhoneInputLocator(
        {
          "aria-labelledby": "phone-label"
        },
        { "phone-label": "Mobile number" }
      )
    ]);

    await expect(findPhonePrefillInput(referenced as never)).resolves.toBe(referenced.inputs[0]);
  });

  it("does not prefill unsafe or bare numeric fields", async () => {
    const unsafe = createLoginInputDiscoveryPage([
      createPhoneInputLocator({
        type: "tel",
        "aria-label": "Verify OTP"
      }),
      createPhoneInputLocator({
        type: "tel",
        "aria-label": "Phone UPI"
      }),
      createPhoneInputLocator({
        type: "number"
      })
    ]);

    await expect(findPhonePrefillInput(unsafe as never)).resolves.toBeUndefined();
  });

  it("treats labeled login inputs, but not bare numeric fields, as login form evidence", async () => {
    const otp = createLoginInputDiscoveryPage([
      createPhoneInputLocator({
        type: "number",
        "aria-label": "OTP"
      })
    ]);
    const bareNumeric = createLoginInputDiscoveryPage([
      createPhoneInputLocator({
        type: "number"
      })
    ]);

    await expect(hasVisibleLoginFormInput(otp as never)).resolves.toBe(true);
    await expect(hasVisibleLoginFormInput(bareNumeric as never)).resolves.toBe(false);
  });

  it("does not treat unsafe phone-like fields as login form evidence", async () => {
    for (const page of [
      createLoginInputDiscoveryPage([
        createPhoneInputLocator({
          type: "tel",
          "aria-label": "Phone UPI"
        })
      ]),
      createLoginInputDiscoveryPage([
        createPhoneInputLocator({
          type: "tel",
          "aria-label": "Checkout phone"
        })
      ]),
      createLoginInputDiscoveryPage([
        createPhoneInputLocator({
          type: "text",
          placeholder: "Phone number",
          "aria-description": "Cash on Delivery"
        })
      ])
    ]) {
      await expect(hasVisibleLoginFormInput(page as never)).resolves.toBe(false);
    }
  });

  it("preserves a previously marked valid session when a re-login attempt fails", () => {
    expect(
      shouldPreserveExistingSessionAfterLoginFailure({
        confirmedSession: true
      })
    ).toBe(true);
  });

  it("does not preserve incomplete session state after failed first login", () => {
    expect(
      shouldPreserveExistingSessionAfterLoginFailure({
        confirmedSession: false
      })
    ).toBe(false);
  });

  it("accepts a login flow only when saved session state is confirmed", () => {
    expect(() => assertSavedLoginSession({ confirmedSession: true })).not.toThrow();
    expect(() => assertSavedLoginSession({ confirmedSession: false })).toThrow(
      "Zepto login finished, but no usable local session was saved."
    );
  });

  it("reports login success with confirmed-session next steps", () => {
    expect(loginOutput()).toEqual({
      status: "session_saved",
      sessionSaved: true,
      confirmedSession: true,
      next: "Run `zepo status --live --json` before account-dependent commands."
    });
  });

  it("refuses logout while a browser command owns the profile lock", () => {
    expect(() =>
      assertNoActiveBrowserRunLockForLogout({
        path: "browser.lock",
        present: true,
        stale: false
      })
    ).toThrow("Another ZepoCli browser command is already running for this data directory.");

    expect(() =>
      assertNoActiveBrowserRunLockForLogout({
        path: "browser.lock",
        present: true,
        stale: true
      })
    ).not.toThrow();
  });

  it("demotes the local login marker when live Zepto status requires login again", () => {
    let markedLoggedOut = false;
    const status = liveSessionStatusFromLoginState("login-required", {
      session: {
        markLoggedOut: () => {
          markedLoggedOut = true;
        }
      }
    } as never);

    expect(markedLoggedOut).toBe(true);
    expect(status).toMatchObject({
      checked: true,
      state: "login-required",
      demotedLocalSession: true,
      message: "Zepto asked for login or OTP again; the local session marker was demoted."
    });
  });

  it("keeps the local login marker when live Zepto status is verified or ambiguous", () => {
    let markedLoggedOut = false;
    const runtime = {
      session: {
        markLoggedOut: () => {
          markedLoggedOut = true;
        }
      }
    } as never;

    expect(liveSessionStatusFromLoginState("logged-in", runtime)).toMatchObject({
      checked: true,
      state: "logged-in",
      demotedLocalSession: false
    });
    expect(liveSessionStatusFromLoginState("unknown", runtime)).toMatchObject({
      checked: true,
      state: "unknown",
      demotedLocalSession: false
    });
    expect(markedLoggedOut).toBe(false);
  });

  it("normalizes supported Indian mobile formats before browser login", () => {
    expect(normalizeLoginPhone(undefined)).toBeUndefined();
    expect(normalizeLoginPhone("9876543210")).toBe("9876543210");
    expect(normalizeLoginPhone("+91 98765 43210")).toBe("9876543210");
    expect(normalizeLoginPhone("09876543210")).toBe("9876543210");
  });

  it("rejects invalid phone prefill before browser login", () => {
    expect(() => normalizeLoginPhone("12345")).toThrow("Phone number must be a valid 10-digit Indian mobile number.");
    expect(() => normalizeLoginPhone("5555555555")).toThrow("Phone number must be a valid 10-digit Indian mobile number.");
    expect(() => normalizeLoginPhone("not a phone")).toThrow(
      "Phone number must be a valid 10-digit Indian mobile number."
    );
  });
});

function createDisabledAccountSurfacePage() {
  const page = {
    clicked: false,
    getByRole: (role: string, options: { name?: RegExp | string } = {}) => {
      if (role === "button" && matchesLocatorName(options.name, "Login")) {
        return createVisibleLocator("Login", async () => {
          page.clicked = true;
        }, { "aria-disabled": "true" });
      }

      return createHiddenLocator();
    },
    locator: () => createHiddenLocator()
  };

  return page;
}

function createMixedLabelAccountSurfacePage(
  text: string,
  ariaLabel: string,
  attributes: Record<string, string | null> = {}
) {
  const page = {
    clicked: false,
    getByRole: (role: string, options: { name?: RegExp | string } = {}) => {
      if (
        role === "button" &&
        (matchesLocatorName(options.name, text) || matchesLocatorName(options.name, ariaLabel))
      ) {
        return createVisibleLocator(text, async () => {
          page.clicked = true;
        }, { "aria-label": ariaLabel, ...attributes });
      }

      return createHiddenLocator();
    },
    locator: () => createHiddenLocator()
  };

  return page;
}

function createLoginFlowPage(attributes: Record<string, string | null> = {}) {
  const phone = createPhoneInputLocator({ type: "tel", ...attributes });
  const page = {
    goto: async () => null,
    waitForLoadState: async () => undefined,
    waitForTimeout: async () => undefined,
    title: async () => "Zepto",
    getByRole: () => createHiddenLocator(),
    locator: (selector: string) => {
      if (selector === PHONE_PREFILL_INPUT_SELECTOR) {
        return createLocatorCollection([phone]);
      }

      if (selector === "body") {
        return createBodyLocator("Zepto");
      }

      return createHiddenLocator();
    }
  };

  return { page, phone };
}

function createLoginStatePage(options: { bodyText: string; phoneInputVisible: boolean }) {
  const phoneInput = createPhoneInputLocator({ type: "tel" }, {}, options.phoneInputVisible);

  return {
    locator: (selector: string) => {
      if (selector === "body") {
        return createBodyLocator(options.bodyText);
      }

      if (selector.includes("input[type='tel']")) {
        return createLocatorCollection(options.phoneInputVisible ? [phoneInput] : []);
      }

      return createHiddenLocator();
    }
  };
}

function createLoginInputDiscoveryPage(inputs: ReturnType<typeof createPhoneInputLocator>[]) {
  return {
    inputs,
    locator: (selector: string) => {
      const directInputs = inputs.filter((input) => input.direct);
      if (selector.includes("name*='phone'") || selector.includes("autocomplete='one-time-code'")) {
        return createLocatorCollection(directInputs);
      }

      if (selector.includes("input:not([type])")) {
        return createLocatorCollection(inputs);
      }

      return createLocatorCollection([]);
    }
  };
}

function createLocatorCollection<T>(items: T[]) {
  return {
    first: () => items[0] ?? createHiddenLocator(),
    filter: () => createLocatorCollection([]),
    count: async () => items.length,
    nth: (index: number) => items[index] ?? createHiddenLocator()
  };
}

function createPhoneInputLocator(
  attributes: Record<string, string | null>,
  referencedLabels: Record<string, string> = {},
  visible = true
) {
  const state = {
    fillValues: [] as string[],
    typedValues: [] as string[],
    evaluateCalls: 0
  };

  return {
    fillValues: state.fillValues,
    typedValues: state.typedValues,
    first() {
      return this;
    },
    filter() {
      return createHiddenLocator();
    },
    direct:
      attributes.type === "tel" ||
      /\btel(?:-\w+)?\b/i.test(attributes.autocomplete ?? "") ||
      /phone|mobile/i.test(`${attributes.name ?? ""} ${attributes.id ?? ""}`) ||
      /phone|mobile/i.test(`${attributes.placeholder ?? ""} ${attributes["aria-label"] ?? ""}`) ||
      /otp|verification code/i.test(`${attributes.placeholder ?? ""} ${attributes["aria-label"] ?? ""}`) ||
      /\bone-time-code\b/i.test(attributes.autocomplete ?? ""),
    isVisible: async () => visible,
    innerText: async () => "",
    getAttribute: async (name: string) => attributes[name] ?? null,
    evaluate: async (fn?: unknown) => {
      const source = String(fn ?? "");
      if (source.includes("aria-labelledby") || source.includes("aria-describedby")) {
        return `${attributes["aria-labelledby"] ?? ""} ${attributes["aria-describedby"] ?? ""}`
          .split(/\s+/)
          .map((id) => id.trim())
          .filter(Boolean)
          .map((id) => referencedLabels[id] ?? "")
          .filter(Boolean);
      }

      state.evaluateCalls += 1;
      if (source.includes("hasDisabledState") || source.includes("HTMLButtonElement")) {
        return false;
      }

      if (source.includes("HTMLInputElement")) {
        return attributes.disabled === undefined && attributes.readonly === undefined;
      }

      return state.evaluateCalls > 1 && attributes.disabled === undefined && attributes.readonly === undefined;
    },
    fill: async (value: string) => {
      state.fillValues.push(value);
    },
    pressSequentially: async (value: string) => {
      state.typedValues.push(value);
    },
    click: async () => undefined
  };
}

function createBodyLocator(text: string) {
  return {
    first() {
      return this;
    },
    filter() {
      return createHiddenLocator();
    },
    isVisible: async () => true,
    innerText: async () => text,
    getAttribute: async () => null,
    evaluate: async () => false,
    click: async () => undefined
  };
}

function createVisibleLocator(
  text: string,
  click: () => Promise<void>,
  attributes: Record<string, string | null> = {}
) {
  return {
    first() {
      return this;
    },
    filter() {
      return createHiddenLocator();
    },
    isVisible: async () => true,
    innerText: async () => text,
    getAttribute: async (name: string) => attributes[name] ?? null,
    evaluate: async () => false,
    click
  };
}

function createHiddenLocator() {
  return {
    first() {
      return this;
    },
    filter() {
      return this;
    },
    isVisible: async () => false,
    innerText: async () => "",
    getAttribute: async () => null,
    evaluate: async () => false,
    click: async () => undefined
  };
}

function matchesLocatorName(name: RegExp | string | undefined, text: string): boolean {
  if (name instanceof RegExp) {
    return name.test(text);
  }

  return name === text;
}
