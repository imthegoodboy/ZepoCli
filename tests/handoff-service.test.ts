import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  withPageCalls: [] as Array<{ options: Record<string, unknown> }>,
  input: vi.fn(async () => ""),
  confirm: vi.fn(async () => true),
  openCheckout: vi.fn(async () => undefined),
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
  BrowserAutomation: class {
    async withPage<T>(options: Record<string, unknown>, action: (page: unknown) => Promise<T> | T): Promise<T> {
      mocks.withPageCalls.push({ options });
      return action({});
    }
  },
  getBrowserRunLockStatus: mocks.getBrowserRunLockStatus
}));

vi.mock("../src/automation/checkout.js", () => ({
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
    mocks.openCheckout.mockClear();
    mocks.startAddAddress.mockClear();
    mocks.listAddresses.mockClear();
    mocks.openLoginFlow.mockClear();
    mocks.detectLoginState.mockClear();
  });

  it("opens checkout in a visible session browser and saves state after handoff", async () => {
    await new CheckoutService(createRuntime()).checkout();

    expect(mocks.withPageCalls[0]?.options).toMatchObject({
      captureFailures: false,
      requireSession: true,
      headless: false,
      saveState: true
    });
    expect(mocks.openCheckout).toHaveBeenCalledOnce();
    expect(mocks.input).toHaveBeenCalledOnce();
  });

  it("opens address add in a visible authenticated browser", async () => {
    await new AddressService(createRuntime()).add();

    expect(mocks.withPageCalls[0]?.options).toMatchObject({
      captureFailures: false,
      requireSession: true,
      headless: false
    });
    expect(mocks.startAddAddress).toHaveBeenCalledOnce();
    expect(mocks.input).toHaveBeenCalledOnce();
  });

  it("opens login in a visible browser and saves the confirmed session", async () => {
    const runtime = createRuntime();

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

function createRuntime() {
  let confirmedSession = false;
  return {
    options: {
      interactive: true
    },
    session: {
      status: () => ({ confirmedSession }),
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
