import { describe, expect, it } from "vitest";

import { inferLoginStateFromText } from "../src/automation/auth.js";

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
});
