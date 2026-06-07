import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  withPageCalls: [] as Array<{ options: Record<string, unknown> }>,
  input: vi.fn(async () => ""),
  confirm: vi.fn(async () => true),
  detectCheckoutHandoffMode: vi.fn(async () => undefined),
  openCheckout: vi.fn(async () => ({
    mode: "checkout_or_payment_page" as const,
    cartEvidence: {
      itemCount: 1,
      hasPayableTotal: true
    },
    manualPaymentControlVisible: false
  })),
  startAddAddress: vi.fn(async () => undefined),
  listAddresses: vi.fn(async () => [{ text: "Home: 221B Baker Street", selected: true }]),
  openLoginFlow: vi.fn(async () => undefined),
  detectLoginState: vi.fn(async () => "logged-in"),
  openAccountSurface: vi.fn(async () => undefined),
  getBrowserRunLockStatus: vi.fn(() => ({ path: "browser.lock", present: false, stale: false }))
}));

vi.mock("@inquirer/prompts", () => ({
  input: mocks.input,
  confirm: mocks.confirm
}));

vi.mock("../src/automation/browser.js", () => ({
  assertConfirmedSession: (runtime: { session: { hasConfirmedSession?: () => boolean; status: () => { confirmedSession?: boolean } } }) => {
    if ((runtime.session.hasConfirmedSession?.() ?? runtime.session.status().confirmedSession) === true) {
      return;
    }

    throw Object.assign(new Error("No confirmed Zepto session found."), {
      code: "no_confirmed_session",
      hint: "Run `zepo --visible login` first."
    });
  },
  BrowserAutomation: class {
    async withPage<T>(options: Record<string, unknown>, action: (page: unknown) => Promise<T> | T): Promise<T> {
      mocks.withPageCalls.push({ options });
      return action({});
    }
  },
  getBrowserRunLockStatus: mocks.getBrowserRunLockStatus
}));

vi.mock("../src/automation/checkout.js", () => ({
  detectCheckoutHandoffMode: mocks.detectCheckoutHandoffMode,
  openCheckout: mocks.openCheckout
}));

vi.mock("../src/automation/address.js", () => ({
  listAddresses: mocks.listAddresses,
  startAddAddress: mocks.startAddAddress,
  useAddress: vi.fn(async () => ({ text: "Home: 221B Baker Street", selected: true }))
}));

vi.mock("../src/automation/auth.js", () => ({
  detectLoginState: mocks.detectLoginState,
  openAccountSurface: mocks.openAccountSurface,
  openLoginFlow: mocks.openLoginFlow
}));

vi.mock("../src/utils/prompts.js", () => ({
  promptContext: () => ({})
}));

const { AddressService } = await import("../src/services/addresses.js");
const { AuthService } = await import("../src/services/auth.js");
const { CheckoutService } = await import("../src/services/checkout.js");

describe("human-controlled browser handoff services", () => {
  beforeEach(() => {
    mocks.withPageCalls.length = 0;
    mocks.input.mockClear();
    mocks.confirm.mockClear();
    mocks.detectCheckoutHandoffMode.mockClear();
    mocks.openCheckout.mockClear();
    mocks.startAddAddress.mockClear();
    mocks.listAddresses.mockClear();
    mocks.openLoginFlow.mockClear();
    mocks.detectLoginState.mockClear();
  });

  it("does not open checkout unless a visible browser is explicitly requested", async () => {
    const runtime = createRuntime();

    await expect(new CheckoutService(runtime).checkout()).rejects.toMatchObject({
      code: "visible_browser_required",
      message: "Zepto checkout requires a visible browser."
    });
    expect(mocks.withPageCalls).toEqual([]);
    expect(mocks.openCheckout).not.toHaveBeenCalled();
  });

  it("requires a confirmed session after checkout is explicitly visible", async () => {
    const runtime = createRuntime({ headless: false });

    await expect(new CheckoutService(runtime).checkout()).rejects.toMatchObject({
      code: "no_confirmed_session"
    });
    expect(mocks.withPageCalls).toEqual([]);
    expect(mocks.openCheckout).not.toHaveBeenCalled();
  });

  it("opens checkout in an explicitly visible session browser and saves state after handoff", async () => {
    await new CheckoutService(createRuntime({ confirmedSession: true, headless: false })).checkout();

    expect(mocks.withPageCalls[0]?.options).toMatchObject({
      captureFailures: false,
      requireSession: true,
      headless: false,
      saveState: true
    });
    expect(mocks.openCheckout).toHaveBeenCalledOnce();
    expect(mocks.input).toHaveBeenCalledOnce();
    expect(mocks.detectCheckoutHandoffMode).toHaveBeenCalledOnce();
  });

  it("returns checkout handoff without prompting when the caller only needs JSON evidence", async () => {
    await new CheckoutService(createRuntime({ confirmedSession: true, headless: false })).checkout({
      waitForCompletion: false
    });

    expect(mocks.withPageCalls[0]?.options).toMatchObject({
      captureFailures: false,
      requireSession: true,
      headless: false,
      saveState: true
    });
    expect(mocks.openCheckout).toHaveBeenCalledOnce();
    expect(mocks.input).not.toHaveBeenCalled();
    expect(mocks.detectCheckoutHandoffMode).not.toHaveBeenCalled();
  });

  it("passes explicit cart-limit removal through checkout handoff", async () => {
    await new CheckoutService(createRuntime({ confirmedSession: true, headless: false })).checkout({
      waitForCompletion: false,
      removeLimitItems: true
    });

    expect(mocks.openCheckout).toHaveBeenCalledWith(expect.anything(), {
      removeLimitItems: true
    });
  });

  it("prompts for human Zepto continuation when checkout exposes only a cart-side payment control", async () => {
    mocks.openCheckout.mockResolvedValueOnce({ mode: "manual_payment_control_visible" });

    await new CheckoutService(createRuntime({ confirmedSession: true, headless: false })).checkout();

    expect(mocks.input).toHaveBeenCalledWith(
      expect.objectContaining({
        message: expect.stringContaining("Continue manually in the Zepto browser")
      }),
      expect.anything()
    );
  });

  it("prints checkout payment-link guidance before waiting for human continuation", async () => {
    const stderr = vi.spyOn(console, "error").mockImplementation(() => undefined);

    try {
      await new CheckoutService(createRuntime({ confirmedSession: true, headless: false })).checkout();
      expect(stderr).toHaveBeenCalledWith("Zepto checkout is open in the visible browser. ZepoCli will not click payment/order controls.");
      expect(stderr).toHaveBeenCalledWith("Payment link: https://www.zepto.com/?cart=open");
      expect(stderr).toHaveBeenCalledWith("Payment link session: user_zepto_session_required");
      expect(stderr).toHaveBeenCalledWith("Open in the user's Zepto session; Zepto handles payment.");
    } finally {
      stderr.mockRestore();
    }
  });

  it("returns a refreshed handoff when manual Zepto continuation reaches a checkout surface", async () => {
    mocks.openCheckout.mockResolvedValueOnce({
      mode: "manual_payment_control_visible",
      cartEvidence: {
        itemCount: 2,
        hasPayableTotal: true
      },
      manualPaymentControlVisible: true
    });
    mocks.detectCheckoutHandoffMode.mockResolvedValueOnce({ mode: "checkout_or_payment_page" });

    const result = await new CheckoutService(createRuntime({ confirmedSession: true, headless: false })).checkout();

    expect(result).toEqual({
      mode: "checkout_or_payment_page",
      cartEvidence: {
        itemCount: 2,
        hasPayableTotal: true
      },
      manualPaymentControlVisible: false
    });
    expect(mocks.input).toHaveBeenCalledOnce();
    expect(mocks.detectCheckoutHandoffMode).toHaveBeenCalledOnce();
  });

  it("keeps the original manual handoff when the post-prompt page is not a readable checkout surface", async () => {
    mocks.openCheckout.mockResolvedValueOnce({ mode: "manual_payment_control_visible" });
    mocks.detectCheckoutHandoffMode.mockResolvedValueOnce(undefined);

    const result = await new CheckoutService(createRuntime({ confirmedSession: true, headless: false })).checkout();

    expect(result).toEqual({ mode: "manual_payment_control_visible" });
    expect(mocks.input).toHaveBeenCalledOnce();
    expect(mocks.detectCheckoutHandoffMode).toHaveBeenCalledOnce();
  });

  it("does not open address add unless a visible browser is explicitly requested", async () => {
    const runtime = createRuntime();

    await expect(new AddressService(runtime).add()).rejects.toMatchObject({
      code: "visible_browser_required",
      message: "Zepto address add requires a visible browser."
    });
    expect(mocks.withPageCalls).toEqual([]);
    expect(mocks.startAddAddress).not.toHaveBeenCalled();
  });

  it("requires a confirmed session after address add is explicitly visible", async () => {
    const runtime = createRuntime({ headless: false });

    await expect(new AddressService(runtime).add()).rejects.toMatchObject({
      code: "no_confirmed_session"
    });
    expect(mocks.withPageCalls).toEqual([]);
    expect(mocks.startAddAddress).not.toHaveBeenCalled();
  });

  it("opens address add in an explicitly visible authenticated browser", async () => {
    await new AddressService(createRuntime({ confirmedSession: true, headless: false })).add();

    expect(mocks.withPageCalls[0]?.options).toMatchObject({
      captureFailures: false,
      requireSession: true,
      headless: false
    });
    expect(mocks.startAddAddress).toHaveBeenCalledOnce();
    expect(mocks.input).toHaveBeenCalledOnce();
  });

  it("does not open login unless a visible browser is explicitly requested", async () => {
    const runtime = createRuntime();

    await expect(new AuthService(runtime).login("9876543210")).rejects.toMatchObject({
      code: "visible_browser_required",
      message: "Zepto login requires a visible browser."
    });
    expect(mocks.withPageCalls).toEqual([]);
    expect(mocks.openLoginFlow).not.toHaveBeenCalled();
  });

  it("opens login in an explicitly visible browser and saves the confirmed session", async () => {
    const runtime = createRuntime({ headless: false });

    await new AuthService(runtime).login("9876543210");

    expect(mocks.withPageCalls[0]?.options).toMatchObject({
      captureFailures: false,
      headless: false,
      saveState: true
    });
    expect(mocks.openLoginFlow).toHaveBeenCalledWith(expect.anything(), "9876543210");
    expect(runtime.session.status()).toMatchObject({ confirmedSession: true });
  });
});

function createRuntime(options: { confirmedSession?: boolean; headless?: boolean } = {}) {
  let confirmedSession = options.confirmedSession ?? false;
  return {
    options: {
      headless: options.headless ?? true,
      interactive: true
    },
    session: {
      status: () => ({ confirmedSession }),
      hasConfirmedSession: () => confirmedSession,
      createSnapshot: () => "snapshot",
      restoreSnapshot: () => undefined,
      disposeSnapshot: () => undefined,
      markLoggedIn: () => {
        confirmedSession = true;
      },
      markLoggedOut: () => {
        confirmedSession = false;
      }
    },
    preferences: {
      saveAddresses: vi.fn()
    }
  } as never;
}
