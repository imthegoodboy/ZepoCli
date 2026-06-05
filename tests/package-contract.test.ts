import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { basename, extname, join, relative, resolve } from "node:path";

import { describe, expect, it } from "vitest";

import packageJson from "../package.json" with { type: "json" };

const rootDir = resolve(import.meta.dirname, "..");
const PACKAGE_CONTRACT_SLOW_TEST_TIMEOUT_MS = 15_000;
const skippedSecretScanDirectories = new Set([".git", "coverage", "dist", "node_modules"]);
const scannedTextFileExtensions = new Set([
  ".cjs",
  ".cts",
  ".js",
  ".json",
  ".jsx",
  ".md",
  ".mjs",
  ".mts",
  ".ps1",
  ".sh",
  ".ts",
  ".tsx",
  ".txt",
  ".yml",
  ".yaml"
]);
const scannedTextFileNames = new Set([".gitattributes", ".gitignore", "LICENSE"]);

function collectTsFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = join(directory, entry.name);

    if (entry.isDirectory()) {
      return collectTsFiles(fullPath);
    }

    return entry.isFile() && fullPath.endsWith(".ts") ? [fullPath] : [];
  });
}

function collectProjectTextFiles(directory: string): string[] {
  const gitFiles = execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard", "-z"], {
    cwd: directory,
    encoding: "utf8"
  });

  return gitFiles
    .split("\0")
    .filter(Boolean)
    .filter((filePath) => !filePath.split(/[\\/]/).some((segment) => skippedSecretScanDirectories.has(segment)))
    .filter((filePath) => isSecretScannedProjectTextFile(filePath))
    .map((filePath) => resolve(directory, filePath));
}

function isSecretScannedProjectTextFile(filePath: string): boolean {
  const name = basename(filePath);

  return (
    name === ".env" ||
    name.startsWith(".env.") ||
    name === ".npmrc" ||
    name.startsWith(".npmrc.") ||
    scannedTextFileNames.has(name) ||
    scannedTextFileExtensions.has(extname(name))
  );
}

function collectSourceErrorCodes(): string[] {
  const codes = new Set<string>();

  for (const filePath of collectTsFiles(resolve(rootDir, "src"))) {
    const source = readFileSync(filePath, "utf8");

    for (const match of source.matchAll(/code:\s*["']([a-z0-9_]+)["']/g)) {
      codes.add(match[1]);
    }
  }

  return [...codes].sort();
}

function collectSafeLiveReportErrorCodes(): string[] {
  const source = readFileSync(resolve(rootDir, "scripts", "live-report-utils.mjs"), "utf8");
  const match = source.match(/const SAFE_REPORT_ERROR_CODES = new Set\(\[([\s\S]*?)\]\);/);

  if (!match) {
    throw new Error("Could not find SAFE_REPORT_ERROR_CODES in live-report-utils.mjs.");
  }

  return [...match[1].matchAll(/["']([a-z0-9_]+)["']/g)].map((codeMatch) => codeMatch[1]).sort();
}

describe("package CLI contract", () => {
  it("publishes zepo as the compiled executable entry", () => {
    expect(packageJson.bin).toEqual({
      zepo: "dist/index.js"
    });
  });

  it("declares the supported Node runtime floor", () => {
    expect(packageJson.engines).toEqual({
      node: ">=20.19"
    });
  });

  it("keeps repository text files normalized for cross-platform agents", () => {
    const attributes = readFileSync(resolve(rootDir, ".gitattributes"), "utf8");

    expect(attributes).toContain("* text=auto eol=lf");
    expect(attributes).toContain("*.tgz binary");
  });

  it("keeps local npm token files ignored and npm tokens out of tracked text", () => {
    const gitignore = readFileSync(resolve(rootDir, ".gitignore"), "utf8");

    expect(gitignore).toContain(".npmrc");
    expect(gitignore).toContain(".npmrc.*");
    expect(gitignore).toContain("!.npmrc.example");
    expect(gitignore).toContain(".env.*");
    expect(gitignore).toContain("!.env.example");
    expect(gitignore).toContain(".zepo/");
    expect(gitignore).toContain(".zepo-*/");
    expect(gitignore).toContain(".zepto/");
    expect(gitignore).toContain(".zepto-*/");
    expect(readFileSync(resolve(rootDir, ".npmrc.example"), "utf8")).toContain("${NPM_TOKEN}");
    expect(readFileSync(resolve(rootDir, ".env.example"), "utf8")).toContain("NPM_TOKEN=");

    const leakedTokens = collectProjectTextFiles(rootDir).flatMap((filePath) => {
      const text = readFileSync(filePath, "utf8");
      const matches = text.match(/npm_[A-Za-z0-9]{20,}/g) ?? [];

      return matches.map((match) => `${relative(rootDir, filePath)}:${match}`);
    });

    expect(leakedTokens).toEqual([]);
  }, PACKAGE_CONTRACT_SLOW_TEST_TIMEOUT_MS);

  it("keeps the source entry declared as a Node executable", () => {
    const sourceEntry = readFileSync(resolve(rootDir, "src", "index.ts"), "utf8");
    const firstLine = sourceEntry.split("\n", 1)[0]?.replace(/\r$/, "");

    expect(firstLine).toBe("#!/usr/bin/env node");
  });

  it("keeps npm check aligned with the required release gates", () => {
    expect(packageJson.scripts?.build).toContain("node scripts/clean-dist.mjs");
    expect(packageJson.scripts?.build).toContain("tsc -p tsconfig.json");
    expect(packageJson.scripts?.build).toContain("node scripts/normalize-cli-entry.mjs");
    expect(packageJson.scripts?.["verify:secrets"]).toBe("node scripts/verify-secrets.mjs");
    expect(packageJson.scripts?.["verify:dependencies"]).toBe("node scripts/verify-dependencies.mjs");

    const checkScript = packageJson.scripts?.check ?? "";

    for (const gate of [
      "npm run verify:secrets",
      "npm run verify:dependencies",
      "npm run build",
      "npm test",
      "npm run verify:cli",
      "npm run verify:package",
      "node dist/index.js --help",
      "npm run verify:audit",
      "npm pack --dry-run",
      "npm run verify:publish-dry-run"
    ]) {
      expect(checkScript).toContain(gate);
    }

    expect(checkScript).not.toContain("verify:live");
  });

  it("exposes audit verification and keeps live verification opt-in", () => {
    expect(packageJson.scripts?.["verify:audit"]).toBe("npm audit --omit=dev");
    expect(packageJson.scripts?.["verify:publish-dry-run"]).toBe("npm publish --dry-run --access public");
    expect(packageJson.scripts?.["verify:live"]).toBe("node scripts/verify-live-flow.mjs");
    expect(packageJson.scripts?.["verify:live:report"]).toBe("node scripts/verify-live-report.mjs");
    expect(packageJson.files).toContain("README.md");
    expect(packageJson.files).toContain("LICENSE");
    expect(packageJson.files).toContain("scripts/clean-dist.mjs");
    expect(packageJson.files).toContain("scripts/normalize-cli-entry.mjs");
    expect(packageJson.files).toContain("scripts/verify-dependencies.mjs");
    expect(packageJson.files).toContain("scripts/verify-cli.mjs");
    expect(packageJson.files).toContain("scripts/verify-package.mjs");
    expect(packageJson.files).toContain("scripts/env-utils.mjs");
    expect(packageJson.files).toContain("scripts/live-report-utils.mjs");
    expect(packageJson.files).toContain("scripts/verify-live-flow.mjs");
    expect(packageJson.files).toContain("scripts/verify-live-report.mjs");
    expect(packageJson.files).toContain("scripts/verify-secrets.mjs");
    expect(packageJson.files).toContain(".env.example");
    expect(packageJson.files).toContain(".npmrc.example");
  });

  it("keeps secret verification redacted and scoped to project text", () => {
    const verifier = readFileSync(resolve(rootDir, "scripts", "verify-secrets.mjs"), "utf8");

    expect(verifier).toContain("const skippedDirectories = new Set");
    expect(verifier).toContain('"node_modules"');
    expect(verifier).toContain('"dist"');
    expect(verifier).toContain("git");
    expect(verifier).toContain("ls-files");
    expect(verifier).toContain("--exclude-standard");
    expect(verifier).toContain('name === ".zepo"');
    expect(verifier).toContain('name.startsWith(".zepo-")');
    expect(verifier).toContain('name === ".zepto"');
    expect(verifier).toContain('name.startsWith(".zepto-")');
    expect(verifier).toContain("isLocalSecretConfigName");
    expect(verifier).toContain("npmTokenPattern");
    expect(verifier).toContain('".js"');
    expect(verifier).toContain('".cjs"');
    expect(verifier).toContain('".mts"');
    expect(verifier).toContain(".npmrc.example");
    expect(verifier).toContain(".env.example");
    expect(verifier).toContain("<redacted-npm-token>");
    expect(verifier).not.toContain("console.error(line)");
  });

  it("keeps dependency verification focused on install readiness", () => {
    const verifier = readFileSync(resolve(rootDir, "scripts", "verify-dependencies.mjs"), "utf8");

    expect(verifier).toContain("ZEPOCLI_VERIFY_DEPENDENCIES_ROOT");
    expect(verifier).toContain("Missing ${section.name} package");
    expect(verifier).toContain("Missing devDependency binary");
    expect(verifier).toContain("npm ci --include=prod --include=dev");
    expect(verifier).toContain("If your npm config omits dev dependencies");
    expect(verifier).not.toContain("NPM_TOKEN");
  });

  it("redacts npm-shaped tokens when secret verification fails", () => {
    const fixturePath = resolve(rootDir, "secret-scan-fixture.js");
    const fakeToken = `npm_${"A".repeat(24)}`;

    writeFileSync(fixturePath, `export const fixture = "${fakeToken}";\n`);

    try {
      const result = spawnSync(process.execPath, ["scripts/verify-secrets.mjs"], {
        cwd: rootDir,
        encoding: "utf8"
      });

      expect(result.status).toBe(1);
      expect(result.stdout).toBe("");
      expect(result.stderr).toContain("Secret verification failed.");
      expect(result.stderr).toContain("<redacted-npm-token>");
      expect(result.stderr).not.toContain(fakeToken);
    } finally {
      rmSync(fixturePath, { force: true });
    }
  }, PACKAGE_CONTRACT_SLOW_TEST_TIMEOUT_MS);

  it("keeps service-spelled local data directories out of secret scanning", () => {
    const fixtureDir = resolve(rootDir, ".zepto-secret-scan-fixture");
    const fixturePath = resolve(fixtureDir, "session.js");
    const fakeToken = `npm_${"B".repeat(24)}`;

    mkdirSync(fixtureDir, { recursive: true });
    writeFileSync(fixturePath, `export const fixture = "${fakeToken}";\n`);

    try {
      const result = spawnSync(process.execPath, ["scripts/verify-secrets.mjs"], {
        cwd: rootDir,
        encoding: "utf8"
      });

      expect(result.status).toBe(0);
      expect(result.stdout).toContain("pass secret verification");
      expect(result.stderr).toBe("");
      expect(`${result.stdout}\n${result.stderr}`).not.toContain(fakeToken);
    } finally {
      rmSync(fixtureDir, { recursive: true, force: true });
    }
  }, PACKAGE_CONTRACT_SLOW_TEST_TIMEOUT_MS);

  it("keeps installed package verification checking shipped README guidance", () => {
    const verifier = readFileSync(resolve(rootDir, "scripts", "verify-package.mjs"), "utf8");

    expect(verifier).toContain("verifyInstalledReadmeContract");
    expect(verifier).toContain("verifyInstalledEnvSanitizerContract");
    expect(verifier).toContain("expected installed env sanitizer to remove Yarn npm auth tokens");
    expect(verifier).toContain("expected installed env sanitizer to remove Corepack npm tokens");
    expect(verifier).toContain("pass installed env sanitizer contract");
    expect(verifier).toContain("verifyInstalledBrowserDiagnosticsContract");
    expect(verifier).toContain("expected installed browser failure capture to default off even with debug");
    expect(verifier).toContain("pass installed browser diagnostics contract");
    expect(verifier).toContain("verifyInstalledBackgroundAutomationModeContract");
    expect(verifier).toContain("expected installed CLI runtime options to keep --visible as the only global visible-browser switch");
    expect(verifier).toContain("expected installed runtime to default browser automation to headless");
    expect(verifier).toContain("expected installed browser automation to pass the runtime headless mode into Chromium launch options");
    expect(verifier).toContain("expected installed browser context options to include the headless flag");
    expect(verifier).toContain("expected installed search service not to force visible browser mode");
    expect(verifier).toContain("expected installed cart service not to force visible browser mode");
    expect(verifier).toContain("expected installed add command to pass explicit item-limit removal into cart service");
    expect(verifier).toContain("expected installed cart service to pass explicit add item-limit removal into cart recovery");
    expect(verifier).toContain("expected installed orders service not to force visible browser mode");
    expect(verifier).toContain("expected installed checkout service to be the visible human-controlled payment handoff");
    expect(verifier).toContain("expected installed login service to require explicit --visible before opening a browser");
    expect(verifier).toContain("expected installed address add service to require session and explicit --visible before opening a browser");
    expect(verifier).toContain("expected installed address add service to require explicit --visible before checking session state");
    expect(verifier).toContain("expected installed checkout service to require session and explicit --visible before opening a browser");
    expect(verifier).toContain("expected installed checkout service to require explicit --visible before checking session state");
    expect(verifier).toContain("pass installed background automation mode contract");
    expect(verifier).toContain("assertInstalledNoBrowserWork");
    expect(verifier).toContain("expected installed guarded command not to create a browser lock");
    expect(verifier).toContain("expected installed guarded command not to write browser profile data");
    expect(verifier).toContain("expected installed guarded command not to launch headless browser");
    expect(verifier).toContain("expected installed package README");
    expect(verifier).toContain("npm run verify:dependencies");
    expect(verifier).toContain("declared runtime packages load and required dev-tool binaries are present");
    expect(verifier).toContain("JSON checkout returns handoff evidence immediately for agents instead of waiting for a prompt");
    expect(verifier).toContain("explicit JSON wait mode (`zepo --visible checkout --json --wait`)");
    expect(verifier).toContain("Wait mode re-checks the visible page after the human presses Enter");
    expect(verifier).toContain("Installed-package commands run browser automation in background/headless mode by default");
    expect(verifier).toContain("Human-only login, address-add, and checkout handoffs fail with `visible_browser_required`");
    expect(verifier).toContain("before session checks and before browser launch");
    expect(verifier).toContain("Normal search/cart/address/order commands stay background/headless unless the user explicitly passes `--visible`");
    expect(verifier).toContain("zepo completion bash");
    expect(verifier).toContain("zepo help search");
    expect(verifier).toContain("zepo help address");
    expect(verifier).toContain("Generate shell completion scripts without starting runtime storage or browser automation");
    expect(verifier).toContain("Completion is generated from the registered command tree");
    expect(verifier).toContain("nested topics such as `zepo help address`");
    expect(verifier).toContain("PowerShell completion also accepts `pwsh` and `ps1` as aliases for `powershell`");
    expect(verifier).toContain("browserAutomationMode.current");
    expect(verifier).toContain("assertBrowserAutomationReadinessModes");
    expect(verifier).toContain("browserAutomation.modes.backgroundHeadless");
    expect(verifier).toContain("browserAutomation.modes.visibleHumanControlled");
    expect(verifier).toContain("normal package runs should report `background_headless`");
    expect(verifier).toContain("expected installed current browser automation mode to be headless");
    expect(verifier).toContain("expected installed visible browser mode not to be requested");
    expect(verifier).toContain("expected installed visible option to document headless default");
    expect(verifier).toContain("expected installed completion command in help output");
    expect(verifier).toContain("installed completion bash");
    expect(verifier).toContain("expected installed bash completion registration");
    expect(verifier).toContain("installed completion runtime-free data-dir");
    expect(verifier).toContain("expected installed completion command not to create runtime data dir");
    expect(verifier).toContain("expected installed help command completions");
    expect(verifier).toContain("expected installed nested help command completions");
    expect(verifier).toContain("installed completion zsh");
    expect(verifier).toContain("expected installed zsh completion header");
    expect(verifier).toContain("installed completion fish");
    expect(verifier).toContain("expected installed fish nested help condition");
    expect(verifier).toContain("installed completion powershell");
    expect(verifier).toContain("expected installed PowerShell completer registration");
    expect(verifier).toContain("installed completion pwsh alias");
    expect(verifier).toContain("installed completion ps1 alias");
    expect(verifier).toContain("installed completion invalid shell json");
    expect(verifier).toContain("expected installed completion shell hint");
    expect(verifier).toContain("Safe-click checks inspect visible text");
    expect(verifier).toContain("CSRF/XSRF or anti-forgery tokens, and bare login/logged UI flags are not enough to confirm local auth");
    expect(verifier).toContain("non-empty auth/session/token-like Zepto cookies or non-empty auth/session/token-like Zepto localStorage keys");
    expect(verifier).toContain("Human spinner/status text, human error text, JSON error text, and JSON error object keys are redacted for sensitive-looking order-id, phone, OTP/PIN/CVV, payment-number, payment-handle");
    expect(verifier).toContain("auth/session/token/password/secret URL parameters, and local-path values");
    expect(verifier).toContain("npm-token-shaped values");
    expect(verifier).toContain("including URL/query-string encoded forms and standalone percent-encoded fragments of those values");
    expect(verifier).toContain("Persistent log object keys/values, Error messages/stacks, and message strings are redacted with the same sensitive-looking order-id, phone, OTP/PIN/CVV, payment-number, payment-handle");
    expect(verifier).toContain("auth/session/token/password/secret URL-parameter, and local-path rules");
    expect(verifier).toContain("`checkout and pay`, or amount-bearing pay text");
    expect(verifier).toContain("unrelated cart/checkout/order/bill/payment text");
    expect(verifier).toContain(
      "Address automation also rejects support, invoice/receipt, refund/return/cancel-order, and rating/review order-action labels"
    );
    expect(verifier).toContain("explicit select/change/set/choose delivery address or location labels");
    expect(verifier).toContain("explicit add/enter delivery address or location labels");
    expect(verifier).toContain("expected installed promotional checkout label to be rejected");
    expect(verifier).toContain("expected installed amount-bearing click-to-pay label not to be automated checkout");
    expect(verifier).toContain("expected installed amount-bearing click-to-pay label to require manual action");
    expect(verifier).toContain("expected installed checkout manual action status");
    expect(verifier).toContain("expected installed checkout manual-action next-step guidance");
    expect(verifier).toContain("expected checkout wait option");
    expect(verifier).toContain("installed no-input checkout wait");
    expect(verifier).toContain("detectCheckoutHandoffMode");
    expect(verifier).toContain("expected installed checkout handoff mode detector to detect payment handoff pages");
    expect(verifier).toContain("expected installed checkout handoff mode detector to detect manual payment controls");
    expect(verifier).toContain("expected installed continue-to-pay label to be unsafe");
    expect(verifier).toContain("expected installed continue-to-payment label to be unsafe");
    expect(verifier).toContain("expected installed card payment-method label to be unsafe");
    expect(verifier).toContain("expected installed deferred payment-method label to be unsafe");
    expect(verifier).toContain("expected installed wallet payment-method label to be unsafe");
    expect(verifier).toContain("verifyInstalledPaymentLabelContract");
    expect(verifier).toContain("expected installed payment handoff surface label to match");
    expect(verifier).toContain("expected installed bare payment brands not to prove handoff surface");
    expect(verifier).toContain("expected installed generic payment heading not to match selection prompt");
    expect(verifier).toContain("pass installed payment label contract");
    expect(verifier).toContain("verifyInstalledFinalActionLabelContract");
    expect(verifier).toContain("expected installed final payment/order label to be unsafe: ${label}");
    expect(verifier).toContain("expected installed proceed-to-pay handoff label not to be final action");
    expect(verifier).toContain("expected installed broad final action not to prove checkout surface");
    expect(verifier).toContain("expected installed amount-bearing pay label not to prove checkout surface");
    expect(verifier).toContain("expected installed automation module to import final action labels: ${file}");
    expect(verifier).toContain("expected installed automation module not to redefine final payment/order labels: ${file}");
    expect(verifier).toContain("expected installed automation module not to redefine final checkout labels: ${file}");
    expect(verifier).toContain("pass installed final action label contract");
    expect(verifier).toContain("expected installed checkout order-action label to be unsafe: ${label}");
    expect(verifier).toContain("expected installed bare proceed label to be unsafe");
    expect(verifier).toContain("verifyInstalledOrderActionLabelContract");
    expect(verifier).toContain("expected installed order-action label to be unsafe: ${label}");
    expect(verifier).toContain("expected installed ordinary workflow label not to match: ${label}");
    expect(verifier).toContain("pass installed order action label contract");
    expect(verifier).toContain("verifyInstalledAuthAutomationContract");
    expect(verifier).toContain("expected installed account-surface label to be unsafe: ${label}");
    expect(verifier).toContain("expected installed phone prefill label to be unsafe: ${label}");
    expect(verifier).toContain("expected installed account-surface final action label to be unsafe: ${label}");
    expect(verifier).toContain("expected installed phone prefill final action label to be unsafe: ${label}");
    expect(verifier).toContain("pass installed auth automation contract");
    expect(verifier).toContain("verifyInstalledCartAutomationContract");
    expect(verifier).toContain("expected installed cart parser to avoid unbounded all-node scroll scans");
    expect(verifier).toContain("expected installed cart parser to use targeted scroll container selectors");
    expect(verifier).toContain("expected installed cart opener to use Zepto cart drawer query fallback");
    expect(verifier).toContain("expected installed cart opener not to navigate to broken /cart page");
    expect(verifier).toContain("expected installed cart remove label to be unsafe: ${label}");
    expect(verifier).toContain("expected installed cart remove row parser to reject order summary rows");
    expect(verifier).toContain("expected installed cart remove row parser to reject tracking rows");
    expect(verifier).toContain("expected installed cart remove row parser to reject final order action rows");
    expect(verifier).toContain("expected installed cart remove row parser to reject checkout-and-pay rows");
    expect(verifier).toContain("expected installed cart remove row parser to reject pay-with rows");
    expect(verifier).toContain("expected installed cart remove row parser to reject inactive cart rows");
    expect(verifier).toContain("expected installed cart total parser not to report item total as final cart total");
    expect(verifier).toContain("expected installed cart total parser not to report items total as final cart total");
    expect(verifier).toContain("expected installed cart total parser not to report subtotal as final cart total");
    expect(verifier).toContain("expected installed cart total parser not to report sub total as final cart total");
    expect(verifier).toContain("expected installed cart total parser not to skip through sub total to a price");
    expect(verifier).toContain("verifyInstalledProductAutomationContract");
    expect(verifier).toContain("expected installed product-specific ADD label to be accepted");
    expect(verifier).toContain("expected installed quantity-only ADD label not to be accepted as product ADD");
    expect(verifier).toContain("expected installed item-count ADD label to be unsafe");
    expect(verifier).toContain("expected installed product ADD amount-pay label not to be accepted");
    expect(verifier).toContain("expected installed product ADD amount-pay label to be unsafe");
    expect(verifier).toContain("expected installed checkout-and-pay product ADD label to be unsafe");
    expect(verifier).toContain("expected installed pay-with product ADD label to be unsafe");
    expect(verifier).toContain("expected installed checkout-and-pay quantity label to be unsafe");
    expect(verifier).toContain("expected installed amount-pay quantity label to be unsafe");
    expect(verifier).toContain("expected installed search input to reject order action label: ${label}");
    expect(verifier).toContain("expected installed search trigger to reject order action label: ${label}");
    expect(verifier).toContain("expected installed product ADD to reject order action label: ${label}");
    expect(verifier).toContain("expected installed quantity increase to reject order action label: ${label}");
    expect(verifier).toContain("expected installed product-specific ADD label with order action text to be unsafe");
    expect(verifier).toContain("expected installed product URL to strip query and hash");
    expect(verifier).toContain("expected installed offsite product URL to be omitted");
    expect(verifier).toContain("expected installed unsafe-scheme product URL to be omitted");
    expect(verifier).toContain(
      "Public product URLs are kept only for Zepto-owned HTTP(S) links, with query strings and hash fragments stripped; offsite or unsafe-scheme hrefs are omitted."
    );
    expect(verifier).toContain("Quantity-only labels such as `Add 2 to cart` are not product-specific ADD controls.");
    expect(verifier).toContain("verifyInstalledOrderExtractionContract");
    expect(verifier).toContain("expected installed order parser to keep active delivery ETA");
    expect(verifier).toContain("expected installed order parser not to borrow delivery-speed ETA from delivered orders");
    expect(verifier).toContain("expected installed order parser to reject eta-only delivery-speed copy");
    expect(verifier).toContain("expected installed order parser to trim final action text from ETA");
    expect(verifier).toContain("expected installed order parser not to report items total as final order total");
    expect(verifier).toContain("expected installed order parser not to report sub total as final order total");
    expect(verifier).toContain("expected installed order parser not to skip through sub total to a price");
    expect(verifier).toContain("expected installed order parser to use centralized order-action label matching");
    expect(verifier).toContain("expected installed order parser to reject no-id action row");
    expect(verifier).toContain("expected installed order parser to keep id-bearing order rows with action labels");
    expect(verifier).toContain("expected installed order parser to keep tracking-context order rows with action labels");
    expect(verifier).toContain("verifyInstalledOrderAutomationContract");
    expect(verifier).toContain("expected installed order navigation label to be unsafe: ${label}");
    expect(verifier).toContain("expected installed account-menu label to be unsafe: ${label}");
    expect(verifier).toContain("expected installed reorder label to be unsafe: ${label}");
    expect(verifier).toContain("expected installed order navigation final action label to be unsafe: ${label}");
    expect(verifier).toContain("expected installed account-menu final action label to be unsafe: ${label}");
    expect(verifier).toContain("expected installed reorder final action label to be unsafe: ${label}");
    expect(verifier).toContain(
      "final-order, support, invoice/receipt, refund/return/cancel, or rating/review actions are rejected"
    );
    expect(verifier).toContain("rate, rating, review, track, cancel, payment-method/payment, checkout, or order summary");
    expect(verifier).toContain(
      "Implicit delivery/arriving time copy is treated as ETA only when the same order block exposes an active tracking status."
    );
    expect(verifier).toContain("verifyInstalledAddressAutomationContract");
    expect(verifier).toContain("expected installed address-manager label to be accepted: ${label}");
    expect(verifier).toContain("expected installed add-address label to be accepted: ${label}");
    expect(verifier).toContain("expected installed product parser to ignore product-card control image alt text");
    expect(verifier).toContain("expected installed product parser not to invent names from product-card controls");
    expect(verifier).toContain("expected installed product parser to reject checkout payment panels");
    expect(verifier).toContain("expected installed product parser to reject promo gift panels");
    expect(verifier).toContain("expected installed product parser to reject membership panels");
    expect(verifier).toContain("expected installed product parser to reject cart upsell panels");
    expect(verifier).toContain("expected installed product parser to reject offer panels");
    expect(verifier).toContain("expected installed product parser to reject cart service row");
    expect(verifier).toContain("expected installed product parser to reject account/location prompt");
    expect(verifier).toContain("expected installed cart parser to ignore inactive saved/unavailable cart sections");
    expect(verifier).toContain("expected installed cart parser to reject promo gift rows");
    expect(verifier).toContain("expected installed cart parser to reject membership rows");
    expect(verifier).toContain("expected installed cart parser to reject checkout payment panels");
    expect(verifier).toContain("expected installed cart parser to reject cart upsell rows");
    expect(verifier).toContain("expected installed cart parser to reject offer rows");
    expect(verifier).toContain("expected installed cart parser to reject cart service row");
    expect(verifier).toContain("expected installed cart parser to reject account/location prompt");
    expect(verifier).toContain("Use Current Location");
    expect(verifier).toContain("Change to current location");
    expect(verifier).toContain("Confirm Address");
    expect(verifier).toContain("Customer Support");
    expect(verifier).toContain("Cancel Order");
    expect(verifier).toContain("Rate Order");
    expect(verifier).toContain("expected installed address automation label to be unsafe");
    expect(verifier).toContain("expected installed address parser to reject final action address copy: ${rejectedText}");
    expect(verifier).toContain("expected installed address manager label to be rejected: ${rejectedText}");
    expect(verifier).toContain("expected installed add-address label to be rejected: ${rejectedText}");
    expect(verifier).toContain("verifyInstalledSessionContract");
    expect(verifier).toContain("expected installed session auth-state contract to reject weak profile/contact keys");
    expect(verifier).toContain("expected installed session status to reject weak profile/contact auth state");
    expect(verifier).toContain("expected installed session auth-state contract to reject bare login/logged flags");
    expect(verifier).toContain("expected installed session status to reject bare login/logged auth flags");
    expect(verifier).toContain("expected installed session auth-state contract to reject CSRF/XSRF token keys");
    expect(verifier).toContain("expected installed session status to reject CSRF/XSRF auth state");
    expect(verifier).toContain("expected installed session auth-state contract to accept strong auth keys");
    expect(verifier).toContain("expected installed cart cache migration to keep marker-only item counts");
    expect(verifier).toContain("expected installed cart cache migration to omit raw product names");
    expect(verifier).toContain("pass installed session auth-state contract");
    expect(verifier).toContain("Both preflight steps must report current-mode `browserAutomation.ready === true`");
    expect(verifier).toContain("doctor must also show a passing `Playwright Chromium` check");
    expect(verifier).toContain('paymentStatus: \\"not_observed_by_zepocli\\"');
    expect(verifier).toContain('cartPrecondition: \\"non_empty_cart_verified\\"');
    expect(verifier).toContain('status: \\"checkout_manual_action_required\\"');
    expect(verifier).toContain("manual amount-bearing payment control");
    expect(verifier).toContain("--choose-add");
    expect(verifier).toContain("--choose-add can only be used with --add.");
    expect(verifier).toContain("expected installed verify:live compatible phone to pass phone parsing");
    expect(verifier).toContain("accepts 10-digit, +91, or leading-0 Indian mobile formats");
    expect(verifier).toContain("expected installed verify:live usage to use silent npm");
    expect(verifier).toContain("expected installed verify:live step-timeout option");
    expect(verifier).toContain("expected installed verify:live production-scope option");
    expect(verifier).toContain("expected installed verify:live production-scope preset to enable checkout wait");
    expect(verifier).toContain("expected installed verify:live to support explicit add item-limit warning removal");
    expect(verifier).toContain("expected installed verify:live add limit-warning removal option");
    expect(verifier).toContain("expected installed verify:live help to explain explicit add limit-warning removal");
    expect(verifier).toContain("expected installed verify:live to support explicit cart item-limit warning removal");
    expect(verifier).toContain("expected installed verify:live cart limit-warning removal option");
    expect(verifier).toContain("expected installed verify:live help to explain explicit cart limit-warning removal");
    expect(verifier).toContain("expected installed verify:live to support explicit checkout item-limit warning removal");
    expect(verifier).toContain("expected installed verify:live checkout limit-warning removal option");
    expect(verifier).toContain("expected installed verify:live production-scope to stop before track when checkout handoff coverage is missing");
    expect(verifier).toContain("expected installed verify:live help to explain production-scope preset");
    expect(verifier).toContain("expected installed verify:live help to explain explicit checkout limit-warning removal");
    expect(verifier).toContain("expected installed verify:live:report max-age option");
    expect(verifier).toContain("expected installed verify:publish-dry-run package script");
    expect(verifier).toContain("expected installed verify:cli package script");
    expect(verifier).toContain("expected installed verify:package package script");
    expect(verifier).toContain("expected installed verify:live package script");
    expect(verifier).toContain("expected installed verify-cli script");
    expect(verifier).toContain("expected installed verify-package script");
    expect(verifier).toContain("expected installed live verifier runner");
    expect(verifier).toContain("function packagePackArgs()");
    expect(verifier).toContain('args.push("--ignore-scripts")');
    expect(verifier).toContain("function isSourceTreePackage");
    expect(verifier).toContain('"src", "index.ts"');
    expect(verifier).toContain('"tsconfig.json"');
    expect(verifier).toContain("expected installed verify:live:report freshness guidance");
    expect(verifier).toContain("expected installed verify:live:report production-scope request guidance");
    expect(verifier).toContain("expected installed verify:live:report production-scope cart-state guidance");
    expect(verifier).toContain("expected installed verify:live:report production-scope focused-workflow exclusion guidance");
    expect(verifier).toContain("expected installed verify:live:report manual/internal command marker guidance");
    expect(verifier).toContain("expected installed live report checkout manual-continuation steps to keep sanitized manual evidence");
    expect(verifier).toContain("expected installed live report manual checkout evidence to remain diagnostic only");
    expect(verifier).toContain("Production-scope acceptance rejects missing freshness windows and no-wait checkout evidence");
    expect(verifier).toContain("optional `--max-age-minutes` freshness");
    expect(verifier).toContain("local status readiness");
    expect(verifier).toContain(
      "browser preflight, local status, live session, address selection, search, add, a non-empty cart, checkout handoff, and track to be explicitly requested and covered"
    );
    expect(verifier).toContain("with checkout wait evidence");
    expect(verifier).toContain(
      "without address-add, address-list, remove, clear, history, or reorder evidence mixed into the final report"
    );
    expect(verifier).toContain("expected installed verify:live production-scope missing input guard");
    expect(verifier).toContain("expected installed verify:live production-scope focused-only guard");
    expect(verifier).toContain("expected installed verify:live add limit-warning removal guard");
    expect(verifier).toContain("expected installed verify:live cart limit-warning removal guard");
    expect(verifier).toContain("expected installed verify:live checkout limit-warning removal guard");
    expect(verifier).toContain("expected checkout limit-warning removal option");
    expect(verifier).toContain("expected installed verify:live unknown option output to omit npm-token-shaped value");
    expect(verifier).toContain("expected installed verify:live unknown assignment output to omit workflow query");
    expect(verifier).toContain("expected installed verify:live unknown assignment output to omit local temp paths");
    expect(verifier).toContain("expected installed verify:live command-timeout code guidance");
    expect(verifier).toContain("expected installed verify:live help to mention silent npm invocation for shared logs");
    expect(verifier).toContain("expected installed verify:live help to explain report summary booleans");
    expect(verifier).toContain("expected installed verify:live help to keep manual preconditions separate from workflow attempts");
    expect(verifier).toContain("expected installed verify:live npm-token redaction guidance");
    expect(verifier).toContain("expected installed verify:live percent-encoded fragment redaction guidance");
    expect(verifier).toContain("npm publish --dry-run --access public");
    expect(verifier).toContain("expected installed verify:secrets to skip service-spelled local runtime data directories");
    expect(verifier).toContain("function installedVerifyLiveArgs");
    expect(verifier).toContain('"--silent", "run", "--prefix", packageDir, "verify:live"');
    expect(verifier).toContain("expected installed verify:live invalid phone output to omit raw phone input");
    expect(verifier).toContain("expected installed verify:live no-session console output to omit local temp paths");
    expect(verifier).toContain("expected installed verify:live requested-checkout console output to omit local temp paths");
    expect(verifier).toContain("expected installed live verifier to sanitize report write failures");
    expect(verifier).toContain("expected installed live verifier to write sanitized partial reports on interrupts");
    expect(verifier).toContain("expected installed live verifier summaries to count readable records");
    expect(verifier).toContain("expected installed live verifier to skip live-session checks when no live workflow was requested");
    expect(verifier).toContain("latestHasStatus: hasReadableText(orders[0]?.status)");
    expect(verifier).toContain("latestHasEta: hasReadableText(orders[0]?.eta)");
    expect(verifier).toContain("expected installed doctor live report contract to require browser automation readiness");
    expect(verifier).toContain("expected installed status report contract to require browser readiness");
    expect(verifier).toContain("expected installed status live report contract to require browser readiness");
    expect(verifier).toContain("expected installed search live report contract to require product detail");
    expect(verifier).toContain("expected installed add live report contract to require product detail");
    expect(verifier).toContain("expected installed add live report contract to require readable cart items");
    expect(verifier).toContain("expected installed cart live report contract to require readable cart item records");
    expect(verifier).toContain("expected installed history live report contract to require readable order records");
    expect(verifier).toContain("expected installed history live report contract to reject total-only order records");
    expect(verifier).toContain("expected installed verify:live no-session report to show browser automation readiness");
    expect(verifier).toContain("expected installed verify:live no-session report to show passing Playwright Chromium evidence");
    expect(verifier).toContain("expected installed verify:live no-session report coverage to distinguish preflight from account workflow");
    expect(verifier).toContain("expected installed verify:live no-session report requests to show explicit verification scope");
    expect(verifier).toContain("expected installed live report requests to include requested workflow scope without sensitive values");
    expect(verifier).toContain("expected installed verify:live no-session report attempts to keep manual preconditions separate from workflow attempts");
    expect(verifier).toContain("expected installed live report attempts to include failed and successful workflow steps");
    expect(verifier).toContain("expected installed live report coverage to include only successful workflow steps");
    expect(verifier).toContain("expected installed live report missing coverage to include requested-but-unverified workflow steps only");
    expect(verifier).toContain("expected installed live report acceptance helper to reject attempted summaries that do not match steps");
    expect(verifier).toContain("expected installed live report acceptance helper to reject coverage summaries that do not match steps");
    expect(verifier).toContain("pass installed live report summary consistency");
    expect(verifier).toContain("expected installed live report acceptance helper to reject incomplete or non-boolean capability summaries");
    expect(verifier).toContain("pass installed live report capability summary contract");
    expect(verifier).toContain("expected installed live report acceptance helper to reject ok reports with failed workflow steps");
    expect(verifier).toContain("expected installed live report acceptance helper to reject ok reports with unknown or internal steps");
    expect(verifier).toContain("pass installed live report ok step set contract");
    expect(verifier).toContain("expected installed live report ok-step rejection to omit raw failed step values");
    expect(verifier).toContain("expected installed live report unknown-step rejection to omit raw failed step values");
    expect(verifier).toContain("expected installed live report acceptance helper to reject duplicate workflow steps");
    expect(verifier).toContain("expected installed live report duplicate-step rejection to omit raw duplicate step values");
    expect(verifier).toContain("pass installed live report unique step contract");
    expect(verifier).toContain("expected installed live report acceptance helper to reject out-of-order workflow steps");
    expect(verifier).toContain("pass installed live report step order contract");
    expect(verifier).toContain("expected installed live report acceptance helper to accept login session evidence");
    expect(verifier).toContain("expected installed live report acceptance helper to reject login steps without confirmed session evidence");
    expect(verifier).toContain("pass installed live report login step contract");
    expect(verifier).toContain("expected installed live report acceptance helper to reject stringly typed step summaries");
    expect(verifier).toContain("expected installed live report summary type rejection to omit raw step values");
    expect(verifier).toContain("pass installed live report summary value contract");
    expect(verifier).toContain("expected installed live report acceptance helper to accept runner-known string summaries");
    expect(verifier).toContain("expected installed live report acceptance helper to reject freeform string summaries");
    expect(verifier).toContain("expected installed live report string summary rejection to omit raw values");
    expect(verifier).toContain("pass installed live report string summary value contract");
    expect(verifier).toContain("expected installed live report acceptance helper to reject internally inconsistent step summaries");
    expect(verifier).toContain("expected installed live report summary consistency rejection to omit raw values");
    expect(verifier).toContain("pass installed live report summary consistency contract");
    expect(verifier).toContain("expected installed live report acceptance helper to reject oversized numeric summaries");
    expect(verifier).toContain("expected installed live report acceptance helper to reject sensitive-looking numeric summaries");
    expect(verifier).toContain("expected installed live report acceptance helper to reject sensitive oversized numeric summaries");
    expect(verifier).toContain("expected installed live report numeric summary rejection to omit raw values");
    expect(verifier).toContain("pass installed live report numeric summary contract");
    expect(verifier).toContain("expected installed live report acceptance helper to reject stripped step summaries");
    expect(verifier).toContain("pass installed live report summary key contract");
    expect(verifier).toContain("expected installed live report acceptance helper to reject malformed unrequested passing steps");
    expect(verifier).toContain("expected installed live report all-step contract rejection to omit raw step values");
    expect(verifier).toContain("pass installed live report all passing step contract");
    expect(verifier).toContain("expected installed live report acceptance helper to reject fields outside the accepted schema");
    expect(verifier).toContain("expected installed live report unexpected-field rejection to omit raw workflow values");
    expect(verifier).toContain("pass installed live report closed schema");
    expect(verifier).toContain("expected installed live report acceptance helper to reject malformed top-level metadata");
    expect(verifier).toContain("expected installed live report metadata rejection to omit raw metadata values");
    expect(verifier).toContain("pass installed live report metadata contract");
    expect(verifier).toContain("expected installed live report acceptance helper to reject unredacted command strings");
    expect(verifier).toContain("expected installed live report command rejection to omit raw workflow values");
    expect(verifier).toContain("expected installed live report acceptance helper to require redacted command strings");
    expect(verifier).toContain("expected installed live report acceptance helper to reject manual commands on workflow steps");
    expect(verifier).toContain("expected installed live report acceptance helper to reject internal commands on workflow steps");
    expect(verifier).toContain("pass installed live report command contract");
    expect(verifier).toContain("expected installed live report acceptance helper to reject inconsistent step result fields");
    expect(verifier).toContain("pass installed live report step result contract");
    expect(verifier).toContain("expected installed live report acceptance helper to reject malformed error objects");
    expect(verifier).toContain("expected installed live report error rejection to omit raw values");
    expect(verifier).toContain("pass installed live report error object contract");
    expect(verifier).toContain(
      "expected installed live report acceptance helper to reject live session without browser readiness"
    );
    expect(verifier).toContain("expected installed live report acceptance helper to require an expected package version");
    expect(verifier).toContain("expected installed live report acceptance helper to accept fresh report evidence");
    expect(verifier).toContain("expected installed live report acceptance helper to reject stale report evidence");
    expect(verifier).toContain("expected installed live report acceptance helper to reject partial reports for production scope");
    expect(verifier).toContain("expected installed live report acceptance helper to accept production-scope report evidence");
    expect(verifier).toContain(
      "expected installed live report acceptance helper to accept production-scope add limit-warning removal evidence"
    );
    expect(verifier).toContain(
      "expected installed live report acceptance helper to accept production-scope checkout limit-warning removal evidence"
    );
    expect(verifier).toContain(
      "expected installed live report acceptance helper to accept production-scope add, cart, and checkout limit-warning removal evidence"
    );
    expect(verifier).toContain(
      "expected installed live report acceptance helper to reject production-scope evidence without checkout wait"
    );
    expect(verifier).toContain(
      "expected installed live report acceptance helper to reject production-scope evidence without freshness"
    );
    expect(verifier).toContain("expected installed live report acceptance helper to reject unrequested production-scope evidence");
    expect(verifier).toContain(
      "expected installed live report acceptance helper to reject focused workflows in production-scope evidence"
    );
    expect(verifier).toContain(
      "expected installed live report acceptance helper to reject empty cart evidence for production scope"
    );
    expect(verifier).toContain("expected installed live report acceptance helper to reject sensitive-looking report keys or values");
    expect(verifier).toContain("expected installed live report validator sensitive rejection output to omit raw sensitive keys or values");
    expect(verifier).toContain("expected installed live report acceptance helper to reject Linux root/opt local paths");
    expect(verifier).toContain("expected installed live report Linux path rejection to omit raw sensitive keys or values");
    expect(verifier).toContain("expected installed live report validator to reject partial reports when production scope is required");
    expect(verifier).toContain("expected installed live report validator to accept production-scope report evidence");
    expect(verifier).toContain("expected installed live report validator to reject production-scope evidence without freshness");
    expect(verifier).toContain("expected installed live report validator to reject unrequested production-scope evidence");
    expect(verifier).toContain(
      "expected installed live report validator to reject focused workflows in production-scope evidence"
    );
    expect(verifier).toContain(
      "expected installed live report validator to reject empty cart evidence for production-scope evidence"
    );
    expect(verifier).toContain("expected installed live report validator to reject stale report evidence");
    expect(verifier).toContain("expected installed live report validator to accept fresh report evidence");
    expect(verifier).toContain("pass installed live report sensitive text rejection");
    expect(verifier).toContain("expected installed live report confirmed-session adjustment to make --login conditional");
    expect(verifier).toContain("expected installed live report confirmed-session adjustment to avoid skipped login missing coverage");
    expect(verifier).toContain("pass installed live report conditional login request");
    expect(verifier).toContain("expected installed verify:live requested-checkout report to mark checkout scope requested");
    expect(verifier).toContain("expected installed verify:live requested-checkout report to mark requested checkout coverage missing");
    expect(verifier).toContain("pass installed verify live requested checkout missing coverage");
    expect(verifier).toContain("expected installed verify:live production-scope report to request final readiness coverage");
    expect(verifier).toContain("expected installed verify:live production-scope report to mark final readiness coverage missing without login");
    expect(verifier).toContain("pass installed verify live production scope preset");
    expect(verifier).toContain("expected installed verify:live:report package script");
    expect(verifier).toContain("expected installed live report acceptance validator");
    expect(verifier).toContain("pass installed live report acceptance validator");
    expect(verifier).toContain("installed status malformed stale browser lock json");
    expect(verifier).toContain("expected installed stale malformed lock not to block automation");
    expect(verifier).toContain("installed status malformed access cooldown metadata json");
    expect(verifier).toContain("LAST_ACCESS_CHALLENGE_META_KEY");
    expect(verifier).toContain("installed status malformed headless run history metadata json");
    expect(verifier).toContain("HEADLESS_BROWSER_RUN_HISTORY_META_KEY");
    expect(verifier).toContain("expected no recorded Zepto access challenge");
    expect(verifier).toContain("installed global json no session nested address list");
    expect(verifier).toContain("installed json encoded sensitive unknown option redaction");
    expect(verifier).toContain("expected installed JSON parser error to omit encoded phone value");
    expect(verifier).toContain("installed json forward-slash path unknown option redaction");
    expect(verifier).toContain("expected installed JSON parser error to omit Windows path");
    expect(verifier).toContain("installed json Linux path unknown option redaction");
    expect(verifier).toContain("expected installed JSON parser error to omit Linux root path");
    expect(verifier).toContain("installed json relative path assignment unknown option redaction");
    expect(verifier).toContain("expected installed JSON parser error to omit relative Zepo data path");
    expect(verifier).toContain("installed json encoded relative path assignment unknown option redaction");
    expect(verifier).toContain("expected installed JSON parser error to omit encoded relative path");
    expect(verifier).toContain("installed json npm token unknown option redaction");
    expect(verifier).toContain("expected installed JSON parser error to omit npm-token-shaped value");
    expect(verifier).toContain("installed json equals flag parser error");
    expect(verifier).toContain("expected installed malformed --json value parser error to keep stdout empty");
    expect(verifier).toContain("installed visible required login");
    expect(verifier).toContain("installed visible required address add");
    expect(verifier).toContain("installed visible required checkout");
    expect(verifier).toContain("visible_browser_required");
    expect(verifier).toContain("browser profile writes, and headless browser run accounting");
    expect(verifier).toContain("expected installed redacted phone hint");
    expect(verifier).toContain("expected installed JSON phone error to omit raw phone-shaped value");
    expect(verifier).toContain("expected runtime error to omit raw data-dir path");
    expect(verifier).toContain("installed human runtime setup redaction");
    expect(verifier).toContain("expected installed human runtime error to omit raw data-dir path");
    expect(verifier).toContain("installed human invalid phone prefill redaction");
    expect(verifier).toContain("expected installed human phone error to omit raw phone-shaped value");
    expect(verifier).toContain("verifyInstalledBinShim");
    expect(verifier).toContain("pass installed CLI shim contract");
    expect(verifier).toContain("spawnSync(process.execPath, commandArgs");
    expect(verifier).toContain("buildLiveCommandTimeoutStep");
    expect(verifier).toContain("expected installed live command timeout redaction");
    expect(verifier).toContain("expected installed checkout live report contract to require non-empty cart precondition");
    expect(verifier).toContain("expected installed manual checkout live report to use incomplete coverage code");
    expect(verifier).toContain("checkout_manual_action_required is manual continuation evidence only");
    expect(verifier).toContain("createLiveConsoleTextRedactor");
    expect(verifier).toContain("redactArgsForLiveConsole");
    expect(verifier).toContain("redactLiveConsoleText");
    expect(verifier).toContain("expected installed live console command redaction to omit local paths and phone input");
    expect(verifier).toContain("expected installed live console command redaction to omit workflow queries");
    expect(verifier).toContain("expected installed live report command redaction to handle global timeout before workflow commands");
    expect(verifier).toContain("expected installed live console stderr redaction to omit workflow queries and local paths");
    expect(verifier).toContain("expected installed live console stderr redaction to omit Windows forward-slash local paths");
    expect(verifier).toContain("expected installed live console stderr redaction to omit Linux root and opt local paths");
    expect(verifier).toContain("expected installed live console stderr redaction to omit URL-encoded workflow queries");
    expect(verifier).toContain("expected installed live console stderr redaction to omit URL-encoded sensitive values");
    expect(verifier).toContain("expected installed live console stderr redaction to omit URL-encoded sensitive blobs");
    expect(verifier).toContain("expected installed live console stderr redaction to omit npm-token-shaped values");
    expect(verifier).toContain("expected installed live console stderr stream redaction to handle split workflow queries");
    expect(verifier).toContain(
      "expected installed immediate live console stderr redaction to handle split sensitive values"
    );
    expect(verifier).toContain("live_verification_incomplete");
  });

  it("bounds release verifier child commands so check failures do not hang indefinitely", () => {
    const cliVerifier = readFileSync(resolve(rootDir, "scripts", "verify-cli.mjs"), "utf8");
    const packageVerifier = readFileSync(resolve(rootDir, "scripts", "verify-package.mjs"), "utf8");
    const runtime = readFileSync(resolve(rootDir, "src", "config", "runtime.ts"), "utf8");
    const redaction = readFileSync(resolve(rootDir, "src", "utils", "redaction.ts"), "utf8");

    expect(cliVerifier).toContain("expected redacted phone hint");
    expect(cliVerifier).toContain("expected JSON phone error to omit raw phone-shaped value");
    expect(cliVerifier).toContain("expected JSON parser error to omit encoded phone value");
    expect(cliVerifier).toContain("json forward-slash path unknown option redaction");
    expect(cliVerifier).toContain("expected JSON parser error to omit Windows forward-slash path");
    expect(cliVerifier).toContain("json Linux path unknown option redaction");
    expect(cliVerifier).toContain("expected JSON parser error to omit Linux root path");
    expect(cliVerifier).toContain("json relative path assignment unknown option redaction");
    expect(cliVerifier).toContain("expected JSON parser error to omit relative Zepo data path");
    expect(cliVerifier).toContain("json encoded relative path assignment unknown option redaction");
    expect(cliVerifier).toContain("expected JSON parser error to omit encoded relative path");
    expect(cliVerifier).toContain("json npm token unknown option redaction");
    expect(cliVerifier).toContain("expected JSON parser error to omit npm-token-shaped value");
    expect(cliVerifier).toContain("json equals flag parser error");
    expect(cliVerifier).toContain("expected malformed --json value parser error to keep stdout empty");
    expect(cliVerifier).toContain("completion bash");
    expect(cliVerifier).toContain("expected bash completion registration");
    expect(cliVerifier).toContain("completion runtime-free data-dir");
    expect(cliVerifier).toContain("expected completion command not to create runtime data dir");
    expect(cliVerifier).toContain("expected help command completions");
    expect(cliVerifier).toContain("expected nested help command completions");
    expect(cliVerifier).toContain("completion zsh");
    expect(cliVerifier).toContain("expected zsh completion header");
    expect(cliVerifier).toContain("completion fish");
    expect(cliVerifier).toContain("expected fish nested help condition");
    expect(cliVerifier).toContain("completion powershell");
    expect(cliVerifier).toContain("expected PowerShell completer registration");
    expect(cliVerifier).toContain("completion pwsh alias");
    expect(cliVerifier).toContain("completion ps1 alias");
    expect(cliVerifier).toContain("completion invalid shell json");
    expect(cliVerifier).toContain("expected completion shell hint");
    expect(cliVerifier).toContain("expected JSON runtime setup error to omit raw data-dir path");
    expect(cliVerifier).toContain("human runtime setup redaction");
    expect(cliVerifier).toContain("expected human runtime setup error to omit raw data-dir path");
    expect(cliVerifier).toContain("human invalid phone prefill redaction");
    expect(cliVerifier).toContain("expected human phone error to omit raw phone-shaped value");
    expect(cliVerifier).toContain("assertNoBrowserWork");
    expect(cliVerifier).toContain("expected guarded command not to create a browser lock");
    expect(cliVerifier).toContain("expected guarded command not to write browser profile data");
    expect(cliVerifier).toContain("expected guarded command not to launch headless browser");

    expect(runtime).toContain("redactSensitiveValue");
    expect(redaction).toContain("redactSensitiveError");
    expect(redaction).toContain("redactEncodedSensitiveParameterValues");
    expect(redaction).toContain("password|passwd|passphrase|pwd|secret|credential");
    expect(redaction).toContain("<redacted-npm-token>");
    expect(runtime).toContain("formatters");
    expect(runtime).toContain("hooks");
    expect(runtime).toContain("logMethod");

    expect(cliVerifier).toContain("CLI_COMMAND_TIMEOUT_MS = 120_000");
    expect(cliVerifier).toContain("timeout: CLI_COMMAND_TIMEOUT_MS");
    expect(cliVerifier).toContain("Command timed out after");

    expect(packageVerifier).toContain("INSTALLED_CLI_COMMAND_TIMEOUT_MS = 120_000");
    expect(packageVerifier).toContain("NPM_COMMAND_TIMEOUT_MS = 180_000");
    expect(packageVerifier).toContain("timeout: INSTALLED_CLI_COMMAND_TIMEOUT_MS");
    expect(packageVerifier).toContain("timeout: timeoutMs");
    expect(packageVerifier).toContain("Command timed out after");
  });

  it("keeps live verification command timeouts bounded and cleanup-aware", () => {
    const liveVerifier = readFileSync(resolve(rootDir, "scripts", "verify-live-flow.mjs"), "utf8");

    expect(liveVerifier).toContain("DEFAULT_STEP_TIMEOUT_MS = 30 * 60 * 1_000");
    expect(liveVerifier).toContain("COMMAND_TIMEOUT_FORCE_KILL_GRACE_MS = 30_000");
    expect(liveVerifier).toContain('child.kill("SIGTERM")');
    expect(liveVerifier).toContain('child.kill("SIGKILL")');
    expect(liveVerifier).toContain("clearForceKillTimer(forceKill)");
    expect(liveVerifier.match(/liveCommandTimeoutError\(options\.stepTimeoutMs, \{ stdout, stderr \}\)/g)).toHaveLength(2);
    expect(liveVerifier).toContain("buildLiveCommandTimeoutOrErrorStep({");
    expect(liveVerifier).toContain("stderr: error.stderr");
  });

  it("keeps live verification interrupts sanitized and cleanup-aware", () => {
    const liveVerifier = readFileSync(resolve(rootDir, "scripts", "verify-live-flow.mjs"), "utf8");

    expect(liveVerifier).toContain('process.once("SIGINT", () => handleInterrupt("SIGINT"))');
    expect(liveVerifier).toContain('process.once("SIGTERM", () => handleInterrupt("SIGTERM"))');
    expect(liveVerifier).toContain("Live verification interrupted by the user.");
    expect(liveVerifier).toContain("Review the visible Zepto browser state, then rerun verify:live when ready.");
    expect(liveVerifier).toContain('child.kill("SIGTERM")');
    expect(liveVerifier).toContain('child.kill("SIGKILL")');
    expect(liveVerifier).toContain("finishInterruptedRun(signal, exitCode)");
    expect(liveVerifier).toContain("writeLiveReport(reportPath, report)");
  });

  it("keeps live verification console report paths redacted", () => {
    const liveVerifier = readFileSync(resolve(rootDir, "scripts", "verify-live-flow.mjs"), "utf8");

    expect(liveVerifier).toContain("Live verification report: <redacted-report-path>");
    expect(liveVerifier).not.toContain("Live verification report: ${reportPath}");
  });

  it("keeps live verification report write failures sanitized", () => {
    const liveVerifier = readFileSync(resolve(rootDir, "scripts", "verify-live-flow.mjs"), "utf8");

    expect(liveVerifier).toContain("const reportWriteError = writeLiveReport(reportPath, report)");
    expect(liveVerifier).toContain("Could not write live verification report.");
    expect(liveVerifier).toContain("Choose a writable report file path and rerun with --report <path>.");
    expect(liveVerifier).toContain("function writeLiveReport(path, payload)");
    expect(liveVerifier).not.toContain("console.error(error.message)");
  });

  it("keeps live report error-code sanitization aligned with CLI errors", () => {
    const sourceCodes = collectSourceErrorCodes();
    const safeReportCodes = new Set(collectSafeLiveReportErrorCodes());

    expect(sourceCodes).toContain("zepto_access_challenge");
    expect(sourceCodes.filter((code) => !safeReportCodes.has(code))).toEqual([]);
  });

  it("keeps CI aligned with the local release gate", () => {
    const workflow = readFileSync(resolve(rootDir, ".github", "workflows", "ci.yml"), "utf8");

    expect(workflow).toContain("- 20.19");
    expect(workflow).toContain("- 22");
    expect(workflow).toContain("- 24");
    expect(workflow).toContain("npx playwright install --with-deps chromium");
    expect(workflow).toContain("npm run check");
    expect(workflow).not.toContain("verify:live");
  });

  it("keeps npm release publishing guarded by the release gate", () => {
    const workflow = readFileSync(resolve(rootDir, ".github", "workflows", "release.yml"), "utf8");

    expect(workflow).toContain("tags:");
    expect(workflow).toContain('"v*"');
    expect(workflow).toContain("id-token: write");
    expect(workflow).toContain("node-version: 20.19");
    expect(workflow).toContain("registry-url: https://registry.npmjs.org");
    expect(workflow).toContain("npx playwright install --with-deps chromium");
    expect(workflow).toContain("npm run check");
    expect(workflow).toContain("npm publish --provenance --access public");
    expect(workflow).toContain("NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}");
    expect(workflow).not.toContain("verify:live");
  });
});
