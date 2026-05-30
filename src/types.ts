export interface RuntimeOptions {
  dataDir?: string;
  debug: boolean;
  headless: boolean;
  interactive: boolean;
  timeoutMs: number;
}

export interface SessionStatus {
  version: string;
  dataDir: string;
  authStatePath: string;
  browserProfileDir: string;
  diagnosticsDir: string;
  browserLock: BrowserRunLockStatus;
  browserAutomation: BrowserAutomationReadiness;
  headlessBrowserThrottle: BrowserRunThrottleStatus;
  accessChallenge: AccessChallengeStatus;
  cache: UserDataCacheStatus;
  hasAuthState: boolean;
  hasBrowserProfileData: boolean;
  markedLoggedIn: boolean;
  confirmedSession: boolean;
  updatedAt?: string;
}

export type LiveSessionState = "skipped" | "logged-in" | "login-required" | "unknown";

export interface LiveSessionStatus {
  checked: boolean;
  state: LiveSessionState;
  checkedAt: string;
  demotedLocalSession: boolean;
  message: string;
  hint?: string;
}

export interface SessionStatusWithLiveCheck extends SessionStatus {
  liveSession: LiveSessionStatus;
}

export interface UserDataCacheStatus {
  searches: number;
  cartSnapshots: number;
  addresses: number;
  orders: number;
}

export interface BrowserRunLockStatus {
  path: string;
  present: boolean;
  stale: boolean;
  pid?: number;
  createdAt?: string;
  staleReason?: BrowserRunLockStaleReason;
}

export type BrowserRunLockStaleReason = "expired" | "process_not_running";

export type BrowserAutomationReadinessReason =
  | "browser_lock_active"
  | "headless_browser_throttle"
  | "zepto_access_cooldown";

export interface BrowserAutomationReadiness {
  ready: boolean;
  reasons: BrowserAutomationReadinessReason[];
  retryAfterMs: number;
  hint?: string;
}

export interface BrowserRunThrottleStatus {
  windowMs: number;
  limit: number;
  recentRuns: number;
  throttleActive: boolean;
  retryAfterMs: number;
}

export interface AccessChallengeStatus {
  detected: boolean;
  lastDetectedAt?: string;
  cooldownActive: boolean;
  retryAfterMs: number;
}

export type DoctorCheckStatus = "pass" | "warn" | "fail";

export interface DoctorCheck {
  name: string;
  status: DoctorCheckStatus;
  message: string;
  hint?: string;
}

export interface DoctorReport {
  ok: boolean;
  version: string;
  generatedAt: string;
  dataDir: string;
  browserLock: BrowserRunLockStatus;
  browserAutomation: BrowserAutomationReadiness;
  headlessBrowserThrottle: BrowserRunThrottleStatus;
  accessChallenge: AccessChallengeStatus;
  checks: DoctorCheck[];
}

export interface Product {
  index: number;
  automationId?: number;
  name: string;
  price?: string;
  mrp?: string;
  unit?: string;
  rating?: string;
  url?: string;
}

export interface CartItem {
  name: string;
  quantity?: string;
  price?: string;
  unit?: string;
}

export interface CartSnapshot {
  items: CartItem[];
  total?: string;
  rawText?: string;
}

export interface Address {
  label?: string;
  text: string;
  selected?: boolean;
}

export interface OrderSnapshot {
  id?: string;
  status?: string;
  eta?: string;
  total?: string;
  placedAt?: string;
  rawText: string;
}

export interface CommandOutputOptions {
  json?: boolean;
}
