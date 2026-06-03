import type { BrowserAutomationModeStatus, RuntimeOptions } from "../types.js";

export function browserAutomationModeStatus(
  options: Pick<RuntimeOptions, "headless">
): BrowserAutomationModeStatus {
  return {
    default: "background_headless",
    current: options.headless ? "background_headless" : "visible_human_controlled",
    visibleRequested: !options.headless
  };
}
