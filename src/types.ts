export interface RuntimeOptions {
  dataDir?: string;
  debug: boolean;
  headless: boolean;
  timeoutMs: number;
}

export interface SessionStatus {
  dataDir: string;
  authStatePath: string;
  browserProfileDir: string;
  diagnosticsDir: string;
  hasAuthState: boolean;
  hasBrowserProfileData: boolean;
  markedLoggedIn: boolean;
  updatedAt?: string;
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
