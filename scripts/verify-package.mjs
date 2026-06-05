import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { sanitizedChildEnv } from "./env-utils.mjs";

const rootDir = resolve(import.meta.dirname, "..");
const packageJson = JSON.parse(readFileSync(resolve(rootDir, "package.json"), "utf8"));
const npmExecPath = process.env.npm_execpath;
const INSTALLED_CLI_COMMAND_TIMEOUT_MS = 120_000;
const INSTALLED_HELPER_COMMAND_TIMEOUT_MS = 15_000;
const NPM_COMMAND_TIMEOUT_MS = 180_000;
const FAKE_NPM_TOKEN = `npm_${"A".repeat(24)}`;
class InstalledFakeElement {
  parentElement = null;
  children = [];
  disabled = false;

  constructor(textContent, attributes = {}, ownerDocument = { getElementById: () => null }) {
    this.textContent = textContent;
    this.attributes = attributes;
    this.ownerDocument = ownerDocument;
  }

  get innerText() {
    return this.textContent;
  }

  appendChild(child) {
    child.parentElement = this;
    this.children.push(child);
  }

  getAttribute(name) {
    return this.attributes[name] ?? null;
  }

  setAttribute(name, value) {
    this.attributes[name] = value;
  }

  hasAttribute(name) {
    return this.attributes[name] !== undefined;
  }

  getBoundingClientRect() {
    return {
      width: 24,
      height: 24
    };
  }

  querySelector(selector) {
    return this.querySelectorAll(selector)[0] ?? null;
  }

  querySelectorAll(selector) {
    if (selector !== "img[alt]") {
      return [];
    }

    return this.children.filter((child) => child.getAttribute("alt") !== null);
  }

  closest() {
    return null;
  }
}

const tempRoot = mkdtempSync(join(tmpdir(), "zepo-package-smoke-"));
const packDir = join(tempRoot, "pack");
const installDir = join(tempRoot, "install");
const dataDir = join(tempRoot, "data");
const accountDependentNoSessionCommands = [
  {
    name: "add",
    args: ["add", "milk", "--json"]
  },
  {
    name: "cart",
    args: ["cart", "--json"]
  },
  {
    name: "remove",
    args: ["remove", "milk", "--json"]
  },
  {
    name: "clear",
    args: ["clear", "--json"]
  },
  {
    name: "address list",
    args: ["address", "list", "--json"]
  },
  {
    name: "address use",
    args: ["address", "use", "home", "--json"]
  },
  {
    name: "track",
    args: ["track", "--json"]
  },
  {
    name: "history",
    args: ["history", "--json"]
  },
  {
    name: "reorder last",
    args: ["reorder", "last", "--json"]
  }
];

try {
  mkdirSync(packDir, { recursive: true });

  runNpm(packagePackArgs(), { cwd: rootDir });

  const tarballs = readdirSync(packDir).filter((entry) => entry.endsWith(".tgz"));
  assert(tarballs.length === 1, `expected one packed tarball, found ${tarballs.length}`);

  const tarballPath = join(packDir, tarballs[0]);
  console.log(`packed ${basename(tarballPath)}`);

  runNpm(["install", "--prefix", installDir, tarballPath, "--omit=dev", "--no-audit", "--no-fund", "--prefer-offline"], {
    cwd: rootDir
  });

  const zepoBin = resolveInstalledBin(installDir, "zepo");
  assert(existsSync(zepoBin), `expected installed zepo binary at ${zepoBin}`);

  const installedCliPath = verifyInstalledCliEntryContract(installDir);
  verifyInstalledBinShim(zepoBin);
  verifyInstalledReadmeContract(installDir);
  await verifyInstalledEnvSanitizerContract(installDir);
  await verifyInstalledBrowserDiagnosticsContract(installDir);
  verifyInstalledBackgroundAutomationModeContract(installDir);
  await verifyInstalledPaymentLabelContract(installDir);
  await verifyInstalledFinalActionLabelContract(installDir);
  await verifyInstalledOrderActionLabelContract(installDir);
  await verifyInstalledAuthAutomationContract(installDir);
  await verifyInstalledCheckoutHandoffContract(installDir);
  await verifyInstalledCartAutomationContract(installDir);
  await verifyInstalledProductAutomationContract(installDir);
  await verifyInstalledOrderExtractionContract(installDir);
  await verifyInstalledOrderAutomationContract(installDir);
  await verifyInstalledAddressAutomationContract(installDir);
  await verifyInstalledSessionContract(installDir);
  await verifyInstalledLiveVerifierContract(installDir);
  const runtimeModules = await loadInstalledRuntimeModules(installDir);
  verifyInstalledCli(installedCliPath, runtimeModules);
} finally {
  removeTree(tempRoot);
}

function verifyInstalledCliEntryContract(prefixDir) {
  const packageDir = join(prefixDir, "node_modules", packageJson.name);
  const installedPackageJson = JSON.parse(readFileSync(join(packageDir, "package.json"), "utf8"));
  const installedCliPath = join(packageDir, "dist", "index.js");
  const installedCleanDistPath = join(packageDir, "scripts", "clean-dist.mjs");
  const installedNormalizeCliEntryPath = join(packageDir, "scripts", "normalize-cli-entry.mjs");
  const installedVerifyDependenciesPath = join(packageDir, "scripts", "verify-dependencies.mjs");
  const installedVerifyCliPath = join(packageDir, "scripts", "verify-cli.mjs");
  const installedVerifyPackagePath = join(packageDir, "scripts", "verify-package.mjs");
  const installedEnvUtilsPath = join(packageDir, "scripts", "env-utils.mjs");
  const installedVerifySecretsPath = join(packageDir, "scripts", "verify-secrets.mjs");
  const installedVerifyLiveFlowPath = join(packageDir, "scripts", "verify-live-flow.mjs");
  const installedVerifyLiveReportPath = join(packageDir, "scripts", "verify-live-report.mjs");
  const installedEnvExamplePath = join(packageDir, ".env.example");
  const installedNpmrcExamplePath = join(packageDir, ".npmrc.example");

  assert(installedPackageJson.bin?.zepo === "dist/index.js", "expected installed package bin zepo entry");
  assert(
    installedPackageJson.scripts?.build?.includes("node scripts/clean-dist.mjs"),
    "expected installed build script to clean dist"
  );
  assert(
    installedPackageJson.scripts?.["verify:secrets"] === "node scripts/verify-secrets.mjs",
    "expected installed verify:secrets package script"
  );
  assert(
    installedPackageJson.scripts?.["verify:dependencies"] === "node scripts/verify-dependencies.mjs",
    "expected installed verify:dependencies package script"
  );
  assert(
    installedPackageJson.scripts?.["verify:cli"] === "node scripts/verify-cli.mjs",
    "expected installed verify:cli package script"
  );
  assert(
    installedPackageJson.scripts?.["verify:package"] === "node scripts/verify-package.mjs",
    "expected installed verify:package package script"
  );
  assert(
    installedPackageJson.scripts?.["verify:live"] === "node scripts/verify-live-flow.mjs",
    "expected installed verify:live package script"
  );
  assert(
    installedPackageJson.scripts?.["verify:live:report"] === "node scripts/verify-live-report.mjs",
    "expected installed verify:live:report package script"
  );
  assert(
    installedPackageJson.scripts?.["verify:publish-dry-run"] === "npm publish --dry-run --access public",
    "expected installed verify:publish-dry-run package script"
  );
  assert(
    installedPackageJson.scripts?.build?.includes("node scripts/normalize-cli-entry.mjs"),
    "expected installed build script to normalize the CLI entry"
  );
  assert(existsSync(installedCliPath), "expected installed dist/index.js");
  assert(existsSync(installedCleanDistPath), "expected installed clean-dist script");
  assert(existsSync(installedNormalizeCliEntryPath), "expected installed normalize-cli-entry script");
  assert(existsSync(installedVerifyDependenciesPath), "expected installed verify-dependencies script");
  assert(existsSync(installedVerifyCliPath), "expected installed verify-cli script");
  assert(existsSync(installedVerifyPackagePath), "expected installed verify-package script");
  assert(existsSync(installedEnvUtilsPath), "expected installed env sanitizer script");
  assert(existsSync(installedVerifySecretsPath), "expected installed verify-secrets script");
  assert(existsSync(installedVerifyLiveFlowPath), "expected installed live verifier runner");
  assert(existsSync(installedVerifyLiveReportPath), "expected installed live report acceptance validator");
  assert(existsSync(installedEnvExamplePath), "expected installed .env.example");
  assert(existsSync(installedNpmrcExamplePath), "expected installed .npmrc.example");
  assert(
    readFileSync(installedEnvExamplePath, "utf8").includes("NPM_TOKEN="),
    "expected installed .env.example to document NPM_TOKEN placeholder"
  );
  assert(
    readFileSync(installedNpmrcExamplePath, "utf8").includes("${NPM_TOKEN}"),
    "expected installed .npmrc.example to reference NPM_TOKEN placeholder"
  );
  const installedVerifySecretsSource = readFileSync(installedVerifySecretsPath, "utf8");
  assert(
    installedVerifySecretsSource.includes('name === ".zepto"') &&
      installedVerifySecretsSource.includes('name.startsWith(".zepto-")'),
    "expected installed verify:secrets to skip service-spelled local runtime data directories"
  );
  const serviceSpelledRuntimeDir = join(packageDir, ".zepto-secret-scan-fixture");
  try {
    mkdirSync(serviceSpelledRuntimeDir, { recursive: true });
    writeFileSync(join(serviceSpelledRuntimeDir, "session.js"), `export const fixture = "${FAKE_NPM_TOKEN}";\n`);
    runNpm(["run", "--prefix", packageDir, "verify:secrets", "--silent"], { cwd: rootDir });
  } finally {
    removeTree(serviceSpelledRuntimeDir);
  }
  runNpm(["run", "--prefix", packageDir, "verify:secrets", "--silent"], { cwd: rootDir });
  assert(
    readFileSync(installedCliPath, "utf8").startsWith("#!/usr/bin/env node\n"),
    "expected installed CLI entry to keep node shebang"
  );
  console.log("pass installed CLI entry contract");
  return installedCliPath;
}

function verifyInstalledBinShim(zepoBin) {
  const result = spawnInstalledBin(zepoBin, ["--version"], {
    cwd: rootDir,
    encoding: "utf8",
    killSignal: "SIGTERM",
    timeout: INSTALLED_CLI_COMMAND_TIMEOUT_MS,
    env: sanitizedChildEnv(process.env, {
      FORCE_COLOR: "0",
      NO_COLOR: "1"
    })
  });

  if (result.error) {
    throwSpawnError(result.error, zepoBin, ["--version"], INSTALLED_CLI_COMMAND_TIMEOUT_MS);
  }

  const normalized = normalizeResult(result);
  assert(normalized.status === 0, "expected installed zepo shim version to succeed");
  assert(normalized.stderr === "", "expected installed zepo shim version stderr to be empty");
  assert(normalized.stdout === packageJson.version, "expected installed zepo shim version to match package.json");
  console.log("pass installed CLI shim contract");
}

function verifyInstalledReadmeContract(prefixDir) {
  const readmePath = join(prefixDir, "node_modules", packageJson.name, "README.md");
  assert(existsSync(readmePath), "expected installed package README");

  const readme = readFileSync(readmePath, "utf8");
  for (const text of [
    "Requires Node.js 20.19 or newer.",
    "npm ci --include=prod --include=dev",
    "npm run verify:dependencies",
    "declared runtime packages load and required dev-tool binaries are present",
    "Installed-package commands run browser automation in background/headless mode by default",
    "never show the browser unless `--visible` is explicitly used",
    "Human-only login, address-add, and checkout handoffs fail with `visible_browser_required`",
    "before session checks and before browser launch",
    "browserAutomationMode.current",
    "normal package runs should report `background_headless`",
    "`zepo status --json` includes `version`, `browserAutomationMode.default`, `browserAutomationMode.current`, `browserAutomationMode.visibleRequested`",
    "browserAutomation.modes.backgroundHeadless",
    "browserAutomation.modes.visibleHumanControlled",
    "`zepo doctor --json` also includes `version`, `dataDir`, `browserAutomationMode`, `browserAutomation`, `browserLock`, `headlessBrowserThrottle`, and `accessChallenge`",
    "Normal search/cart/address/order commands stay background/headless unless the user explicitly passes `--visible`",
    "zepo completion bash",
    "zepo help search",
    "zepo help address",
    "Generate shell completion scripts without starting runtime storage or browser automation",
    "Completion is generated from the registered command tree",
    "nested topics such as `zepo help address`",
    "PowerShell completion also accepts `pwsh` and `ps1` as aliases for `powershell`",
    "zepo --visible login",
    "zepo --visible checkout",
    "JSON checkout returns handoff evidence immediately for agents instead of waiting for a prompt",
    "explicit JSON wait mode (`zepo --visible checkout --json --wait`)",
    "Wait mode re-checks the visible page after the human presses Enter",
    "handoffUrl: \"https://www.zepto.com/?cart=open\"",
    "handoffSurface: \"visible_zepto_browser\"",
    "cartPrecondition: \"non_empty_cart_verified\"",
    "status: \"checkout_manual_action_required\"",
    "manual amount-bearing payment control",
    "paymentStatus: \"not_observed_by_zepocli\"",
    "Checkout handoff controls are rejected if any visible or accessible label contains generic `continue`, bare `proceed`, payment-method, final-payment, final-order, support/help, invoice/receipt, refund/return/cancel, rating/review, `checkout and pay`, or amount-bearing pay text",
    "Those labels and disabled state are revalidated after any scroll into view before clicking.",
    "browser profile writes, and headless browser run accounting",
    "Address manager/add-address controls use visible, enabled address controls only and reject mixed visible or accessible labels that point at location-consent, final address-confirmation, unrelated cart/checkout/order/bill/payment text, or payment-method/payment surfaces",
    "Address automation also rejects support, invoice/receipt, refund/return/cancel-order, and rating/review order-action labels",
    "explicit select/change/set/choose delivery address or location labels",
    "explicit add/enter delivery address or location labels",
    "Address manager/add-address labels and disabled state are revalidated after any scroll into view before clicking.",
    "Saved-address labels are derived from Zepto's visible saved-address row text",
    "The tagged saved-address row is revalidated against Zepto's current visible row text before click, including after any scroll into view",
    "rather than a hardcoded service-city allow-list",
    "Cart parsing skips delivery-address blocks with custom saved-address labels",
    "account/login/OTP/location/address prompts",
    "inactive saved-for-later sections, unavailable item sections, checkout/payment panels, cart/checkout service rows such as clear-cart actions, bill/order summaries, minimum-order-value copy, demand/rain fees, charges, taxes/GST, tips, discounts, donations, round-off rows, instructions, and policy rows, promo gift rows, offer/upsell rows, merchandising headings, and membership rows",
    "not a fixed address-label list or service-city allow-list",
    "Tagged remove/decrease controls are rejected if any visible or accessible label points at coupon, address, checkout, payment-method/payment, inactive saved/unavailable item actions, promotional/merchandising/payment/membership rows, or order actions",
    "whose readable order-card text matches the latest detected order, including after any scroll into view before clicking",
    "Implicit delivery/arriving time copy is treated as ETA only when the same order block exposes an active tracking status.",
    "checkout/payment panels, cart/checkout service rows such as fees, charges, tips, discounts, donations, taxes, and GST, promo gift panels, offer/upsell panels, merchandising headings, membership rows, and image alt/accessibility text",
    "Public product URLs are kept only for Zepto-owned HTTP(S) links, with query strings and hash fragments stripped; offsite or unsafe-scheme hrefs are omitted.",
    "product-specific accessible labels such as `Add <product> to cart`",
    "Quantity-only labels such as `Add 2 to cart` are not product-specific ADD controls.",
    "quantity-only add text such as `Add 2 items to cart`",
    "`Item total`, `Items total`, `Subtotal`, and `Sub total` are not reported as final cart/order totals",
    "Safe-click checks inspect visible text, `aria-label`, `title`, `placeholder`, `value`, `aria-description`, and referenced `aria-labelledby`/`aria-describedby` text",
    "Search/account/cart/order navigation labels and disabled state are revalidated after any scroll into view before clicking.",
    "cart navigation labels plus disabled state are revalidated after any scroll into view before clicking",
    "Order navigation also requires visible, enabled controls and revalidates labels plus disabled state after any scroll into view before clicking.",
    "final-order, support, invoice/receipt, refund/return/cancel, or rating/review actions are rejected",
    "rate, rating, review, track, cancel, payment-method/payment, checkout, or order summary",
    "`--browser-locale <locale>` and `--browser-timezone <timezone>`",
    "do not add a custom user agent",
    "Terms of Use version 1.4",
    "were checked on 2026-06-05",
    "Privacy Notice version 1.1",
    "was checked on 2026-06-05",
    "Last updated: 17th June 2025",
    "passwords and payment instrument details as sensitive personal information",
    "keeps debug capture disabled for Zepto browser pages that may use the persistent profile",
    "Debug HTML/screenshot artifacts are disabled for Zepto browser flows that may use the persistent profile, including search, live session checks, login, cart, address, checkout, orders, and reorder",
    "CSRF/XSRF or anti-forgery tokens, and bare login/logged UI flags are not enough to confirm local auth",
    "non-empty auth/session/token-like Zepto cookies or non-empty auth/session/token-like Zepto localStorage keys",
    "Human spinner/status text, human error text, JSON error text, and JSON error object keys are redacted for sensitive-looking order-id, phone, OTP/PIN/CVV, payment-number, payment-handle",
    "auth/session/token/password/secret URL parameters, and local-path values",
    "npm-token-shaped values",
    "including URL/query-string encoded forms and standalone percent-encoded fragments of those values",
    "Persistent log object keys/values, Error messages/stacks, and message strings are redacted with the same sensitive-looking order-id, phone, OTP/PIN/CVV, payment-number, payment-handle",
    "auth/session/token/password/secret URL-parameter, and local-path rules",
    "npm --silent run verify:live -- --data-dir ./.zepo-live",
    'npm --silent run verify:live -- --data-dir ./.zepo-live --login --production-scope --search milk --address home --add "Amul Milk 500ml"',
    'npm --silent run verify:live -- --data-dir ./.zepo-live --login --production-scope --search milk --address home --add "Amul Milk 500ml" --add-remove-limit-items --cart-remove-limit-items --checkout-remove-limit-items',
    "Both preflight steps must report current-mode `browserAutomation.ready === true`",
    "doctor must also show a passing `Playwright Chromium` check",
    "Use `--production-scope` for the final readiness run",
    "then requests non-empty cart, checkout handoff, and track coverage with checkout wait enabled",
    "The wait step lets a human complete Zepto-side checkout/payment before tracking and is required for accepted production-scope evidence",
    "Use `--add-remove-limit-items` only when the visible Zepto add verification step shows item-limit warnings",
    "Use `--cart-remove-limit-items` only when the visible Zepto cart evidence step shows item-limit warnings",
    "Use `--checkout-remove-limit-items` only when the visible Zepto cart shows item-limit warnings",
    "If checkout remains at `checkout_manual_action_required`, production-scope verification stops before `track` because final readiness requires checkout handoff coverage before tracking",
    "Use `--browser-locale <locale>` and `--browser-timezone <timezone>` to pass the same validated browser context to every child `zepo` command",
    "<redacted-browser-locale>",
    "<redacted-browser-timezone>",
    "browser locale/timezone values",
    "With no live workflow flags, a data directory that already has a confirmed local session stops after those local preflight checks instead of opening a visible `status --live`",
    "`--login` is conditional: if the dedicated data directory already has a confirmed session",
    "counts of structural address-detail records, product records with readable name plus price or unit detail, readable cart records, and status/ETA-bearing order records",
    "top-level `requested`, `attempted`, `coverage`, and `missingCoverage` objects showing which workflow capabilities were requested, ran, actually passed, and remain requested-but-unverified",
    "`checkoutHandoff`",
    "`--choose-add` with `--add`",
    "`verify:live --phone` accepts the same 10-digit, `+91`, or leading-0 Indian mobile formats",
    "npm --silent run verify:live:report -- ./.zepo-live/live-verification-report.json",
    "npm --silent run verify:live:report -- --require-production-scope --max-age-minutes 1440 ./.zepo-live/live-verification-report.json",
    "`verify:live:report` does not contact Zepto or prove a fresh run happened",
    "sanitized non-future `generatedAt` plus data/report path metadata, optional `--max-age-minutes` freshness",
    "the fixed runner note",
    "Production-scope acceptance rejects missing freshness windows and no-wait checkout evidence",
    "accepted report schema",
    "complete boolean capability summaries",
    "redacted step command contract",
    "`ok` reports containing only passing known workflow steps",
    "unique workflow step names",
    "runner workflow order",
    "complete workflow step summaries",
    "typed workflow step summaries",
    "local status readiness",
    "runner-known string and string-array workflow step summaries",
    "internally consistent workflow step summaries",
    "bounded numeric workflow step summaries",
    "all passing workflow step summaries satisfy their known contracts",
    "login session evidence",
    "consistent step `exitCode`/`ok`/`summary`/`error` fields",
    "stable failure error objects",
    "Use `--require-production-scope` with `--max-age-minutes 1440` for the final readiness gate",
    "browser preflight, local status, live session, address selection, search, add, a non-empty cart, checkout handoff, and track to be explicitly requested and covered, with checkout wait evidence",
    "stale saved reports or stale order-history tracking cannot be reused as current evidence",
    "without address-add, address-list, remove, clear, history, or reorder evidence mixed into the final report",
    "`attempted`/`coverage` consistency with `steps`",
    "sensitive-looking key/value redaction",
    "npm publish --dry-run --access public",
    "Live report failures use stable `error.code` values.",
    "live_verification_incomplete",
    "npm run verify:secrets",
    "without printing the raw token",
    "Never put npm tokens in the app, README, tests, or committed config."
  ]) {
    assert(readme.includes(text), `expected installed README to document: ${text}`);
  }

  console.log("pass installed README contract");
}

async function verifyInstalledEnvSanitizerContract(prefixDir) {
  const envUtilsPath = join(prefixDir, "node_modules", packageJson.name, "scripts", "env-utils.mjs");
  const { isNpmAuthEnvironmentKey, sanitizedChildEnv } = await import(pathToFileURL(envUtilsPath).href);
  const env = sanitizedChildEnv({
    COREPACK_HOME: "C:\\corepack",
    COREPACK_NPM_TOKEN: "secret",
    NODE_AUTH_TOKEN: "secret",
    NPM_AUTH_IDENT: "user:secret",
    NPM_AUTH_TOKEN: "secret",
    NPM_CONFIG_CACHE: "C:\\npm-cache",
    NPM_CONFIG__AUTH: "secret",
    "NPM_CONFIG_//REGISTRY.NPMJS.ORG/:_AUTHTOKEN": "secret",
    NPM_TOKEN: "secret",
    PATH: "C:\\Windows\\System32",
    YARN_NPM_AUTH: "secret",
    YARN_NPM_AUTH_IDENT: "user:secret",
    YARN_NPM_AUTH_TOKEN: "secret"
  });

  assert(!("COREPACK_NPM_TOKEN" in env), "expected installed env sanitizer to remove Corepack npm tokens");
  assert(!("NODE_AUTH_TOKEN" in env), "expected installed env sanitizer to remove Node npm auth tokens");
  assert(!("NPM_AUTH_IDENT" in env), "expected installed env sanitizer to remove npm auth identities");
  assert(!("NPM_AUTH_TOKEN" in env), "expected installed env sanitizer to remove npm auth tokens");
  assert(!("NPM_CONFIG__AUTH" in env), "expected installed env sanitizer to remove npm config auth");
  assert(
    !("NPM_CONFIG_//REGISTRY.NPMJS.ORG/:_AUTHTOKEN" in env),
    "expected installed env sanitizer to remove registry-scoped npm config auth"
  );
  assert(!("NPM_TOKEN" in env), "expected installed env sanitizer to remove npm publish tokens");
  assert(!("YARN_NPM_AUTH" in env), "expected installed env sanitizer to remove Yarn npm auth");
  assert(!("YARN_NPM_AUTH_IDENT" in env), "expected installed env sanitizer to remove Yarn npm auth identities");
  assert(!("YARN_NPM_AUTH_TOKEN" in env), "expected installed env sanitizer to remove Yarn npm auth tokens");
  assert(env.COREPACK_HOME === "C:\\corepack", "expected installed env sanitizer to keep ordinary Corepack env");
  assert(env.NPM_CONFIG_CACHE === "C:\\npm-cache", "expected installed env sanitizer to keep ordinary npm config");
  assert(env.PATH === "C:\\Windows\\System32", "expected installed env sanitizer to keep PATH");
  assert(isNpmAuthEnvironmentKey("YARN_NPM_AUTH_TOKEN") === true, "expected installed env sanitizer to match Yarn tokens");
  assert(isNpmAuthEnvironmentKey("COREPACK_NPM_TOKEN") === true, "expected installed env sanitizer to match Corepack tokens");
  assert(isNpmAuthEnvironmentKey("COREPACK_HOME") === false, "expected installed env sanitizer to keep Corepack home");
  console.log("pass installed env sanitizer contract");
}

async function verifyInstalledBrowserDiagnosticsContract(prefixDir) {
  const browserAutomationModulePath = join(
    prefixDir,
    "node_modules",
    packageJson.name,
    "dist",
    "automation",
    "browser.js"
  );
  const { shouldCaptureBrowserFailure } = await import(pathToFileURL(browserAutomationModulePath).href);

  assert(
    shouldCaptureBrowserFailure({}, false) === false,
    "expected installed browser failure capture to stay off without debug"
  );
  assert(
    shouldCaptureBrowserFailure({}, true) === false,
    "expected installed browser failure capture to default off even with debug"
  );
  assert(
    shouldCaptureBrowserFailure({ captureFailures: false }, true) === false,
    "expected installed browser failure capture opt-out to stay off"
  );
  assert(
    shouldCaptureBrowserFailure({ captureFailures: true }, false) === false,
    "expected installed browser failure capture opt-in to still require debug"
  );
  assert(
    shouldCaptureBrowserFailure({ captureFailures: true }, true) === true,
    "expected installed browser failure capture to require explicit opt-in and debug"
  );

  console.log("pass installed browser diagnostics contract");
}

function verifyInstalledBackgroundAutomationModeContract(prefixDir) {
  const packageDir = join(prefixDir, "node_modules", packageJson.name);
  const sharedCommandSource = readFileSync(join(packageDir, "dist", "commands", "shared.js"), "utf8");
  const runtimeSource = readFileSync(join(packageDir, "dist", "config", "runtime.js"), "utf8");
  const browserAutomationSource = readFileSync(join(packageDir, "dist", "automation", "browser.js"), "utf8");
  const addCommandSource = readFileSync(join(packageDir, "dist", "commands", "add.js"), "utf8");
  const searchServiceSource = readFileSync(join(packageDir, "dist", "services", "search.js"), "utf8");
  const cartServiceSource = readFileSync(join(packageDir, "dist", "services", "cart.js"), "utf8");
  const ordersServiceSource = readFileSync(join(packageDir, "dist", "services", "orders.js"), "utf8");
  const authServiceSource = readFileSync(join(packageDir, "dist", "services", "auth.js"), "utf8");
  const addressesServiceSource = readFileSync(join(packageDir, "dist", "services", "addresses.js"), "utf8");
  const checkoutServiceSource = readFileSync(join(packageDir, "dist", "services", "checkout.js"), "utf8");

  assert(
    sharedCommandSource.includes("headless: !options.visible"),
    "expected installed CLI runtime options to keep --visible as the only global visible-browser switch"
  );
  assert(
    runtimeSource.includes("headless: options.headless ?? true"),
    "expected installed runtime to default browser automation to headless"
  );
  assert(
    browserAutomationSource.includes("launchPersistentContext") &&
      browserAutomationSource.includes("buildPersistentContextOptions(headless, this.runtime.options)"),
    "expected installed browser automation to pass the runtime headless mode into Chromium launch options"
  );
  assert(
    browserAutomationSource.includes("return {") && browserAutomationSource.includes("headless,"),
    "expected installed browser context options to include the headless flag"
  );

  assert(
    !searchServiceSource.includes("headless: false"),
    "expected installed search service not to force visible browser mode"
  );
  assert(
    !cartServiceSource.includes("headless: false"),
    "expected installed cart service not to force visible browser mode"
  );
  assert(
    addCommandSource.includes("--remove-limit-items") &&
      addCommandSource.includes("removeLimitItems: options.removeLimitItems === true"),
    "expected installed add command to pass explicit item-limit removal into cart service"
  );
  assert(
    cartServiceSource.includes("readCartWithEmptyRecovery(page, POST_ADD_EMPTY_CART_REREAD_ATTEMPTS") &&
      cartServiceSource.includes("removeLimitItems: options.removeLimitItems === true"),
    "expected installed cart service to pass explicit add item-limit removal into cart recovery"
  );
  assert(
    !ordersServiceSource.includes("headless: false"),
    "expected installed orders service not to force visible browser mode"
  );

  assert(
    countSourceOccurrences(authServiceSource, "headless: false") === 1,
    "expected installed login service to be the visible human-controlled login handoff"
  );
  assert(
    authServiceSource.includes("requireVisibleBrowser") &&
      authServiceSource.includes("Zepto login requires a visible browser."),
    "expected installed login service to require explicit --visible before opening a browser"
  );
  assert(
    countSourceOccurrences(addressesServiceSource, "headless: false") === 1,
    "expected installed address service to force visible browser only for address add"
  );
  assert(
    addressesServiceSource.includes("assertConfirmedSession") &&
      addressesServiceSource.includes("requireVisibleBrowser") &&
      addressesServiceSource.includes("Zepto address add requires a visible browser."),
    "expected installed address add service to require session and explicit --visible before opening a browser"
  );
  assert(
    addressesServiceSource.indexOf("requireVisibleBrowser(this.runtime") <
      addressesServiceSource.indexOf("assertConfirmedSession(this.runtime"),
    "expected installed address add service to require explicit --visible before checking session state"
  );
  assert(
    countSourceOccurrences(checkoutServiceSource, "headless: false") === 1,
    "expected installed checkout service to be the visible human-controlled payment handoff"
  );
  assert(
    checkoutServiceSource.includes("assertConfirmedSession") &&
      checkoutServiceSource.includes("requireVisibleBrowser") &&
      checkoutServiceSource.includes("Zepto checkout requires a visible browser."),
    "expected installed checkout service to require session and explicit --visible before opening a browser"
  );
  assert(
    checkoutServiceSource.indexOf("requireVisibleBrowser(this.runtime") <
      checkoutServiceSource.indexOf("assertConfirmedSession(this.runtime"),
    "expected installed checkout service to require explicit --visible before checking session state"
  );
  console.log("pass installed background automation mode contract");
}

async function verifyInstalledPaymentLabelContract(prefixDir) {
  const paymentLabelModulePath = join(
    prefixDir,
    "node_modules",
    packageJson.name,
    "dist",
    "automation",
    "payment-labels.js"
  );
  const {
    isPaymentHandoffSurfaceText,
    isPaymentMethodLabelText,
    isPaymentSelectionPromptText,
    isPaymentUiSurfaceText
  } = await import(pathToFileURL(paymentLabelModulePath).href);

  assert(isPaymentMethodLabelText("Credit & Debit Cards") === true, "expected installed card payment label to match");
  assert(isPaymentMethodLabelText("Amazon Pay") === true, "expected installed wallet payment label to match");
  assert(isPaymentMethodLabelText("Delivery Address") === false, "expected installed address label not to match payment methods");
  assert(
    isPaymentHandoffSurfaceText("Payment Method UPI Cards") === true,
    "expected installed payment handoff surface label to match"
  );
  assert(
    isPaymentHandoffSurfaceText("UPI Cards Wallet") === false,
    "expected installed bare payment brands not to prove handoff surface"
  );
  assert(
    isPaymentSelectionPromptText("Select Payment Method") === true,
    "expected installed payment selection prompt to match"
  );
  assert(
    isPaymentSelectionPromptText("Payment Methods Accepted") === false,
    "expected installed generic payment heading not to match selection prompt"
  );
  assert(isPaymentUiSurfaceText("Cards") === true, "expected installed payment UI surface to match standalone cards");
  assert(isPaymentUiSurfaceText("Card Offers") === true, "expected installed payment UI surface to match card offers");
  assert(
    isPaymentUiSurfaceText("Playing Cards") === false,
    "expected installed payment UI surface not to reject ordinary card product names"
  );
  assert(
    isPaymentUiSurfaceText("Wallet Cleaner") === false,
    "expected installed payment UI surface not to reject ordinary wallet product names"
  );
  console.log("pass installed payment label contract");
}

async function verifyInstalledFinalActionLabelContract(prefixDir) {
  const packageDir = join(prefixDir, "node_modules", packageJson.name);
  const finalActionModulePath = join(
    prefixDir,
    "node_modules",
    packageJson.name,
    "dist",
    "automation",
    "final-action-labels.js"
  );
  const { isFinalCheckoutSurfaceText, isFinalPaymentOrOrderActionText } = await import(
    pathToFileURL(finalActionModulePath).href
  );

  for (const label of [
    "Place Order",
    "Confirm Order",
    "Pay Now",
    "Make Payment",
    "Order Now",
    "Pay ₹249",
    "Checkout and Pay",
    "Pay with UPI"
  ]) {
    assert(
      isFinalPaymentOrOrderActionText(label) === true,
      `expected installed final payment/order label to be unsafe: ${label}`
    );
  }
  assert(
    isFinalPaymentOrOrderActionText("Proceed to Pay") === false,
    "expected installed proceed-to-pay handoff label not to be final action"
  );
  assert(
    isFinalCheckoutSurfaceText("Confirm Payment") === true,
    "expected installed final checkout surface label to match"
  );
  assert(
    isFinalCheckoutSurfaceText("Checkout and Pay") === false,
    "expected installed broad final action not to prove checkout surface"
  );
  assert(
    isFinalCheckoutSurfaceText("Pay ₹249") === false,
    "expected installed amount-bearing pay label not to prove checkout surface"
  );
  for (const file of [
    "address.js",
    "auth.js",
    "cart.js",
    "checkout.js",
    "extract.js",
    "login-inputs.js",
    "orders.js",
    "search.js"
  ]) {
    const source = readFileSync(join(packageDir, "dist", "automation", file), "utf8");
    assert(source.includes("./final-action-labels.js"), `expected installed automation module to import final action labels: ${file}`);
    assert(
      !/const FINAL_PAYMENT_OR_ORDER_ACTION_PATTERN(?:_SOURCE)?\s*=/.test(source),
      `expected installed automation module not to redefine final payment/order labels: ${file}`
    );
    assert(
      !/const FINAL_CHECKOUT_SURFACE_PATTERN(?:_SOURCE)?\s*=/.test(source),
      `expected installed automation module not to redefine final checkout labels: ${file}`
    );
  }
  console.log("pass installed final action label contract");
}

async function verifyInstalledCheckoutHandoffContract(prefixDir) {
  const checkoutModulePath = join(prefixDir, "node_modules", packageJson.name, "dist", "commands", "checkout.js");
  const checkoutAutomationModulePath = join(
    prefixDir,
    "node_modules",
    packageJson.name,
    "dist",
    "automation",
    "checkout.js"
  );
  const { checkoutHandoffOutput } = await import(pathToFileURL(checkoutModulePath).href);
  const {
    detectCheckoutHandoffMode,
    isCheckoutHandoffClickText,
    isCheckoutHandoffText,
    isManualCheckoutActionText,
    isUnsafeCheckoutAutomationClickText
  } = await import(pathToFileURL(checkoutAutomationModulePath).href);
  assertCheckoutHandoffContract(checkoutHandoffOutput());
  assertCheckoutManualActionContract(checkoutHandoffOutput("manual_payment_control_visible"));
  assert(isCheckoutHandoffClickText("Checkout") === true, "expected installed checkout label to be accepted");
  assert(
    isCheckoutHandoffClickText("Checkout 2 items") === true,
    "expected installed checkout item-count label to be accepted"
  );
  assert(
    isCheckoutHandoffClickText("Checkout these offers") === false,
    "expected installed promotional checkout label to be rejected"
  );
  assert(
    isCheckoutHandoffClickText("Checkout and Pay") === false,
    "expected installed checkout-and-pay label to be rejected"
  );
  assert(
    isCheckoutHandoffClickText("Click to Pay ₹509") === false,
    "expected installed amount-bearing click-to-pay label not to be automated checkout"
  );
  assert(
    isManualCheckoutActionText("Click to Pay ₹509") === true,
    "expected installed amount-bearing click-to-pay label to require manual action"
  );
  assert(
    isManualCheckoutActionText("Pay ₹509") === false,
    "expected installed generic pay amount not to be manual checkout action"
  );
  assert(
    isUnsafeCheckoutAutomationClickText("Continue to Pay") === true,
    "expected installed continue-to-pay label to be unsafe"
  );
  assert(
    isUnsafeCheckoutAutomationClickText("Continue to Payment") === true,
    "expected installed continue-to-payment label to be unsafe"
  );
  assert(
    isUnsafeCheckoutAutomationClickText("Credit & Debit Cards") === true,
    "expected installed card payment-method label to be unsafe"
  );
  assert(
    isUnsafeCheckoutAutomationClickText("Pay Later") === true,
    "expected installed deferred payment-method label to be unsafe"
  );
  assert(
    isUnsafeCheckoutAutomationClickText("Amazon Pay") === true,
    "expected installed wallet payment-method label to be unsafe"
  );
  for (const label of [
    "Customer Support",
    "Help",
    "Invoice",
    "Refunded",
    "Cancellation",
    "Cancelled",
    "Rate & Review",
    "Review Your Order"
  ]) {
    assert(
      isUnsafeCheckoutAutomationClickText(label) === true,
      `expected installed checkout order-action label to be unsafe: ${label}`
    );
  }
  assert(isUnsafeCheckoutAutomationClickText("Proceed") === true, "expected installed bare proceed label to be unsafe");
  assert(
    isCheckoutHandoffText("Cart Bill Summary Item Total ₹249 Checkout Payment Methods Accepted UPI Cards") === false,
    "expected installed checkout detector to reject cart payment-method promo text"
  );
  assert(
    isCheckoutHandoffText("Cart Order Summary Bill Summary Select payment method UPI Cards") === true,
    "expected installed checkout detector to accept explicit payment selection text"
  );
  assert(
    (await detectCheckoutHandoffMode(
      createInstalledCheckoutHandoffDetectionPage("Select payment method UPI Card Wallet")
    ))?.mode === "checkout_or_payment_page",
    "expected installed checkout handoff mode detector to detect payment handoff pages"
  );
  assert(
    (await detectCheckoutHandoffMode(
      createInstalledCheckoutHandoffDetectionPage("Cart Bill Summary", ["Click to Pay ₹509"])
    ))?.mode === "manual_payment_control_visible",
    "expected installed checkout handoff mode detector to detect manual payment controls"
  );
  console.log("pass installed checkout handoff contract");
}

function createInstalledCheckoutHandoffDetectionPage(bodyText, controlTexts = []) {
  return {
    title: async () => "",
    waitForLoadState: async () => undefined,
    locator: (selector) => {
      if (selector === "body") {
        return {
          innerText: async () => bodyText
        };
      }

      return {
        evaluateAll: async (callback) => {
          const elements = controlTexts.map((text) => ({
            textContent: text,
            getAttribute: () => null,
            getBoundingClientRect: () => ({ width: 100, height: 20 }),
            hasAttribute: () => false
          }));
          const previousWindow = globalThis.window;
          globalThis.window = {
            getComputedStyle: () => ({ display: "block", visibility: "visible" })
          };
          try {
            return callback(elements);
          } finally {
            if (previousWindow === undefined) {
              delete globalThis.window;
            } else {
              globalThis.window = previousWindow;
            }
          }
        }
      };
    }
  };
}

async function verifyInstalledAuthAutomationContract(prefixDir) {
  const authAutomationModulePath = join(prefixDir, "node_modules", packageJson.name, "dist", "automation", "auth.js");
  const { isUnsafeAccountSurfaceClickText, isUnsafePhonePrefillInputText } = await import(
    pathToFileURL(authAutomationModulePath).href
  );

  for (const label of [
    "Customer Support",
    "Invoice",
    "Refund",
    "Return Request",
    "Cancellation",
    "Rate & Review",
    "Review Your Order"
  ]) {
    assert(
      isUnsafeAccountSurfaceClickText(label) === true,
      `expected installed account-surface label to be unsafe: ${label}`
    );
    assert(
      isUnsafePhonePrefillInputText(`${label} phone`) === true,
      `expected installed phone prefill label to be unsafe: ${label}`
    );
  }
  for (const label of ["Order Now", "Checkout and Pay", "Pay with UPI", "Pay ₹249"]) {
    assert(
      isUnsafeAccountSurfaceClickText(label) === true,
      `expected installed account-surface final action label to be unsafe: ${label}`
    );
    assert(
      isUnsafePhonePrefillInputText(`${label} phone`) === true,
      `expected installed phone prefill final action label to be unsafe: ${label}`
    );
  }

  console.log("pass installed auth automation contract");
}

async function verifyInstalledOrderActionLabelContract(prefixDir) {
  const orderActionModulePath = join(
    prefixDir,
    "node_modules",
    packageJson.name,
    "dist",
    "automation",
    "order-action-labels.js"
  );
  const { ORDER_ACTION_LABEL_PATTERN_SOURCE, isOrderActionLabelText } = await import(
    pathToFileURL(orderActionModulePath).href
  );
  const pattern = new RegExp(ORDER_ACTION_LABEL_PATTERN_SOURCE, "i");

  for (const label of [
    "Help",
    "Support Ticket",
    "Refunded",
    "Refunds",
    "Return Order",
    "Cancellation",
    "Cancelled",
    "Rate Order",
    "Rate & Review",
    "Rate and Review",
    "Review Your Order",
    "Write Review"
  ]) {
    assert(isOrderActionLabelText(label) === true, `expected installed order-action label to be unsafe: ${label}`);
    assert(pattern.test(label) === true, `expected installed order-action source to match: ${label}`);
  }

  for (const label of ["Account", "Login", "Search", "Cart", "Checkout", "Reorder", "Track Order", "Product Reviews"]) {
    assert(isOrderActionLabelText(label) === false, `expected installed ordinary workflow label not to match: ${label}`);
  }

  console.log("pass installed order action label contract");
}

async function verifyInstalledCartAutomationContract(prefixDir) {
  const cartAutomationModulePath = join(prefixDir, "node_modules", packageJson.name, "dist", "automation", "cart.js");
  const cartAutomationSource = readFileSync(cartAutomationModulePath, "utf8");
  const {
    isCartOpenClickText,
    isCartRemoveControlText,
    isLikelyRemovableCartItemText,
    requireReadableCartSnapshot,
    isUnsafeCartOpenClickText,
    isUnsafeCartRemoveControlText
  } = await import(pathToFileURL(cartAutomationModulePath).href);

  assert(
    !cartAutomationSource.includes('querySelectorAll("*")') && !cartAutomationSource.includes("querySelectorAll('*')"),
    "expected installed cart parser to avoid unbounded all-node scroll scans"
  );
  assert(
    cartAutomationSource.includes('[data-testid*="cart" i]') &&
      cartAutomationSource.includes('[class*="cart" i]') &&
      cartAutomationSource.includes('[role="dialog"]'),
    "expected installed cart parser to use targeted scroll container selectors"
  );
  assert(
    cartAutomationSource.includes('gotoZepto(page, "/?cart=open")'),
    "expected installed cart opener to use Zepto cart drawer query fallback"
  );
  assert(
    !cartAutomationSource.includes('gotoZepto(page, "/cart")') &&
      !cartAutomationSource.includes("gotoZepto(page, '/cart')"),
    "expected installed cart opener not to navigate to broken /cart page"
  );
  assert(isCartOpenClickText("Cart") === true, "expected installed cart open label to be accepted");
  assert(isCartOpenClickText("Cart 11") === true, "expected installed cart badge label to be accepted");
  assert(isCartOpenClickText("Cart\n11") === true, "expected installed cart newline badge label to be accepted");
  for (const label of [
    "Customer Support",
    "Invoice",
    "Refund",
    "Cancellation",
    "Cancelled",
    "Rate & Review",
    "Review Your Order",
    "Order Now",
    "Checkout and Pay",
    "Pay with UPI",
    "Pay ₹249"
  ]) {
    assert(isCartOpenClickText(label) === false, `expected installed cart open label to be rejected: ${label}`);
    assert(isUnsafeCartOpenClickText(label) === true, `expected installed cart open label to be unsafe: ${label}`);
  }
  assert(isCartRemoveControlText("Remove") === true, "expected installed cart remove label to be accepted");
  for (const label of [
    "Order Summary",
    "Track Order",
    "Reorder",
    "Cancel Order",
    "Invoice",
    "Support",
    "Order Now",
    "Checkout and Pay",
    "Pay with UPI",
    "Pay ₹249"
  ]) {
    assert(isCartRemoveControlText(label) === false, `expected installed cart remove label to be rejected: ${label}`);
    assert(isUnsafeCartRemoveControlText(label) === true, `expected installed cart remove label to be unsafe: ${label}`);
  }
  assert(
    isLikelyRemovableCartItemText("Amul Taaza Toned Milk 500 ml Rs 32 Remove") === true,
    "expected installed cart remove row parser to accept product rows"
  );
  for (const prefix of [
    "Top Picks For You",
    "Best Offers For You",
    "Trending Deals",
    "Best Sellers",
    "Offer Zone",
    "Buy More Save More",
    "Deals For You",
    "UPI Cashback",
    "Card Offers",
    "Saved Cards",
    "Wallet Cashback",
    "Cash on Delivery",
    "Zepto Pass",
    "Membership",
    "Free Gift",
    "Gift Unlocked",
    "Promo",
    "Checkout",
    "Payment Method"
  ]) {
    assert(
      isLikelyRemovableCartItemText(`${prefix} Amul Taaza Toned Milk 500 ml Rs 32 Remove`) === false,
      `expected installed cart remove row parser to reject non-cart product surfaces: ${prefix}`
    );
    assert(
      isLikelyRemovableCartItemText(`${prefix} Amul Taaza Toned Milk 500 ml Rs 32 Remove`, "Amul Taaza Toned Milk") ===
        false,
      `expected installed cart remove row parser query matching to reject non-cart product surfaces: ${prefix}`
    );
  }
  assert(
    isLikelyRemovableCartItemText("Playing Cards 1 pack Rs 99 Remove") === true,
    "expected installed cart remove row parser not to reject ordinary card product rows"
  );
  assert(
    isLikelyRemovableCartItemText("Wallet Cleaner 100 ml Rs 49 Remove") === true,
    "expected installed cart remove row parser not to reject ordinary wallet product rows"
  );
  assert(
    isLikelyRemovableCartItemText("Order Summary Amul Taaza Toned Milk 500 ml Rs 32 Remove") === false,
    "expected installed cart remove row parser to reject order summary rows"
  );
  assert(
    isLikelyRemovableCartItemText("Track Order Amul Taaza Toned Milk 500 ml Rs 32 Remove") === false,
    "expected installed cart remove row parser to reject tracking rows"
  );
  assert(
    isLikelyRemovableCartItemText("Order Now Amul Taaza Toned Milk 500 ml Rs 32 Remove") === false,
    "expected installed cart remove row parser to reject final order action rows"
  );
  assert(
    isLikelyRemovableCartItemText("Checkout and Pay Amul Taaza Toned Milk 500 ml Rs 32 Remove") === false,
    "expected installed cart remove row parser to reject checkout-and-pay rows"
  );
  assert(
    isLikelyRemovableCartItemText("Pay with UPI Amul Taaza Toned Milk 500 ml Rs 32 Remove") === false,
    "expected installed cart remove row parser to reject pay-with rows"
  );
  assert(
    requireReadableCartSnapshot("My Cart\nAmul Taaza Toned Milk\n500 ml\n₹32\nQty 1\nItem total ₹32").total === undefined,
    "expected installed cart total parser not to report item total as final cart total"
  );
  assert(
    requireReadableCartSnapshot("My Cart\nAmul Taaza Toned Milk\n500 ml\n₹32\nQty 1\nItems total ₹32").total === undefined,
    "expected installed cart total parser not to report items total as final cart total"
  );
  assert(
    requireReadableCartSnapshot("My Cart\nAmul Taaza Toned Milk\n500 ml\n₹32\nQty 1\nSubtotal ₹32").total === undefined,
    "expected installed cart total parser not to report subtotal as final cart total"
  );
  assert(
    requireReadableCartSnapshot("My Cart\nAmul Taaza Toned Milk\n500 ml\n₹32\nQty 1\nSub total ₹32").total === undefined,
    "expected installed cart total parser not to report sub total as final cart total"
  );
  assert(
    requireReadableCartSnapshot("My Cart\nAmul Taaza Toned Milk\n500 ml\n₹32\nQty 1\nTotal\nSub total\n₹32").total ===
      undefined,
    "expected installed cart total parser not to skip through sub total to a price"
  );
  for (const rowText of [
    "Currently unavailable Potato Chips 52 g Rs 20 Remove",
    "Out of stock Potato Chips 52 g Rs 20 Remove",
    "Sold out Potato Chips 52 g Rs 20 Remove",
    "Potato Chips 52 g Rs 20 Move to cart",
    "Potato Chips 52 g Rs 20 Notify Me"
  ]) {
    assert(
      isLikelyRemovableCartItemText(rowText) === false,
      `expected installed cart remove row parser to reject inactive cart rows: ${rowText}`
    );
  }
  console.log("pass installed cart automation contract");
}

async function verifyInstalledProductAutomationContract(prefixDir) {
  const searchAutomationModulePath = join(
    prefixDir,
    "node_modules",
    packageJson.name,
    "dist",
    "automation",
    "search.js"
  );
  const extractAutomationModulePath = join(
    prefixDir,
    "node_modules",
    packageJson.name,
    "dist",
    "automation",
    "extract.js"
  );
  const {
    extractProducts,
    isProductAddControlText,
    isUnsafeProductAddControlText,
    isUnsafeQuantityIncreaseControlText,
    isUnsafeSearchInputText,
    isUnsafeSearchTriggerClickText
  } = await import(pathToFileURL(searchAutomationModulePath).href);
  const { parseProductCard } = await import(pathToFileURL(extractAutomationModulePath).href);

  assert(isProductAddControlText("Add to Cart") === true, "expected installed generic product ADD label to be accepted");
  assert(
    isProductAddControlText("Add Amul Milk to Cart") === true,
    "expected installed product-specific ADD label to be accepted"
  );
  for (const label of ["Add Playing Cards to Cart", "Add Card Holder to Cart", "Add Wallet Cleaner to Cart"]) {
    assert(
      isProductAddControlText(label) === true && isUnsafeProductAddControlText(label) === false,
      `expected installed ordinary card/wallet product-specific ADD label to be accepted: ${label}`
    );
  }
  assert(
    isProductAddControlText("Add 2 to cart") === false,
    "expected installed quantity-only ADD label not to be accepted as product ADD"
  );
  assert(
    isUnsafeProductAddControlText("Add 2 to cart") === true,
    "expected installed quantity-only ADD label to be unsafe"
  );
  assert(
    isProductAddControlText("Add 2 items to cart") === false,
    "expected installed item-count ADD label not to be accepted as product ADD"
  );
  assert(
    isUnsafeProductAddControlText("Add 2 items to cart") === true,
    "expected installed item-count ADD label to be unsafe"
  );
  assert(
    isProductAddControlText("Add Amul Milk Pay ₹249 to Cart") === false,
    "expected installed product ADD amount-pay label not to be accepted"
  );
  assert(
    isUnsafeProductAddControlText("Add Amul Milk Pay ₹249 to Cart") === true,
    "expected installed product ADD amount-pay label to be unsafe"
  );
  assert(
    isUnsafeProductAddControlText("Checkout and Pay") === true,
    "expected installed checkout-and-pay product ADD label to be unsafe"
  );
  assert(
    isUnsafeProductAddControlText("Pay with UPI") === true,
    "expected installed pay-with product ADD label to be unsafe"
  );
  assert(
    isUnsafeQuantityIncreaseControlText("Checkout and Pay") === true,
    "expected installed checkout-and-pay quantity label to be unsafe"
  );
  assert(
    isUnsafeQuantityIncreaseControlText("Pay ₹249") === true,
    "expected installed amount-pay quantity label to be unsafe"
  );
  for (const label of ["Customer Support", "Help", "Invoice", "Refunded", "Cancellation", "Rate & Review", "Review Your Order"]) {
    assert(
      isUnsafeSearchInputText(`Search ${label}`) === true,
      `expected installed search input to reject order action label: ${label}`
    );
    assert(
      isUnsafeSearchTriggerClickText(label) === true,
      `expected installed search trigger to reject order action label: ${label}`
    );
    assert(
      isUnsafeProductAddControlText(label) === true,
      `expected installed product ADD to reject order action label: ${label}`
    );
    assert(
      isUnsafeQuantityIncreaseControlText(label) === true,
      `expected installed quantity increase to reject order action label: ${label}`
    );
  }
  assert(
    isProductAddControlText("Add Help to Cart") === false &&
      isUnsafeProductAddControlText("Add Help to Cart") === true,
    "expected installed product-specific ADD label with order action text to be unsafe"
  );
  for (const product of [
    {
      cardText: "Playing Cards\n1 pack\n₹99",
      label: "Add Playing Cards to cart",
      name: "Playing Cards",
      price: "₹99",
      unit: "1 pack"
    },
    {
      cardText: "Card Holder\n1 pc\n₹149",
      label: "Add Card Holder to cart",
      name: "Card Holder",
      price: "₹149",
      unit: "1 pc"
    },
    {
      cardText: "Wallet Cleaner\n100 ml\n₹49",
      label: "Add Wallet Cleaner to cart",
      name: "Wallet Cleaner",
      price: "₹49",
      unit: "100 ml"
    }
  ]) {
    const products = await extractProducts(
      createInstalledProductExtractionPage({
        buttonText: "",
        buttonAttributes: {
          "aria-label": product.label
        },
        cardText: product.cardText
      }),
      5
    );
    assert(
      products[0]?.name === product.name &&
        products[0]?.price === product.price &&
        products[0]?.unit === product.unit &&
        products[0]?.automationId === 0,
      `expected installed product extraction to accept ordinary product-specific ADD label: ${product.label}`
    );
  }
  assert(
    parseProductCard(
      {
        text: "ADD\n₹32\nAmul Taaza Toned Milk\n1 pack (500 ml)",
        href: "https://www.zepto.com/p/amul-taaza-toned-milk?session=raw#details"
      },
      0
    )?.url === "https://www.zepto.com/p/amul-taaza-toned-milk",
    "expected installed product URL to strip query and hash"
  );
  assert(
    parseProductCard(
      {
        text: "ADD\n₹32\nAmul Taaza Toned Milk\n1 pack (500 ml)",
        href: "https://example.com/p/amul-taaza-toned-milk?session=raw"
      },
      0
    )?.url === undefined,
    "expected installed offsite product URL to be omitted"
  );
  assert(
    parseProductCard(
      {
        text: "ADD\n₹32\nAmul Taaza Toned Milk\n1 pack (500 ml)",
        href: "javascript:alert('raw')"
      },
      0
    )?.url === undefined,
    "expected installed unsafe-scheme product URL to be omitted"
  );
  console.log("pass installed product automation contract");
}

function createInstalledProductExtractionPage(options) {
  const labels = Object.fromEntries(
    Object.entries(options.referencedLabels ?? {}).map(([id, text]) => [id, new InstalledFakeElement(text)])
  );
  const documentLike = {
    buttons: [],
    querySelectorAll(selector) {
      return selector === "button, [role='button']" ? this.buttons : [];
    },
    getElementById(id) {
      return labels[id] ?? null;
    }
  };
  const card = new InstalledFakeElement(options.cardText ?? "Amul Milk\n500 ml\n₹32", {}, documentLike);
  const button = new InstalledFakeElement(options.buttonText, options.buttonAttributes ?? {}, documentLike);
  card.appendChild(button);
  documentLike.buttons = [button];

  return {
    button,
    evaluate: async (callback, input) => {
      const previous = {
        document: globalThis.document,
        window: globalThis.window,
        HTMLElement: globalThis.HTMLElement,
        HTMLButtonElement: globalThis.HTMLButtonElement,
        HTMLInputElement: globalThis.HTMLInputElement,
        HTMLAnchorElement: globalThis.HTMLAnchorElement,
        HTMLSelectElement: globalThis.HTMLSelectElement,
        HTMLTextAreaElement: globalThis.HTMLTextAreaElement
      };
      globalThis.document = documentLike;
      globalThis.window = {
        getComputedStyle: () => ({
          display: "block",
          visibility: "visible"
        })
      };
      globalThis.HTMLElement = InstalledFakeElement;
      globalThis.HTMLButtonElement = InstalledFakeElement;
      globalThis.HTMLInputElement = InstalledFakeElement;
      globalThis.HTMLAnchorElement = InstalledFakeElement;
      globalThis.HTMLSelectElement = InstalledFakeElement;
      globalThis.HTMLTextAreaElement = InstalledFakeElement;
      try {
        return callback(input);
      } finally {
        for (const [key, value] of Object.entries(previous)) {
          if (value === undefined) {
            delete globalThis[key];
          } else {
            globalThis[key] = value;
          }
        }
      }
    }
  };
}

async function verifyInstalledOrderExtractionContract(prefixDir) {
  const extractAutomationModulePath = join(
    prefixDir,
    "node_modules",
    packageJson.name,
    "dist",
    "automation",
    "extract.js"
  );
  const extractAutomationSource = readFileSync(extractAutomationModulePath, "utf8");
  const { parseOrdersFromText } = await import(pathToFileURL(extractAutomationModulePath).href);
  assert(
    extractAutomationSource.includes("isOrderActionLabelText"),
    "expected installed order parser to use centralized order-action label matching"
  );

  assertDeepEqual(
    parseOrdersFromText("Order #ZEP9999 Out for delivery Delivery in 6 mins Total ₹320"),
    [
      {
        id: "ZEP9999",
        status: "Out for delivery",
        eta: "6 mins",
        total: "₹320",
        rawText: "Order #ZEP9999 Out for delivery Delivery in 6 mins Total ₹320"
      }
    ],
    "expected installed order parser to keep active delivery ETA"
  );
  assertDeepEqual(
    parseOrdersFromText("Order #ZEP1234 Delivered Delivery in 6 mins Total ₹249"),
    [
      {
        id: "ZEP1234",
        status: "Delivered",
        eta: undefined,
        total: "₹249",
        rawText: "Order #ZEP1234 Delivered Delivery in 6 mins Total ₹249"
      }
    ],
    "expected installed order parser not to borrow delivery-speed ETA from delivered orders"
  );
  assertDeepEqual(
    parseOrdersFromText("Order #ZEP1234 Delivery in 6 mins Total ₹249"),
    [],
    "expected installed order parser to reject eta-only delivery-speed copy"
  );
  assertDeepEqual(
    parseOrdersFromText("Track order Out for delivery ETA: 8 mins Checkout and Pay Total ₹249"),
    [
      {
        id: undefined,
        status: "Out for delivery",
        eta: "8 mins",
        total: "₹249",
        rawText: "Track order Out for delivery ETA: 8 mins Checkout and Pay Total ₹249"
      }
    ],
    "expected installed order parser to trim final action text from ETA"
  );
  assertDeepEqual(
    parseOrdersFromText("Order #ZEP1234 Delivered Items total ₹32"),
    [
      {
        id: "ZEP1234",
        status: "Delivered",
        eta: undefined,
        total: undefined,
        rawText: "Order #ZEP1234 Delivered Items total ₹32"
      }
    ],
    "expected installed order parser not to report items total as final order total"
  );
  assertDeepEqual(
    parseOrdersFromText("Order #ZEP1234 Delivered Sub total ₹32"),
    [
      {
        id: "ZEP1234",
        status: "Delivered",
        eta: undefined,
        total: undefined,
        rawText: "Order #ZEP1234 Delivered Sub total ₹32"
      }
    ],
    "expected installed order parser not to report sub total as final order total"
  );
  assertDeepEqual(
    parseOrdersFromText("Order #ZEP1234 Delivered Total\nSub total\n₹32"),
    [
      {
        id: "ZEP1234",
        status: "Delivered",
        eta: undefined,
        total: undefined,
        rawText: "Order #ZEP1234 Delivered Total Sub total ₹32"
      }
    ],
    "expected installed order parser not to skip through sub total to a price"
  );
  for (const text of [
    "My Orders Refunds Delivered Total ₹249",
    "Rate your order Delivered Total ₹249",
    "Review order Delivered Total ₹249",
    "My Orders Order Summary Total ₹249 Delivered",
    "My Orders Bill Summary Delivered Total ₹249",
    "My Orders Invoice Delivered Total ₹249",
    "My Orders Customer Support Delivered Total ₹249"
  ]) {
    assertDeepEqual(
      parseOrdersFromText(text),
      [],
      `expected installed order parser to reject no-id action row: ${text}`
    );
  }
  assertDeepEqual(
    parseOrdersFromText("Order #ZEP1234 Invoice Delivered Total ₹249"),
    [
      {
        id: "ZEP1234",
        status: "Delivered",
        eta: undefined,
        total: "₹249",
        rawText: "Order #ZEP1234 Invoice Delivered Total ₹249"
      }
    ],
    "expected installed order parser to keep id-bearing order rows with action labels"
  );
  assertDeepEqual(
    parseOrdersFromText("Track order Support Delivered Total ₹249"),
    [
      {
        id: undefined,
        status: "Delivered",
        eta: undefined,
        total: "₹249",
        rawText: "Track order Support Delivered Total ₹249"
      }
    ],
    "expected installed order parser to keep tracking-context order rows with action labels"
  );
  console.log("pass installed order extraction contract");
}

async function verifyInstalledOrderAutomationContract(prefixDir) {
  const ordersAutomationModulePath = join(
    prefixDir,
    "node_modules",
    packageJson.name,
    "dist",
    "automation",
    "orders.js"
  );
  const {
    isUnsafeAccountMenuClickText,
    isUnsafeOrdersOpenClickText,
    isUnsafeReorderActionClickText
  } = await import(pathToFileURL(ordersAutomationModulePath).href);

  for (const label of ["Customer Support", "Invoice", "Refund", "Return Request", "Cancellation", "Rate & Review"]) {
    assert(
      isUnsafeOrdersOpenClickText(label) === true,
      `expected installed order navigation label to be unsafe: ${label}`
    );
    assert(
      isUnsafeAccountMenuClickText(label) === true,
      `expected installed account-menu label to be unsafe: ${label}`
    );
  }
  for (const label of ["Order Now", "Checkout and Pay", "Pay with UPI", "Pay ₹249"]) {
    assert(
      isUnsafeOrdersOpenClickText(label) === true,
      `expected installed order navigation final action label to be unsafe: ${label}`
    );
    assert(
      isUnsafeAccountMenuClickText(label) === true,
      `expected installed account-menu final action label to be unsafe: ${label}`
    );
  }

  for (const label of [
    "Customer Support",
    "Invoice",
    "Refund",
    "Return Request",
    "Cancellation",
    "Rate & Review",
    "Review Your Order"
  ]) {
    assert(
      isUnsafeReorderActionClickText(label) === true,
      `expected installed reorder label to be unsafe: ${label}`
    );
  }
  for (const label of ["Order Now", "Checkout and Pay", "Pay with UPI", "Pay ₹249"]) {
    assert(
      isUnsafeReorderActionClickText(label) === true,
      `expected installed reorder final action label to be unsafe: ${label}`
    );
  }

  console.log("pass installed order automation contract");
}

async function verifyInstalledAddressAutomationContract(prefixDir) {
  const addressAutomationModulePath = join(
    prefixDir,
    "node_modules",
    packageJson.name,
    "dist",
    "automation",
    "address.js"
  );
  const {
    extractAddressLabel,
    isAddAddressClickText,
    isAddressManagerClickText,
    isLikelyAddressText,
    isUnsafeAddressAutomationClickText
  } = await import(pathToFileURL(addressAutomationModulePath).href);
  const { parseCartItemsFromText, parseProductCard } = await import(
    pathToFileURL(
      join(prefixDir, "node_modules", packageJson.name, "dist", "automation", "extract.js")
    ).href
  );

  for (const label of [
    "Delivery Address",
    "Select Location",
    "Select Delivery Location",
    "Select Delivery Address",
    "Change Delivery Address",
    "Set Delivery Location",
    "Choose Delivery Address",
    "Other - Study Home PG, Ramakrishna Ashrama Road, Bengaluru, Karnataka 560001 India"
  ]) {
    assert(isAddressManagerClickText(label) === true, `expected installed address-manager label to be accepted: ${label}`);
  }
  for (const label of ["Use current location", "Confirm Address", "Add Address", "Checkout", "UPI", "Pay ₹249", "Other", "Home"]) {
    assert(isAddressManagerClickText(label) === false, `expected installed address-manager label to be rejected: ${label}`);
  }
  for (const label of [
    "Add Address",
    "Add New Delivery Address",
    "Add Delivery Location",
    "Enter Complete Address",
    "Enter Delivery Location"
  ]) {
    assert(isAddAddressClickText(label) === true, `expected installed add-address label to be accepted: ${label}`);
  }
  assert(
    extractAddressLabel("Parents A-1204 Sunrise Society, Near Metro Station, Karnataka 560076 India") === "Parents",
    "expected installed address parser to derive custom saved-address labels"
  );
  const cartItems = parseCartItemsFromText(`
    Cart
    Delivery Address
    Parents
    A-1204 Sunrise Society
    Near Metro Station, Karnataka 560076 India
    Protein Bar
    50 g
    ₹120
    Qty 1
    Grand Total ₹120
  `);
  assert(
    cartItems.length === 1 && cartItems[0]?.name === "Protein Bar",
    "expected installed cart parser to ignore custom-label delivery address blocks"
  );
  const cartItemsWithInactiveSections = parseCartItemsFromText(`
    Cart
    Amul Taaza Toned Milk
    1 pack (500 ml)
    ₹32
    Qty 1
    Saved for later
    Protein Bar
    50 g
    ₹120
    Move to cart
    Currently unavailable
    Tender Coconut
    1 piece
    ₹65
    Notify Me
    Grand Total ₹32
  `);
  assert(
    cartItemsWithInactiveSections.length === 1 && cartItemsWithInactiveSections[0]?.name === "Amul Taaza Toned Milk",
    "expected installed cart parser to ignore inactive saved/unavailable cart sections"
  );
  const productFromControlAlt = parseProductCard(
    {
      imageAlt: "Image: Notify Me",
      text: "Notify Me\n₹120\nProtein Bar\n50 g"
    },
    0
  );
  assert(
    productFromControlAlt?.name === "Protein Bar",
    "expected installed product parser to ignore product-card control image alt text"
  );
  assert(
    parseProductCard(
      {
        imageAlt: "Image: Add Item",
        text: "Add Item\n₹120\n50 g"
      },
      0
    ) === undefined,
    "expected installed product parser not to invent names from product-card controls"
  );
  assert(
    parseProductCard(
      {
        text: "Checkout\n₹249\nPayment Methods\nUPI"
      },
      0
    ) === undefined,
    "expected installed product parser to reject checkout payment panels"
  );
  assert(
    parseProductCard(
      {
        text: "Free Gift\n1 piece\n₹0\nUnlocked at checkout"
      },
      0
    ) === undefined,
    "expected installed product parser to reject promo gift panels"
  );
  assert(
    parseProductCard(
      {
        text: "Zepto Pass\n1 month\n₹99"
      },
      0
    ) === undefined,
    "expected installed product parser to reject membership panels"
  );
  assert(
    parseProductCard(
      {
        text: "Buy More Save More\n50 g\n₹120"
      },
      0
    ) === undefined,
    "expected installed product parser to reject cart upsell panels"
  );
  assert(
    parseProductCard(
      {
        text: "Offer Zone\n1 pack\n₹99"
      },
      0
    ) === undefined,
    "expected installed product parser to reject offer panels"
  );
  for (const heading of ["Top Picks For You", "Best Offers For You", "Trending Deals", "Best Sellers"]) {
    assert(
      parseProductCard(
        {
          text: `${heading}\n50 g\n₹120`
        },
        0
      ) === undefined,
      `expected installed product parser to reject merchandising heading: ${heading}`
    );
  }
  for (const text of [
    "Clear Cart\n₹0",
    "Minimum order value\n₹99",
    "Small cart fee\n₹15",
    "Delivery Partner Tip\n₹10",
    "Handling fee\n₹5",
    "Order Summary\n₹249",
    "Bill Summary\n₹249",
    "View Bill\n₹249",
    "Delivery instructions\n₹0",
    "Add cooking instructions\n₹0",
    "Cancellation Policy\n₹0",
    "Refund Policy\n₹0",
    "Return Policy\n₹0",
    "Delivery Charges\n₹15",
    "Handling Charges\n₹5",
    "Platform Charges\n₹4",
    "Packaging Charges\n₹7",
    "Convenience Fees\n₹9",
    "Taxes\n₹12",
    "GST\n₹8",
    "Taxes and Charges\n₹20",
    "Service Charge\n₹10",
    "Service Charges\n₹10",
    "Rain Fee\n₹20",
    "Rain Charges\n₹20",
    "High Demand Fee\n₹15",
    "Long Distance Fee\n₹10",
    "Tip your delivery partner\n₹10",
    "Partner Tip\n₹10",
    "Donation\n₹1",
    "Feeding India Donation\n₹1",
    "Wallet Discount\n₹50"
  ]) {
    assert(
      parseProductCard(
        {
          text
        },
        0
      ) === undefined,
      `expected installed product parser to reject cart service row: ${text.split("\n")[0]}`
    );
  }
  for (const text of [
    "Delivery Location\n1 pack\n₹99",
    "Select delivery location\n1 pack\n₹99",
    "Add delivery address\n1 pack\n₹99",
    "Delivering to\n1 pack\n₹99",
    "Login / Sign Up\n1 pack\n₹99",
    "Continue with Phone\n1 pack\n₹99",
    "Enter mobile number\n1 pack\n₹99",
    "Verify OTP\n1 pack\n₹99",
    "My Account\n1 pack\n₹99"
  ]) {
    assert(
      parseProductCard(
        {
          text
        },
        0
      ) === undefined,
      `expected installed product parser to reject account/location prompt: ${text.split("\n")[0]}`
    );
  }
  assert(
    parseCartItemsFromText(`
      Cart
      Free Gift
      1 piece
      ₹0
      Unlocked at checkout
      Grand Total ₹120
    `).length === 0,
    "expected installed cart parser to reject promo gift rows"
  );
  assert(
    parseCartItemsFromText(`
      Cart
      Zepto Pass
      1 month
      ₹99
      Grand Total ₹120
    `).length === 0,
    "expected installed cart parser to reject membership rows"
  );
  assert(
    parseCartItemsFromText(`
      Cart
      Checkout
      Payment Methods
      UPI
      Pay ₹249
      Grand Total ₹249
    `).length === 0,
    "expected installed cart parser to reject checkout payment panels"
  );
  assert(
    parseCartItemsFromText(`
      Cart
      Buy More Save More
      50 g
      ₹120
      Grand Total ₹120
    `).length === 0,
    "expected installed cart parser to reject cart upsell rows"
  );
  assert(
    parseCartItemsFromText(`
      Cart
      Offer Zone
      1 pack
      ₹99
      Grand Total ₹99
    `).length === 0,
    "expected installed cart parser to reject offer rows"
  );
  for (const heading of ["Top Picks For You", "Best Offers For You", "Trending Deals", "Best Sellers"]) {
    assert(
      parseCartItemsFromText(`
        Cart
        ${heading}
        50 g
        ₹120
        Grand Total ₹120
      `).length === 0,
      `expected installed cart parser to reject merchandising heading: ${heading}`
    );
  }
  for (const row of [
    "Clear Cart\n₹0",
    "Minimum order value\n₹99",
    "Small cart fee\n₹15",
    "Delivery Partner Tip\n₹10",
    "Handling fee\n₹5",
    "Order Summary\n₹249",
    "Bill Summary\n₹249",
    "View Bill\n₹249",
    "Delivery instructions\n₹0",
    "Add cooking instructions\n₹0",
    "Cancellation Policy\n₹0",
    "Refund Policy\n₹0",
    "Return Policy\n₹0",
    "Delivery Charges\n₹15",
    "Handling Charges\n₹5",
    "Platform Charges\n₹4",
    "Packaging Charges\n₹7",
    "Convenience Fees\n₹9",
    "Taxes\n₹12",
    "GST\n₹8",
    "Taxes and Charges\n₹20",
    "Service Charge\n₹10",
    "Service Charges\n₹10",
    "Rain Fee\n₹20",
    "Rain Charges\n₹20",
    "High Demand Fee\n₹15",
    "Long Distance Fee\n₹10",
    "Tip your delivery partner\n₹10",
    "Partner Tip\n₹10",
    "Donation\n₹1",
    "Feeding India Donation\n₹1",
    "Wallet Discount\n₹50",
    "Round Off\n₹1"
  ]) {
    assert(
      parseCartItemsFromText(`
        Cart
        ${row}
        Grand Total ₹249
      `).length === 0,
      `expected installed cart parser to reject cart service row: ${row.split("\n")[0]}`
    );
  }
  for (const prompt of ["Delivery Location", "Select delivery location", "Add delivery address", "Login / Sign Up", "Verify OTP"]) {
    assert(
      parseCartItemsFromText(`
        Cart
        ${prompt}
        1 pack
        ₹99
        Qty 1
        Grand Total ₹99
      `).length === 0,
      `expected installed cart parser to reject account/location prompt: ${prompt}`
    );
  }
  for (const unsafeText of [
    "Checkout",
    "Pay Now",
    "Order Summary",
    "Bill Summary",
    "Cart",
    "Customer Support",
    "Invoice",
    "Refund",
    "Cancellation",
    "Rate & Review",
    "Order Now",
    "Checkout and Pay",
    "Pay with UPI",
    "Pay ₹249"
  ]) {
    assert(
      isUnsafeAddressAutomationClickText(unsafeText) === true,
      `expected installed address automation label to be unsafe: ${unsafeText}`
    );
  }
  for (const rejectedText of [
    "Order Now Home 221B Baker Street, Bengaluru, India",
    "Checkout and Pay Home 221B Baker Street, Bengaluru, India",
    "Pay with UPI Home 221B Baker Street, Bengaluru, India",
    "Pay ₹249 Home 221B Baker Street, Bengaluru, India"
  ]) {
    assert(
      isLikelyAddressText(rejectedText) === false,
      `expected installed address parser to reject final action address copy: ${rejectedText}`
    );
  }
  for (const rejectedText of [
    "Beco Natural Floor Cleaner Liquid",
    "Bingo! Original Style Chilli Sprinkled | Flat Cut Spicy Potato Chips",
    "India Gate Dubar Basmati Rice | Long Slender Grains",
    "Mother Dairy Near Me |",
    "Paan shop near me |",
    "Parachute 100% Pure Coconut Oil",
    "Bare Anatomy Rosemary Water Spray for Hair Growth, 100% Natural"
  ]) {
    assert(
      isLikelyAddressText(rejectedText) === false,
      `expected installed address parser to reject product copy: ${rejectedText}`
    );
  }
  for (const rejectedText of [
    "Checkout",
    "Pay Now",
    "Order Summary",
    "Bill Summary",
    "Cart",
    "Use Current Location",
    "Change to current location",
    "Save Address",
    "Confirm Address",
    "Address selected",
    "Customer Support",
    "Invoice",
    "Refund",
    "Cancellation",
    "Rate & Review"
  ]) {
    assert(
      isAddressManagerClickText(rejectedText) === false,
      `expected installed address manager label to be rejected: ${rejectedText}`
    );
    assert(
      isAddAddressClickText(rejectedText) === false,
      `expected installed add-address label to be rejected: ${rejectedText}`
    );
  }
  console.log("pass installed address automation contract");
}

async function verifyInstalledSessionContract(prefixDir) {
  const packageDir = join(prefixDir, "node_modules", packageJson.name);
  const sessionModuleUrl = pathToFileURL(join(packageDir, "dist", "storage", "session.js")).href;
  const sqliteModuleUrl = pathToFileURL(join(packageDir, "dist", "storage", "sqlite.js")).href;
  const pathsModuleUrl = pathToFileURL(join(packageDir, "dist", "config", "paths.js")).href;
  const sessionDataDir = join(tempRoot, "installed-session-contract");
  const script = `
    import Database from "better-sqlite3";
    import { mkdirSync, writeFileSync } from "node:fs";
    import { join } from "node:path";
    import { SessionStore } from ${JSON.stringify(sessionModuleUrl)};
    import { SqliteStore } from ${JSON.stringify(sqliteModuleUrl)};
    import { resolveAppPaths } from ${JSON.stringify(pathsModuleUrl)};

    const paths = resolveAppPaths(${JSON.stringify(sessionDataDir)});
    const sqlite = new SqliteStore(paths.dbPath);
    const session = new SessionStore(paths, sqlite);

    try {
      writeFileSync(
        paths.authStatePath,
        JSON.stringify({
          cookies: [
            {
              name: "customerProfile",
              value: "present",
              domain: "www.zepto.com",
              path: "/"
            },
            {
              name: "phoneNumber",
              value: "present",
              domain: ".zeptonow.com",
              path: "/"
            }
          ],
          origins: [
            {
              origin: "https://www.zepto.com",
              localStorage: [
                {
                  name: "mobileNumber",
                  value: "present"
                },
                {
                  name: "identity",
                  value: "present"
                }
              ]
            }
          ]
        })
      );
      mkdirSync(join(paths.browserProfileDir, "Default"), { recursive: true });
      writeFileSync(join(paths.browserProfileDir, "Default", "Cookies"), "cookie-data");
      session.markLoggedIn();

      assert(
        session.hasStorageState() === false,
        "expected installed session auth-state contract to reject weak profile/contact keys"
      );
      assert(
        session.status().confirmedSession === false,
        "expected installed session status to reject weak profile/contact auth state"
      );

      writeFileSync(
        paths.authStatePath,
        JSON.stringify({
          cookies: [
            {
              name: "loginModalSeen",
              value: "true",
              domain: "www.zepto.com",
              path: "/"
            },
            {
              name: "loggedOut",
              value: "false",
              domain: ".zeptonow.com",
              path: "/"
            }
          ],
          origins: [
            {
              origin: "https://www.zepto.com",
              localStorage: [
                {
                  name: "isLoggedIn",
                  value: "true"
                },
                {
                  name: "lastLoginPrompt",
                  value: "2026-06-03"
                }
              ]
            }
          ]
        })
      );
      assert(
        session.hasStorageState() === false,
        "expected installed session auth-state contract to reject bare login/logged flags"
      );
      assert(
        session.status().confirmedSession === false,
        "expected installed session status to reject bare login/logged auth flags"
      );

      writeFileSync(
        paths.authStatePath,
        JSON.stringify({
          cookies: [
            {
              name: "XSRF-TOKEN",
              value: "present",
              domain: "www.zepto.com",
              path: "/"
            },
            {
              name: "csrfToken",
              value: "present",
              domain: ".zeptonow.com",
              path: "/"
            }
          ],
          origins: [
            {
              origin: "https://www.zepto.com",
              localStorage: [
                {
                  name: "antiForgeryToken",
                  value: "present"
                },
                {
                  name: "requestVerificationToken",
                  value: "present"
                }
              ]
            }
          ]
        })
      );
      assert(
        session.hasStorageState() === false,
        "expected installed session auth-state contract to reject CSRF/XSRF token keys"
      );
      assert(
        session.status().confirmedSession === false,
        "expected installed session status to reject CSRF/XSRF auth state"
      );

      writeFileSync(
        paths.authStatePath,
        JSON.stringify({
          cookies: [
            {
              name: "sid",
              value: "present",
              domain: "www.zepto.com",
              path: "/"
            }
          ],
          origins: []
        })
      );
      assert(
        session.hasStorageState() === true,
        "expected installed session auth-state contract to accept strong auth keys"
      );
      assert(session.status().confirmedSession === true, "expected installed session status to accept strong auth state");
    } finally {
      sqlite.close();
    }

    const cartCachePaths = resolveAppPaths(join(${JSON.stringify(sessionDataDir)}, "cart-cache"));
    const legacyCartDb = new Database(cartCachePaths.dbPath);
    legacyCartDb.exec(\`
      create table cart_snapshots (
        id integer primary key autoincrement,
        items_json text not null,
        total text,
        raw_text text,
        created_at text not null
      );

      insert into cart_snapshots (items_json, total, raw_text, created_at)
      values
        ('[{"name":"cache-cart-item-1","unit":"500 ml","price":"₹32"},{"name":"Amul Milk","unit":"1 L"}]', '₹90', 'Cart Amul Milk 500 ml', datetime('now')),
        ('not-json', '₹10', 'Cart raw text', datetime('now'));
    \`);
    legacyCartDb.close();

    const migratedCartSqlite = new SqliteStore(cartCachePaths.dbPath);
    migratedCartSqlite.close();

    const migratedCartDb = new Database(cartCachePaths.dbPath, { readonly: true });
    try {
      const rows = migratedCartDb
        .prepare("select items_json, total, raw_text from cart_snapshots order by id")
        .all();
      const serializedRows = JSON.stringify(rows);
      assert(
        rows[0]?.items_json === JSON.stringify([{ name: "cache-cart-item-1" }, { name: "cache-cart-item-2" }]),
        "expected installed cart cache migration to keep marker-only item counts"
      );
      assert(rows[1]?.items_json === "[]", "expected installed cart cache migration to scrub malformed item JSON");
      assert(rows.every((row) => row.total === null), "expected installed cart cache migration to clear totals");
      assert(rows.every((row) => row.raw_text === null), "expected installed cart cache migration to clear raw text");
      assert(!serializedRows.includes("Amul"), "expected installed cart cache migration to omit raw product names");
      assert(!serializedRows.includes("500 ml"), "expected installed cart cache migration to omit raw product units");
      assert(!serializedRows.includes("₹32"), "expected installed cart cache migration to omit raw product prices");
    } finally {
      migratedCartDb.close();
    }

    function assert(condition, message) {
      if (!condition) {
        throw new Error(message);
      }
    }
  `;

  run(process.execPath, ["--input-type=module", "--eval", script], {
    cwd: rootDir,
    env: sanitizedChildEnv(process.env, {
      FORCE_COLOR: "0",
      NO_COLOR: "1"
    })
  });

  console.log("pass installed session auth-state contract");
}

async function verifyInstalledLiveVerifierContract(prefixDir) {
  const packageDir = join(prefixDir, "node_modules", packageJson.name);
  const installedPackageJson = JSON.parse(readFileSync(join(packageDir, "package.json"), "utf8"));
  const liveReportUtilsPath = join(packageDir, "scripts", "live-report-utils.mjs");
  const liveVerifierPath = join(packageDir, "scripts", "verify-live-flow.mjs");
  const liveReportVerifierPath = join(packageDir, "scripts", "verify-live-report.mjs");

  assert(
    installedPackageJson.scripts?.["verify:live"] === "node scripts/verify-live-flow.mjs",
    "expected installed verify:live package script"
  );
  assert(
    installedPackageJson.scripts?.["verify:live:report"] === "node scripts/verify-live-report.mjs",
    "expected installed verify:live:report package script"
  );
  assert(existsSync(liveReportUtilsPath), "expected installed live-report-utils script");
  assert(existsSync(liveVerifierPath), "expected installed verify-live-flow script");
  assert(existsSync(liveReportVerifierPath), "expected installed live report acceptance validator");
  const liveVerifierSource = readFileSync(liveVerifierPath, "utf8");
  assert(
    liveVerifierSource.includes("version: packageJson.version"),
    "expected installed live verifier report to include package version"
  );
  assert(
    liveVerifierSource.includes("productCount: readableProductCount(payload)") &&
      liveVerifierSource.includes("productDetailCount: detailedProductCount(payload)") &&
      liveVerifierSource.includes("productHasDetail: hasReadableProductDetail(payload.product)") &&
      liveVerifierSource.includes("const addressCount = readableAddressCount(addresses)") &&
      liveVerifierSource.includes("addressCount,") &&
      liveVerifierSource.includes("selectedCount: readableSelectedAddressCount(addresses)") &&
      liveVerifierSource.includes("hasAddressDetail: addressCount > 0") &&
      liveVerifierSource.includes("cartItemCount: readableCartItemCount(payload)") &&
      liveVerifierSource.includes("orderCount: readableOrderCount(orders)") &&
      liveVerifierSource.includes("latestHasStatus: hasReadableText(orders[0]?.status)") &&
      liveVerifierSource.includes("latestHasEta: hasReadableText(orders[0]?.eta)"),
    "expected installed live verifier summaries to count readable records and product detail evidence"
  );
  assert(
    liveVerifierSource.includes("summarizeLiveRunnerFailure(error)") &&
      liveVerifierSource.includes('name: "live runner"'),
    "expected installed live verifier to record sanitized internal runner failures"
  );
  assert(
    liveVerifierSource.includes("const LIVE_STATUS_MAX_ATTEMPTS = 3") &&
      liveVerifierSource.includes("const LIVE_STATUS_RETRY_DELAY_MS = 5_000") &&
      liveVerifierSource.includes("if (report.requested.liveSession !== true)") &&
      liveVerifierSource.includes("const liveStatus = await runLiveStatusStep()") &&
      liveVerifierSource.includes("isRetryableUnknownLiveStatus(result)") &&
      liveVerifierSource.includes('result?.payload?.liveSession?.state === "unknown"') &&
      liveVerifierSource.includes('removeLastReportStep("status live")'),
    "expected installed live verifier to retry ambiguous live-session checks without storing failed duplicate steps"
  );
  assert(
    liveVerifierSource.indexOf("if (report.requested.liveSession !== true)") <
      liveVerifierSource.indexOf("const liveStatus = await runLiveStatusStep()"),
    "expected installed live verifier to skip live-session checks when no live workflow was requested"
  );
  assert(
    liveVerifierSource.includes("const reportWriteError = writeLiveReport(reportPath, report)") &&
      liveVerifierSource.includes("Could not write live verification report.") &&
      liveVerifierSource.includes("Choose a writable report file path and rerun with --report <path>.") &&
      !liveVerifierSource.includes("console.error(error.message)"),
    "expected installed live verifier to sanitize report write failures"
  );
  assert(
    liveVerifierSource.includes('process.once("SIGINT", () => handleInterrupt("SIGINT"))') &&
      liveVerifierSource.includes('process.once("SIGTERM", () => handleInterrupt("SIGTERM"))') &&
      liveVerifierSource.includes("Live verification interrupted by the user.") &&
      liveVerifierSource.includes("Review the visible Zepto browser state, then rerun verify:live when ready.") &&
      liveVerifierSource.includes("finishInterruptedRun(signal, exitCode)") &&
      liveVerifierSource.includes("writeLiveReport(reportPath, report)"),
    "expected installed live verifier to write sanitized partial reports on interrupts"
  );
  assert(
    liveVerifierSource.includes("parsed.checkoutWait = true"),
    "expected installed verify:live production-scope preset to enable checkout wait"
  );
  assert(
    liveVerifierSource.includes("options.cartRemoveLimitItems") &&
      liveVerifierSource.includes('cartArgs.splice(cartArgs.length - 1, 0, "--remove-limit-items")') &&
      liveVerifierSource.includes("--cart-remove-limit-items can only be used when cart evidence is requested."),
    "expected installed verify:live to support explicit cart item-limit warning removal"
  );
  assert(
    liveVerifierSource.includes("options.addRemoveLimitItems") &&
      liveVerifierSource.includes('addArgs.splice(addArgs.length - 1, 0, "--remove-limit-items")') &&
      liveVerifierSource.includes("--add-remove-limit-items can only be used with --add."),
    "expected installed verify:live to support explicit add item-limit warning removal"
  );
  assert(
    liveVerifierSource.includes("options.checkoutRemoveLimitItems") &&
      liveVerifierSource.includes('checkoutArgs.splice(checkoutArgs.length - 1, 0, "--remove-limit-items")') &&
      liveVerifierSource.includes("--checkout-remove-limit-items can only be used with --checkout or --production-scope."),
    "expected installed verify:live to support explicit checkout item-limit warning removal"
  );
  assert(
    liveVerifierSource.includes("shouldContinueAfterManualCheckout(checkoutResult)") &&
      liveVerifierSource.includes("function shouldContinueAfterManualCheckout(result)") &&
      liveVerifierSource.includes("!options.productionScope") &&
      liveVerifierSource.includes("Production-scope verification stops before tracking because checkout handoff coverage is missing."),
    "expected installed verify:live production-scope to stop before track when checkout handoff coverage is missing"
  );

  const result = runNpm(installedVerifyLiveArgs(packageDir, "--help"), { cwd: rootDir });
  assert(result.stdout.includes("Usage: npm --silent run verify:live"), "expected installed verify:live usage to use silent npm");
  assert(result.stdout.includes("human-controlled live verification"), "expected installed verify:live help output");
  assert(result.stdout.includes("--production-scope"), "expected installed verify:live production-scope option");
  assert(result.stdout.includes("--reorder-last"), "expected installed verify:live reorder option");
  assert(result.stdout.includes("--choose-add"), "expected installed verify:live choose-add option");
  assert(result.stdout.includes("--add-remove-limit-items"), "expected installed verify:live add limit-warning removal option");
  assert(result.stdout.includes("--remove <query>"), "expected installed verify:live remove option");
  assert(result.stdout.includes("--clear"), "expected installed verify:live clear option");
  assert(
    result.stdout.includes("--cart-remove-limit-items") &&
      result.stdout.includes("cart evidence") &&
      result.stdout.includes("click Zepto's Remove Items action"),
    "expected installed verify:live cart limit-warning removal option"
  );
  assert(
    result.stdout.includes("--checkout-remove-limit-items") &&
      result.stdout.includes("click Zepto's Remove Items action"),
    "expected installed verify:live checkout limit-warning removal option"
  );
  assert(result.stdout.includes("--step-timeout <ms>"), "expected installed verify:live step-timeout option");
  assert(
    result.stdout.includes("npm --silent run verify:live"),
    "expected installed verify:live help to mention silent npm invocation for shared logs"
  );
  assert(
    result.stdout.includes("accepts 10-digit, +91, or leading-0 Indian mobile formats"),
    "expected installed verify:live login phone format guidance"
  );
  assert(
    result.stdout.includes("requested, attempted, coverage, and missingCoverage booleans") &&
      result.stdout.includes("partial runs cannot be mistaken for full verification"),
    "expected installed verify:live help to explain report summary booleans"
  );
  assert(
    result.stdout.includes("Manual precondition failures") &&
      result.stdout.includes("are not counted as workflow attempts"),
    "expected installed verify:live help to keep manual preconditions separate from workflow attempts"
  );
  assert(
    result.stdout.includes("Use --production-scope for the final production readiness run"),
    "expected installed verify:live help to explain production-scope preset"
  );
  assert(
    result.stdout.includes("If checkout remains at checkout_manual_action_required, production-scope verification stops before track"),
    "expected installed verify:live help to explain production-scope stops before track without checkout handoff"
  );
  assert(
    result.stdout.includes("Use --add-remove-limit-items only when the visible Zepto add verification step shows item-limit warnings"),
    "expected installed verify:live help to explain explicit add limit-warning removal"
  );
  assert(
    result.stdout.includes("Use --cart-remove-limit-items only when the visible Zepto cart evidence step shows item-limit warnings"),
    "expected installed verify:live help to explain explicit cart limit-warning removal"
  );
  assert(
    result.stdout.includes("Use --checkout-remove-limit-items only when the visible Zepto cart shows item-limit warnings"),
    "expected installed verify:live help to explain explicit checkout limit-warning removal"
  );
  assert(result.stdout.includes("omits raw page text"), "expected installed verify:live sanitized-report guidance");
  assert(result.stdout.includes("npm-token-shaped values"), "expected installed verify:live npm-token redaction guidance");
  assert(
    result.stdout.includes("standalone percent-encoded sensitive fragments"),
    "expected installed verify:live percent-encoded fragment redaction guidance"
  );
  assert(result.stdout.includes("Stable report failure codes include"), "expected installed verify:live stable-code guidance");
  assert(
    result.stdout.includes("live_verification_incomplete"),
    "expected installed verify:live manual-precondition code guidance"
  );
  assert(result.stdout.includes("live_command_launch_failed"), "expected installed verify:live command-launch code guidance");
  assert(result.stdout.includes("live_command_timeout"), "expected installed verify:live command-timeout code guidance");
  assert(result.stdout.includes("live_summary_failed"), "expected installed verify:live summary-failure code guidance");
  assert(result.stdout.includes("command_failed"), "expected installed verify:live fallback code guidance");

  const reportHelpResult = runNpm(
    ["--silent", "run", "--prefix", packageDir, "verify:live:report", "--", "--help"],
    { cwd: rootDir }
  );
  assert(
    reportHelpResult.stdout.includes("--max-age-minutes <minutes>|--max-age-minutes=<minutes>"),
    "expected installed verify:live:report max-age option"
  );
  assert(
    reportHelpResult.stdout.includes("requires --max-age-minutes") &&
      reportHelpResult.stdout.includes("Use --max-age-minutes so old saved reports cannot be reused") &&
      reportHelpResult.stdout.includes("It accepts either --max-age-minutes <minutes> or --max-age-minutes=<minutes>."),
    "expected installed verify:live:report freshness guidance"
  );
  assert(
    reportHelpResult.stdout.includes("workflow was requested and has passing coverage"),
    "expected installed verify:live:report production-scope request guidance"
  );
  assert(
    reportHelpResult.stdout.includes("non-empty cart"),
    "expected installed verify:live:report production-scope cart-state guidance"
  );
  assert(
    reportHelpResult.stdout.includes("address-add, address-list, remove, clear, history, and reorder workflows"),
    "expected installed verify:live:report production-scope focused-workflow exclusion guidance"
  );
  assert(
    reportHelpResult.stdout.includes("checkout_manual_action_required is manual continuation evidence only"),
    "expected installed verify:live:report manual checkout exclusion guidance"
  );
  assert(
    reportHelpResult.stdout.includes(
      "manualEvidence is diagnostic only, must preserve humanActionRequired, automationBoundary, handoffUrl, and handoffSurface markers"
    ),
    "expected installed verify:live:report manual checkout boundary guidance"
  );
  assert(
    reportHelpResult.stdout.includes("manual/internal command markers are accepted only for runner-defined precondition/internal failure steps"),
    "expected installed verify:live:report manual/internal command marker guidance"
  );

  const invalidPhoneResult = runNpmResult(
    installedVerifyLiveArgs(
      packageDir,
      "--data-dir",
      join(tempRoot, "live-invalid-phone-data"),
      "--login",
      "--phone",
      "phone 9876543210"
    ),
    { cwd: rootDir }
  );
  assert(invalidPhoneResult.status === 1, "expected installed verify:live invalid phone to fail");
  assert(
    invalidPhoneResult.stderr.includes("--phone must be a valid Indian mobile number."),
    "expected installed verify:live invalid phone message"
  );
  assert(
    !invalidPhoneResult.stderr.includes("Compiled CLI was not found"),
    "expected installed verify:live invalid phone to fail before compiled CLI checks"
  );
  assert(
    !`${invalidPhoneResult.stdout}\n${invalidPhoneResult.stderr}`.includes("9876543210"),
    "expected installed verify:live invalid phone output to omit raw phone input"
  );

  const compatiblePhoneResult = runNpmResult(
    installedVerifyLiveArgs(
      packageDir,
      "--data-dir",
      join(tempRoot, "live-compatible-phone-data"),
      "--login",
      "--phone",
      "+91 98765 43210",
      "--quantity",
      "2"
    ),
    { cwd: rootDir }
  );
  assert(compatiblePhoneResult.status === 1, "expected installed verify:live compatible phone guard to fail on quantity");
  assert(
    compatiblePhoneResult.stderr.includes("--quantity can only be used with --add."),
    "expected installed verify:live compatible phone to pass phone parsing before quantity validation"
  );
  assert(
    !compatiblePhoneResult.stderr.includes("--phone must be a valid"),
    "expected installed verify:live to accept CLI-compatible phone formats"
  );
  assert(
    !compatiblePhoneResult.stderr.includes("Compiled CLI was not found"),
    "expected installed verify:live compatible phone guard to fail before compiled CLI checks"
  );
  assert(
    !`${compatiblePhoneResult.stdout}\n${compatiblePhoneResult.stderr}`.includes("98765 43210"),
    "expected installed verify:live compatible phone output to omit raw phone input"
  );

  const chooseAddWithoutAddResult = runNpmResult(
    installedVerifyLiveArgs(
      packageDir,
      "--data-dir",
      join(tempRoot, "live-choose-add-without-add-data"),
      "--choose-add"
    ),
    { cwd: rootDir }
  );
  assert(chooseAddWithoutAddResult.status === 1, "expected installed verify:live choose-add without add to fail");
  assert(
    chooseAddWithoutAddResult.stderr.includes("--choose-add can only be used with --add."),
    "expected installed verify:live choose-add guard"
  );
  assert(
    !chooseAddWithoutAddResult.stderr.includes("Compiled CLI was not found"),
    "expected installed verify:live choose-add guard to fail before compiled CLI checks"
  );

  const addRemoveLimitWithoutAddResult = runNpmResult(
    installedVerifyLiveArgs(
      packageDir,
      "--data-dir",
      join(tempRoot, "live-add-remove-limit-without-add-data"),
      "--add-remove-limit-items"
    ),
    { cwd: rootDir }
  );
  assert(addRemoveLimitWithoutAddResult.status === 1, "expected installed verify:live add limit-warning removal without add to fail");
  assert(
    addRemoveLimitWithoutAddResult.stderr.includes("--add-remove-limit-items can only be used with --add."),
    "expected installed verify:live add limit-warning removal guard"
  );
  assert(
    !addRemoveLimitWithoutAddResult.stderr.includes("Compiled CLI was not found"),
    "expected installed verify:live add limit-warning removal guard to fail before compiled CLI checks"
  );

  const cartRemoveLimitWithoutCartEvidenceResult = runNpmResult(
    installedVerifyLiveArgs(
      packageDir,
      "--data-dir",
      join(tempRoot, "live-cart-remove-limit-without-cart-data"),
      "--cart-remove-limit-items"
    ),
    { cwd: rootDir }
  );
  assert(
    cartRemoveLimitWithoutCartEvidenceResult.status === 1,
    "expected installed verify:live cart limit-warning removal without cart evidence to fail"
  );
  assert(
    cartRemoveLimitWithoutCartEvidenceResult.stderr.includes(
      "--cart-remove-limit-items can only be used when cart evidence is requested."
    ),
    "expected installed verify:live cart limit-warning removal guard"
  );
  assert(
    !cartRemoveLimitWithoutCartEvidenceResult.stderr.includes("Compiled CLI was not found"),
    "expected installed verify:live cart limit-warning removal guard to fail before compiled CLI checks"
  );

  const checkoutRemoveLimitWithoutCheckoutResult = runNpmResult(
    installedVerifyLiveArgs(
      packageDir,
      "--data-dir",
      join(tempRoot, "live-checkout-remove-limit-without-checkout-data"),
      "--checkout-remove-limit-items"
    ),
    { cwd: rootDir }
  );
  assert(
    checkoutRemoveLimitWithoutCheckoutResult.status === 1,
    "expected installed verify:live checkout limit-warning removal without checkout to fail"
  );
  assert(
    checkoutRemoveLimitWithoutCheckoutResult.stderr.includes(
      "--checkout-remove-limit-items can only be used with --checkout or --production-scope."
    ),
    "expected installed verify:live checkout limit-warning removal guard"
  );
  assert(
    !checkoutRemoveLimitWithoutCheckoutResult.stderr.includes("Compiled CLI was not found"),
    "expected installed verify:live checkout limit-warning removal guard to fail before compiled CLI checks"
  );

  const productionScopeMissingInputsResult = runNpmResult(
    installedVerifyLiveArgs(packageDir, "--data-dir", join(tempRoot, "live-production-scope-missing-data"), "--production-scope"),
    { cwd: rootDir }
  );
  assert(
    productionScopeMissingInputsResult.status === 1,
    "expected installed verify:live production-scope missing inputs to fail"
  );
  assert(
    productionScopeMissingInputsResult.stderr.includes(
      "--production-scope requires --search <query>, --address <query>, and --add <query>."
    ),
    "expected installed verify:live production-scope missing input guard"
  );
  assert(
    !productionScopeMissingInputsResult.stderr.includes("Compiled CLI was not found"),
    "expected installed verify:live production-scope missing input guard to fail before compiled CLI checks"
  );

  const productionScopeFocusedOnlyResult = runNpmResult(
    installedVerifyLiveArgs(
      packageDir,
      "--data-dir",
      join(tempRoot, "live-production-scope-focused-only-data"),
      "--production-scope",
      "--search",
      "milk",
      "--address",
      "home",
      "--add",
      "milk",
      "--remove",
      "milk"
    ),
    { cwd: rootDir }
  );
  assert(
    productionScopeFocusedOnlyResult.status === 1,
    "expected installed verify:live production-scope extra workflow to fail"
  );
  assert(
    productionScopeFocusedOnlyResult.stderr.includes(
      "--production-scope cannot be combined with --address-add, --address-list, --remove, --clear, --history, or --reorder-last."
    ),
    "expected installed verify:live production-scope focused-only guard"
  );
  assert(
    productionScopeFocusedOnlyResult.stderr.includes(
      "Run those focused live verifications separately so final production-scope evidence stays clear."
    ),
    "expected installed verify:live production-scope focused-only guidance"
  );
  assert(
    !productionScopeFocusedOnlyResult.stderr.includes("Compiled CLI was not found"),
    "expected installed verify:live production-scope focused-only guard to fail before compiled CLI checks"
  );

  const unknownTokenOptionResult = runNpmResult(
    installedVerifyLiveArgs(packageDir, `--bad-${FAKE_NPM_TOKEN}`),
    { cwd: rootDir }
  );
  assert(unknownTokenOptionResult.status === 1, "expected installed verify:live unknown option to fail");
  assert(
    unknownTokenOptionResult.stderr.includes("Unknown option: --bad-<redacted-npm-token>."),
    "expected installed verify:live unknown option to redact npm-token-shaped values"
  );
  assert(
    !unknownTokenOptionResult.stderr.includes(FAKE_NPM_TOKEN),
    "expected installed verify:live unknown option output to omit npm-token-shaped value"
  );
  assert(
    !unknownTokenOptionResult.stderr.includes("Compiled CLI was not found"),
    "expected installed verify:live unknown option to fail before compiled CLI checks"
  );

  const unknownSearchAssignmentResult = runNpmResult(
    installedVerifyLiveArgs(packageDir, "--unknown-search=Amul Milk 500ml"),
    { cwd: rootDir }
  );
  assert(unknownSearchAssignmentResult.status === 1, "expected installed verify:live unknown assignment to fail");
  assert(
    unknownSearchAssignmentResult.stderr.includes("Unknown option: --unknown-search."),
    "expected installed verify:live unknown assignment to keep only the option name"
  );
  assert(
    unknownSearchAssignmentResult.stderr.includes(
      "Check the option name; supported value options accept both --option value and --option=value."
    ),
    "expected installed verify:live unknown assignment to explain assignment-form support"
  );
  assert(
    !`${unknownSearchAssignmentResult.stdout}\n${unknownSearchAssignmentResult.stderr}`.includes("Amul Milk 500ml"),
    "expected installed verify:live unknown assignment output to omit workflow query"
  );

  const unknownReportAssignmentPath = join(tempRoot, "live-secret-report.json");
  const unknownReportAssignmentResult = runNpmResult(
    installedVerifyLiveArgs(packageDir, `--unknown-report=${unknownReportAssignmentPath}`),
    { cwd: rootDir }
  );
  assert(unknownReportAssignmentResult.status === 1, "expected installed verify:live unknown report assignment to fail");
  assert(
    unknownReportAssignmentResult.stderr.includes("Unknown option: --unknown-report."),
    "expected installed verify:live unknown report assignment to keep only the option name"
  );
  assert(
    !`${unknownReportAssignmentResult.stdout}\n${unknownReportAssignmentResult.stderr}`.includes(tempRoot),
    "expected installed verify:live unknown assignment output to omit local temp paths"
  );

  const assignmentFormResult = runNpmResult(
    installedVerifyLiveArgs(
      packageDir,
      "--data-dir=.zepo-live",
      "--report=.zepo-live/live-verification-report.json",
      "--browser-locale=en-IN",
      "--browser-timezone=Asia/Kolkata",
      "--step-timeout=1000",
      "--login",
      "--phone=9999999999",
      "--production-scope",
      "--search=milk",
      "--address=home",
      "--add=milk",
      "--quantity=2",
      "--remove=milk"
    ),
    { cwd: rootDir }
  );
  assert(assignmentFormResult.status === 1, "expected installed verify:live assignment form guard to fail intentionally");
  assert(
    assignmentFormResult.stderr.includes(
      "--production-scope cannot be combined with --address-add, --address-list, --remove, --clear, --history, or --reorder-last."
    ),
    "expected installed verify:live to accept assignment-form values before production-scope validation"
  );
  assert(
    !assignmentFormResult.stderr.includes("Unknown option"),
    "expected installed verify:live assignment-form values not to be treated as unknown options"
  );
  assert(
    !`${assignmentFormResult.stdout}\n${assignmentFormResult.stderr}`.includes("9999999999") &&
      !`${assignmentFormResult.stdout}\n${assignmentFormResult.stderr}`.includes("milk") &&
      !`${assignmentFormResult.stdout}\n${assignmentFormResult.stderr}`.includes("home") &&
      !`${assignmentFormResult.stdout}\n${assignmentFormResult.stderr}`.includes(".zepo-live/live-verification-report.json"),
    "expected installed verify:live assignment-form guard output to omit phone, workflow queries, and report path"
  );

  const noSessionDataDir = join(tempRoot, "live-no-session-data");
  const noSessionReportPath = join(tempRoot, "live-no-session-report.json");
  const noSessionResult = runNpmResult(
    installedVerifyLiveArgs(
      packageDir,
      "--data-dir",
      noSessionDataDir,
      "--report",
      noSessionReportPath
    ),
    {
      cwd: rootDir,
      env: sanitizedChildEnv(process.env, {
        FORCE_COLOR: "0",
        NO_COLOR: "1"
      })
    }
  );
  assert(noSessionResult.status === 1, "expected installed verify:live no-session run to fail intentionally");
  assert(
    !`${noSessionResult.stdout}\n${noSessionResult.stderr}`.includes(tempRoot),
    "expected installed verify:live no-session console output to omit local temp paths"
  );
  assert(existsSync(noSessionReportPath), "expected installed verify:live no-session report");
  const noSessionReport = JSON.parse(readFileSync(noSessionReportPath, "utf8"));
  assert(noSessionReport.version === packageJson.version, "expected installed verify:live report version");
  assert(noSessionReport.ok === false, "expected installed verify:live no-session report to fail");
  assert(noSessionReport.dataDir === "<redacted-data-dir>", "expected installed verify:live report data dir redaction");
  assert(
    noSessionReport.reportPath === "<redacted-report-path>",
    "expected installed verify:live report path redaction"
  );
  assert(
    noSessionReport.steps?.some(
      (step) => step.name === "session precondition" && step.error?.code === "live_verification_incomplete"
    ),
    "expected installed verify:live no-session report to explain login evidence is incomplete"
  );
  const noSessionDoctorStep = noSessionReport.steps?.find((step) => step.name === "doctor");
  assert(
    noSessionDoctorStep?.summary?.browserAutomationReady === true,
    "expected installed verify:live no-session report to show browser automation readiness"
  );
  assert(
    noSessionDoctorStep?.summary?.playwrightChromiumPassed === true,
    "expected installed verify:live no-session report to show passing Playwright Chromium evidence"
  );
  assert(
    noSessionReport.coverage?.browserPreflight === true &&
      noSessionReport.coverage?.localStatus === true &&
      noSessionReport.coverage?.login === false &&
      noSessionReport.coverage?.checkoutHandoff === false,
    "expected installed verify:live no-session report coverage to distinguish preflight from account workflow"
  );
  assert(
    noSessionReport.requested?.browserPreflight === true &&
      noSessionReport.requested?.localStatus === true &&
      noSessionReport.requested?.login === false &&
      noSessionReport.requested?.checkoutHandoff === false,
    "expected installed verify:live no-session report requests to show explicit verification scope"
  );
  assert(
    noSessionReport.attempted?.browserPreflight === true &&
      noSessionReport.attempted?.localStatus === true &&
      noSessionReport.attempted?.login === false &&
      noSessionReport.attempted?.checkoutHandoff === false,
    "expected installed verify:live no-session report attempts to keep manual preconditions separate from workflow attempts"
  );
  assert(
    noSessionReport.missingCoverage?.browserPreflight === false &&
      noSessionReport.missingCoverage?.localStatus === false &&
      noSessionReport.missingCoverage?.login === false &&
      noSessionReport.missingCoverage?.checkoutHandoff === false,
    "expected installed verify:live no-session report missing coverage to include requested-but-unverified workflow steps only"
  );
  assert(
    !JSON.stringify(noSessionReport).includes(tempRoot),
    "expected installed verify:live report to omit local temp paths"
  );

  const requestedCheckoutDataDir = join(tempRoot, "live-requested-checkout-data");
  const requestedCheckoutReportPath = join(tempRoot, "live-requested-checkout-report.json");
  const requestedCheckoutResult = runNpmResult(
    installedVerifyLiveArgs(
      packageDir,
      "--data-dir",
      requestedCheckoutDataDir,
      "--report",
      requestedCheckoutReportPath,
      "--checkout"
    ),
    {
      cwd: rootDir,
      env: sanitizedChildEnv(process.env, {
        FORCE_COLOR: "0",
        NO_COLOR: "1"
      })
    }
  );
  assert(
    requestedCheckoutResult.status === 1,
    "expected installed verify:live requested-checkout no-session run to fail intentionally"
  );
  assert(
    !`${requestedCheckoutResult.stdout}\n${requestedCheckoutResult.stderr}`.includes(tempRoot),
    "expected installed verify:live requested-checkout console output to omit local temp paths"
  );
  assert(
    existsSync(requestedCheckoutReportPath),
    "expected installed verify:live requested-checkout no-session report"
  );
  const requestedCheckoutReport = JSON.parse(readFileSync(requestedCheckoutReportPath, "utf8"));
  assert(
    requestedCheckoutReport.requested?.liveSession === true &&
      requestedCheckoutReport.requested?.checkoutHandoff === true,
    "expected installed verify:live requested-checkout report to mark checkout scope requested"
  );
  assert(
    requestedCheckoutReport.coverage?.liveSession === false &&
      requestedCheckoutReport.coverage?.checkoutHandoff === false,
    "expected installed verify:live requested-checkout report to leave checkout coverage false without login"
  );
  assert(
    requestedCheckoutReport.missingCoverage?.liveSession === true &&
      requestedCheckoutReport.missingCoverage?.checkoutHandoff === true,
    "expected installed verify:live requested-checkout report to mark requested checkout coverage missing"
  );
  assert(
    !JSON.stringify(requestedCheckoutReport).includes(tempRoot),
    "expected installed verify:live requested-checkout report to omit local temp paths"
  );
  console.log("pass installed verify live requested checkout missing coverage");

  const productionScopeDataDir = join(tempRoot, "live-production-scope-data");
  const productionScopeReportPath = join(tempRoot, "live-production-scope-report.json");
  const productionScopeResult = runNpmResult(
    installedVerifyLiveArgs(
      packageDir,
      "--data-dir",
      productionScopeDataDir,
      "--report",
      productionScopeReportPath,
      "--production-scope",
      "--search",
      "milk",
      "--address",
      "home",
      "--add",
      "milk"
    ),
    {
      cwd: rootDir,
      env: sanitizedChildEnv(process.env, {
        FORCE_COLOR: "0",
        NO_COLOR: "1"
      })
    }
  );
  assert(
    productionScopeResult.status === 1,
    "expected installed verify:live production-scope no-session run to fail intentionally"
  );
  assert(
    !`${productionScopeResult.stdout}\n${productionScopeResult.stderr}`.includes(tempRoot),
    "expected installed verify:live production-scope console output to omit local temp paths"
  );
  assert(
    !`${productionScopeResult.stdout}\n${productionScopeResult.stderr}`.includes("milk") &&
      !`${productionScopeResult.stdout}\n${productionScopeResult.stderr}`.includes("home"),
    "expected installed verify:live production-scope console output to omit workflow query values"
  );
  assert(existsSync(productionScopeReportPath), "expected installed verify:live production-scope no-session report");
  const productionScopeReport = JSON.parse(readFileSync(productionScopeReportPath, "utf8"));
  assert(
    productionScopeReport.requested?.browserPreflight === true &&
      productionScopeReport.requested?.localStatus === true &&
      productionScopeReport.requested?.liveSession === true &&
      productionScopeReport.requested?.search === true &&
      productionScopeReport.requested?.addressUse === true &&
      productionScopeReport.requested?.add === true &&
      productionScopeReport.requested?.cart === true &&
      productionScopeReport.requested?.checkoutHandoff === true &&
      productionScopeReport.requested?.track === true,
    "expected installed verify:live production-scope report to request final readiness coverage"
  );
  assert(
    productionScopeReport.coverage?.browserPreflight === true &&
      productionScopeReport.coverage?.localStatus === true &&
      productionScopeReport.coverage?.liveSession === false &&
      productionScopeReport.coverage?.search === false &&
      productionScopeReport.coverage?.addressUse === false &&
      productionScopeReport.coverage?.add === false &&
      productionScopeReport.coverage?.cart === false &&
      productionScopeReport.coverage?.checkoutHandoff === false &&
      productionScopeReport.coverage?.track === false,
    "expected installed verify:live production-scope no-session report to leave account workflow coverage false"
  );
  assert(
    productionScopeReport.missingCoverage?.browserPreflight === false &&
      productionScopeReport.missingCoverage?.localStatus === false &&
      productionScopeReport.missingCoverage?.liveSession === true &&
      productionScopeReport.missingCoverage?.search === true &&
      productionScopeReport.missingCoverage?.addressUse === true &&
      productionScopeReport.missingCoverage?.add === true &&
      productionScopeReport.missingCoverage?.cart === true &&
      productionScopeReport.missingCoverage?.checkoutHandoff === true &&
      productionScopeReport.missingCoverage?.track === true,
    "expected installed verify:live production-scope report to mark final readiness coverage missing without login"
  );
  assert(
    !JSON.stringify(productionScopeReport).includes(tempRoot) &&
      !JSON.stringify(productionScopeReport).includes("milk") &&
      !JSON.stringify(productionScopeReport).includes("home"),
    "expected installed verify:live production-scope report to omit local paths and workflow query values"
  );
  console.log("pass installed verify live production scope preset");

  const {
    adjustLiveReportRequestsForConfirmedSession,
    buildLiveCommandLaunchFailureStep,
    buildLiveCommandTimeoutStep,
    buildLiveReportStep,
    createLiveConsoleTextRedactor,
    LIVE_REPORT_NOTE,
    redactArgsForLiveConsole,
    redactArgsForLiveReport,
    redactLiveConsoleText,
    summarizeCommandError,
    summarizeLiveReportAttempts,
    summarizeLiveReportCoverage,
    summarizeLiveReportMissingCoverage,
    summarizeLiveReportRequests,
    summarizeLiveRunnerFailure,
    validateLiveReportAcceptance
  } = await import(pathToFileURL(liveReportUtilsPath).href);
  assertDeepEqual(
    summarizeLiveReportRequests({
      login: true,
      search: "milk",
      address: "home",
      add: "milk",
      remove: "milk",
      checkout: true,
      history: true,
      reorderLast: true
    }),
    {
      browserPreflight: true,
      localStatus: true,
      login: true,
      liveSession: true,
      search: true,
      addressAdd: false,
      addressList: false,
      addressUse: true,
      add: true,
      cart: true,
      remove: true,
      clear: false,
      checkoutHandoff: true,
      track: false,
      history: true,
      reorder: true
    },
    "expected installed live report requests to include requested workflow scope without sensitive values"
  );
  const installedConditionalLoginRequest = summarizeLiveReportRequests({
    login: true
  });
  const installedConfirmedSessionRequest = adjustLiveReportRequestsForConfirmedSession(
    installedConditionalLoginRequest,
    {
      confirmedSession: true
    }
  );
  assert(
    installedConditionalLoginRequest.login === true &&
      installedConfirmedSessionRequest.login === false &&
      installedConfirmedSessionRequest.liveSession === true,
    "expected installed live report confirmed-session adjustment to make --login conditional"
  );
  const installedConfirmedSessionMissingCoverage = summarizeLiveReportMissingCoverage(
    installedConfirmedSessionRequest,
    summarizeLiveReportCoverage([
      {
        name: "doctor",
        command: "zepo --data-dir <redacted-data-dir> doctor --json",
        exitCode: 0,
        ok: true,
        summary: {
          ok: true,
          browserAutomationReady: true,
          playwrightChromiumPassed: true,
          warnings: [],
          failures: []
        }
      },
      {
        name: "status",
        command: "zepo --data-dir <redacted-data-dir> status --json",
        exitCode: 0,
        ok: true,
        summary: {
          confirmedSession: true,
          browserAutomationReady: true
        }
      },
      {
        name: "status live",
        command: "zepo --data-dir <redacted-data-dir> --visible status --live --json",
        exitCode: 0,
        ok: true,
        summary: {
          confirmedSession: true,
          browserAutomationReady: true,
          liveSessionState: "logged-in"
        }
      }
    ])
  );
  assert(
    installedConfirmedSessionMissingCoverage.login === false &&
      installedConfirmedSessionMissingCoverage.liveSession === false,
    "expected installed live report confirmed-session adjustment to avoid skipped login missing coverage"
  );
  console.log("pass installed live report conditional login request");

  const acceptedLiveReportSteps = [
    {
      name: "doctor",
      command: "zepo --data-dir <redacted-data-dir> doctor --json",
      exitCode: 0,
      ok: true,
      summary: {
        ok: true,
        browserAutomationReady: true,
        playwrightChromiumPassed: true,
        warnings: [],
        failures: []
      }
    },
    {
      name: "status",
      command: "zepo --data-dir <redacted-data-dir> status --json",
      exitCode: 0,
      ok: true,
      summary: {
        confirmedSession: true,
        browserAutomationReady: true
      }
    },
    {
      name: "status live",
      command: "zepo --data-dir <redacted-data-dir> --visible status --live --json",
      exitCode: 0,
      ok: true,
      summary: {
        confirmedSession: true,
        browserAutomationReady: true,
        liveSessionState: "logged-in"
      }
    },
    {
      name: "search",
      command: "zepo --data-dir <redacted-data-dir> --visible search <redacted-query> --json",
      exitCode: 0,
      ok: true,
      summary: {
        productCount: 1,
        productDetailCount: 1
      }
    },
    {
      name: "checkout",
      command: "zepo --data-dir <redacted-data-dir> --visible checkout --json",
      exitCode: 0,
      ok: true,
      summary: {
        status: "checkout_handoff_returned",
        humanActionRequired: true,
        automationBoundary: "zepocli_did_not_click_payment_or_order_controls",
        handoffUrl: "https://www.zepto.com/?cart=open",
        handoffSurface: "visible_zepto_browser",
        cartPrecondition: "non_empty_cart_verified",
        paymentStatus: "not_observed_by_zepocli",
        orderPlacement: "not_confirmed_by_zepocli",
        orderStatusCommand: "zepo track"
      }
    }
  ];
  const acceptedLiveReportRequested = summarizeLiveReportRequests({
    search: "milk",
    checkout: true
  });
  const acceptedLiveReportCoverage = summarizeLiveReportCoverage(acceptedLiveReportSteps);
  const acceptedLiveReport = {
    ok: true,
    version: packageJson.version,
    generatedAt: "2026-05-31T00:00:00.000Z",
    dataDir: "<redacted-data-dir>",
    reportPath: "<redacted-report-path>",
    note: LIVE_REPORT_NOTE,
    requested: acceptedLiveReportRequested,
    attempted: summarizeLiveReportAttempts(acceptedLiveReportSteps),
    coverage: acceptedLiveReportCoverage,
    missingCoverage: summarizeLiveReportMissingCoverage(acceptedLiveReportRequested, acceptedLiveReportCoverage),
    steps: acceptedLiveReportSteps
  };
  const productionScopeLiveReportSteps = [
    ...acceptedLiveReportSteps.slice(0, 3),
    {
      name: "address use",
      command: "zepo --data-dir <redacted-data-dir> --visible address use <redacted-address-query> --json",
      exitCode: 0,
      ok: true,
      summary: {
        selected: true,
        hasAddressText: true,
        hasAddressDetail: true
      }
    },
    acceptedLiveReportSteps[3],
    {
      name: "add",
      command: "zepo --data-dir <redacted-data-dir> --visible add <redacted-query> --quantity 1 --json",
      exitCode: 0,
      ok: true,
      summary: {
        productAdded: true,
        productHasDetail: true,
        cartItemCount: 1
      }
    },
    {
      name: "cart",
      command: "zepo --data-dir <redacted-data-dir> --visible cart --json",
      exitCode: 0,
      ok: true,
      summary: {
        cartItemCount: 1,
        hasTotal: true
      }
    },
    {
      ...acceptedLiveReportSteps[4],
      command: "zepo --data-dir <redacted-data-dir> --visible checkout --wait --json"
    },
    {
      name: "track",
      command: "zepo --data-dir <redacted-data-dir> --visible track --json",
      exitCode: 0,
      ok: true,
      summary: {
        orderCount: 1,
        latestHasStatus: true,
        latestHasEta: false
      }
    }
  ];
  const productionScopeLiveReportRequested = summarizeLiveReportRequests({
    search: "milk",
    address: "home",
    add: "milk",
    cart: true,
    checkout: true,
    track: true
  });
  const productionScopeLiveReportCoverage = summarizeLiveReportCoverage(productionScopeLiveReportSteps);
  const productionScopeLiveReport = {
    ...acceptedLiveReport,
    requested: productionScopeLiveReportRequested,
    attempted: summarizeLiveReportAttempts(productionScopeLiveReportSteps),
    coverage: productionScopeLiveReportCoverage,
    missingCoverage: summarizeLiveReportMissingCoverage(
      productionScopeLiveReportRequested,
      productionScopeLiveReportCoverage
    ),
    steps: productionScopeLiveReportSteps
  };
  const freshProductionScopeLiveReport = {
    ...productionScopeLiveReport,
    generatedAt: new Date().toISOString()
  };
  assert(
    validateLiveReportAcceptance(acceptedLiveReport, { expectedVersion: packageJson.version }).accepted === true,
    "expected installed live report acceptance helper to accept complete report evidence"
  );
  const notReadyLiveSessionReport = {
    ...acceptedLiveReport,
    steps: acceptedLiveReport.steps.map((step) =>
      step.name === "status live"
        ? {
            ...step,
            summary: {
              ...step.summary,
              browserAutomationReady: false
            }
          }
        : step
    )
  };
  notReadyLiveSessionReport.attempted = summarizeLiveReportAttempts(notReadyLiveSessionReport.steps);
  notReadyLiveSessionReport.coverage = summarizeLiveReportCoverage(notReadyLiveSessionReport.steps);
  notReadyLiveSessionReport.missingCoverage = summarizeLiveReportMissingCoverage(
    notReadyLiveSessionReport.requested,
    notReadyLiveSessionReport.coverage
  );
  assert(
    validateLiveReportAcceptance(notReadyLiveSessionReport, {
      expectedVersion: packageJson.version
    }).issues.some((issue) => issue.code === "live_report_step_contract_mismatch"),
    "expected installed live report acceptance helper to reject live session without browser readiness"
  );
  assert(
    validateLiveReportAcceptance(acceptedLiveReport).issues.some(
      (issue) => issue.code === "live_report_expected_version_missing"
    ),
    "expected installed live report acceptance helper to require an expected package version"
  );
  assert(
    validateLiveReportAcceptance(
      {
        ...acceptedLiveReport,
        generatedAt: new Date().toISOString()
      },
      { expectedVersion: packageJson.version, maxAgeMs: 60_000 }
    ).accepted === true,
    "expected installed live report acceptance helper to accept fresh report evidence"
  );
  assert(
    validateLiveReportAcceptance(
      {
        ...acceptedLiveReport,
        generatedAt: new Date(Date.now() - 2 * 60 * 60 * 1_000).toISOString()
      },
      { expectedVersion: packageJson.version, maxAgeMs: 60 * 60 * 1_000 }
    ).issues.some((issue) => issue.code === "live_report_stale"),
    "expected installed live report acceptance helper to reject stale report evidence"
  );
  assert(
    validateLiveReportAcceptance(
      {
        ...acceptedLiveReport,
        generatedAt: new Date().toISOString()
      },
      {
        expectedVersion: packageJson.version,
        requireProductionScope: true,
        maxAgeMs: 60_000
      }
    ).issues.some((issue) => issue.code === "live_report_production_scope_missing"),
    "expected installed live report acceptance helper to reject partial reports for production scope"
  );
  assert(
    validateLiveReportAcceptance(freshProductionScopeLiveReport, {
      expectedVersion: packageJson.version,
      requireProductionScope: true,
      maxAgeMs: 60_000
    }).accepted === true,
    "expected installed live report acceptance helper to accept production-scope report evidence"
  );
  const checkoutLimitRemovalProductionScopeLiveReport = {
    ...freshProductionScopeLiveReport,
    steps: freshProductionScopeLiveReport.steps.map((step) =>
      step.name === "checkout"
        ? {
            ...step,
            command: "zepo --data-dir <redacted-data-dir> --visible checkout --remove-limit-items --wait --json"
          }
        : step
    )
  };
  checkoutLimitRemovalProductionScopeLiveReport.attempted = summarizeLiveReportAttempts(
    checkoutLimitRemovalProductionScopeLiveReport.steps
  );
  checkoutLimitRemovalProductionScopeLiveReport.coverage = summarizeLiveReportCoverage(
    checkoutLimitRemovalProductionScopeLiveReport.steps
  );
  checkoutLimitRemovalProductionScopeLiveReport.missingCoverage = summarizeLiveReportMissingCoverage(
    checkoutLimitRemovalProductionScopeLiveReport.requested,
    checkoutLimitRemovalProductionScopeLiveReport.coverage
  );
  assert(
    validateLiveReportAcceptance(checkoutLimitRemovalProductionScopeLiveReport, {
      expectedVersion: packageJson.version,
      requireProductionScope: true,
      maxAgeMs: 60_000
    }).accepted === true,
    "expected installed live report acceptance helper to accept production-scope checkout limit-warning removal evidence"
  );
  const addLimitRemovalProductionScopeLiveReport = {
    ...freshProductionScopeLiveReport,
    steps: freshProductionScopeLiveReport.steps.map((step) =>
      step.name === "add"
        ? {
            ...step,
            command: "zepo --data-dir <redacted-data-dir> --visible add <redacted-query> --quantity 1 --remove-limit-items --json"
          }
        : step
    )
  };
  addLimitRemovalProductionScopeLiveReport.attempted = summarizeLiveReportAttempts(
    addLimitRemovalProductionScopeLiveReport.steps
  );
  addLimitRemovalProductionScopeLiveReport.coverage = summarizeLiveReportCoverage(
    addLimitRemovalProductionScopeLiveReport.steps
  );
  addLimitRemovalProductionScopeLiveReport.missingCoverage = summarizeLiveReportMissingCoverage(
    addLimitRemovalProductionScopeLiveReport.requested,
    addLimitRemovalProductionScopeLiveReport.coverage
  );
  assert(
    validateLiveReportAcceptance(addLimitRemovalProductionScopeLiveReport, {
      expectedVersion: packageJson.version,
      requireProductionScope: true,
      maxAgeMs: 60_000
    }).accepted === true,
    "expected installed live report acceptance helper to accept production-scope add limit-warning removal evidence"
  );
  const cartAndCheckoutLimitRemovalProductionScopeLiveReport = {
    ...freshProductionScopeLiveReport,
    steps: freshProductionScopeLiveReport.steps.map((step) => {
      if (step.name === "add") {
        return {
          ...step,
          command: "zepo --data-dir <redacted-data-dir> --visible add <redacted-query> --quantity 1 --remove-limit-items --json"
        };
      }

      if (step.name === "cart") {
        return {
          ...step,
          command: "zepo --data-dir <redacted-data-dir> --visible cart --remove-limit-items --json"
        };
      }

      if (step.name === "checkout") {
        return {
          ...step,
          command: "zepo --data-dir <redacted-data-dir> --visible checkout --remove-limit-items --wait --json"
        };
      }

      return step;
    })
  };
  cartAndCheckoutLimitRemovalProductionScopeLiveReport.attempted = summarizeLiveReportAttempts(
    cartAndCheckoutLimitRemovalProductionScopeLiveReport.steps
  );
  cartAndCheckoutLimitRemovalProductionScopeLiveReport.coverage = summarizeLiveReportCoverage(
    cartAndCheckoutLimitRemovalProductionScopeLiveReport.steps
  );
  cartAndCheckoutLimitRemovalProductionScopeLiveReport.missingCoverage = summarizeLiveReportMissingCoverage(
    cartAndCheckoutLimitRemovalProductionScopeLiveReport.requested,
    cartAndCheckoutLimitRemovalProductionScopeLiveReport.coverage
  );
  assert(
    validateLiveReportAcceptance(cartAndCheckoutLimitRemovalProductionScopeLiveReport, {
      expectedVersion: packageJson.version,
      requireProductionScope: true,
      maxAgeMs: 60_000
    }).accepted === true,
    "expected installed live report acceptance helper to accept production-scope add, cart, and checkout limit-warning removal evidence"
  );
  const noWaitProductionScopeLiveReport = {
    ...freshProductionScopeLiveReport,
    steps: freshProductionScopeLiveReport.steps.map((step) =>
      step.name === "checkout"
        ? {
            ...step,
            command: "zepo --data-dir <redacted-data-dir> --visible checkout --json"
          }
        : step
    )
  };
  noWaitProductionScopeLiveReport.attempted = summarizeLiveReportAttempts(noWaitProductionScopeLiveReport.steps);
  noWaitProductionScopeLiveReport.coverage = summarizeLiveReportCoverage(noWaitProductionScopeLiveReport.steps);
  noWaitProductionScopeLiveReport.missingCoverage = summarizeLiveReportMissingCoverage(
    noWaitProductionScopeLiveReport.requested,
    noWaitProductionScopeLiveReport.coverage
  );
  assert(
    validateLiveReportAcceptance(noWaitProductionScopeLiveReport, {
      expectedVersion: packageJson.version,
      requireProductionScope: true,
      maxAgeMs: 60_000
    }).issues.some((issue) => issue.code === "live_report_production_scope_checkout_wait_missing"),
    "expected installed live report acceptance helper to reject production-scope evidence without checkout wait"
  );
  const diagnosticManualCheckoutStep = buildLiveReportStep({
    name: "checkout",
    args: ["--data-dir", ".zepo-live", "--visible", "checkout", "--wait", "--json"],
    status: 0,
    stdout: JSON.stringify({
      status: "checkout_manual_action_required",
      payment: "handled_by_zepto",
      humanActionRequired: true,
      automationBoundary: "zepocli_did_not_click_payment_or_order_controls",
      handoffUrl: "https://www.zepto.com/?cart=open",
      handoffSurface: "visible_zepto_browser",
      cartPrecondition: "non_empty_cart_verified",
      paymentStatus: "not_observed_by_zepocli",
      orderPlacement: "not_confirmed_by_zepocli",
      orderStatusCommand: "zepo track"
    }),
    stderr: "",
    summarizePayload: () => {
      throw new Error("manual checkout should not be summarized as handoff coverage");
    }
  }).step;
  assert(
    diagnosticManualCheckoutStep.ok === false &&
      diagnosticManualCheckoutStep.error?.code === "live_verification_incomplete" &&
      diagnosticManualCheckoutStep.manualEvidence?.status === "checkout_manual_action_required" &&
      diagnosticManualCheckoutStep.manualEvidence?.humanActionRequired === true &&
      diagnosticManualCheckoutStep.manualEvidence?.automationBoundary ===
        "zepocli_did_not_click_payment_or_order_controls" &&
      diagnosticManualCheckoutStep.manualEvidence?.handoffUrl === "https://www.zepto.com/?cart=open" &&
      diagnosticManualCheckoutStep.manualEvidence?.handoffSurface === "visible_zepto_browser" &&
      diagnosticManualCheckoutStep.manualEvidence?.cartPrecondition === "non_empty_cart_verified",
    "expected installed live report checkout manual-continuation steps to keep sanitized manual evidence"
  );
  const manualCheckoutReport = {
    ...acceptedLiveReport,
    ok: false,
    steps: acceptedLiveReport.steps.map((step) => (step.name === "checkout" ? diagnosticManualCheckoutStep : step))
  };
  manualCheckoutReport.attempted = summarizeLiveReportAttempts(manualCheckoutReport.steps);
  manualCheckoutReport.coverage = summarizeLiveReportCoverage(manualCheckoutReport.steps);
  manualCheckoutReport.missingCoverage = summarizeLiveReportMissingCoverage(
    manualCheckoutReport.requested,
    manualCheckoutReport.coverage
  );
  const manualCheckoutIssues = validateLiveReportAcceptance(manualCheckoutReport, {
    expectedVersion: packageJson.version
  }).issues.map((issue) => issue.code);
  assert(
    manualCheckoutIssues.includes("live_report_not_ok") &&
      manualCheckoutIssues.includes("live_report_requested_coverage_missing") &&
      !manualCheckoutIssues.includes("live_report_unexpected_field") &&
      !manualCheckoutIssues.includes("live_report_step_result_mismatch") &&
      !manualCheckoutIssues.includes("live_report_step_contract_mismatch"),
    "expected installed live report manual checkout evidence to remain diagnostic only"
  );

  const staleManualCheckoutStep = {
    name: "checkout",
    command: "zepo --data-dir <redacted-data-dir> --visible checkout --wait --json",
    exitCode: 1,
    ok: false,
    manualEvidence: {
      status: "checkout_manual_action_required",
      humanActionRequired: true,
      automationBoundary: "zepocli_did_not_click_payment_or_order_controls",
      cartPrecondition: "non_empty_cart_verified",
      paymentStatus: "not_observed_by_zepocli",
      orderPlacement: "not_confirmed_by_zepocli",
      orderStatusCommand: "zepo track"
    },
    error: {
      code: "live_verification_incomplete",
      message: "Checkout requires manual Zepto payment-control action and is not checkout handoff coverage."
    }
  };
  const staleManualCheckoutReport = {
    ...acceptedLiveReport,
    ok: false,
    steps: acceptedLiveReport.steps.map((step) => (step.name === "checkout" ? staleManualCheckoutStep : step))
  };
  staleManualCheckoutReport.attempted = summarizeLiveReportAttempts(staleManualCheckoutReport.steps);
  staleManualCheckoutReport.coverage = summarizeLiveReportCoverage(staleManualCheckoutReport.steps);
  staleManualCheckoutReport.missingCoverage = summarizeLiveReportMissingCoverage(
    staleManualCheckoutReport.requested,
    staleManualCheckoutReport.coverage
  );
  assert(
    validateLiveReportAcceptance(staleManualCheckoutReport, {
      expectedVersion: packageJson.version
    }).issues.some((issue) => issue.code === "live_report_step_contract_mismatch"),
    "expected installed live report manual checkout evidence to require fixed handoff markers"
  );

  const checkoutSummaryWithoutHandoffMarkersReport = {
    ...acceptedLiveReport,
    steps: acceptedLiveReport.steps.map((step) =>
      step.name === "checkout"
        ? {
            ...step,
            summary: {
              status: "checkout_handoff_returned",
              humanActionRequired: true,
              automationBoundary: "zepocli_did_not_click_payment_or_order_controls",
              cartPrecondition: "non_empty_cart_verified",
              paymentStatus: "not_observed_by_zepocli",
              orderPlacement: "not_confirmed_by_zepocli",
              orderStatusCommand: "zepo track"
            }
          }
        : step
    )
  };
  checkoutSummaryWithoutHandoffMarkersReport.attempted = summarizeLiveReportAttempts(
    checkoutSummaryWithoutHandoffMarkersReport.steps
  );
  checkoutSummaryWithoutHandoffMarkersReport.coverage = summarizeLiveReportCoverage(
    checkoutSummaryWithoutHandoffMarkersReport.steps
  );
  checkoutSummaryWithoutHandoffMarkersReport.missingCoverage = summarizeLiveReportMissingCoverage(
    checkoutSummaryWithoutHandoffMarkersReport.requested,
    checkoutSummaryWithoutHandoffMarkersReport.coverage
  );
  assert(
    checkoutSummaryWithoutHandoffMarkersReport.coverage.checkoutHandoff === false &&
      checkoutSummaryWithoutHandoffMarkersReport.missingCoverage.checkoutHandoff === true,
    "expected installed live report checkout summaries without fixed handoff markers to remain uncovered"
  );
  assert(
    validateLiveReportAcceptance(checkoutSummaryWithoutHandoffMarkersReport, {
      expectedVersion: packageJson.version
    }).issues.some((issue) => issue.code === "live_report_step_contract_mismatch"),
    "expected installed live report checkout summaries to require fixed handoff markers"
  );
  assert(
    validateLiveReportAcceptance(freshProductionScopeLiveReport, {
      expectedVersion: packageJson.version,
      requireProductionScope: true
    }).issues.some((issue) => issue.code === "live_report_production_scope_freshness_missing"),
    "expected installed live report acceptance helper to reject production-scope evidence without freshness"
  );
  const unrequestedProductionScopeLiveReport = {
    ...freshProductionScopeLiveReport,
    requested: {
      ...freshProductionScopeLiveReport.requested,
      search: false
    }
  };
  unrequestedProductionScopeLiveReport.missingCoverage = summarizeLiveReportMissingCoverage(
    unrequestedProductionScopeLiveReport.requested,
    unrequestedProductionScopeLiveReport.coverage
  );
  assert(
    validateLiveReportAcceptance(unrequestedProductionScopeLiveReport, {
      expectedVersion: packageJson.version,
      requireProductionScope: true,
      maxAgeMs: 60_000
    }).issues.some((issue) => issue.code === "live_report_production_scope_missing"),
    "expected installed live report acceptance helper to reject unrequested production-scope evidence"
  );
  const extraProductionScopeLiveReport = {
    ...freshProductionScopeLiveReport,
    requested: {
      ...freshProductionScopeLiveReport.requested,
      history: true
    },
    steps: [
      ...freshProductionScopeLiveReport.steps,
      {
        name: "history",
        command: "zepo --data-dir <redacted-data-dir> --visible history --json",
        exitCode: 0,
        ok: true,
        summary: {
          orderCount: 1,
          latestHasStatus: true,
          latestHasEta: false
        }
      }
    ]
  };
  extraProductionScopeLiveReport.attempted = summarizeLiveReportAttempts(extraProductionScopeLiveReport.steps);
  extraProductionScopeLiveReport.coverage = summarizeLiveReportCoverage(extraProductionScopeLiveReport.steps);
  extraProductionScopeLiveReport.missingCoverage = summarizeLiveReportMissingCoverage(
    extraProductionScopeLiveReport.requested,
    extraProductionScopeLiveReport.coverage
  );
  assert(
    validateLiveReportAcceptance(extraProductionScopeLiveReport, {
      expectedVersion: packageJson.version,
      requireProductionScope: true,
      maxAgeMs: 60_000
    }).issues.some((issue) => issue.code === "live_report_production_scope_extra"),
    "expected installed live report acceptance helper to reject focused workflows in production-scope evidence"
  );
  const emptyCartProductionScopeLiveReport = {
    ...freshProductionScopeLiveReport,
    steps: freshProductionScopeLiveReport.steps.map((step) =>
      step.name === "cart"
        ? {
            ...step,
            summary: {
              cartItemCount: 0,
              hasTotal: false
            }
          }
        : step
    )
  };
  emptyCartProductionScopeLiveReport.attempted = summarizeLiveReportAttempts(
    emptyCartProductionScopeLiveReport.steps
  );
  emptyCartProductionScopeLiveReport.coverage = summarizeLiveReportCoverage(emptyCartProductionScopeLiveReport.steps);
  emptyCartProductionScopeLiveReport.missingCoverage = summarizeLiveReportMissingCoverage(
    emptyCartProductionScopeLiveReport.requested,
    emptyCartProductionScopeLiveReport.coverage
  );
  assert(
    validateLiveReportAcceptance(emptyCartProductionScopeLiveReport, {
      expectedVersion: packageJson.version,
      requireProductionScope: true,
      maxAgeMs: 60_000
    }).issues.some((issue) => issue.code === "live_report_production_scope_cart_empty"),
    "expected installed live report acceptance helper to reject empty cart evidence for production scope"
  );
  const inconsistentAttemptedLiveReport = {
    ...acceptedLiveReport,
    attempted: {
      ...acceptedLiveReport.attempted,
      search: false
    }
  };
  assert(
    validateLiveReportAcceptance(inconsistentAttemptedLiveReport, {
      expectedVersion: packageJson.version
    }).issues.some((issue) => issue.code === "live_report_attempted_mismatch"),
    "expected installed live report acceptance helper to reject attempted summaries that do not match steps"
  );
  const inconsistentCoverageLiveReport = {
    ...acceptedLiveReport,
    coverage: {
      ...acceptedLiveReport.coverage,
      search: false
    }
  };
  inconsistentCoverageLiveReport.missingCoverage = summarizeLiveReportMissingCoverage(
    inconsistentCoverageLiveReport.requested,
    inconsistentCoverageLiveReport.coverage
  );
  assert(
    validateLiveReportAcceptance(inconsistentCoverageLiveReport, {
      expectedVersion: packageJson.version
    }).issues.some((issue) => issue.code === "live_report_coverage_mismatch"),
    "expected installed live report acceptance helper to reject coverage summaries that do not match steps"
  );
  console.log("pass installed live report summary consistency");
  const malformedCapabilityLiveReports = [
    {
      ...acceptedLiveReport,
      requested: {
        ...acceptedLiveReport.requested,
        search: "true"
      }
    },
    {
      ...acceptedLiveReport,
      coverage: Object.fromEntries(Object.entries(acceptedLiveReport.coverage).filter(([key]) => key !== "search"))
    }
  ];
  for (const malformedCapabilityLiveReport of malformedCapabilityLiveReports) {
    assert(
      validateLiveReportAcceptance(malformedCapabilityLiveReport, {
        expectedVersion: packageJson.version
      }).issues.some((issue) => issue.code === "live_report_capability_summary_mismatch"),
      "expected installed live report acceptance helper to reject incomplete or non-boolean capability summaries"
    );
  }
  console.log("pass installed live report capability summary contract");
  const failedKnownStepLiveReport = {
    ...acceptedLiveReport,
    steps: [
      ...acceptedLiveReport.steps,
      {
        name: "cart",
        command: "zepo --data-dir <redacted-data-dir> --visible cart --json",
        exitCode: 1,
        ok: false,
        error: {
          code: "command_failed",
          message: "failed"
        }
      }
    ]
  };
  failedKnownStepLiveReport.attempted = summarizeLiveReportAttempts(failedKnownStepLiveReport.steps);
  failedKnownStepLiveReport.coverage = summarizeLiveReportCoverage(failedKnownStepLiveReport.steps);
  failedKnownStepLiveReport.missingCoverage = summarizeLiveReportMissingCoverage(
    failedKnownStepLiveReport.requested,
    failedKnownStepLiveReport.coverage
  );
  const failedKnownStepIssues = validateLiveReportAcceptance(failedKnownStepLiveReport, {
    expectedVersion: packageJson.version
  }).issues;
  assert(
    failedKnownStepIssues.some((issue) => issue.code === "live_report_ok_step_mismatch"),
    "expected installed live report acceptance helper to reject ok reports with failed workflow steps"
  );
  assert(
    !JSON.stringify(failedKnownStepIssues).includes("failed"),
    "expected installed live report ok-step rejection to omit raw failed step values"
  );
  const unknownStepLiveReport = {
    ...acceptedLiveReport,
    steps: [
      ...acceptedLiveReport.steps,
      {
        name: "live runner",
        command: "internal",
        exitCode: 1,
        ok: false,
        error: {
          code: "live_runner_failed",
          message: "failed"
        }
      }
    ]
  };
  unknownStepLiveReport.attempted = summarizeLiveReportAttempts(unknownStepLiveReport.steps);
  unknownStepLiveReport.coverage = summarizeLiveReportCoverage(unknownStepLiveReport.steps);
  unknownStepLiveReport.missingCoverage = summarizeLiveReportMissingCoverage(
    unknownStepLiveReport.requested,
    unknownStepLiveReport.coverage
  );
  const unknownStepIssues = validateLiveReportAcceptance(unknownStepLiveReport, {
    expectedVersion: packageJson.version
  }).issues;
  assert(
    unknownStepIssues.some((issue) => issue.code === "live_report_ok_step_mismatch"),
    "expected installed live report acceptance helper to reject ok reports with unknown or internal steps"
  );
  assert(
    !JSON.stringify(unknownStepIssues).includes("failed"),
    "expected installed live report unknown-step rejection to omit raw failed step values"
  );
  console.log("pass installed live report ok step set contract");
  const duplicateStepLiveReport = {
    ...acceptedLiveReport,
    steps: [
      ...acceptedLiveReport.steps,
      {
        name: "checkout",
        command: "zepo --data-dir <redacted-data-dir> --visible checkout --json",
        exitCode: 0,
        ok: true,
        summary: {
          status: "checkout_handoff_returned",
          humanActionRequired: true,
          automationBoundary: "zepocli_did_not_click_payment_or_order_controls",
          cartPrecondition: "non_empty_cart_verified",
          paymentStatus: "paid",
          orderPlacement: "confirmed",
          orderStatusCommand: "zepo track"
        }
      }
    ]
  };
  duplicateStepLiveReport.attempted = summarizeLiveReportAttempts(duplicateStepLiveReport.steps);
  duplicateStepLiveReport.coverage = summarizeLiveReportCoverage(duplicateStepLiveReport.steps);
  duplicateStepLiveReport.missingCoverage = summarizeLiveReportMissingCoverage(
    duplicateStepLiveReport.requested,
    duplicateStepLiveReport.coverage
  );
  const duplicateStepIssues = validateLiveReportAcceptance(duplicateStepLiveReport, {
    expectedVersion: packageJson.version
  }).issues;
  assert(
    duplicateStepIssues.some((issue) => issue.code === "live_report_step_uniqueness_mismatch"),
    "expected installed live report acceptance helper to reject duplicate workflow steps"
  );
  assert(
    !JSON.stringify(duplicateStepIssues).includes("paid"),
    "expected installed live report duplicate-step rejection to omit raw duplicate step values"
  );
  console.log("pass installed live report unique step contract");
  const outOfOrderStepLiveReport = {
    ...acceptedLiveReport,
    steps: [
      acceptedLiveReport.steps[0],
      acceptedLiveReport.steps[1],
      acceptedLiveReport.steps[4],
      acceptedLiveReport.steps[2],
      acceptedLiveReport.steps[3]
    ]
  };
  outOfOrderStepLiveReport.attempted = summarizeLiveReportAttempts(outOfOrderStepLiveReport.steps);
  outOfOrderStepLiveReport.coverage = summarizeLiveReportCoverage(outOfOrderStepLiveReport.steps);
  outOfOrderStepLiveReport.missingCoverage = summarizeLiveReportMissingCoverage(
    outOfOrderStepLiveReport.requested,
    outOfOrderStepLiveReport.coverage
  );
  const outOfOrderStepIssues = validateLiveReportAcceptance(outOfOrderStepLiveReport, {
    expectedVersion: packageJson.version
  }).issues;
  assert(
    outOfOrderStepIssues.some((issue) => issue.code === "live_report_step_order_mismatch"),
    "expected installed live report acceptance helper to reject out-of-order workflow steps"
  );
  console.log("pass installed live report step order contract");
  const loginStepLiveReport = {
    ...acceptedLiveReport,
    requested: summarizeLiveReportRequests({
      login: true,
      search: "milk",
      checkout: true
    }),
    steps: [
      acceptedLiveReport.steps[0],
      acceptedLiveReport.steps[1],
      {
        name: "login",
        command: "zepo --data-dir <redacted-data-dir> --visible login --json",
        exitCode: 0,
        ok: true,
        summary: {
          sessionSaved: true,
          confirmedSession: true
        }
      },
      ...acceptedLiveReport.steps.slice(2)
    ]
  };
  loginStepLiveReport.attempted = summarizeLiveReportAttempts(loginStepLiveReport.steps);
  loginStepLiveReport.coverage = summarizeLiveReportCoverage(loginStepLiveReport.steps);
  loginStepLiveReport.missingCoverage = summarizeLiveReportMissingCoverage(
    loginStepLiveReport.requested,
    loginStepLiveReport.coverage
  );
  assert(
    validateLiveReportAcceptance(loginStepLiveReport, { expectedVersion: packageJson.version }).accepted === true,
    "expected installed live report acceptance helper to accept login session evidence"
  );
  const badLoginStepLiveReport = {
    ...loginStepLiveReport,
    steps: loginStepLiveReport.steps.map((step) =>
      step.name === "login"
        ? {
            ...step,
            summary: {
              sessionSaved: true,
              confirmedSession: false
            }
          }
        : step
    )
  };
  badLoginStepLiveReport.attempted = summarizeLiveReportAttempts(badLoginStepLiveReport.steps);
  badLoginStepLiveReport.coverage = summarizeLiveReportCoverage(badLoginStepLiveReport.steps);
  badLoginStepLiveReport.missingCoverage = summarizeLiveReportMissingCoverage(
    badLoginStepLiveReport.requested,
    badLoginStepLiveReport.coverage
  );
  assert(
    validateLiveReportAcceptance(badLoginStepLiveReport, {
      expectedVersion: packageJson.version
    }).issues.some((issue) => issue.code === "live_report_step_contract_mismatch"),
    "expected installed live report acceptance helper to reject login steps without confirmed session evidence"
  );
  console.log("pass installed live report login step contract");
  const stringlySummaryLiveReport = {
    ...acceptedLiveReport,
    steps: acceptedLiveReport.steps.map((step) =>
      step.name === "search"
        ? {
            ...step,
            summary: {
              productCount: "1"
            }
          }
        : step
    )
  };
  stringlySummaryLiveReport.attempted = summarizeLiveReportAttempts(stringlySummaryLiveReport.steps);
  stringlySummaryLiveReport.coverage = summarizeLiveReportCoverage(stringlySummaryLiveReport.steps);
  stringlySummaryLiveReport.missingCoverage = summarizeLiveReportMissingCoverage(
    stringlySummaryLiveReport.requested,
    stringlySummaryLiveReport.coverage
  );
  const stringlySummaryIssues = validateLiveReportAcceptance(stringlySummaryLiveReport, {
    expectedVersion: packageJson.version
  }).issues;
  assert(
    stringlySummaryIssues.some((issue) => issue.code === "live_report_step_contract_mismatch"),
    "expected installed live report acceptance helper to reject stringly typed step summaries"
  );
  assert(
    !JSON.stringify(stringlySummaryIssues).includes('"1"'),
    "expected installed live report summary type rejection to omit raw step values"
  );
  console.log("pass installed live report summary value contract");
  const statusSkippedLiveReport = {
    ...acceptedLiveReport,
    steps: acceptedLiveReport.steps.map((step) =>
      step.name === "status"
        ? {
            ...step,
            summary: {
              ...step.summary,
              liveSessionState: "skipped"
            }
          }
        : step
    )
  };
  statusSkippedLiveReport.attempted = summarizeLiveReportAttempts(statusSkippedLiveReport.steps);
  statusSkippedLiveReport.coverage = summarizeLiveReportCoverage(statusSkippedLiveReport.steps);
  statusSkippedLiveReport.missingCoverage = summarizeLiveReportMissingCoverage(
    statusSkippedLiveReport.requested,
    statusSkippedLiveReport.coverage
  );
  assert(
    validateLiveReportAcceptance(statusSkippedLiveReport, { expectedVersion: packageJson.version }).accepted === true,
    "expected installed live report acceptance helper to accept runner-known string summaries"
  );
  const freeformStringSummaryLiveReports = [
    {
      ...acceptedLiveReport,
      steps: acceptedLiveReport.steps.map((step) =>
        step.name === "status"
          ? {
              ...step,
              summary: {
                ...step.summary,
                liveSessionState: "Cart page showed Amul Milk 500ml"
              }
            }
          : step
      )
    },
    {
      ...acceptedLiveReport,
      steps: acceptedLiveReport.steps.map((step) =>
        step.name === "doctor"
          ? {
              ...step,
              summary: {
                ...step.summary,
                warnings: ["Amul Milk 500ml"]
              }
            }
          : step
      )
    }
  ];
  for (const freeformStringSummaryLiveReport of freeformStringSummaryLiveReports) {
    freeformStringSummaryLiveReport.attempted = summarizeLiveReportAttempts(freeformStringSummaryLiveReport.steps);
    freeformStringSummaryLiveReport.coverage = summarizeLiveReportCoverage(freeformStringSummaryLiveReport.steps);
    freeformStringSummaryLiveReport.missingCoverage = summarizeLiveReportMissingCoverage(
      freeformStringSummaryLiveReport.requested,
      freeformStringSummaryLiveReport.coverage
    );
    const freeformStringSummaryIssues = validateLiveReportAcceptance(freeformStringSummaryLiveReport, {
      expectedVersion: packageJson.version
    }).issues;
    assert(
      freeformStringSummaryIssues.some((issue) => issue.code === "live_report_step_contract_mismatch"),
      "expected installed live report acceptance helper to reject freeform string summaries"
    );
    assert(
      !JSON.stringify(freeformStringSummaryIssues).includes("Amul Milk"),
      "expected installed live report string summary rejection to omit raw values"
    );
  }
  console.log("pass installed live report string summary value contract");
  const inconsistentSummaryLiveReports = [
    {
      ...acceptedLiveReport,
      steps: acceptedLiveReport.steps.map((step) =>
        step.name === "status"
          ? {
              ...step,
              summary: {
                ...step.summary,
                liveSessionState: "logged-in"
              }
            }
          : step
      )
    },
    {
      ...acceptedLiveReport,
      steps: acceptedLiveReport.steps.map((step) =>
        step.name === "doctor"
          ? {
              ...step,
              summary: {
                ...step.summary,
                failures: ["SQLite"]
              }
            }
          : step
      )
    },
    {
      ...acceptedLiveReport,
      steps: [
        ...acceptedLiveReport.steps.slice(0, 3),
        {
          name: "search",
          command: "zepo --data-dir <redacted-data-dir> --visible search <redacted-query> --json",
          exitCode: 0,
          ok: true,
          summary: {
            productCount: 1,
            productDetailCount: 0
          }
        },
        ...acceptedLiveReport.steps.slice(4)
      ]
    },
    {
      ...acceptedLiveReport,
      steps: [
        ...acceptedLiveReport.steps.slice(0, 3),
        {
          name: "search",
          command: "zepo --data-dir <redacted-data-dir> --visible search <redacted-query> --json",
          exitCode: 0,
          ok: true,
          summary: {
            productCount: 1,
            productDetailCount: 2
          }
        },
        ...acceptedLiveReport.steps.slice(4)
      ]
    },
    {
      ...acceptedLiveReport,
      steps: [
        ...acceptedLiveReport.steps.slice(0, 4),
        {
          name: "add",
          command: "zepo --data-dir <redacted-data-dir> --visible add <redacted-query> --quantity 1 --json",
          exitCode: 0,
          ok: true,
          summary: {
            productAdded: true,
            productHasDetail: false,
            cartItemCount: 1
          }
        },
        ...acceptedLiveReport.steps.slice(4)
      ]
    },
    {
      ...acceptedLiveReport,
      steps: [
        ...acceptedLiveReport.steps.slice(0, 3),
        {
          name: "address list",
          command: "zepo --data-dir <redacted-data-dir> --visible address list --json",
          exitCode: 0,
          ok: true,
          summary: {
            addressCount: 1,
            selectedCount: 2,
            hasAddressDetail: true
          }
        },
        ...acceptedLiveReport.steps.slice(3)
      ]
    },
    {
      ...acceptedLiveReport,
      requested: summarizeLiveReportRequests({
        search: "milk",
        checkout: true,
        track: true
      }),
      steps: [
        ...acceptedLiveReport.steps,
        {
          name: "track",
          command: "zepo --data-dir <redacted-data-dir> --visible track --json",
          exitCode: 0,
          ok: true,
          summary: {
            orderCount: 0,
            latestHasStatus: true,
            latestHasEta: false
          }
        }
      ]
    },
    {
      ...acceptedLiveReport,
      requested: summarizeLiveReportRequests({
        search: "milk",
        checkout: true,
        history: true
      }),
      steps: [
        ...acceptedLiveReport.steps,
        {
          name: "history",
          command: "zepo --data-dir <redacted-data-dir> --visible history --json",
          exitCode: 0,
          ok: true,
          summary: {
            orderCount: 1,
            latestHasStatus: false,
            latestHasEta: false
          }
        }
      ]
    }
  ];
  for (const inconsistentSummaryLiveReport of inconsistentSummaryLiveReports) {
    inconsistentSummaryLiveReport.attempted = summarizeLiveReportAttempts(inconsistentSummaryLiveReport.steps);
    inconsistentSummaryLiveReport.coverage = summarizeLiveReportCoverage(inconsistentSummaryLiveReport.steps);
    inconsistentSummaryLiveReport.missingCoverage = summarizeLiveReportMissingCoverage(
      inconsistentSummaryLiveReport.requested,
      inconsistentSummaryLiveReport.coverage
    );
    const inconsistentSummaryIssues = validateLiveReportAcceptance(inconsistentSummaryLiveReport, {
      expectedVersion: packageJson.version
    }).issues;
    assert(
      inconsistentSummaryIssues.some((issue) => issue.code === "live_report_step_contract_mismatch"),
      "expected installed live report acceptance helper to reject internally inconsistent step summaries"
    );
    assert(
      !JSON.stringify(inconsistentSummaryIssues).includes("SQLite"),
      "expected installed live report summary consistency rejection to omit raw values"
    );
  }
  console.log("pass installed live report summary consistency contract");
  const oversizedSummaryLiveReport = {
    ...acceptedLiveReport,
    steps: acceptedLiveReport.steps.map((step) =>
      step.name === "search"
        ? {
            ...step,
            summary: {
              productCount: 51
            }
          }
        : step
    )
  };
  oversizedSummaryLiveReport.attempted = summarizeLiveReportAttempts(oversizedSummaryLiveReport.steps);
  oversizedSummaryLiveReport.coverage = summarizeLiveReportCoverage(oversizedSummaryLiveReport.steps);
  oversizedSummaryLiveReport.missingCoverage = summarizeLiveReportMissingCoverage(
    oversizedSummaryLiveReport.requested,
    oversizedSummaryLiveReport.coverage
  );
  const oversizedSummaryIssues = validateLiveReportAcceptance(oversizedSummaryLiveReport, {
    expectedVersion: packageJson.version
  }).issues;
  assert(
    oversizedSummaryIssues.some((issue) => issue.code === "live_report_step_contract_mismatch"),
    "expected installed live report acceptance helper to reject oversized numeric summaries"
  );
  const sensitiveNumberSummaryLiveReport = {
    ...acceptedLiveReport,
    steps: acceptedLiveReport.steps.map((step) =>
      step.name === "search"
        ? {
            ...step,
            summary: {
              productCount: 9876543210
            }
          }
        : step
    )
  };
  sensitiveNumberSummaryLiveReport.attempted = summarizeLiveReportAttempts(sensitiveNumberSummaryLiveReport.steps);
  sensitiveNumberSummaryLiveReport.coverage = summarizeLiveReportCoverage(sensitiveNumberSummaryLiveReport.steps);
  sensitiveNumberSummaryLiveReport.missingCoverage = summarizeLiveReportMissingCoverage(
    sensitiveNumberSummaryLiveReport.requested,
    sensitiveNumberSummaryLiveReport.coverage
  );
  const sensitiveNumberSummaryIssues = validateLiveReportAcceptance(sensitiveNumberSummaryLiveReport, {
    expectedVersion: packageJson.version
  }).issues;
  assert(
    sensitiveNumberSummaryIssues.some((issue) => issue.code === "live_report_sensitive_text"),
    "expected installed live report acceptance helper to reject sensitive-looking numeric summaries"
  );
  assert(
    sensitiveNumberSummaryIssues.some((issue) => issue.code === "live_report_step_contract_mismatch"),
    "expected installed live report acceptance helper to reject sensitive oversized numeric summaries"
  );
  assert(
    !JSON.stringify(sensitiveNumberSummaryIssues).includes("9876543210"),
    "expected installed live report numeric summary rejection to omit raw values"
  );
  console.log("pass installed live report numeric summary contract");
  const strippedSummaryLiveReport = {
    ...acceptedLiveReport,
    steps: acceptedLiveReport.steps.map((step) =>
      step.name === "doctor"
        ? {
            ...step,
            summary: {
              ok: true,
              browserAutomationReady: true,
              playwrightChromiumPassed: true
            }
          }
        : step
    )
  };
  strippedSummaryLiveReport.attempted = summarizeLiveReportAttempts(strippedSummaryLiveReport.steps);
  strippedSummaryLiveReport.coverage = summarizeLiveReportCoverage(strippedSummaryLiveReport.steps);
  strippedSummaryLiveReport.missingCoverage = summarizeLiveReportMissingCoverage(
    strippedSummaryLiveReport.requested,
    strippedSummaryLiveReport.coverage
  );
  const strippedSummaryIssues = validateLiveReportAcceptance(strippedSummaryLiveReport, {
    expectedVersion: packageJson.version
  }).issues;
  assert(
    strippedSummaryIssues.some((issue) => issue.code === "live_report_step_contract_mismatch"),
    "expected installed live report acceptance helper to reject stripped step summaries"
  );
  console.log("pass installed live report summary key contract");
  const unrequestedBadCheckoutLiveReport = {
    ...acceptedLiveReport,
    requested: summarizeLiveReportRequests({
      search: "milk"
    }),
    steps: acceptedLiveReport.steps.map((step) =>
      step.name === "checkout"
        ? {
            ...step,
            summary: {
              ...step.summary,
              cartPrecondition: "non_empty_cart_verified",
              paymentStatus: "paid",
              orderPlacement: "confirmed"
            }
          }
        : step
    )
  };
  unrequestedBadCheckoutLiveReport.attempted = summarizeLiveReportAttempts(unrequestedBadCheckoutLiveReport.steps);
  unrequestedBadCheckoutLiveReport.coverage = summarizeLiveReportCoverage(unrequestedBadCheckoutLiveReport.steps);
  unrequestedBadCheckoutLiveReport.missingCoverage = summarizeLiveReportMissingCoverage(
    unrequestedBadCheckoutLiveReport.requested,
    unrequestedBadCheckoutLiveReport.coverage
  );
  const unrequestedBadCheckoutIssues = validateLiveReportAcceptance(unrequestedBadCheckoutLiveReport, {
    expectedVersion: packageJson.version
  }).issues;
  assert(
    unrequestedBadCheckoutIssues.some((issue) => issue.code === "live_report_step_contract_mismatch"),
    "expected installed live report acceptance helper to reject malformed unrequested passing steps"
  );
  assert(
    !JSON.stringify(unrequestedBadCheckoutIssues).includes("paid"),
    "expected installed live report all-step contract rejection to omit raw step values"
  );
  console.log("pass installed live report all passing step contract");
  const unexpectedFieldLiveReports = [
    {
      ...acceptedLiveReport,
      rawQuery: "Amul Milk 500ml"
    },
    {
      ...acceptedLiveReport,
      steps: acceptedLiveReport.steps.map((step) =>
        step.name === "search" ? { ...step, rawPayload: "Amul Milk 500ml" } : step
      )
    },
    {
      ...acceptedLiveReport,
      steps: acceptedLiveReport.steps.map((step) =>
        step.name === "checkout"
          ? { ...step, summary: { ...step.summary, rawPageText: "Amul Milk 500ml" } }
          : step
      )
    }
  ];
  for (const unexpectedFieldLiveReport of unexpectedFieldLiveReports) {
    const unexpectedFieldIssues = validateLiveReportAcceptance(unexpectedFieldLiveReport, {
      expectedVersion: packageJson.version
    }).issues;
    assert(
      unexpectedFieldIssues.some((issue) => issue.code === "live_report_unexpected_field"),
      "expected installed live report acceptance helper to reject fields outside the accepted schema"
    );
    assert(
      !JSON.stringify(unexpectedFieldIssues).includes("Amul Milk 500ml"),
      "expected installed live report unexpected-field rejection to omit raw workflow values"
    );
  }
  console.log("pass installed live report closed schema");
  const malformedMetadataLiveReports = [
    {
      ...acceptedLiveReport,
      generatedAt: "today",
      dataDir: "<redacted-local-path>"
    },
    {
      ...acceptedLiveReport,
      generatedAt: "2999-01-01T00:00:00.000Z"
    },
    {
      ...acceptedLiveReport,
      note: `${LIVE_REPORT_NOTE} Cart item Amul Milk 500ml was observed.`
    }
  ];
  for (const malformedMetadataLiveReport of malformedMetadataLiveReports) {
    const metadataLiveReportIssues = validateLiveReportAcceptance(malformedMetadataLiveReport, {
      expectedVersion: packageJson.version
    }).issues;
    assert(
      metadataLiveReportIssues.some((issue) => issue.code === "live_report_metadata_mismatch"),
      "expected installed live report acceptance helper to reject malformed top-level metadata"
    );
    assert(
      !JSON.stringify(metadataLiveReportIssues).includes("today") &&
        !JSON.stringify(metadataLiveReportIssues).includes("2999") &&
        !JSON.stringify(metadataLiveReportIssues).includes("Amul Milk 500ml"),
      "expected installed live report metadata rejection to omit raw metadata values"
    );
  }
  console.log("pass installed live report metadata contract");
  const rawCommandLiveReport = {
    ...acceptedLiveReport,
    steps: acceptedLiveReport.steps.map((step) =>
      step.name === "search"
        ? { ...step, command: "zepo --data-dir <redacted-data-dir> --visible search Amul Milk 500ml --json" }
        : step
    )
  };
  const rawCommandIssues = validateLiveReportAcceptance(rawCommandLiveReport, {
    expectedVersion: packageJson.version
  }).issues;
  assert(
    rawCommandIssues.some((issue) => issue.code === "live_report_command_mismatch"),
    "expected installed live report acceptance helper to reject unredacted command strings"
  );
  assert(
    !JSON.stringify(rawCommandIssues).includes("Amul Milk 500ml"),
    "expected installed live report command rejection to omit raw workflow values"
  );
  const missingCommandLiveReport = {
    ...acceptedLiveReport,
    steps: acceptedLiveReport.steps.map((step) =>
      step.name === "search"
        ? {
            name: step.name,
            exitCode: step.exitCode,
            ok: step.ok,
            summary: step.summary
          }
        : step
    )
  };
  assert(
    validateLiveReportAcceptance(missingCommandLiveReport, {
      expectedVersion: packageJson.version
    }).issues.some((issue) => issue.code === "live_report_command_mismatch"),
    "expected installed live report acceptance helper to require redacted command strings"
  );
  const editedManualWorkflowLiveReport = {
    ...acceptedLiveReport,
    ok: false,
    steps: [
      ...acceptedLiveReport.steps,
      {
        name: "login",
        command: "manual",
        exitCode: 1,
        ok: false,
        error: {
          code: "live_verification_incomplete",
          message: "No confirmed Zepto session is available."
        }
      }
    ]
  };
  assert(
    validateLiveReportAcceptance(editedManualWorkflowLiveReport, {
      expectedVersion: packageJson.version
    }).issues.some((issue) => issue.code === "live_report_command_mismatch"),
    "expected installed live report acceptance helper to reject manual commands on workflow steps"
  );
  const editedInternalWorkflowLiveReport = {
    ...acceptedLiveReport,
    ok: false,
    steps: [
      ...acceptedLiveReport.steps,
      {
        name: "cart",
        command: "internal",
        exitCode: 1,
        ok: false,
        error: {
          code: "live_runner_failed",
          message: "Runner failed."
        }
      }
    ]
  };
  assert(
    validateLiveReportAcceptance(editedInternalWorkflowLiveReport, {
      expectedVersion: packageJson.version
    }).issues.some((issue) => issue.code === "live_report_command_mismatch"),
    "expected installed live report acceptance helper to reject internal commands on workflow steps"
  );
  console.log("pass installed live report command contract");
  const malformedStepResultLiveReports = [
    {
      ...acceptedLiveReport,
      steps: acceptedLiveReport.steps.map((step) =>
        step.name === "search"
          ? {
              name: step.name,
              command: step.command,
              ok: step.ok,
              summary: step.summary
            }
          : step
      )
    },
    {
      ...acceptedLiveReport,
      steps: acceptedLiveReport.steps.map((step) =>
        step.name === "search" ? { ...step, exitCode: 1 } : step
      )
    },
    {
      ...acceptedLiveReport,
      steps: [
        ...acceptedLiveReport.steps,
        {
          name: "add",
          command: "zepo --data-dir <redacted-data-dir> --visible add <redacted-query> --quantity 1 --json",
          exitCode: 1,
          ok: false
        }
      ]
    }
  ];
  for (const malformedStepResultLiveReport of malformedStepResultLiveReports) {
    assert(
      validateLiveReportAcceptance(malformedStepResultLiveReport, {
        expectedVersion: packageJson.version
      }).issues.some((issue) => issue.code === "live_report_step_result_mismatch"),
      "expected installed live report acceptance helper to reject inconsistent step result fields"
    );
  }
  console.log("pass installed live report step result contract");
  const malformedErrorLiveReports = [
    {
      ...acceptedLiveReport,
      ok: false,
      steps: [
        ...acceptedLiveReport.steps,
        {
          name: "cart",
          command: "zepo --data-dir <redacted-data-dir> --visible cart --json",
          exitCode: 1,
          ok: false,
          error: {
            code: "not_a_stable_code",
            message: "failed"
          }
        }
      ]
    },
    {
      ...acceptedLiveReport,
      ok: false,
      steps: [
        ...acceptedLiveReport.steps,
        {
          name: "cart",
          command: "zepo --data-dir <redacted-data-dir> --visible cart --json",
          exitCode: 1,
          ok: false,
          error: {
            code: "command_failed",
            message: ""
          }
        }
      ]
    },
    {
      ...acceptedLiveReport,
      ok: false,
      steps: [
        ...acceptedLiveReport.steps,
        {
          name: "cart",
          command: "zepo --data-dir <redacted-data-dir> --visible cart --json",
          exitCode: 1,
          ok: false,
          error: {
            code: "zepto_access_cooldown",
            message: "cooling down",
            retryAfterMs: -1
          }
        }
      ]
    },
    {
      ...acceptedLiveReport,
      ok: false,
      steps: [
        ...acceptedLiveReport.steps,
        {
          name: "cart",
          command: "zepo --data-dir <redacted-data-dir> --visible cart --json",
          exitCode: 1,
          ok: false,
          error: {
            code: "zepto_access_cooldown",
            message: "cooling down",
            retryAfterMs: 3_600_001
          }
        }
      ]
    }
  ];
  for (const malformedErrorLiveReport of malformedErrorLiveReports) {
    malformedErrorLiveReport.attempted = summarizeLiveReportAttempts(malformedErrorLiveReport.steps);
    malformedErrorLiveReport.coverage = summarizeLiveReportCoverage(malformedErrorLiveReport.steps);
    malformedErrorLiveReport.missingCoverage = summarizeLiveReportMissingCoverage(
      malformedErrorLiveReport.requested,
      malformedErrorLiveReport.coverage
    );
    const malformedErrorIssues = validateLiveReportAcceptance(malformedErrorLiveReport, {
      expectedVersion: packageJson.version
    }).issues;
    assert(
      malformedErrorIssues.some((issue) => issue.code === "live_report_error_mismatch"),
      "expected installed live report acceptance helper to reject malformed error objects"
    );
    assert(
      !JSON.stringify(malformedErrorIssues).includes("not_a_stable_code") &&
        !JSON.stringify(malformedErrorIssues).includes("cooling down"),
      "expected installed live report error rejection to omit raw values"
    );
  }
  console.log("pass installed live report error object contract");
  const sensitiveLiveReport = {
    ...acceptedLiveReport,
    reportPath: join(tempRoot, "raw-live-verification-report.json"),
    note: `raw phone 9876543210 and token ${FAKE_NPM_TOKEN} should not be acceptable`,
    metadata: {
      [join(tempRoot, "raw-report-key")]: true
    }
  };
  const sensitiveLiveReportIssues = validateLiveReportAcceptance(sensitiveLiveReport, {
    expectedVersion: packageJson.version
  }).issues;
  assert(
    sensitiveLiveReportIssues.some((issue) => issue.code === "live_report_sensitive_text"),
    "expected installed live report acceptance helper to reject sensitive-looking report keys or values"
  );
  assert(
    !JSON.stringify(sensitiveLiveReportIssues).includes(tempRoot) &&
      !JSON.stringify(sensitiveLiveReportIssues).includes(FAKE_NPM_TOKEN),
    "expected installed live report sensitive text rejection to avoid echoing raw sensitive keys or values"
  );
  const linuxSensitiveLiveReport = {
    ...acceptedLiveReport,
    metadata: {
      "/root/.zepo-live/report.json": true,
      "/opt/zepocli/.zepto-smoke/trace.txt": true
    }
  };
  const linuxSensitiveLiveReportIssues = validateLiveReportAcceptance(linuxSensitiveLiveReport, {
    expectedVersion: packageJson.version
  }).issues;
  assert(
    linuxSensitiveLiveReportIssues.some((issue) => issue.code === "live_report_sensitive_text"),
    "expected installed live report acceptance helper to reject Linux root/opt local paths"
  );
  assert(
    !JSON.stringify(linuxSensitiveLiveReportIssues).includes("/root") &&
      !JSON.stringify(linuxSensitiveLiveReportIssues).includes("/opt"),
    "expected installed live report Linux path rejection to omit raw sensitive keys or values"
  );
  const sensitiveLiveReportPath = join(tempRoot, "sensitive-live-verification-report.json");
  writeFileSync(sensitiveLiveReportPath, `${JSON.stringify(sensitiveLiveReport, null, 2)}\n`);
  const sensitiveLiveReportResult = runNpmResult(
    ["--silent", "run", "--prefix", packageDir, "verify:live:report", "--", sensitiveLiveReportPath],
    { cwd: rootDir }
  );
  assert(sensitiveLiveReportResult.status === 1, "expected installed live report validator to reject sensitive reports");
  assert(
    sensitiveLiveReportResult.stderr.includes("live_report_sensitive_text"),
    "expected installed live report validator to explain sensitive report rejection with stable code"
  );
  assert(
    !`${sensitiveLiveReportResult.stdout}\n${sensitiveLiveReportResult.stderr}`.includes(tempRoot) &&
      !`${sensitiveLiveReportResult.stdout}\n${sensitiveLiveReportResult.stderr}`.includes(FAKE_NPM_TOKEN),
    "expected installed live report validator sensitive rejection output to omit raw sensitive keys or values"
  );
  console.log("pass installed live report sensitive text rejection");
  const acceptedLiveReportPath = join(tempRoot, "accepted-live-verification-report.json");
  writeFileSync(acceptedLiveReportPath, `${JSON.stringify(acceptedLiveReport, null, 2)}\n`);
  const acceptedLiveReportResult = runNpm(
    ["--silent", "run", "--prefix", packageDir, "verify:live:report", "--", acceptedLiveReportPath],
    { cwd: rootDir }
  );
  assert(
    acceptedLiveReportResult.stdout.includes("pass live verification report acceptance"),
    "expected installed live report validator to accept complete report"
  );
  const staleLiveReportPath = join(tempRoot, "stale-live-verification-report.json");
  writeFileSync(
    staleLiveReportPath,
    `${JSON.stringify(
      {
        ...acceptedLiveReport,
        generatedAt: new Date(Date.now() - 2 * 60 * 60 * 1_000).toISOString()
      },
      null,
      2
    )}\n`
  );
  const staleLiveReportResult = runNpmResult(
    [
      "--silent",
      "run",
      "--prefix",
      packageDir,
      "verify:live:report",
      "--",
      "--max-age-minutes",
      "60",
      staleLiveReportPath
    ],
    { cwd: rootDir }
  );
  assert(
    staleLiveReportResult.status === 1 && staleLiveReportResult.stderr.includes("live_report_stale"),
    "expected installed live report validator to reject stale report evidence"
  );
  const freshLiveReportPath = join(tempRoot, "fresh-live-verification-report.json");
  writeFileSync(
    freshLiveReportPath,
    `${JSON.stringify({ ...acceptedLiveReport, generatedAt: new Date().toISOString() }, null, 2)}\n`
  );
  const freshLiveReportResult = runNpm(
    [
      "--silent",
      "run",
      "--prefix",
      packageDir,
      "verify:live:report",
      "--",
      "--max-age-minutes=60",
      freshLiveReportPath
    ],
    { cwd: rootDir }
  );
  assert(
    freshLiveReportResult.stdout.includes("pass live verification report acceptance"),
    "expected installed live report validator to accept fresh report evidence"
  );
  const partialScopeLiveReportResult = runNpmResult(
    [
      "--silent",
      "run",
      "--prefix",
      packageDir,
      "verify:live:report",
      "--",
      "--require-production-scope",
      "--max-age-minutes",
      "60",
      freshLiveReportPath
    ],
    { cwd: rootDir }
  );
  assert(
    partialScopeLiveReportResult.status === 1 &&
      partialScopeLiveReportResult.stderr.includes("live_report_production_scope_missing"),
    "expected installed live report validator to reject partial reports when production scope is required"
  );
  const productionScopeLiveReportPath = join(tempRoot, "production-scope-live-verification-report.json");
  writeFileSync(productionScopeLiveReportPath, `${JSON.stringify(freshProductionScopeLiveReport, null, 2)}\n`);
  const productionScopeFreshnessResult = runNpmResult(
    [
      "--silent",
      "run",
      "--prefix",
      packageDir,
      "verify:live:report",
      "--",
      "--require-production-scope",
      productionScopeLiveReportPath
    ],
    { cwd: rootDir }
  );
  assert(
    productionScopeFreshnessResult.status === 1 &&
      productionScopeFreshnessResult.stderr.includes("live_report_production_scope_freshness_missing"),
    "expected installed live report validator to reject production-scope evidence without freshness"
  );
  const productionScopeLiveReportResult = runNpm(
    [
      "--silent",
      "run",
      "--prefix",
      packageDir,
      "verify:live:report",
      "--",
      "--require-production-scope",
      "--max-age-minutes=60",
      productionScopeLiveReportPath
    ],
    { cwd: rootDir }
  );
  assert(
    productionScopeLiveReportResult.stdout.includes("pass live verification report acceptance"),
    "expected installed live report validator to accept production-scope report evidence"
  );
  const assignedBadMaxAgeLiveReportResult = runNpmResult(
    [
      "--silent",
      "run",
      "--prefix",
      packageDir,
      "verify:live:report",
      "--",
      "--max-age-minutes=abc",
      freshLiveReportPath
    ],
    { cwd: rootDir }
  );
  assert(
    assignedBadMaxAgeLiveReportResult.status === 1 &&
      assignedBadMaxAgeLiveReportResult.stderr.includes("--max-age-minutes must be an integer from 1 to 10080."),
    "expected installed live report validator to reject invalid assignment-form max age"
  );
  const unrequestedProductionScopeLiveReportPath = join(
    tempRoot,
    "unrequested-production-scope-live-verification-report.json"
  );
  writeFileSync(
    unrequestedProductionScopeLiveReportPath,
    `${JSON.stringify(unrequestedProductionScopeLiveReport, null, 2)}\n`
  );
  const unrequestedProductionScopeLiveReportResult = runNpmResult(
    [
      "--silent",
      "run",
      "--prefix",
      packageDir,
      "verify:live:report",
      "--",
      "--require-production-scope",
      "--max-age-minutes",
      "60",
      unrequestedProductionScopeLiveReportPath
    ],
    { cwd: rootDir }
  );
  assert(
    unrequestedProductionScopeLiveReportResult.status === 1 &&
      unrequestedProductionScopeLiveReportResult.stderr.includes("live_report_production_scope_missing"),
    "expected installed live report validator to reject unrequested production-scope evidence"
  );
  const extraProductionScopeLiveReportPath = join(tempRoot, "extra-production-scope-live-verification-report.json");
  writeFileSync(extraProductionScopeLiveReportPath, `${JSON.stringify(extraProductionScopeLiveReport, null, 2)}\n`);
  const extraProductionScopeLiveReportResult = runNpmResult(
    [
      "--silent",
      "run",
      "--prefix",
      packageDir,
      "verify:live:report",
      "--",
      "--require-production-scope",
      "--max-age-minutes",
      "60",
      extraProductionScopeLiveReportPath
    ],
    { cwd: rootDir }
  );
  assert(
    extraProductionScopeLiveReportResult.status === 1 &&
      extraProductionScopeLiveReportResult.stderr.includes("live_report_production_scope_extra"),
    "expected installed live report validator to reject focused workflows in production-scope evidence"
  );
  const emptyCartProductionScopeLiveReportPath = join(
    tempRoot,
    "empty-cart-production-scope-live-verification-report.json"
  );
  writeFileSync(
    emptyCartProductionScopeLiveReportPath,
    `${JSON.stringify(emptyCartProductionScopeLiveReport, null, 2)}\n`
  );
  const emptyCartProductionScopeLiveReportResult = runNpmResult(
    [
      "--silent",
      "run",
      "--prefix",
      packageDir,
      "verify:live:report",
      "--",
      "--require-production-scope",
      "--max-age-minutes",
      "60",
      emptyCartProductionScopeLiveReportPath
    ],
    { cwd: rootDir }
  );
  assert(
    emptyCartProductionScopeLiveReportResult.status === 1 &&
      emptyCartProductionScopeLiveReportResult.stderr.includes("live_report_production_scope_cart_empty"),
    "expected installed live report validator to reject empty cart evidence for production-scope evidence"
  );
  const rejectedLiveReportPath = join(tempRoot, "rejected-live-verification-report.json");
  writeFileSync(
    rejectedLiveReportPath,
    `${JSON.stringify(
      {
        ...acceptedLiveReport,
        ok: false,
        version: "0.0.0"
      },
      null,
      2
    )}\n`
  );
  const rejectedLiveReportResult = runNpmResult(
    ["--silent", "run", "--prefix", packageDir, "verify:live:report", "--", rejectedLiveReportPath],
    { cwd: rootDir }
  );
  assert(rejectedLiveReportResult.status === 1, "expected installed live report validator to reject incomplete reports");
  assert(
    rejectedLiveReportResult.stderr.includes("Live verification report is not acceptable.") &&
      rejectedLiveReportResult.stderr.includes("live_report_not_ok") &&
      rejectedLiveReportResult.stderr.includes("live_report_version_mismatch"),
    "expected installed live report validator to explain acceptance failures with stable codes"
  );
  assert(
    !`${rejectedLiveReportResult.stdout}\n${rejectedLiveReportResult.stderr}`.includes(tempRoot),
    "expected installed live report validator output to omit local report paths"
  );
  console.log("pass installed live report acceptance validator");
  assertDeepEqual(
    summarizeLiveReportAttempts([
      { name: "doctor", ok: true },
      { name: "status", ok: true },
      { name: "login", ok: false },
      { name: "checkout", ok: true },
      { name: "history", ok: false }
    ]),
    {
      browserPreflight: true,
      localStatus: true,
      login: true,
      liveSession: false,
      search: false,
      addressAdd: false,
      addressList: false,
      addressUse: false,
      add: false,
      cart: false,
      remove: false,
      clear: false,
      checkoutHandoff: true,
      track: false,
      history: true,
      reorder: false
    },
    "expected installed live report attempts to include failed and successful workflow steps"
  );
  assertDeepEqual(
    summarizeLiveReportCoverage([
      acceptedLiveReportSteps[0],
      acceptedLiveReportSteps[1],
      { name: "login", ok: false },
      acceptedLiveReportSteps[4],
      { name: "history", ok: false }
    ]),
    {
      browserPreflight: true,
      localStatus: true,
      login: false,
      liveSession: false,
      search: false,
      addressAdd: false,
      addressList: false,
      addressUse: false,
      add: false,
      cart: false,
      remove: false,
      clear: false,
      checkoutHandoff: true,
      track: false,
      history: false,
      reorder: false
    },
    "expected installed live report coverage to include only accepted successful workflow steps"
  );
  assert(
    summarizeLiveReportCoverage([
      {
        name: "cart",
        command: "zepo --data-dir <redacted-data-dir> --visible cart --json",
        exitCode: 0,
        ok: true,
        summary: {
          cartItemCount: "1",
          hasTotal: true
        }
      }
    ]).cart === false,
    "expected installed live report coverage to reject malformed summary evidence"
  );
  const malformedResultOrCommandCoverage = summarizeLiveReportCoverage([
    {
      name: "cart",
      command: "zepo --data-dir <redacted-data-dir> --visible cart --json",
      exitCode: 0,
      ok: true,
      summary: {
        cartItemCount: 1,
        hasTotal: true
      }
    },
    {
      name: "remove",
      command: "zepo --data-dir <redacted-data-dir> --visible remove milk --json",
      exitCode: 0,
      ok: true,
      summary: {
        cartItemCount: 1,
        hasTotal: true
      }
    },
    {
      name: "history",
      command: "zepo --data-dir <redacted-data-dir> --visible history --json",
      exitCode: 7,
      ok: true,
      summary: {
        orderCount: 1,
        latestHasStatus: true,
        latestHasEta: false
      }
    }
  ]);
  assert(
    malformedResultOrCommandCoverage.cart === true &&
      malformedResultOrCommandCoverage.remove === false &&
      malformedResultOrCommandCoverage.history === false,
    "expected installed live report coverage to reject malformed result or command evidence"
  );
  assertDeepEqual(
    summarizeLiveReportMissingCoverage(
      summarizeLiveReportRequests({
        login: true,
        search: "milk",
        checkout: true,
        history: true
      }),
      summarizeLiveReportCoverage([
        acceptedLiveReportSteps[0],
        acceptedLiveReportSteps[1],
        { name: "login", ok: false },
        acceptedLiveReportSteps[3],
        acceptedLiveReportSteps[4]
      ])
    ),
    {
      browserPreflight: false,
      localStatus: false,
      login: true,
      liveSession: true,
      search: false,
      addressAdd: false,
      addressList: false,
      addressUse: false,
      add: false,
      cart: false,
      remove: false,
      clear: false,
      checkoutHandoff: false,
      track: false,
      history: true,
      reorder: false
    },
    "expected installed live report missing coverage to include requested-but-unverified workflow steps only"
  );
  assertDeepEqual(
    redactArgsForLiveConsole([
      "--data-dir",
      ".zepo-live",
      "--visible",
      "login",
      "--phone",
      "9999999999",
      "--report",
      "C:\\Users\\parth\\report.json",
      "--json"
    ]),
    [
      "--data-dir",
      "<redacted-data-dir>",
      "--visible",
      "login",
      "--phone",
      "<redacted-phone>",
      "--report",
      "<redacted-report-path>",
      "--json"
    ],
    "expected installed live console command redaction to omit local paths and phone input"
  );
  assertDeepEqual(
    redactArgsForLiveConsole([
      "--data-dir",
      ".zepo-live",
      "--visible",
      "add",
      "Amul Milk 500ml",
      "--report",
      "C:\\Users\\parth\\report.json",
      "--json"
    ]),
    [
      "--data-dir",
      "<redacted-data-dir>",
      "--visible",
      "add",
      "<redacted-query>",
      "--report",
      "<redacted-report-path>",
      "--json"
    ],
    "expected installed live console command redaction to omit workflow queries"
  );
  assertDeepEqual(
    redactArgsForLiveReport([
      "--data-dir",
      ".zepo-live",
      "--timeout",
      "45000",
      "--visible",
      "search",
      "Amul Milk 500ml",
      "--json"
    ]),
    [
      "--data-dir",
      "<redacted-data-dir>",
      "--timeout",
      "45000",
      "--visible",
      "search",
      "<redacted-query>",
      "--json"
    ],
    "expected installed live report command redaction to handle global timeout before workflow commands"
  );
  const redactedLiveStderr = redactLiveConsoleText(
    'Could not find a Zepto product matching "Amul Milk 500ml" near C:\\Users\\parth\\.zepo-live\\trace.txt.',
    ["--data-dir", ".zepo-live", "--visible", "add", "Amul Milk 500ml", "--json"]
  );
  assert(
    redactedLiveStderr.includes("<redacted-query>") &&
      redactedLiveStderr.includes("<redacted-local-path>") &&
      !redactedLiveStderr.includes("Amul Milk 500ml") &&
      !redactedLiveStderr.includes("Users"),
    "expected installed live console stderr redaction to omit workflow queries and local paths"
  );
  const forwardSlashPathLiveStderr = redactLiveConsoleText(
    "Live stderr referenced C:/Users/parth/.zepo-live/report.json and file:///C:/Users/parth/.zepo-live/trace.txt.",
    []
  );
  assert(
    forwardSlashPathLiveStderr.includes("<redacted-local-path>") &&
      !forwardSlashPathLiveStderr.includes("C:/Users") &&
      !forwardSlashPathLiveStderr.includes("file:///") &&
      !forwardSlashPathLiveStderr.includes("report.json") &&
      !forwardSlashPathLiveStderr.includes("trace.txt"),
    "expected installed live console stderr redaction to omit Windows forward-slash local paths"
  );
  const linuxPathLiveStderr = redactLiveConsoleText(
    "Live stderr referenced /root/.zepo-live/report.json and /opt/zepocli/.zepto-smoke/trace.txt.",
    []
  );
  assert(
    linuxPathLiveStderr.includes("<redacted-local-path>") &&
      !linuxPathLiveStderr.includes("/root") &&
      !linuxPathLiveStderr.includes("/opt") &&
      !linuxPathLiveStderr.includes(".zepo-live") &&
      !linuxPathLiveStderr.includes(".zepto-smoke") &&
      !linuxPathLiveStderr.includes("report.json") &&
      !linuxPathLiveStderr.includes("trace.txt"),
    "expected installed live console stderr redaction to omit Linux root and opt local paths"
  );
  const encodedLiveStderr = redactLiveConsoleText(
    "Debug URL: https://www.zepto.com/search?query=Amul%20Milk%20500ml&fallback=Amul+Milk+500ml",
    ["--data-dir", ".zepo-live", "--visible", "add", "Amul Milk 500ml", "--json"]
  );
  assert(
    encodedLiveStderr.includes("query=<redacted-query>") &&
      encodedLiveStderr.includes("fallback=<redacted-query>") &&
      !encodedLiveStderr.includes("Amul%20Milk%20500ml") &&
      !encodedLiveStderr.includes("Amul+Milk+500ml"),
    "expected installed live console stderr redaction to omit URL-encoded workflow queries"
  );
  const encodedSensitiveLiveStderr = redactLiveConsoleText(
    "Debug URL: https://example.test/callback?phone=%2B91+98765+43210&otp=%31%32%33%34%35%36&card=4111%201111%201111%201111&upi=abc%40upi&token=raw-token-123&access_token=abc.def.ghi&password=hunter2&secret=client-secret-123&file=C%3A%5CUsers%5Cparth%5C.zepo-live%5Ctrace.txt",
    []
  );
  assert(
    encodedSensitiveLiveStderr.includes("phone=<redacted-phone>") &&
      encodedSensitiveLiveStderr.includes("otp=<redacted-verification-code>") &&
      encodedSensitiveLiveStderr.includes("card=<redacted-payment-number>") &&
      encodedSensitiveLiveStderr.includes("upi=<redacted-payment-handle>") &&
      encodedSensitiveLiveStderr.includes("token=<redacted-auth-token>") &&
      encodedSensitiveLiveStderr.includes("access_token=<redacted-auth-token>") &&
      encodedSensitiveLiveStderr.includes("password=<redacted-auth-token>") &&
      encodedSensitiveLiveStderr.includes("secret=<redacted-auth-token>") &&
      encodedSensitiveLiveStderr.includes("file=<redacted-local-path>") &&
      !encodedSensitiveLiveStderr.includes("%2B91") &&
      !encodedSensitiveLiveStderr.includes("4111%201111") &&
      !encodedSensitiveLiveStderr.includes("abc%40upi") &&
      !encodedSensitiveLiveStderr.includes("raw-token-123") &&
      !encodedSensitiveLiveStderr.includes("abc.def.ghi") &&
      !encodedSensitiveLiveStderr.includes("hunter2") &&
      !encodedSensitiveLiveStderr.includes("client-secret-123") &&
      !encodedSensitiveLiveStderr.includes("C%3A%5CUsers"),
    "expected installed live console stderr redaction to omit URL-encoded sensitive values"
  );
  const encodedSensitiveBlobLiveStderr = redactLiveConsoleText(
    "Encoded callback https%3A%2F%2Fexample.test%2Fcallback%3Fphone%3D%2B91%2098765%2043210%26card%3D4111%201111%201111%201111%26password%3Dhunter2%26file%3DC%3A%2FUsers%2Fparth%2F.zepo-live%2Ftrace.txt and C%3A%2FUsers%2Fparth%2F.zepo-live%2Freport.json",
    []
  );
  assert(
    encodedSensitiveBlobLiveStderr.includes("phone=<redacted-phone>") &&
      encodedSensitiveBlobLiveStderr.includes("card=<redacted-payment-number>") &&
      encodedSensitiveBlobLiveStderr.includes("password=<redacted-auth-token>") &&
      encodedSensitiveBlobLiveStderr.includes("file=<redacted-local-path>") &&
      encodedSensitiveBlobLiveStderr.includes("<redacted-local-path>") &&
      !encodedSensitiveBlobLiveStderr.includes("https%3A%2F%2Fexample.test") &&
      !encodedSensitiveBlobLiveStderr.includes("hunter2") &&
      !encodedSensitiveBlobLiveStderr.includes("C%3A%2FUsers") &&
      !encodedSensitiveBlobLiveStderr.includes("report.json") &&
      !encodedSensitiveBlobLiveStderr.includes("trace.txt"),
    "expected installed live console stderr redaction to omit URL-encoded sensitive blobs"
  );
  const fakeNpmToken = `npm_${"A".repeat(24)}`;
  const npmTokenLiveStderr = redactLiveConsoleText(`Live stderr included ${fakeNpmToken}.`, []);
  assert(
    npmTokenLiveStderr.includes("<redacted-npm-token>") && !npmTokenLiveStderr.includes(fakeNpmToken),
    "expected installed live console stderr redaction to omit npm-token-shaped values"
  );
  const streamedLiveStderrChunks = [];
  const streamedLiveStderrRedactor = createLiveConsoleTextRedactor(
    ["--data-dir", ".zepo-live", "--visible", "add", "Amul Milk 500ml", "--json"],
    (chunk) => streamedLiveStderrChunks.push(chunk)
  );
  streamedLiveStderrRedactor.write('Could not find "Amul ');
  streamedLiveStderrRedactor.write('Milk 500ml" near C:\\Users\\parth\\.zepo-live\\trace.txt.\n');
  streamedLiveStderrRedactor.flush();
  const streamedLiveStderr = streamedLiveStderrChunks.join("");
  assert(
    streamedLiveStderr.includes("<redacted-query>") &&
      streamedLiveStderr.includes("<redacted-local-path>") &&
      !streamedLiveStderr.includes("Amul Milk 500ml") &&
      !streamedLiveStderr.includes("Users"),
    "expected installed live console stderr stream redaction to handle split workflow queries"
  );
  const immediateLiveStderrChunks = [];
  const immediateLiveStderrRedactor = createLiveConsoleTextRedactor(
    ["--data-dir", ".zepo-live", "--visible", "add", "Amul Milk 500ml", "--json"],
    (chunk) => immediateLiveStderrChunks.push(chunk),
    { immediate: true }
  );
  immediateLiveStderrRedactor.write("Visible prompt: choose item > ");
  assert(
    immediateLiveStderrChunks.join("") === "Visible prompt: choose item > ",
    "expected installed immediate live console stderr redaction to stream non-sensitive prompt text"
  );
  immediateLiveStderrRedactor.write("token n");
  assert(
    !immediateLiveStderrChunks.join("").includes("token n"),
    "expected installed immediate live console stderr redaction to hold split npm-token-shaped values"
  );
  immediateLiveStderrRedactor.write("pm");
  assert(
    !immediateLiveStderrChunks.join("").includes("token npm"),
    "expected installed immediate live console stderr redaction to hold npm-token-shaped prefixes"
  );
  immediateLiveStderrRedactor.write(`${fakeNpmToken.slice(3)} and query "Amul `);
  immediateLiveStderrRedactor.write('Milk 500ml" near C:\\Users\\parth\\.');
  immediateLiveStderrRedactor.write("zepo-live\\trace.txt for +91 ");
  immediateLiveStderrRedactor.write("98765 43210.");
  immediateLiveStderrRedactor.flush();
  const immediateLiveStderr = immediateLiveStderrChunks.join("");
  assert(
    (immediateLiveStderr.match(/Visible prompt/g) ?? []).length === 1 &&
      immediateLiveStderr.includes("<redacted-npm-token>") &&
      immediateLiveStderr.includes("<redacted-query>") &&
      immediateLiveStderr.includes("<redacted-local-path>") &&
      immediateLiveStderr.includes("<redacted-phone>") &&
      !immediateLiveStderr.includes(fakeNpmToken) &&
      !immediateLiveStderr.includes("token npm") &&
      !immediateLiveStderr.includes("+91") &&
      !immediateLiveStderr.includes("Amul Milk 500ml") &&
      !immediateLiveStderr.includes("Users") &&
      !immediateLiveStderr.includes(".zepo-live") &&
      !immediateLiveStderr.includes("98765 43210"),
    "expected installed immediate live console stderr redaction to handle split sensitive values"
  );
  assertDeepEqual(
    redactArgsForLiveReport([
      "--data-dir",
      ".zepo-live",
      "--visible",
      "login",
      "--phone",
      "9999999999",
      "--json"
    ]),
    ["--data-dir", "<redacted-data-dir>", "--visible", "login", "--phone", "<redacted-phone>", "--json"],
    "expected installed live report command redaction to omit phone input"
  );
  const { step: doctorWithoutChromiumStep } = buildLiveReportStep({
    name: "doctor",
    args: ["--data-dir", ".zepo-live", "doctor", "--skip-browser", "--json"],
    status: 0,
    stdout: JSON.stringify({
      ok: true,
      checks: [],
      ...installedLiveStatusDiagnosticsPayload()
    }),
    stderr: "",
    summarizePayload: () => ({ unsafe: true })
  });
  assert(doctorWithoutChromiumStep.ok === false, "expected installed doctor live report contract to require Chromium check");
  assert(
    doctorWithoutChromiumStep.error?.code === "live_doctor_contract_mismatch",
    "expected installed doctor mismatch code"
  );

  const { step: doctorNotReadyStep } = buildLiveReportStep({
    name: "doctor",
    args: ["--data-dir", ".zepo-live", "doctor", "--json"],
    status: 0,
    stdout: JSON.stringify({
      ok: true,
      checks: [{ name: "Playwright Chromium", status: "pass" }],
      ...installedLiveStatusDiagnosticsPayload(),
      browserAutomation: {
        ready: false,
        reasons: ["browser_lock_active"],
        retryAfterMs: 0
      }
    }),
    stderr: "",
    summarizePayload: () => ({ unsafe: true })
  });
  assert(
    doctorNotReadyStep.ok === false,
    "expected installed doctor live report contract to require browser automation readiness"
  );
  assert(
    doctorNotReadyStep.error?.code === "live_doctor_contract_mismatch",
    "expected installed doctor readiness mismatch code"
  );

  const { step: doctorWithChromiumStep } = buildLiveReportStep({
    name: "doctor",
    args: ["--data-dir", ".zepo-live", "doctor", "--json"],
    status: 0,
    stdout: JSON.stringify({
      ok: true,
      checks: [{ name: "Playwright Chromium", status: "pass" }],
      ...installedLiveStatusDiagnosticsPayload()
    }),
    stderr: "",
    summarizePayload: () => ({ browserChecked: true })
  });
  assert(doctorWithChromiumStep.ok === true, "expected installed doctor live report contract to accept Chromium check");

  const { step: checkoutStep } = buildLiveReportStep({
    name: "checkout",
    args: ["--data-dir", ".zepo-live", "--visible", "checkout", "--json"],
    status: 0,
    stdout: JSON.stringify({
      status: "checkout_handoff_returned",
      payment: "handled_by_zepto",
      humanActionRequired: true,
      automationBoundary: "zepocli_did_not_click_payment_or_order_controls",
      handoffUrl: "https://www.zepto.com/?cart=open",
      handoffSurface: "visible_zepto_browser",
      cartPrecondition: "non_empty_cart_verified",
      paymentStatus: "paid",
      orderPlacement: "not_confirmed_by_zepocli",
      orderStatusCommand: "zepo track"
    }),
    stderr: "",
    summarizePayload: () => ({ unsafe: true })
  });
  assert(checkoutStep.ok === false, "expected installed checkout live report contract to fail unsafe payment status");
  assert(
    checkoutStep.error?.code === "live_checkout_contract_mismatch",
    "expected installed checkout mismatch code"
  );

  const { step: checkoutWithoutHandoffMarkersStep } = buildLiveReportStep({
    name: "checkout",
    args: ["--data-dir", ".zepo-live", "--visible", "checkout", "--json"],
    status: 0,
    stdout: JSON.stringify({
      status: "checkout_handoff_returned",
      payment: "handled_by_zepto",
      humanActionRequired: true,
      automationBoundary: "zepocli_did_not_click_payment_or_order_controls",
      cartPrecondition: "non_empty_cart_verified",
      paymentStatus: "not_observed_by_zepocli",
      orderPlacement: "not_confirmed_by_zepocli",
      orderStatusCommand: "zepo track"
    }),
    stderr: "",
    summarizePayload: () => ({ unsafe: true })
  });
  assert(
    checkoutWithoutHandoffMarkersStep.ok === false &&
      checkoutWithoutHandoffMarkersStep.error?.code === "live_checkout_contract_mismatch",
    "expected installed checkout live report contract to require fixed handoff markers"
  );

  const { step: manualCheckoutStep } = buildLiveReportStep({
    name: "checkout",
    args: ["--data-dir", ".zepo-live", "--visible", "checkout", "--json"],
    status: 0,
    stdout: JSON.stringify({
      status: "checkout_manual_action_required",
      payment: "handled_by_zepto",
      humanActionRequired: true,
      automationBoundary: "zepocli_did_not_click_payment_or_order_controls",
      handoffUrl: "https://www.zepto.com/?cart=open",
      handoffSurface: "visible_zepto_browser",
      cartPrecondition: "non_empty_cart_verified",
      paymentStatus: "not_observed_by_zepocli",
      orderPlacement: "not_confirmed_by_zepocli",
      orderStatusCommand: "zepo track"
    }),
    stderr: "",
    summarizePayload: () => ({ unsafe: true })
  });
  assert(manualCheckoutStep.ok === false, "expected installed manual checkout live report to stay incomplete");
  assert(
    manualCheckoutStep.error?.code === "live_verification_incomplete",
    "expected installed manual checkout live report to use incomplete coverage code"
  );

  const { step: checkoutWithoutCartPreconditionStep } = buildLiveReportStep({
    name: "checkout",
    args: ["--data-dir", ".zepo-live", "--visible", "checkout", "--json"],
    status: 0,
    stdout: JSON.stringify({
      status: "checkout_handoff_returned",
      payment: "handled_by_zepto",
      humanActionRequired: true,
      automationBoundary: "zepocli_did_not_click_payment_or_order_controls",
      handoffUrl: "https://www.zepto.com/?cart=open",
      handoffSurface: "visible_zepto_browser",
      paymentStatus: "not_observed_by_zepocli",
      orderPlacement: "not_confirmed_by_zepocli",
      orderStatusCommand: "zepo track"
    }),
    stderr: "",
    summarizePayload: () => ({ unsafe: true })
  });
  assert(
    checkoutWithoutCartPreconditionStep.ok === false &&
      checkoutWithoutCartPreconditionStep.error?.code === "live_checkout_contract_mismatch",
    "expected installed checkout live report contract to require non-empty cart precondition"
  );

  const { step: clearStep } = buildLiveReportStep({
    name: "clear",
    args: ["--data-dir", ".zepo-live", "--visible", "clear", "--json"],
    status: 0,
    stdout: JSON.stringify({ items: [{ name: "Milk" }] }),
    stderr: "",
    summarizePayload: () => ({ unsafe: true })
  });
  assert(clearStep.ok === false, "expected installed clear live report contract to fail non-empty cart");
  assert(clearStep.error?.code === "live_clear_contract_mismatch", "expected installed clear mismatch code");

  const unreadableSearchStep = buildLiveReportStep({
    name: "search",
    args: ["--data-dir", ".zepo-live", "--visible", "search", "milk", "--json"],
    status: 0,
    stdout: JSON.stringify([{ name: "Milk" }]),
    stderr: "",
    summarizePayload: () => ({ unsafe: true })
  }).step;
  assert(
    unreadableSearchStep.ok === false &&
      unreadableSearchStep.error?.code === "live_search_contract_mismatch",
    "expected installed search live report contract to require product detail"
  );

  const unreadableAddressStep = buildLiveReportStep({
    name: "address list",
    args: ["--data-dir", ".zepo-live", "--visible", "address", "list", "--json"],
    status: 0,
    stdout: JSON.stringify([{ text: "Amul Milk 500ml" }]),
    stderr: "",
    summarizePayload: () => ({ unsafe: true })
  }).step;
  assert(
    unreadableAddressStep.ok === false &&
      unreadableAddressStep.error?.code === "live_address_contract_mismatch",
    "expected installed address live report contract to require structural address detail"
  );

  const unreadableAddStep = buildLiveReportStep({
    name: "add",
    args: ["--data-dir", ".zepo-live", "--visible", "add", "milk", "--json"],
    status: 0,
    stdout: JSON.stringify({ product: { name: "Milk" }, cart: { items: [{ name: "Milk" }] } }),
    stderr: "",
    summarizePayload: () => ({ unsafe: true })
  }).step;
  assert(
    unreadableAddStep.ok === false &&
      unreadableAddStep.error?.code === "live_add_contract_mismatch",
    "expected installed add live report contract to require product detail"
  );

  const addWithUnreadableCartStep = buildLiveReportStep({
    name: "add",
    args: ["--data-dir", ".zepo-live", "--visible", "add", "milk", "--json"],
    status: 0,
    stdout: JSON.stringify({ product: { name: "Milk", unit: "500 ml" }, cart: { items: [{}] } }),
    stderr: "",
    summarizePayload: () => ({ unsafe: true })
  }).step;
  assert(
    addWithUnreadableCartStep.ok === false &&
      addWithUnreadableCartStep.error?.code === "live_add_contract_mismatch",
    "expected installed add live report contract to require readable cart items"
  );

  const unreadableCartStep = buildLiveReportStep({
    name: "cart",
    args: ["--data-dir", ".zepo-live", "--visible", "cart", "--json"],
    status: 0,
    stdout: JSON.stringify({ items: [{}] }),
    stderr: "",
    summarizePayload: () => ({ unsafe: true })
  }).step;
  assert(
    unreadableCartStep.ok === false &&
      unreadableCartStep.error?.code === "live_cart_contract_mismatch",
    "expected installed cart live report contract to require readable cart item records"
  );

  const unreadableHistoryStep = buildLiveReportStep({
    name: "history",
    args: ["--data-dir", ".zepo-live", "--visible", "history", "--json"],
    status: 0,
    stdout: JSON.stringify([{}]),
    stderr: "",
    summarizePayload: () => ({ unsafe: true })
  }).step;
  assert(
    unreadableHistoryStep.ok === false &&
      unreadableHistoryStep.error?.code === "live_history_contract_mismatch",
    "expected installed history live report contract to require readable order records"
  );
  const totalOnlyHistoryStep = buildLiveReportStep({
    name: "history",
    args: ["--data-dir", ".zepo-live", "--visible", "history", "--json"],
    status: 0,
    stdout: JSON.stringify([{ total: "₹249" }]),
    stderr: "",
    summarizePayload: () => ({ unsafe: true })
  }).step;
  assert(
    totalOnlyHistoryStep.ok === false &&
      totalOnlyHistoryStep.error?.code === "live_history_contract_mismatch",
    "expected installed history live report contract to reject total-only order records"
  );

  const { step: notReadyStatusStep } = buildLiveReportStep({
    name: "status",
    args: ["--data-dir", ".zepo-live", "status", "--json"],
    status: 0,
    stdout: JSON.stringify({
      confirmedSession: true,
      ...installedLiveStatusDiagnosticsPayload(),
      browserAutomation: {
        ready: false,
        reasons: ["zepto_access_cooldown"],
        retryAfterMs: 900_000
      },
      accessChallenge: { detected: true, cooldownActive: true, retryAfterMs: 900_000 }
    }),
    stderr: "",
    summarizePayload: () => ({ browserAutomationReady: false })
  });
  assert(
    notReadyStatusStep.ok === false &&
      notReadyStatusStep.error?.code === "live_status_contract_mismatch",
    "expected installed status report contract to require browser readiness"
  );

  const { step: statusLiveStep } = buildLiveReportStep({
    name: "status live",
    args: ["--data-dir", ".zepo-live", "--visible", "status", "--live", "--json"],
    status: 0,
    stdout: JSON.stringify({
      confirmedSession: true,
      ...installedLiveStatusDiagnosticsPayload(),
      liveSession: { checked: true, state: "logged-in" }
    }),
    stderr: "",
    summarizePayload: () => ({ liveSessionState: "logged-in" })
  });
  assert(statusLiveStep.ok === true, "expected installed status live report contract to pass logged-in session");

  const { step: notReadyStatusLiveStep } = buildLiveReportStep({
    name: "status live",
    args: ["--data-dir", ".zepo-live", "--visible", "status", "--live", "--json"],
    status: 0,
    stdout: JSON.stringify({
      confirmedSession: true,
      ...installedLiveStatusDiagnosticsPayload(),
      browserAutomation: {
        ready: false,
        reasons: ["browser_lock_active"],
        retryAfterMs: 0
      },
      liveSession: { checked: true, state: "logged-in" }
    }),
    stderr: "",
    summarizePayload: () => ({ liveSessionState: "logged-in" })
  });
  assert(
    notReadyStatusLiveStep.ok === false &&
      notReadyStatusLiveStep.error?.code === "live_status_contract_mismatch",
    "expected installed status live report contract to require browser readiness"
  );

  const { step: summaryFailureStep } = buildLiveReportStep({
    name: "cart",
    args: ["--data-dir", "C:\\Users\\parth\\.zepo-live", "--visible", "cart", "--json"],
    status: 0,
    stdout: JSON.stringify({ items: [{ name: "Readable cart item" }] }),
    stderr: "",
    summarizePayload: () => {
      throw new Error("Summary failed near C:\\Users\\parth\\.zepo-live\\trace.txt with OTP 123456.");
    }
  });
  assert(summaryFailureStep.ok === false, "expected installed live report summary failures to fail the step");
  assert(
    summaryFailureStep.error?.code === "live_summary_failed",
    "expected installed live report summary failure code"
  );
  assert(
    String(summaryFailureStep.error?.message).includes("<redacted-verification-code>"),
    "expected installed live report summary failure to redact OTP-like values"
  );
  assert(
    !JSON.stringify(summaryFailureStep).includes("123456") && !JSON.stringify(summaryFailureStep).includes("parth"),
    "expected installed live report summary failure to omit raw secrets and local paths"
  );
  const runnerFailure = summarizeLiveRunnerFailure(
    new Error("Runner failed at C:\\Users\\parth\\.zepo-live\\trace.txt with OTP 123456.")
  );
  assert(runnerFailure.code === "live_runner_failed", "expected installed live runner failure code");
  assert(
    String(runnerFailure.message).includes("<redacted-verification-code>") &&
      !String(runnerFailure.message).includes("123456") &&
      !String(runnerFailure.message).includes("parth"),
    "expected installed live runner failure redaction"
  );
  const corruptCompiledCliStep = buildLiveReportStep({
    name: "doctor",
    args: ["--data-dir", "C:\\Users\\parth\\.zepo-live", "doctor", "--json"],
    status: 1,
    stdout: "",
    stderr: [
      "file:///C:/Users/parth/Desktop/ZepoCli/dist/config/constants.js:1",
      "\u0000\u0000\u0000",
      "^^^^",
      "SyntaxError: Invalid or unexpected token",
      "    at compileSourceTextModule (node:internal/modules/esm/utils:346:16)"
    ].join("\n"),
    summarizePayload: () => ({ unsafe: true })
  }).step;
  assert(corruptCompiledCliStep.ok === false, "expected installed corrupt compiled CLI step to fail");
  assert(
    corruptCompiledCliStep.error?.code === "command_failed" &&
      corruptCompiledCliStep.error?.message === "SyntaxError: Invalid or unexpected token",
    "expected installed live command failure to prefer actionable syntax errors over redacted path-only lines"
  );
  assert(
    !JSON.stringify(corruptCompiledCliStep).includes("parth") &&
      !JSON.stringify(corruptCompiledCliStep).includes("constants.js"),
    "expected installed corrupt compiled CLI failure to omit local paths from the report"
  );
  const commandLaunchFailure = buildLiveCommandLaunchFailureStep(
    "add",
    ["--data-dir", "C:\\Users\\parth\\.zepo-live", "--visible", "add", "Amul Milk 500ml", "--json"],
    new Error("spawn failed near C:\\Users\\parth\\.zepo-live\\trace.txt with OTP 123456.")
  );
  assert(commandLaunchFailure.ok === false, "expected installed live command launch failure to fail the step");
  assert(
    commandLaunchFailure.command === "zepo --data-dir <redacted-data-dir> --visible add <redacted-query> --json",
    "expected installed live command launch failure to redact command arguments"
  );
  assert(
    commandLaunchFailure.error?.code === "live_command_launch_failed" &&
      String(commandLaunchFailure.error?.message).includes("<redacted-verification-code>") &&
      !JSON.stringify(commandLaunchFailure).includes("123456") &&
      !JSON.stringify(commandLaunchFailure).includes("parth"),
    "expected installed live command launch failure redaction"
  );
  const commandTimeoutFailure = buildLiveCommandTimeoutStep(
    "checkout",
    ["--data-dir", "C:\\Users\\parth\\.zepo-live", "--visible", "checkout", "--json"],
    1_000
  );
  assert(commandTimeoutFailure.ok === false, "expected installed live command timeout to fail the step");
  assert(
    commandTimeoutFailure.command === "zepo --data-dir <redacted-data-dir> --visible checkout --json",
    "expected installed live command timeout to redact command arguments"
  );
  assert(
    commandTimeoutFailure.error?.code === "live_command_timeout" &&
      String(commandTimeoutFailure.error?.message).includes("1000 ms") &&
      !JSON.stringify(commandTimeoutFailure).includes("parth"),
    "expected installed live command timeout redaction"
  );
  const malformedCodeFailure = summarizeCommandError(
    {
      code: "Order ZEP1234 at C:\\Users\\parth\\.zepo-live",
      message: "Malformed code should be normalized."
    },
    "",
    []
  );
  assert(malformedCodeFailure.code === "command_failed", "expected installed malformed live error code fallback");
  assert(
    !JSON.stringify(malformedCodeFailure).includes("ZEP1234") && !JSON.stringify(malformedCodeFailure).includes("parth"),
    "expected installed malformed live error code to omit raw sensitive values"
  );
  const lowercaseMalformedCodeFailure = summarizeCommandError(
    {
      code: "order_zep1234",
      message: "Lowercase malformed code should be normalized."
    },
    "",
    []
  );
  assert(
    lowercaseMalformedCodeFailure.code === "command_failed",
    "expected installed lowercase malformed live error code fallback"
  );
  const accessChallengeFailureStep = buildLiveReportStep({
    name: "search",
    args: ["--data-dir", ".zepo-live", "--visible", "search", "milk", "--json"],
    status: 1,
    stdout: "",
    stderr: JSON.stringify({
      ok: false,
      error: {
        code: "zepto_access_challenge",
        message: "Zepto returned HTTP 429 from https://www.zepto.com/api/search?query=milk.",
        hint: "Stop repeated automation and retry milk later.",
        retryAfterMs: 900_000
      }
    }),
    summarizePayload: () => ({ unsafe: true })
  }).step;
  assert(accessChallengeFailureStep.ok === false, "expected installed access-challenge report step to fail");
  assert(
    accessChallengeFailureStep.error?.code === "zepto_access_challenge" &&
      accessChallengeFailureStep.error?.retryAfterMs === 900_000,
    "expected installed access-challenge report step to preserve retry timing"
  );
  assert(
    !JSON.stringify(accessChallengeFailureStep).includes("query=milk") &&
      !JSON.stringify(accessChallengeFailureStep).includes("retry milk"),
    "expected installed access-challenge report step to redact workflow query text"
  );
  console.log("pass installed live verifier contract");
}

async function loadInstalledRuntimeModules(prefixDir) {
  return {
    packageDir: join(prefixDir, "node_modules", packageJson.name)
  };
}

function verifyInstalledCli(installedCliPath, runtimeModules) {
  const visibleLoginDataDir = join(tempRoot, "data-visible-login");
  const visibleAddressAddDataDir = join(tempRoot, "data-visible-address-add");
  const visibleCheckoutDataDir = join(tempRoot, "data-visible-checkout");
  const completionRuntimeDataDir = join(tempRoot, "data-completion-runtime-free");
  const checks = [
    {
      name: "installed version",
      args: ["--version"],
      expect: ({ status, stdout, stderr }) => {
        assert(status === 0, "expected exit code 0");
        assert(stderr === "", "expected empty stderr");
        assert(stdout === packageJson.version, "expected installed CLI version to match package.json");
      }
    },
    {
      name: "installed status human",
      args: ["--data-dir", dataDir, "status"],
      expect: ({ status, stdout, stderr }) => {
        assert(status === 0, "expected exit code 0");
        assert(stderr === "", "expected empty stderr");
        assert(stdout.includes(`Version: ${packageJson.version}`), "expected installed status to print package version");
        assert(stdout.includes("Browser mode:"), "expected installed status to print browser mode");
        assert(stdout.includes("background/headless"), "expected installed status to print background browser mode");
        assert(stdout.includes("Confirmed session:"), "expected installed status readiness output");
      }
    },
    {
      name: "installed doctor skip browser human",
      args: ["--data-dir", dataDir, "doctor", "--skip-browser"],
      expect: ({ status, stdout, stderr }) => {
        assert(status === 0, "expected exit code 0");
        assert(stderr === "", "expected empty stderr");
        assert(stdout.includes("ZepoCli doctor"), "expected installed doctor heading");
        assert(
          stdout.includes(`Version: ${packageJson.version}`),
          "expected installed doctor to print package version"
        );
        assert(stdout.includes("Browser mode:"), "expected installed doctor to print browser mode");
        assert(stdout.includes("background/headless"), "expected installed doctor to print background browser mode");
      }
    },
    {
      name: "installed help",
      args: ["--help"],
      expect: ({ status, stdout }) => {
        assert(status === 0, "expected exit code 0");
        assert(stdout.includes("Developer CLI for user-directed Zepto workflows"), "expected CLI description");
        assert(stdout.includes("--browser-locale <locale>"), "expected installed browser locale option in help output");
        assert(
          stdout.includes("--browser-timezone <timezone>"),
          "expected installed browser timezone option in help output"
        );
        assert(stdout.includes("default is background/headless"), "expected installed visible option to document headless default");
        assert(stdout.includes("checkout"), "expected checkout command in help output");
        assert(stdout.includes("completion"), "expected installed completion command in help output");
      }
    },
    {
      name: "installed login help",
      args: ["login", "--help"],
      expect: ({ status, stdout, stderr }) => {
        assert(status === 0, "expected exit code 0");
        assert(stderr === "", "expected empty stderr");
        assert(stdout.includes("Save a Zepto login session (requires --visible)"), "expected login description");
        assert(stdout.includes("--phone <number>"), "expected login phone option");
        assert(stdout.includes("--json"), "expected login json option");
      }
    },
    {
      name: "installed logout help",
      args: ["logout", "--help"],
      expect: ({ status, stdout, stderr }) => {
        assert(status === 0, "expected exit code 0");
        assert(stderr === "", "expected empty stderr");
        assert(stdout.includes("Remove the locally saved Zepto session"), "expected logout description");
        assert(stdout.includes("--json"), "expected logout json option");
      }
    },
    {
      name: "installed status help",
      args: ["status", "--help"],
      expect: ({ status, stdout, stderr }) => {
        assert(status === 0, "expected exit code 0");
        assert(stderr === "", "expected empty stderr");
        assert(stdout.includes("Show local ZepoCli session and storage status"), "expected status description");
        assert(stdout.includes("--live"), "expected status live option");
        assert(stdout.includes("--json"), "expected status json option");
      }
    },
    {
      name: "installed doctor help",
      args: ["doctor", "--help"],
      expect: ({ status, stdout, stderr }) => {
        assert(status === 0, "expected exit code 0");
        assert(stderr === "", "expected empty stderr");
        assert(stdout.includes("Check local ZepoCli environment readiness"), "expected doctor description");
        assert(stdout.includes("--skip-browser"), "expected doctor skip-browser option");
        assert(stdout.includes("--json"), "expected doctor json option");
      }
    },
    {
      name: "installed search help",
      args: ["search", "--help"],
      expect: ({ status, stdout, stderr }) => {
        assert(status === 0, "expected exit code 0");
        assert(stderr === "", "expected empty stderr");
        assert(stdout.includes("Search Zepto products"), "expected search description");
        assert(stdout.includes("<query...>"), "expected search query argument");
        assert(stdout.includes("--limit <number>"), "expected search limit option");
        assert(stdout.includes("--json"), "expected search json option");
      }
    },
    {
      name: "installed add help",
      args: ["add", "--help"],
      expect: ({ status, stdout, stderr }) => {
        assert(status === 0, "expected exit code 0");
        assert(stderr === "", "expected empty stderr");
        assert(stdout.includes("Search and add a product to the Zepto cart"), "expected add description");
        assert(stdout.includes("quantity to add, maximum 12"), "expected add quantity cap in help output");
        assert(stdout.includes("--choose"), "expected add choose option");
        assert(stdout.includes("--remove-limit-items"), "expected add limit-warning removal option");
        assert(stdout.includes("--json"), "expected add json option");
      }
    },
    {
      name: "installed cart help",
      args: ["cart", "--help"],
      expect: ({ status, stdout, stderr }) => {
        assert(status === 0, "expected exit code 0");
        assert(stderr === "", "expected empty stderr");
        assert(stdout.includes("Show Zepto cart"), "expected cart description");
        assert(stdout.includes("--remove-limit-items"), "expected cart limit resolution option");
        assert(stdout.includes("--json"), "expected cart json option");
      }
    },
    {
      name: "installed remove help",
      args: ["remove", "--help"],
      expect: ({ status, stdout, stderr }) => {
        assert(status === 0, "expected exit code 0");
        assert(stderr === "", "expected empty stderr");
        assert(stdout.includes("Remove a matching item from the Zepto cart"), "expected remove description");
        assert(stdout.includes("<query...>"), "expected remove query argument");
        assert(stdout.includes("--json"), "expected remove json option");
      }
    },
    {
      name: "installed clear help",
      args: ["clear", "--help"],
      expect: ({ status, stdout, stderr }) => {
        assert(status === 0, "expected exit code 0");
        assert(stderr === "", "expected empty stderr");
        assert(stdout.includes("Remove all detected items from the Zepto cart"), "expected clear description");
        assert(stdout.includes("--json"), "expected clear json option");
      }
    },
    {
      name: "installed address help",
      args: ["address", "--help"],
      expect: ({ status, stdout, stderr }) => {
        assert(status === 0, "expected exit code 0");
        assert(stderr === "", "expected empty stderr");
        assert(stdout.includes("Manage Zepto delivery addresses"), "expected address description");
        assert(stdout.includes("list"), "expected address list subcommand");
        assert(stdout.includes("use"), "expected address use subcommand");
        assert(stdout.includes("add"), "expected address add subcommand");
      }
    },
    {
      name: "installed address list help",
      args: ["address", "list", "--help"],
      expect: ({ status, stdout, stderr }) => {
        assert(status === 0, "expected exit code 0");
        assert(stderr === "", "expected empty stderr");
        assert(stdout.includes("List addresses detected from Zepto"), "expected address list description");
        assert(stdout.includes("--json"), "expected address list json option");
      }
    },
    {
      name: "installed address use help",
      args: ["address", "use", "--help"],
      expect: ({ status, stdout, stderr }) => {
        assert(status === 0, "expected exit code 0");
        assert(stderr === "", "expected empty stderr");
        assert(stdout.includes("Select a saved Zepto address by visible text"), "expected address use description");
        assert(stdout.includes("<query...>"), "expected address use query argument");
        assert(stdout.includes("--json"), "expected address use json option");
      }
    },
    {
      name: "installed address add help",
      args: ["address", "add", "--help"],
      expect: ({ status, stdout, stderr }) => {
        assert(status === 0, "expected exit code 0");
        assert(stderr === "", "expected empty stderr");
        assert(stdout.includes("Open the Zepto address flow (requires --visible)"), "expected address add description");
        assert(stdout.includes("--json"), "expected address add json option");
      }
    },
    {
      name: "installed checkout help",
      args: ["checkout", "--help"],
      expect: ({ status, stdout, stderr }) => {
        assert(status === 0, "expected exit code 0");
        assert(stderr === "", "expected empty stderr");
        assert(stdout.includes("Open Zepto checkout handoff (requires --visible)"), "expected checkout description");
        assert(stdout.includes("--json"), "expected checkout json option");
        assert(stdout.includes("--wait"), "expected checkout wait option");
        assert(stdout.includes("--remove-limit-items"), "expected checkout limit-warning removal option");
      }
    },
    {
      name: "installed track help",
      args: ["track", "--help"],
      expect: ({ status, stdout, stderr }) => {
        assert(status === 0, "expected exit code 0");
        assert(stderr === "", "expected empty stderr");
        assert(stdout.includes("Show latest Zepto order status"), "expected track description");
        assert(stdout.includes("--json"), "expected track json option");
      }
    },
    {
      name: "installed history help",
      args: ["history", "--help"],
      expect: ({ status, stdout, stderr }) => {
        assert(status === 0, "expected exit code 0");
        assert(stderr === "", "expected empty stderr");
        assert(stdout.includes("Show Zepto order history"), "expected history description");
        assert(stdout.includes("--json"), "expected history json option");
      }
    },
    {
      name: "installed reorder help",
      args: ["reorder", "--help"],
      expect: ({ status, stdout, stderr }) => {
        assert(status === 0, "expected exit code 0");
        assert(stderr === "", "expected empty stderr");
        assert(stdout.includes("Reorder from Zepto order history"), "expected reorder description");
        assert(stdout.includes("[target]"), "expected reorder target argument");
        assert(stdout.includes("--json"), "expected reorder json option");
      }
    },
    {
      name: "installed completion help",
      args: ["completion", "--help"],
      expect: ({ status, stdout, stderr }) => {
        assert(status === 0, "expected exit code 0");
        assert(stderr === "", "expected empty stderr");
        assert(stdout.includes("Generate a shell completion script"), "expected installed completion description");
        assert(stdout.includes("<shell>"), "expected installed completion shell argument");
      }
    },
    {
      name: "installed completion bash",
      args: ["completion", "bash"],
      expect: ({ status, stdout, stderr }) => {
        assert(status === 0, "expected exit code 0");
        assert(stderr === "", "expected empty stderr");
        assert(stdout.includes("complete -F _zepo_completion zepo"), "expected installed bash completion registration");
        assert(
          stdout.includes("login logout status doctor search add cart remove clear address checkout track history reorder completion help"),
          "expected installed root command completions"
        );
        assert(
          stdout.includes("help) candidates='login logout status doctor search add cart"),
          "expected installed help command completions"
        );
        assert(
          stdout.includes("help\\ address) candidates='list use add"),
          "expected installed nested help command completions"
        );
        assert(stdout.includes("--data-dir --debug --json --no-input --visible"), "expected installed global option completions");
      }
    },
    {
      name: "installed completion runtime-free data-dir",
      args: ["--data-dir", completionRuntimeDataDir, "completion", "bash"],
      expect: ({ status, stdout, stderr }) => {
        assert(status === 0, "expected exit code 0");
        assert(stderr === "", "expected empty stderr");
        assert(stdout.includes("complete -F _zepo_completion zepo"), "expected installed bash completion registration");
        assert(!existsSync(completionRuntimeDataDir), "expected installed completion command not to create runtime data dir");
      }
    },
    {
      name: "installed completion zsh",
      args: ["completion", "zsh"],
      expect: ({ status, stdout, stderr }) => {
        assert(status === 0, "expected exit code 0");
        assert(stderr === "", "expected empty stderr");
        assert(stdout.includes("#compdef zepo"), "expected installed zsh completion header");
        assert(stdout.includes("_describe 'command or option' candidates"), "expected installed zsh candidate description");
        assert(stdout.includes("address\\:address"), "expected installed zsh address candidate");
        assert(stdout.includes("--visible\\:--visible"), "expected installed zsh global option candidate");
      }
    },
    {
      name: "installed completion fish",
      args: ["completion", "fish"],
      expect: ({ status, stdout, stderr }) => {
        assert(status === 0, "expected exit code 0");
        assert(stderr === "", "expected empty stderr");
        assert(stdout.includes("complete -c zepo -f"), "expected installed fish completion root");
        assert(stdout.includes("__fish_seen_subcommand_from address"), "expected installed fish address subcommand condition");
        assert(stdout.includes("__fish_seen_subcommand_from help address"), "expected installed fish nested help condition");
        assert(stdout.includes("-l 'visible'"), "expected installed fish visible option");
      }
    },
    {
      name: "installed completion powershell",
      args: ["completion", "powershell"],
      expect: ({ status, stdout, stderr }) => {
        assert(status === 0, "expected exit code 0");
        assert(stderr === "", "expected empty stderr");
        assert(
          stdout.includes("Register-ArgumentCompleter -Native -CommandName 'zepo'"),
          "expected installed PowerShell completer registration"
        );
        assert(stdout.includes("'address'"), "expected installed PowerShell address candidate");
        assert(stdout.includes("'--visible'"), "expected installed PowerShell visible option candidate");
      }
    },
    {
      name: "installed completion pwsh alias",
      args: ["completion", "pwsh"],
      expect: ({ status, stdout, stderr }) => {
        assert(status === 0, "expected exit code 0");
        assert(stderr === "", "expected empty stderr");
        assert(
          stdout.includes("Register-ArgumentCompleter -Native -CommandName 'zepo'"),
          "expected installed pwsh alias to render PowerShell completion"
        );
      }
    },
    {
      name: "installed completion ps1 alias",
      args: ["completion", "ps1"],
      expect: ({ status, stdout, stderr }) => {
        assert(status === 0, "expected exit code 0");
        assert(stderr === "", "expected empty stderr");
        assert(
          stdout.includes("Register-ArgumentCompleter -Native -CommandName 'zepo'"),
          "expected installed ps1 alias to render PowerShell completion"
        );
      }
    },
    {
      name: "installed completion invalid shell json",
      args: ["--json", "completion", "cmd"],
      expect: (result) => {
        const payload = expectJsonError(result, "user_error", "Unsupported completion shell.", "invalid_input");
        assert(String(payload.error?.hint).includes("zepo completion bash"), "expected installed completion shell hint");
      }
    },
    {
      name: "installed status json",
      args: ["--data-dir", dataDir, "status", "--json"],
      expect: ({ status, stdout, stderr }) => {
        assert(status === 0, "expected exit code 0");
        assert(stderr === "", "expected empty stderr");
        const payload = parseJson(stdout, "stdout");
        assertFreshStatus(payload, dataDir);
      }
    },
    {
      name: "installed global json status",
      args: ["--data-dir", dataDir, "--json", "status"],
      expect: ({ status, stdout, stderr }) => {
        assert(status === 0, "expected exit code 0");
        assert(stderr === "", "expected empty stderr");
        const payload = parseJson(stdout, "stdout");
        assertFreshStatus(payload, dataDir);
      }
    },
    {
      name: "installed global json no session cart",
      args: ["--data-dir", dataDir, "--json", "cart"],
      expect: (result) => {
        expectJsonError(result, "user_error", "No confirmed Zepto session found.", "no_confirmed_session");
      }
    },
    {
      name: "installed global json no session nested address list",
      args: ["--data-dir", dataDir, "--json", "address", "list"],
      expect: (result) => {
        expectJsonError(result, "user_error", "No confirmed Zepto session found.", "no_confirmed_session");
      }
    },
    {
      name: "installed status live skipped json",
      args: ["--data-dir", dataDir, "status", "--live", "--json"],
      expect: ({ status, stdout, stderr }) => {
        assert(status === 0, "expected exit code 0");
        assert(stderr === "", "expected empty stderr");
        const payload = parseJson(stdout, "stdout");
        assertFreshStatus(payload, dataDir);
        assert(payload.liveSession?.checked === false, "expected live session check skipped");
        assert(payload.liveSession?.state === "skipped", "expected skipped live session state");
        assert(payload.liveSession?.demotedLocalSession === false, "expected no local session demotion");
        assert(
          payload.liveSession?.message === "No confirmed local Zepto session is available for live verification.",
          "expected live session skipped message"
        );
      }
    },
    {
      name: "installed status old active browser lock json",
      args: () => {
        writeFileSync(
          join(dataDir, "browser.lock"),
          JSON.stringify({
            token: "smoke",
            pid: process.pid,
            createdAt: Date.now() - 20 * 60 * 1_000
          })
        );
        return ["--data-dir", dataDir, "status", "--json"];
      },
      expect: ({ status, stdout }) => {
        assert(status === 0, "expected exit code 0");
        const payload = parseJson(stdout, "stdout");
        assert(payload.browserLock?.path === join(dataDir, "browser.lock"), "expected browser lock path");
        assert(payload.browserLock?.present === true, "expected browser lock present");
        assert(payload.browserLock?.stale === false, "expected browser lock not stale");
        assert(payload.browserLock?.pid === process.pid, "expected browser lock owner pid");
        assert(typeof payload.browserLock?.createdAt === "string", "expected browser lock createdAt");
        assert(payload.browserAutomation?.ready === false, "expected old live-owner lock to block automation");
        assert(
          payload.browserAutomation?.reasons?.includes("browser_lock_active"),
          "expected active browser lock stop reason"
        );
        rmSync(join(dataDir, "browser.lock"), { force: true });
      }
    },
    {
      name: "installed status malformed stale browser lock json",
      args: () => {
        const lockPath = join(dataDir, "browser.lock");
        writeFileSync(lockPath, "{}");
        utimesSync(lockPath, new Date(10_000), new Date(10_000));
        return ["--data-dir", dataDir, "status", "--json"];
      },
      expect: ({ status, stdout }) => {
        assert(status === 0, "expected exit code 0");
        const payload = parseJson(stdout, "stdout");
        assert(payload.browserLock?.path === join(dataDir, "browser.lock"), "expected installed malformed lock path");
        assert(payload.browserLock?.present === true, "expected installed malformed lock present");
        assert(payload.browserLock?.stale === true, "expected installed malformed lock to be stale");
        assert(payload.browserLock?.staleReason === "expired", "expected installed malformed lock expired stale reason");
        assert(typeof payload.browserLock?.createdAt === "string", "expected installed malformed lock createdAt from mtime");
        assert(payload.browserAutomation?.ready === true, "expected installed stale malformed lock not to block automation");
        assert(
          !payload.browserAutomation?.reasons?.includes("browser_lock_active"),
          "expected installed stale malformed lock not to report active lock reason"
        );
        rmSync(join(dataDir, "browser.lock"), { force: true });
      }
    },
    {
      name: "installed status malformed access cooldown metadata json",
      args: () => {
        setRuntimeMeta(runtimeModules, dataDir, "LAST_ACCESS_CHALLENGE_META_KEY", "999999999999999999999");
        return ["--data-dir", dataDir, "status", "--json"];
      },
      expect: ({ status, stdout }) => {
        assert(status === 0, "expected exit code 0");
        const payload = parseJson(stdout, "stdout");
        assertFreshStatus(payload, dataDir);
      }
    },
    {
      name: "installed status malformed headless run history metadata json",
      args: () => {
        setRuntimeMeta(
          runtimeModules,
          dataDir,
          "HEADLESS_BROWSER_RUN_HISTORY_META_KEY",
          JSON.stringify(Array.from({ length: 8 }, () => 999_999_999_999_999_999_999))
        );
        return ["--data-dir", dataDir, "status", "--json"];
      },
      expect: ({ status, stdout }) => {
        assert(status === 0, "expected exit code 0");
        const payload = parseJson(stdout, "stdout");
        assertFreshStatus(payload, dataDir);
      }
    },
    {
      name: "installed doctor skip browser json",
      args: ["--data-dir", dataDir, "doctor", "--skip-browser", "--json"],
      expect: ({ status, stdout }) => {
        assert(status === 0, "expected exit code 0");
        const payload = parseJson(stdout, "stdout");
        assertDoctorReport(payload, dataDir);
      }
    },
    {
      name: "installed doctor browser json",
      args: ["--data-dir", dataDir, "doctor", "--json"],
      expect: ({ status, stdout }) => {
        assert(status === 0, "expected exit code 0");
        const payload = parseJson(stdout, "stdout");
        assertDoctorReport(payload, dataDir, { browser: true });
      }
    },
    {
      name: "installed logout json",
      args: ["--data-dir", dataDir, "logout", "--json"],
      expect: ({ status, stdout, stderr }) => {
        assert(status === 0, "expected exit code 0");
        assert(stderr === "", "expected empty stderr");
        const payload = parseJson(stdout, "stdout");
        assert(payload.status === "session_removed", "expected installed logout status");
        assert(payload.sessionRemoved === true, "expected installed logout confirmation");
        assert(payload.cacheCleared === true, "expected installed logout cache cleanup confirmation");
        assert(
          payload.next === "Run `zepo --visible login` before account-dependent commands.",
          "expected installed logout next-step guidance"
        );
      }
    },
    {
      name: "installed logout active browser lock json",
      args: () => {
        const logoutLockDataDir = join(tempRoot, "data-logout-lock");
        const authStatePath = join(logoutLockDataDir, "storage", "auth-state.json");
        const profileFile = join(logoutLockDataDir, "storage", "browser-profile", "Default", "Cookies");
        mkdirSync(join(logoutLockDataDir, "storage", "browser-profile", "Default"), { recursive: true });
        writeFileSync(authStatePath, "{}");
        writeFileSync(profileFile, "cookie-data");
        writeFileSync(
          join(logoutLockDataDir, "browser.lock"),
          JSON.stringify({
            token: "active",
            pid: process.pid,
            createdAt: Date.now()
          })
        );
        return ["--data-dir", logoutLockDataDir, "logout", "--json"];
      },
      expect: (result) => {
        expectJsonError(
          result,
          "user_error",
          "Another ZepoCli browser command is already running for this data directory.",
          "browser_lock_active"
        );
        assert(
          existsSync(join(tempRoot, "data-logout-lock", "storage", "auth-state.json")),
          "expected installed logout to preserve auth state while lock is active"
        );
        assert(
          existsSync(join(tempRoot, "data-logout-lock", "storage", "browser-profile", "Default", "Cookies")),
          "expected installed logout to preserve browser profile while lock is active"
        );
      }
    },
    {
      name: "installed runtime setup error",
      args: () => {
        const blockedPath = join(tempRoot, "blocked-data-dir");
        writeFileSync(blockedPath, "not a directory");
        return ["--data-dir", blockedPath, "status", "--json"];
      },
      expect: (result) => {
        assert(result.status === 1, "expected exit code 1");
        assert(result.stdout === "", "expected empty stdout");
        const payload = parseJson(result.stderr, "stderr");
        assert(payload.ok === false, "expected ok false");
        assert(payload.error?.type === "user_error", "expected user error type");
        assert(payload.error?.code === "runtime_setup_failed", "expected runtime setup error code");
        assert(
          String(payload.error?.message).startsWith("Could not initialize local ZepoCli storage"),
          "expected runtime setup message"
        );
        assert(String(payload.error?.message).includes("<redacted-local-path>"), "expected redacted data-dir path");
        assert(!result.stderr.includes(join(tempRoot, "blocked-data-dir")), "expected runtime error to omit raw data-dir path");
        assert(String(payload.error?.hint).includes("zepo --data-dir <path> doctor"), "expected data-dir doctor hint");
      }
    },
    {
      name: "installed human runtime setup redaction",
      args: () => {
        const blockedPath = join(tempRoot, "blocked-human-data-dir");
        writeFileSync(blockedPath, "not a directory");
        return ["--data-dir", blockedPath, "status"];
      },
      expect: (result) => {
        assert(result.status === 1, "expected exit code 1");
        assert(result.stdout === "", "expected empty stdout");
        assert(result.stderr.includes("Could not initialize local ZepoCli storage"), "expected runtime setup message");
        assert(result.stderr.includes("<redacted-local-path>"), "expected installed human redacted data-dir path");
        assert(
          !result.stderr.includes(join(tempRoot, "blocked-human-data-dir")),
          "expected installed human runtime error to omit raw data-dir path"
        );
        assert(result.stderr.includes("zepo --data-dir <path> doctor"), "expected data-dir doctor hint");
      }
    },
    {
      name: "installed json invalid timeout format",
      args: ["--timeout", "1e3", "status", "--json"],
      expect: (result) => {
        const payload = expectJsonError(result, "invalid_input", "Invalid input.", "invalid_input");
        assert(payload.error?.issues?.[0]?.path === "timeout", "expected installed timeout validation issue");
        assert(
          payload.error?.issues?.[0]?.message === "must be a decimal integer number of milliseconds",
          "expected installed timeout format message"
        );
      }
    },
    {
      name: "installed json invalid timeout range",
      args: ["--timeout", "300001", "status", "--json"],
      expect: (result) => {
        const payload = expectJsonError(result, "invalid_input", "Invalid input.", "invalid_input");
        assert(payload.error?.issues?.[0]?.path === "timeout", "expected installed timeout validation issue");
        assert(
          payload.error?.issues?.[0]?.message === "must be at most 300000 ms",
          "expected installed timeout maximum message"
        );
      }
    },
    {
      name: "installed json unknown command",
      args: ["--json", "not-a-command"],
      expect: (result) => {
        expectJsonError(result, "invalid_input", "error: unknown command 'not-a-command'", "invalid_input");
      }
    },
    {
      name: "installed json blank data dir",
      args: ["--data-dir", "   ", "status", "--json"],
      expect: (result) => {
        const payload = expectJsonError(result, "invalid_input", "Invalid input.", "invalid_input");
        assert(payload.error?.issues?.[0]?.path === "dataDir", "expected installed dataDir validation issue");
        assert(payload.error?.issues?.[0]?.message === "must not be blank", "expected installed blank data dir message");
      }
    },
    {
      name: "installed json invalid browser locale",
      args: ["--browser-locale", "not_a_locale", "status", "--json"],
      expect: (result) => {
        const payload = expectJsonError(result, "invalid_input", "Invalid input.", "invalid_input");
        assert(payload.error?.issues?.[0]?.path === "browserLocale", "expected installed browserLocale validation issue");
        assert(
          payload.error?.issues?.[0]?.message === "must be a valid BCP 47 locale",
          "expected installed browser locale validation message"
        );
      }
    },
    {
      name: "installed json invalid browser timezone",
      args: ["--browser-timezone", "Mars/Olympus", "status", "--json"],
      expect: (result) => {
        const payload = expectJsonError(result, "invalid_input", "Invalid input.", "invalid_input");
        assert(
          payload.error?.issues?.[0]?.path === "browserTimezone",
          "expected installed browserTimezone validation issue"
        );
        assert(
          payload.error?.issues?.[0]?.message === "must be a valid IANA time zone",
          "expected installed browser timezone validation message"
        );
      }
    },
    ...[
      {
        name: "search",
        args: ["search", "   ", "--json"],
        message: "Search query is required."
      },
      {
        name: "add",
        args: ["add", "   ", "--json"],
        message: "Product query is required."
      },
      {
        name: "remove",
        args: ["remove", "   ", "--json"],
        message: "Cart item query is required."
      },
      {
        name: "address use",
        args: ["address", "use", "   ", "--json"],
        message: "Address query is required."
      }
    ].map((testCase) => ({
      name: `installed blank ${testCase.name} query`,
      args: ["--data-dir", join(tempRoot, `data-blank-${testCase.name.replaceAll(" ", "-")}`), ...testCase.args],
      expect: (result) => {
        expectJsonError(result, "user_error", testCase.message, "invalid_input");
        assert(!result.stderr.includes("No confirmed Zepto session found."), "expected blank query to fail before session work");
      }
    })),
    {
      name: "installed json unknown option",
      args: ["--json", "status", "--bad-option"],
      expect: (result) => {
        expectJsonError(result, "invalid_input", "error: unknown option '--bad-option'", "invalid_input");
      }
    },
    {
      name: "installed json equals flag parser error",
      args: ["--json=true", "status", "--bad-option"],
      expect: (result) => {
        expectJsonError(result, "invalid_input", "error: unknown option '--json=true'", "invalid_input");
        assert(result.stdout === "", "expected installed malformed --json value parser error to keep stdout empty");
      }
    },
    {
      name: "installed json encoded sensitive unknown option redaction",
      args: ["--json", "status", "--phone=%2B91+98765+43210"],
      expect: (result) => {
        expectJsonError(
          result,
          "invalid_input",
          "error: unknown option '--phone=<redacted-phone>'",
          "invalid_input"
        );
        assert(!result.stderr.includes("%2B91"), "expected installed JSON parser error to omit encoded phone value");
        assert(
          !result.stderr.includes("98765+43210"),
          "expected installed JSON parser error to omit plus-encoded phone value"
        );
      }
    },
    {
      name: "installed json forward-slash path unknown option redaction",
      args: ["--json", "status", "--path=C:/Users/parth/.zepo-live/report.json"],
      expect: (result) => {
        expectJsonError(
          result,
          "invalid_input",
          "error: unknown option '--path=<redacted-local-path>'",
          "invalid_input"
        );
        assert(!result.stderr.includes("C:/Users"), "expected installed JSON parser error to omit Windows path");
        assert(!result.stderr.includes("report.json"), "expected installed JSON parser error to omit path tail");
      }
    },
    {
      name: "installed json Linux path unknown option redaction",
      args: ["--json", "status", "--path=/root/.zepo-live/report.json"],
      expect: (result) => {
        expectJsonError(
          result,
          "invalid_input",
          "error: unknown option '--path=<redacted-local-path>'",
          "invalid_input"
        );
        assert(!result.stderr.includes("/root"), "expected installed JSON parser error to omit Linux root path");
        assert(!result.stderr.includes("report.json"), "expected installed JSON parser error to omit Linux path tail");
      }
    },
    {
      name: "installed json relative path assignment unknown option redaction",
      args: ["--json", "status", "--bad=.zepo-live/report.json"],
      expect: (result) => {
        expectJsonError(
          result,
          "invalid_input",
          "error: unknown option '--bad=<redacted-local-path>'",
          "invalid_input"
        );
        assert(
          !result.stderr.includes(".zepo-live"),
          "expected installed JSON parser error to omit relative Zepo data path"
        );
        assert(!result.stderr.includes("report.json"), "expected installed JSON parser error to omit relative path tail");
      }
    },
    {
      name: "installed json encoded relative path assignment unknown option redaction",
      args: ["--json", "status", "--bad=%2Ezepto-live%2Freport.json"],
      expect: (result) => {
        expectJsonError(
          result,
          "invalid_input",
          "error: unknown option '--bad=<redacted-local-path>'",
          "invalid_input"
        );
        assert(
          !result.stderr.includes("%2Ezepto-live"),
          "expected installed JSON parser error to omit encoded relative path"
        );
        assert(!result.stderr.includes("report.json"), "expected installed JSON parser error to omit encoded relative path tail");
      }
    },
    {
      name: "installed json npm token unknown option redaction",
      args: ["--json", "status", `--bad-${FAKE_NPM_TOKEN}`],
      expect: (result) => {
        expectJsonError(
          result,
          "invalid_input",
          "error: unknown option '--bad-<redacted-npm-token>'",
          "invalid_input"
        );
        assert(
          !result.stderr.includes(FAKE_NPM_TOKEN),
          "expected installed JSON parser error to omit npm-token-shaped value"
        );
      }
    },
    {
      name: "installed json missing nested argument",
      args: ["--data-dir", dataDir, "--json", "address", "use"],
      expect: (result) => {
        expectJsonError(result, "invalid_input", "error: missing required argument 'query'", "invalid_input");
      }
    },
    {
      name: "installed json unknown nested command",
      args: ["--data-dir", dataDir, "--json", "address", "nope"],
      expect: (result) => {
        expectJsonError(result, "invalid_input", "error: unknown command 'nope'", "invalid_input");
      }
    },
    {
      name: "installed json unsupported reorder target",
      args: ["--data-dir", dataDir, "reorder", "previous", "--json"],
      expect: (result) => {
        expectJsonError(result, "user_error", "Only `zepo reorder last` is supported.", "unsupported_operation");
      }
    },
    ...accountDependentNoSessionCommands.map((command) => ({
      name: `installed no session ${command.name}`,
      args: ["--data-dir", dataDir, ...command.args],
      expect: (result) => {
        expectJsonError(result, "user_error", "No confirmed Zepto session found.", "no_confirmed_session");
      }
    })),
    {
      name: "installed no-input guard",
      args: ["--data-dir", dataDir, "--no-input", "login", "--json"],
      expect: (result) => {
        expectJsonError(result, "user_error", "Zepto login requires interactive input.", "interactive_input_required");
        assertInstalledNoBrowserWork(installedCliPath, dataDir);
      }
    },
    {
      name: "installed visible required login",
      args: () => ["--data-dir", visibleLoginDataDir, "login", "--json"],
      expect: (result) => {
        const payload = expectJsonError(
          result,
          "user_error",
          "Zepto login requires a visible browser.",
          "visible_browser_required"
        );
        assert(String(payload.error?.hint).includes("zepo --visible login"), "expected installed visible login hint");
        assertInstalledNoBrowserWork(installedCliPath, visibleLoginDataDir);
      }
    },
    {
      name: "installed no-input address add",
      args: ["--data-dir", dataDir, "--no-input", "address", "add", "--json"],
      expect: (result) => {
        expectJsonError(result, "user_error", "Zepto address add requires interactive input.", "interactive_input_required");
        assertInstalledNoBrowserWork(installedCliPath, dataDir);
      }
    },
    {
      name: "installed visible required address add",
      args: ["--data-dir", visibleAddressAddDataDir, "address", "add", "--json"],
      expect: (result) => {
        const payload = expectJsonError(
          result,
          "user_error",
          "Zepto address add requires a visible browser.",
          "visible_browser_required"
        );
        assert(
          String(payload.error?.hint).includes("zepo --visible address add"),
          "expected installed visible address add hint"
        );
        assertInstalledNoBrowserWork(installedCliPath, visibleAddressAddDataDir);
      }
    },
    {
      name: "installed no-input checkout still requires visible browser",
      args: ["--data-dir", dataDir, "--no-input", "checkout", "--json"],
      expect: (result) => {
        const payload = expectJsonError(
          result,
          "user_error",
          "Zepto checkout requires a visible browser.",
          "visible_browser_required"
        );
        assert(String(payload.error?.hint).includes("zepo --visible checkout"), "expected installed visible checkout hint");
        assertInstalledNoBrowserWork(installedCliPath, dataDir);
      }
    },
    {
      name: "installed no-input checkout wait",
      args: ["--data-dir", dataDir, "--no-input", "checkout", "--json", "--wait"],
      expect: (result) => {
        expectJsonError(
          result,
          "user_error",
          "Zepto checkout requires interactive input.",
          "interactive_input_required"
        );
        assertInstalledNoBrowserWork(installedCliPath, dataDir);
      }
    },
    {
      name: "installed visible required checkout",
      args: ["--data-dir", visibleCheckoutDataDir, "checkout", "--json"],
      expect: (result) => {
        const payload = expectJsonError(
          result,
          "user_error",
          "Zepto checkout requires a visible browser.",
          "visible_browser_required"
        );
        assert(String(payload.error?.hint).includes("zepo --visible checkout"), "expected installed visible checkout hint");
        assertInstalledNoBrowserWork(installedCliPath, visibleCheckoutDataDir);
      }
    },
    {
      name: "installed no-input choose",
      args: ["--data-dir", dataDir, "--no-input", "add", "milk", "--choose", "--json"],
      expect: (result) => {
        expectJsonError(result, "user_error", "Interactive product selection requires input.", "interactive_input_required");
      }
    },
    {
      name: "installed invalid phone prefill",
      args: ["--data-dir", dataDir, "login", "--phone", "phone 9876543210", "--json"],
      expect: (result) => {
        const payload = expectJsonError(
          result,
          "user_error",
          "Phone number must be a valid 10-digit Indian mobile number.",
          "invalid_input"
        );
        assert(String(payload.error?.hint).includes("<redacted-phone>"), "expected installed redacted phone hint");
        assert(!result.stderr.includes("9876543210"), "expected installed JSON phone error to omit raw phone-shaped value");
      }
    },
    {
      name: "installed human invalid phone prefill redaction",
      args: ["--data-dir", dataDir, "login", "--phone", "phone 9876543210"],
      expect: (result) => {
        assert(result.status === 1, "expected exit code 1");
        assert(result.stdout === "", "expected empty stdout");
        assert(
          result.stderr.includes("Phone number must be a valid 10-digit Indian mobile number."),
          "expected installed human phone message"
        );
        assert(result.stderr.includes("<redacted-phone>"), "expected installed human redacted phone hint");
        assert(
          !result.stderr.includes("9876543210"),
          "expected installed human phone error to omit raw phone-shaped value"
        );
      }
    },
    {
      name: "installed invalid search limit json",
      args: ["--data-dir", dataDir, "search", "milk", "--limit", "0", "--json"],
      expect: (result) => {
        expectJsonError(result, "user_error", "Search limit must be an integer from 1 to 50.", "invalid_input");
      }
    },
    {
      name: "installed invalid search limit format json",
      args: ["--data-dir", dataDir, "search", "milk", "--limit", "1e1", "--json"],
      expect: (result) => {
        expectJsonError(result, "user_error", "Search limit must be an integer from 1 to 50.", "invalid_input");
      }
    },
    {
      name: "installed access cooldown before browser",
      args: () => {
        const cooldownDataDir = join(tempRoot, "data-access-cooldown");
        setRuntimeMeta(runtimeModules, cooldownDataDir, "LAST_ACCESS_CHALLENGE_META_KEY", String(Date.now()));
        return ["--data-dir", cooldownDataDir, "search", "milk", "--json"];
      },
      expect: (result) => {
        expectJsonErrorWithRetry(
          result,
          "user_error",
          "Recent Zepto verification or block was detected; pausing headless browser automation.",
          "zepto_access_cooldown"
        );
      }
    },
    {
      name: "installed headless throttle before browser",
      args: () => {
        const throttleDataDir = join(tempRoot, "data-headless-throttle");
        setRuntimeMeta(
          runtimeModules,
          throttleDataDir,
          "HEADLESS_BROWSER_RUN_HISTORY_META_KEY",
          JSON.stringify(Array.from({ length: 8 }, (_, index) => Date.now() - index))
        );
        return ["--data-dir", throttleDataDir, "search", "milk", "--json"];
      },
      expect: (result) => {
        expectJsonErrorWithRetry(
          result,
          "user_error",
          "Headless browser automation is cooling down after many recent Zepto commands.",
          "headless_browser_throttle"
        );
      }
    },
    {
      name: "installed invalid add quantity cap",
      args: ["--data-dir", dataDir, "add", "milk", "--quantity", "13", "--json"],
      expect: (result) => {
        expectJsonError(result, "user_error", "Quantity must be an integer from 1 to 12.", "invalid_input");
      }
    },
    {
      name: "installed invalid add quantity format",
      args: ["--data-dir", dataDir, "add", "milk", "--quantity", "0x2", "--json"],
      expect: (result) => {
        expectJsonError(result, "user_error", "Quantity must be an integer from 1 to 12.", "invalid_input");
      }
    }
  ];

  for (const check of checks) {
    const args = typeof check.args === "function" ? check.args() : check.args;
    let result;
    try {
      result = runInstalledCli(installedCliPath, args);
    } catch (error) {
      throw new Error(`Installed CLI smoke check failed (${check.name}): ${error.message}`, { cause: error });
    }
    check.expect(result);
    console.log(`pass ${check.name}`);
  }
}

function resolveInstalledBin(prefixDir, commandName) {
  const binName = process.platform === "win32" ? `${commandName}.cmd` : commandName;
  return join(prefixDir, "node_modules", ".bin", binName);
}

function runInstalledCli(installedCliPath, args) {
  const commandArgs = [installedCliPath, ...args];
  const result = spawnSync(process.execPath, commandArgs, {
    cwd: rootDir,
    encoding: "utf8",
    killSignal: "SIGTERM",
    timeout: INSTALLED_CLI_COMMAND_TIMEOUT_MS,
    env: sanitizedChildEnv(process.env, {
      FORCE_COLOR: "0",
      NO_COLOR: "1"
    })
  });

  if (result.error) {
    throwSpawnError(result.error, process.execPath, commandArgs, INSTALLED_CLI_COMMAND_TIMEOUT_MS);
  }

  return normalizeResult(result);
}

function runNpm(args, options) {
  assert(npmExecPath, "expected npm_execpath to run npm package verification");
  return run(process.execPath, [npmExecPath, ...args], options);
}

function packagePackArgs() {
  const args = ["pack", "--pack-destination", packDir, "--silent"];
  if (!isSourceTreePackage(rootDir)) {
    args.push("--ignore-scripts");
  }
  return args;
}

function isSourceTreePackage(packageDir) {
  return existsSync(join(packageDir, "src", "index.ts")) && existsSync(join(packageDir, "tsconfig.json"));
}

function installedVerifyLiveArgs(packageDir, ...args) {
  return ["--silent", "run", "--prefix", packageDir, "verify:live", "--", ...args];
}

function runNpmResult(args, options) {
  assert(npmExecPath, "expected npm_execpath to run npm package verification");
  const timeoutMs = options?.timeout ?? NPM_COMMAND_TIMEOUT_MS;
  const result = spawnSync(process.execPath, [npmExecPath, ...args], {
    ...options,
    encoding: "utf8",
    killSignal: options?.killSignal ?? "SIGTERM",
    timeout: timeoutMs
  });

  if (result.error) {
    throwSpawnError(result.error, process.execPath, [npmExecPath, ...args], timeoutMs);
  }

  return normalizeResult(result);
}

function run(command, args, options) {
  const timeoutMs = options?.timeout ?? NPM_COMMAND_TIMEOUT_MS;
  const result = spawnSync(command, args, {
    ...options,
    encoding: "utf8",
    killSignal: options?.killSignal ?? "SIGTERM",
    timeout: timeoutMs
  });

  if (result.error) {
    throwSpawnError(result.error, command, args, timeoutMs);
  }

  if (result.status !== 0) {
    const stdout = result.stdout?.trim();
    const stderr = result.stderr?.trim();
    throw new Error(
      [
        `Command failed: ${command} ${args.join(" ")}`,
        `Exit code: ${result.status}`,
        stdout ? `stdout:\n${stdout}` : undefined,
        stderr ? `stderr:\n${stderr}` : undefined
      ]
        .filter(Boolean)
        .join("\n")
    );
  }

  return normalizeResult(result);
}

function throwSpawnError(error, command, args, timeoutMs) {
  if (error && error.code === "ETIMEDOUT") {
    throw new Error(`Command timed out after ${timeoutMs} ms: ${command} ${args.join(" ")}`);
  }

  throw error;
}

function spawnInstalledBin(command, args, options) {
  if (process.platform !== "win32") {
    return spawnSync(command, args, options);
  }

  return spawnSync(process.env.ComSpec ?? "cmd.exe", ["/d", "/c", `call ${formatCmd(command, args)}`], {
    ...options,
    windowsVerbatimArguments: true
  });
}

function formatCmd(command, args) {
  return [quoteCmdArg(command), ...args.map(formatCmdArg)].join(" ");
}

function formatCmdArg(value) {
  const arg = String(value);
  return /[\s"&|<>^]/.test(arg) ? quoteCmdArg(arg) : arg;
}

function quoteCmdArg(value) {
  return `"${String(value).replace(/(["^&|<>])/g, "^$1")}"`;
}

function expectJsonError(result, type, message, code) {
  assert(result.status === 1, "expected exit code 1");
  assert(result.stdout === "", "expected empty stdout");
  const payload = parseJson(result.stderr, "stderr");
  assert(payload.ok === false, "expected ok false");
  assert(payload.error?.type === type, `expected error type ${type}`);
  if (code !== undefined) {
    assert(payload.error?.code === code, `expected error code ${code}`);
  }
  assert(payload.error?.message === message, `expected error message ${message}`);
  assert(payload.error?.exitCode === 1, "expected error exitCode 1");
  return payload;
}

function expectJsonErrorWithRetry(result, type, message, code) {
  const payload = expectJsonError(result, type, message, code);
  assert(
    Number.isFinite(payload.error?.retryAfterMs) && payload.error.retryAfterMs > 0,
    "expected positive error retryAfterMs"
  );
}

function setRuntimeMeta(runtimeModules, targetDataDir, keyExportName, value) {
  const browserModuleUrl = pathToFileURL(join(runtimeModules.packageDir, "dist", "automation", "browser.js")).href;
  const pathsModuleUrl = pathToFileURL(join(runtimeModules.packageDir, "dist", "config", "paths.js")).href;
  const sqliteModuleUrl = pathToFileURL(join(runtimeModules.packageDir, "dist", "storage", "sqlite.js")).href;
  const script = `
    import { ${keyExportName} as metaKey } from ${JSON.stringify(browserModuleUrl)};
    import { resolveAppPaths } from ${JSON.stringify(pathsModuleUrl)};
    import { SqliteStore } from ${JSON.stringify(sqliteModuleUrl)};

    const sqlite = new SqliteStore(resolveAppPaths(${JSON.stringify(targetDataDir)}).dbPath);
    try {
      sqlite.setMeta(metaKey, ${JSON.stringify(value)});
    } finally {
      sqlite.close();
    }
  `;

  run(process.execPath, ["--input-type=module", "--eval", script], {
    cwd: rootDir,
    timeout: INSTALLED_HELPER_COMMAND_TIMEOUT_MS,
    env: sanitizedChildEnv(process.env, {
      FORCE_COLOR: "0",
      NO_COLOR: "1"
    })
  });
}

function assertFreshCache(cache) {
  assert(cache?.searches === 0, "expected empty search cache");
  assert(cache?.cartSnapshots === 0, "expected empty cart snapshot cache");
  assert(cache?.addresses === 0, "expected empty address cache");
  assert(cache?.orders === 0, "expected empty order cache");
}

function assertInstalledNoBrowserWork(installedCliPath, expectedDataDir) {
  const statusResult = runInstalledCli(installedCliPath, ["--data-dir", expectedDataDir, "status", "--json"]);
  assert(statusResult.status === 0, "expected installed status check after guarded command to pass");
  const payload = JSON.parse(statusResult.stdout);
  assert(payload.browserLock?.present === false, "expected installed guarded command not to create a browser lock");
  assert(payload.hasBrowserProfileData === false, "expected installed guarded command not to write browser profile data");
  assert(
    payload.headlessBrowserThrottle?.recentRuns === 0,
    "expected installed guarded command not to launch headless browser"
  );
}

function assertFreshStatus(payload, expectedDataDir) {
  assertFreshCache(payload.cache);
  assert(payload.version === packageJson.version, "expected installed status version to match package.json");
  assert(payload.dataDir === expectedDataDir, "expected status to use disposable data dir");
  assert(payload.confirmedSession === false, "expected fresh data dir to be logged out");
  assert(payload.browserLock?.path === join(expectedDataDir, "browser.lock"), "expected browser lock path");
  assert(payload.browserLock?.present === false, "expected no browser lock");
  assert(payload.browserLock?.stale === false, "expected browser lock not stale");
  assertBrowserAutomationMode(payload.browserAutomationMode);
  assert(payload.browserAutomation?.ready === true, "expected browser automation ready");
  assert(Array.isArray(payload.browserAutomation?.reasons), "expected browser automation reasons array");
  assert(payload.browserAutomation.reasons.length === 0, "expected no browser automation stop reasons");
  assert(payload.browserAutomation?.retryAfterMs === 0, "expected zero browser automation retry delay");
  assertBrowserAutomationReadinessModes(payload.browserAutomation, "status");
  assert(payload.headlessBrowserThrottle?.windowMs === 600_000, "expected headless throttle window");
  assert(payload.headlessBrowserThrottle?.limit === 8, "expected headless throttle limit");
  assert(payload.headlessBrowserThrottle?.recentRuns === 0, "expected no recent headless browser runs");
  assert(payload.headlessBrowserThrottle?.throttleActive === false, "expected no headless browser throttle");
  assert(payload.headlessBrowserThrottle?.retryAfterMs === 0, "expected zero headless throttle retry delay");
  assert(payload.accessChallenge?.detected === false, "expected no recorded Zepto access challenge");
  assert(payload.accessChallenge?.cooldownActive === false, "expected no Zepto access challenge cooldown");
  assert(payload.accessChallenge?.retryAfterMs === 0, "expected zero Zepto access challenge retry delay");
}

function assertDoctorReport(payload, expectedDataDir, options = { browser: false }) {
  assert(payload.ok === true, "expected doctor ok true");
  assert(payload.version === packageJson.version, "expected installed doctor version to match package.json");
  assert(payload.dataDir === expectedDataDir, "expected doctor data dir");
  assert(payload.browserLock?.path === join(expectedDataDir, "browser.lock"), "expected doctor browser lock path");
  assert(payload.browserLock?.present === false, "expected doctor no browser lock");
  assert(payload.browserLock?.stale === false, "expected doctor browser lock not stale");
  assertBrowserAutomationMode(payload.browserAutomationMode);
  assert(payload.browserAutomation?.ready === true, "expected doctor browser automation ready");
  assert(Array.isArray(payload.browserAutomation?.reasons), "expected doctor browser automation reasons array");
  assert(payload.browserAutomation.reasons.length === 0, "expected doctor no browser automation stop reasons");
  assert(payload.browserAutomation?.retryAfterMs === 0, "expected doctor zero browser automation retry delay");
  assertBrowserAutomationReadinessModes(payload.browserAutomation, "doctor");
  assert(payload.headlessBrowserThrottle?.windowMs === 600_000, "expected doctor headless throttle window");
  assert(payload.headlessBrowserThrottle?.limit === 8, "expected doctor headless throttle limit");
  assert(payload.headlessBrowserThrottle?.recentRuns === 0, "expected doctor no recent headless runs");
  assert(payload.headlessBrowserThrottle?.throttleActive === false, "expected doctor no headless throttle");
  assert(payload.headlessBrowserThrottle?.retryAfterMs === 0, "expected doctor zero headless retry delay");
  assert(payload.accessChallenge?.detected === false, "expected doctor no recorded access challenge");
  assert(payload.accessChallenge?.cooldownActive === false, "expected doctor no access challenge cooldown");
  assert(payload.accessChallenge?.retryAfterMs === 0, "expected doctor zero access challenge retry delay");
  const checkNames = payload.checks?.map((check) => check.name) ?? [];
  assert(checkNames.includes("Node.js"), "expected Node.js doctor check");
  assert(checkNames.includes("Data directory"), "expected data directory doctor check");
  assert(checkNames.includes("SQLite"), "expected SQLite doctor check");
  assert(checkNames.includes("Zepto session"), "expected Zepto session doctor check");
  assert(checkNames.includes("Browser automation lock"), "expected browser automation lock doctor check");
  assert(checkNames.includes("Headless browser throttle"), "expected headless browser throttle doctor check");
  assert(checkNames.includes("Zepto access challenge"), "expected Zepto access challenge doctor check");
  if (options.browser) {
    assert(checkNames.includes("Playwright Chromium"), "expected Playwright Chromium doctor check");
    const chromiumCheck = payload.checks.find((check) => check.name === "Playwright Chromium");
    assert(chromiumCheck?.status === "pass", "expected Playwright Chromium doctor check to pass");
    assert(chromiumCheck?.message === "Chromium launches successfully.", "expected Playwright Chromium pass message");
  } else {
    assert(!checkNames.includes("Playwright Chromium"), "expected browser check to be skipped");
  }
}

function assertBrowserAutomationMode(mode) {
  assert(mode?.default === "background_headless", "expected installed default browser automation mode to be headless");
  assert(mode?.current === "background_headless", "expected installed current browser automation mode to be headless");
  assert(mode?.visibleRequested === false, "expected installed visible browser mode not to be requested");
}

function assertBrowserAutomationReadinessModes(readiness, label) {
  for (const mode of ["backgroundHeadless", "visibleHumanControlled"]) {
    const modeReadiness = readiness?.modes?.[mode];
    assert(modeReadiness?.ready === true, `expected installed ${label} ${mode} readiness`);
    assert(Array.isArray(modeReadiness?.reasons), `expected installed ${label} ${mode} readiness reasons`);
    assert(modeReadiness.reasons.length === 0, `expected installed ${label} ${mode} readiness reasons to be empty`);
    assert(modeReadiness.retryAfterMs === 0, `expected installed ${label} ${mode} zero retry delay`);
  }
}

function assertCheckoutHandoffContract(payload) {
  assert(payload.status === "checkout_handoff_returned", "expected installed checkout handoff status");
  assertCommonCheckoutOutputContract(payload);
  assert(String(payload.next).includes("Complete payment in Zepto"), "expected installed checkout next-step guidance");
}

function assertCheckoutManualActionContract(payload) {
  assert(payload.status === "checkout_manual_action_required", "expected installed checkout manual action status");
  assertCommonCheckoutOutputContract(payload);
  assert(
    String(payload.next).includes("A human must continue in the visible Zepto browser"),
    "expected installed checkout manual-action next-step guidance"
  );
  assert(
    !/^Click\b/i.test(String(payload.next)),
    "expected installed checkout manual-action guidance not to start with an agent-clickable instruction"
  );
}

function assertCommonCheckoutOutputContract(payload) {
  assert(payload.payment === "handled_by_zepto", "expected installed Zepto-handled payment marker");
  assert(payload.humanActionRequired === true, "expected installed checkout human action marker");
  assert(
    payload.automationBoundary === "zepocli_did_not_click_payment_or_order_controls",
    "expected installed checkout automation boundary marker"
  );
  assert(payload.handoffUrl === "https://www.zepto.com/?cart=open", "expected installed checkout handoff URL marker");
  assert(payload.handoffSurface === "visible_zepto_browser", "expected installed checkout handoff surface marker");
  assert(payload.cartPrecondition === "non_empty_cart_verified", "expected installed non-empty cart precondition marker");
  assert(payload.paymentStatus === "not_observed_by_zepocli", "expected installed unobserved payment status");
  assert(payload.orderPlacement === "not_confirmed_by_zepocli", "expected installed unconfirmed order placement");
  assert(payload.orderStatusCommand === "zepo track", "expected installed track next command");
}

function installedLiveStatusDiagnosticsPayload() {
  return {
    version: packageJson.version,
    browserAutomationMode: {
      default: "background_headless",
      current: "background_headless",
      visibleRequested: false
    },
    browserAutomation: { ready: true, reasons: [], retryAfterMs: 0 },
    browserLock: { present: false, stale: false },
    headlessBrowserThrottle: {
      windowMs: 600_000,
      limit: 8,
      recentRuns: 0,
      throttleActive: false,
      retryAfterMs: 0
    },
    accessChallenge: { detected: false, cooldownActive: false, retryAfterMs: 0 },
    cache: { searches: 0, cartSnapshots: 0, addresses: 0, orders: 0 }
  };
}

function parseJson(text, streamName) {
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`Could not parse ${streamName} as JSON: ${text}`);
  }
}

function normalizeResult(result) {
  return {
    status: result.status ?? 1,
    stdout: result.stdout.trim(),
    stderr: result.stderr.trim()
  };
}

function removeTree(path) {
  rmSync(path, {
    recursive: true,
    force: true,
    maxRetries: 10,
    retryDelay: 100
  });
}

function countSourceOccurrences(source, needle) {
  return source.split(needle).length - 1;
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function assertDeepEqual(actual, expected, message) {
  assert(JSON.stringify(actual) === JSON.stringify(expected), message);
}
