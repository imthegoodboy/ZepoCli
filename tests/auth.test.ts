import { describe, expect, it } from "vitest";

import {
  ACCOUNT_SURFACE_CLICK_LABELS,
  PHONE_PREFILL_INPUT_SELECTOR,
  clickAccountSurfaceButton,
  detectLoginState,
  inferLoginStateFromText,
  isAccountSurfaceClickText,
  isUnsafeAccountSurfaceClickText,
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
      bodyText: "Account My Orders Wallet Profile",
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

    for (const label of ["Login to continue checkout", "My Orders", "Cart", "Delivering to Home"]) {
      expect(isUnsafeAccountSurfaceClickText(label)).toBe(true);
    }
  });

  it("does not click disabled account or login controls", async () => {
    const page = createDisabledAccountSurfacePage();

    await expect(clickAccountSurfaceButton(page as never)).resolves.toBe(false);

    expect(page.clicked).toBe(false);
  });

  it("does not click account or login controls when any visible or accessible label is unsafe", async () => {
    for (const page of [createMixedLabelAccountSurfacePage("Checkout", "Login"), createMixedLabelAccountSurfacePage("Account", "My Orders")]) {
      await expect(clickAccountSurfaceButton(page as never)).resolves.toBe(false);

      expect(page.clicked).toBe(false);
    }
  });

  it("prefills phone only into explicit phone or mobile fields", () => {
    expect(PHONE_PREFILL_INPUT_SELECTOR).toContain("input[type='tel']");
    expect(PHONE_PREFILL_INPUT_SELECTOR).toContain("phone");
    expect(PHONE_PREFILL_INPUT_SELECTOR).toContain("mobile");
    expect(PHONE_PREFILL_INPUT_SELECTOR).not.toContain("input[inputmode='numeric']");
    expect(PHONE_PREFILL_INPUT_SELECTOR).not.toContain("otp");
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

function createMixedLabelAccountSurfacePage(text: string, ariaLabel: string) {
  const page = {
    clicked: false,
    getByRole: (role: string, options: { name?: RegExp | string } = {}) => {
      if (
        role === "button" &&
        (matchesLocatorName(options.name, text) || matchesLocatorName(options.name, ariaLabel))
      ) {
        return createVisibleLocator(text, async () => {
          page.clicked = true;
        }, { "aria-label": ariaLabel });
      }

      return createHiddenLocator();
    },
    locator: () => createHiddenLocator()
  };

  return page;
}

function createLoginFlowPage(attributes: Record<string, string | null> = {}) {
  const phone = createPhoneInputLocator(attributes);
  const page = {
    goto: async () => null,
    waitForLoadState: async () => undefined,
    waitForTimeout: async () => undefined,
    title: async () => "Zepto",
    getByRole: () => createHiddenLocator(),
    locator: (selector: string) => {
      if (selector === PHONE_PREFILL_INPUT_SELECTOR) {
        return phone;
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
  const phoneInput = {
    first() {
      return this;
    },
    isVisible: async () => options.phoneInputVisible
  };

  return {
    locator: (selector: string) => {
      if (selector === "body") {
        return createBodyLocator(options.bodyText);
      }

      if (selector.includes("input[type='tel']")) {
        return phoneInput;
      }

      return createHiddenLocator();
    }
  };
}

function createPhoneInputLocator(attributes: Record<string, string | null>) {
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
    isVisible: async () => true,
    innerText: async () => "",
    getAttribute: async (name: string) => attributes[name] ?? null,
    evaluate: async () => {
      state.evaluateCalls += 1;
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
