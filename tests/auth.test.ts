import { describe, expect, it } from "vitest";

import { inferLoginStateFromText } from "../src/automation/auth.js";
import { assertSavedLoginSession, shouldPreserveExistingSessionAfterLoginFailure } from "../src/services/auth.js";

describe("login state inference", () => {
  it("detects obvious login prompts", () => {
    expect(inferLoginStateFromText("Login Enter mobile number Verify OTP")).toBe("login-required");
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
});
