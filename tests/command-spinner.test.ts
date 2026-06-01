import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const spinner = {
    fail: vi.fn(),
    start: vi.fn(),
    succeed: vi.fn()
  };
  spinner.start.mockReturnValue(spinner);

  return {
    ora: vi.fn(() => spinner),
    spinner
  };
});

vi.mock("ora", () => ({
  default: mocks.ora
}));

const { withCommandSpinner } = await import("../src/commands/shared.js");

const originalIsTty = Object.getOwnPropertyDescriptor(process.stderr, "isTTY");

describe("command spinner output", () => {
  beforeEach(() => {
    setStderrTty(true);
    mocks.ora.mockClear();
    mocks.spinner.start.mockClear();
    mocks.spinner.start.mockReturnValue(mocks.spinner);
    mocks.spinner.succeed.mockClear();
    mocks.spinner.fail.mockClear();
  });

  afterEach(() => {
    restoreStderrTty();
  });

  it("redacts sensitive-looking start and success messages", async () => {
    const fakeNpmToken = `npm_${"A".repeat(24)}`;

    await withCommandSpinner(
      `Searching Zepto for "${fakeNpmToken}" near C:\\Users\\parth\\.zepo-live\\trace.txt`,
      () => "Loaded order ZEP1234 for +91 98765 43210.",
      async () => ({ ok: true })
    );

    expect(mocks.ora).toHaveBeenCalledWith(
      'Searching Zepto for "<redacted-npm-token>" near <redacted-local-path>'
    );
    expect(mocks.spinner.succeed).toHaveBeenCalledWith("Loaded order <redacted-order-id> for <redacted-phone>.");
    expect(JSON.stringify(mocks.ora.mock.calls)).not.toContain(fakeNpmToken);
    expect(JSON.stringify(mocks.spinner.succeed.mock.calls)).not.toContain("98765 43210");
    expect(JSON.stringify(mocks.spinner.succeed.mock.calls)).not.toContain("ZEP1234");
  });

  it("redacts sensitive-looking failure spinner messages before rethrowing", async () => {
    await expect(
      withCommandSpinner(
        "Removing card 4111 1111 1111 1111 and abc@upi from ./local-report.json",
        "Removed item.",
        async () => {
          throw new Error("boom");
        }
      )
    ).rejects.toThrow("boom");

    expect(mocks.spinner.fail).toHaveBeenCalledWith(
      "Removing card <redacted-payment-number> and <redacted-payment-handle> from <redacted-local-path>"
    );
    expect(JSON.stringify(mocks.spinner.fail.mock.calls)).not.toContain("4111");
    expect(JSON.stringify(mocks.spinner.fail.mock.calls)).not.toContain("abc@upi");
    expect(JSON.stringify(mocks.spinner.fail.mock.calls)).not.toContain("local-report.json");
  });
});

function setStderrTty(value: boolean): void {
  Object.defineProperty(process.stderr, "isTTY", {
    configurable: true,
    value
  });
}

function restoreStderrTty(): void {
  if (originalIsTty) {
    Object.defineProperty(process.stderr, "isTTY", originalIsTty);
    return;
  }

  delete (process.stderr as NodeJS.WriteStream & { isTTY?: boolean }).isTTY;
}
