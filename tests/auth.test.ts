import { describe, expect, it } from "vitest";

import { inferLoginStateFromText } from "../src/automation/auth.js";
import { shouldPreserveExistingSessionAfterLoginFailure } from "../src/services/auth.js";

describe("login state inference", () => {
  it("detects obvious login prompts", () => {
    expect(inferLoginStateFromText("Login Enter mobile number Verify OTP")).toBe("login-required");
  });

  it("detects logged-in account text when login text is absent", () => {
    expect(inferLoginStateFromText("Account My Orders Wallet")).toBe("logged-in");
  });

  it("returns unknown for ambiguous page text", () => {
    expect(inferLoginStateFromText("Search for milk Cart")).toBe("unknown");
  });

  it("preserves a previously marked valid session when a re-login attempt fails", () => {
    expect(
      shouldPreserveExistingSessionAfterLoginFailure({
        hasAuthState: true,
        markedLoggedIn: true
      })
    ).toBe(true);
  });

  it("does not preserve incomplete session state after failed first login", () => {
    expect(
      shouldPreserveExistingSessionAfterLoginFailure({
        hasAuthState: false,
        markedLoggedIn: true
      })
    ).toBe(false);
    expect(
      shouldPreserveExistingSessionAfterLoginFailure({
        hasAuthState: true,
        markedLoggedIn: false
      })
    ).toBe(false);
  });
});
