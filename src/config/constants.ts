export const APP_NAME = "zepo";
export const BASE_URL = "https://www.zepto.com";
export const ZEPTO_CHECKOUT_HANDOFF_URL = `${BASE_URL}/?cart=open` as const;
export const CHECKOUT_PAYMENT_LINK_SESSION = "user_zepto_session_required" as const;
export const CHECKOUT_AUTOMATION_BOUNDARY = "zepocli_did_not_click_payment_or_order_controls" as const;
export const CHECKOUT_COMMAND = "zepo --visible checkout" as const;
export const CHECKOUT_WAIT_COMMAND = "zepo --visible checkout --wait" as const;
export const DEFAULT_TIMEOUT_MS = 60_000;
export const DEFAULT_PRODUCT_LIMIT = 10;
export const DEFAULT_BROWSER_LOCALE = "en-IN";
export const DEFAULT_BROWSER_TIMEZONE = "Asia/Kolkata";
export const DEFAULT_BROWSER_VIEWPORT = {
  width: 1366,
  height: 900
} as const;
export const STORAGE_STATE_FILE = "auth-state.json";
export const BROWSER_PROFILE_DIR = "browser-profile";
export const SQLITE_FILE = "zepo.sqlite";
export const LOG_FILE = "zepo.log";
