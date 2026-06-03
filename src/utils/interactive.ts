import type { AppRuntime } from "../config/runtime.js";
import { UserFacingError } from "./errors.js";

export function requireInteractiveInput(
  runtime: Pick<AppRuntime, "options">,
  message: string,
  hint: string
): void {
  if (runtime.options.interactive) {
    return;
  }

  throw new UserFacingError(message, { code: "interactive_input_required", hint });
}

export function requireVisibleBrowser(
  runtime: Pick<AppRuntime, "options">,
  message: string,
  hint: string
): void {
  if (!runtime.options.headless) {
    return;
  }

  throw new UserFacingError(message, { code: "visible_browser_required", hint });
}
