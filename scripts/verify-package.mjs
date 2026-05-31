import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const rootDir = resolve(import.meta.dirname, "..");
const packageJson = JSON.parse(readFileSync(resolve(rootDir, "package.json"), "utf8"));
const npmExecPath = process.env.npm_execpath;
const INSTALLED_CLI_COMMAND_TIMEOUT_MS = 120_000;
const NPM_COMMAND_TIMEOUT_MS = 180_000;
const FAKE_NPM_TOKEN = `npm_${"A".repeat(24)}`;

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
    name: "address add",
    args: ["address", "add", "--json"]
  },
  {
    name: "checkout",
    args: ["checkout", "--json"]
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

  runNpm(["pack", "--pack-destination", packDir, "--silent"], { cwd: rootDir });

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
  await verifyInstalledCheckoutHandoffContract(installDir);
  await verifyInstalledAddressAutomationContract(installDir);
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
  const installedVerifySecretsPath = join(packageDir, "scripts", "verify-secrets.mjs");
  const installedVerifyLiveReportPath = join(packageDir, "scripts", "verify-live-report.mjs");
  const installedEnvExamplePath = join(packageDir, ".env.example");
  const installedNpmrcExamplePath = join(packageDir, ".npmrc.example");

  assert(installedPackageJson.bin?.zepo === "./dist/index.js", "expected installed package bin zepo entry");
  assert(
    installedPackageJson.scripts?.build?.includes("node scripts/clean-dist.mjs"),
    "expected installed build script to clean dist"
  );
  assert(
    installedPackageJson.scripts?.["verify:secrets"] === "node scripts/verify-secrets.mjs",
    "expected installed verify:secrets package script"
  );
  assert(
    installedPackageJson.scripts?.["verify:live:report"] === "node scripts/verify-live-report.mjs",
    "expected installed verify:live:report package script"
  );
  assert(
    installedPackageJson.scripts?.build?.includes("node scripts/normalize-cli-entry.mjs"),
    "expected installed build script to normalize the CLI entry"
  );
  assert(existsSync(installedCliPath), "expected installed dist/index.js");
  assert(existsSync(installedCleanDistPath), "expected installed clean-dist script");
  assert(existsSync(installedNormalizeCliEntryPath), "expected installed normalize-cli-entry script");
  assert(existsSync(installedVerifySecretsPath), "expected installed verify-secrets script");
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
    env: {
      ...process.env,
      FORCE_COLOR: "0",
      NO_COLOR: "1"
    }
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
    "zepo login",
    "zepo checkout",
    "paymentStatus: \"not_observed_by_zepocli\"",
    "Checkout handoff controls are rejected if any visible or accessible label contains payment-method, final-payment, final-order, `checkout and pay`, or amount-bearing pay text",
    "Address manager/add-address controls use visible, enabled address controls only and reject mixed visible or accessible labels that point at location-consent, final address-confirmation, unrelated cart/checkout/order/bill/payment text, or payment-method/payment surfaces",
    "Safe-click checks inspect visible text, `aria-label`, `title`, `placeholder`, `value`, `aria-description`, and referenced `aria-labelledby`/`aria-describedby` text",
    "Privacy Notice version 1.1",
    "Last updated: 17th June 2025",
    "passwords and payment instrument details as sensitive personal information",
    "Human and JSON error text redact sensitive-looking order-id, phone, OTP/PIN/CVV, payment-number, payment-handle",
    "auth/session/token URL parameters, and local-path values",
    "npm-token-shaped values",
    "including URL/query-string encoded forms and standalone percent-encoded fragments of those values",
    "Persistent log object values, Error messages/stacks, and message strings are redacted with the same sensitive-looking order-id, phone, OTP/PIN/CVV, payment-number, payment-handle",
    "auth/session/token URL-parameter, and local-path rules",
    "npm --silent run verify:live -- --data-dir ./.zepo-live",
    "the live report contract requires `browserAutomation.ready === true` plus a passing `Playwright Chromium` check",
    "`--login` is conditional: if the dedicated data directory already has a confirmed session",
    "top-level `requested`, `attempted`, `coverage`, and `missingCoverage` objects showing which workflow capabilities were requested, ran, actually passed, and remain requested-but-unverified",
    "`checkoutHandoff`",
    "`--choose-add` with `--add`",
    "`verify:live --phone` accepts the same 10-digit, `+91`, or leading-0 Indian mobile formats",
    "npm --silent run verify:live:report -- ./.zepo-live/live-verification-report.json",
    "`verify:live:report` does not contact Zepto or prove a fresh run happened",
    "sanitized `generatedAt` plus data/report path metadata",
    "accepted report schema",
    "complete boolean capability summaries",
    "redacted step command contract",
    "`ok` reports containing only passing known workflow steps",
    "unique workflow step names",
    "consistent step `exitCode`/`ok`/`summary`/`error` fields",
    "`attempted`/`coverage` consistency with `steps`",
    "sensitive-looking key/value redaction",
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
  const { isCheckoutHandoffClickText, isUnsafeCheckoutAutomationClickText } = await import(
    pathToFileURL(checkoutAutomationModulePath).href
  );
  assertCheckoutHandoffContract(checkoutHandoffOutput());
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
    isUnsafeCheckoutAutomationClickText("Continue to Pay") === true,
    "expected installed continue-to-pay label to be unsafe"
  );
  console.log("pass installed checkout handoff contract");
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
  const { isAddAddressClickText, isAddressManagerClickText, isUnsafeAddressAutomationClickText } = await import(
    pathToFileURL(addressAutomationModulePath).href
  );

  assert(isAddressManagerClickText("Delivery Address") === true, "expected installed address-manager label to be accepted");
  assert(isAddAddressClickText("Add Address") === true, "expected installed add-address label to be accepted");
  for (const unsafeText of ["Checkout", "Pay Now", "Order Summary", "Bill Summary", "Cart"]) {
    assert(
      isUnsafeAddressAutomationClickText(unsafeText) === true,
      `expected installed address automation label to be unsafe: ${unsafeText}`
    );
    assert(
      isAddressManagerClickText(unsafeText) === false,
      `expected installed address manager label to be rejected: ${unsafeText}`
    );
    assert(
      isAddAddressClickText(unsafeText) === false,
      `expected installed add-address label to be rejected: ${unsafeText}`
    );
  }
  console.log("pass installed address automation contract");
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
    liveVerifierSource.includes("summarizeLiveRunnerFailure(error)") &&
      liveVerifierSource.includes('name: "live runner"'),
    "expected installed live verifier to record sanitized internal runner failures"
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

  const result = runNpm(installedVerifyLiveArgs(packageDir, "--help"), { cwd: rootDir });
  assert(result.stdout.includes("Usage: npm --silent run verify:live"), "expected installed verify:live usage to use silent npm");
  assert(result.stdout.includes("human-controlled live verification"), "expected installed verify:live help output");
  assert(result.stdout.includes("--reorder-last"), "expected installed verify:live reorder option");
  assert(result.stdout.includes("--choose-add"), "expected installed verify:live choose-add option");
  assert(result.stdout.includes("--remove <query>"), "expected installed verify:live remove option");
  assert(result.stdout.includes("--clear"), "expected installed verify:live clear option");
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
    installedVerifyLiveArgs(packageDir, "--search=Amul Milk 500ml"),
    { cwd: rootDir }
  );
  assert(unknownSearchAssignmentResult.status === 1, "expected installed verify:live unknown assignment to fail");
  assert(
    unknownSearchAssignmentResult.stderr.includes("Unknown option: --search."),
    "expected installed verify:live unknown assignment to keep only the option name"
  );
  assert(
    unknownSearchAssignmentResult.stderr.includes("Use a space between a live verifier option and its value."),
    "expected installed verify:live unknown assignment to explain option value syntax"
  );
  assert(
    !`${unknownSearchAssignmentResult.stdout}\n${unknownSearchAssignmentResult.stderr}`.includes("Amul Milk 500ml"),
    "expected installed verify:live unknown assignment output to omit workflow query"
  );

  const unknownReportAssignmentPath = join(tempRoot, "live-secret-report.json");
  const unknownReportAssignmentResult = runNpmResult(
    installedVerifyLiveArgs(packageDir, `--report=${unknownReportAssignmentPath}`),
    { cwd: rootDir }
  );
  assert(unknownReportAssignmentResult.status === 1, "expected installed verify:live unknown report assignment to fail");
  assert(
    unknownReportAssignmentResult.stderr.includes("Unknown option: --report."),
    "expected installed verify:live unknown report assignment to keep only the option name"
  );
  assert(
    !`${unknownReportAssignmentResult.stdout}\n${unknownReportAssignmentResult.stderr}`.includes(tempRoot),
    "expected installed verify:live unknown assignment output to omit local temp paths"
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
      env: {
        ...process.env,
        FORCE_COLOR: "0",
        NO_COLOR: "1"
      }
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
    noSessionReport.steps?.some((step) => step.name === "login" && step.error?.code === "live_verification_incomplete"),
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
      noSessionReport.attempted?.login === true &&
      noSessionReport.attempted?.checkoutHandoff === false,
    "expected installed verify:live no-session report attempts to distinguish failed preconditions from skipped workflow"
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
      env: {
        ...process.env,
        FORCE_COLOR: "0",
        NO_COLOR: "1"
      }
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

  const {
    adjustLiveReportRequestsForConfirmedSession,
    buildLiveCommandLaunchFailureStep,
    buildLiveCommandTimeoutStep,
    buildLiveReportStep,
    createLiveConsoleTextRedactor,
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
      { name: "doctor", ok: true },
      { name: "status", ok: true },
      { name: "status live", ok: true }
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
        playwrightChromiumPassed: true
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
        productCount: 1
      }
    },
    {
      name: "checkout",
      command: "zepo --data-dir <redacted-data-dir> --visible checkout --json",
      exitCode: 0,
      ok: true,
      summary: {
        status: "checkout_handoff_returned",
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
    note: "Sanitized ZepoCli live verification report. Fixture omits raw workflow data.",
    requested: acceptedLiveReportRequested,
    attempted: summarizeLiveReportAttempts(acceptedLiveReportSteps),
    coverage: acceptedLiveReportCoverage,
    missingCoverage: summarizeLiveReportMissingCoverage(acceptedLiveReportRequested, acceptedLiveReportCoverage),
    steps: acceptedLiveReportSteps
  };
  assert(
    validateLiveReportAcceptance(acceptedLiveReport, { expectedVersion: packageJson.version }).accepted === true,
    "expected installed live report acceptance helper to accept complete report evidence"
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
  const metadataLiveReportIssues = validateLiveReportAcceptance(
    {
      ...acceptedLiveReport,
      generatedAt: "today",
      dataDir: "<redacted-local-path>"
    },
    {
      expectedVersion: packageJson.version
    }
  ).issues;
  assert(
    metadataLiveReportIssues.some((issue) => issue.code === "live_report_metadata_mismatch"),
    "expected installed live report acceptance helper to reject malformed top-level metadata"
  );
  assert(
    !JSON.stringify(metadataLiveReportIssues).includes("today"),
    "expected installed live report metadata rejection to omit raw metadata values"
  );
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
      { name: "doctor", ok: true },
      { name: "status", ok: true },
      { name: "login", ok: false },
      { name: "checkout", ok: true },
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
    "expected installed live report coverage to include only successful workflow steps"
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
        { name: "doctor", ok: true },
        { name: "status", ok: true },
        { name: "login", ok: false },
        { name: "search", ok: true },
        { name: "checkout", ok: true }
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
    "Debug URL: https://example.test/callback?phone=%2B91+98765+43210&otp=%31%32%33%34%35%36&card=4111%201111%201111%201111&upi=abc%40upi&token=raw-token-123&access_token=abc.def.ghi&file=C%3A%5CUsers%5Cparth%5C.zepo-live%5Ctrace.txt",
    []
  );
  assert(
    encodedSensitiveLiveStderr.includes("phone=<redacted-phone>") &&
      encodedSensitiveLiveStderr.includes("otp=<redacted-verification-code>") &&
      encodedSensitiveLiveStderr.includes("card=<redacted-payment-number>") &&
      encodedSensitiveLiveStderr.includes("upi=<redacted-payment-handle>") &&
      encodedSensitiveLiveStderr.includes("token=<redacted-auth-token>") &&
      encodedSensitiveLiveStderr.includes("access_token=<redacted-auth-token>") &&
      encodedSensitiveLiveStderr.includes("file=<redacted-local-path>") &&
      !encodedSensitiveLiveStderr.includes("%2B91") &&
      !encodedSensitiveLiveStderr.includes("4111%201111") &&
      !encodedSensitiveLiveStderr.includes("abc%40upi") &&
      !encodedSensitiveLiveStderr.includes("raw-token-123") &&
      !encodedSensitiveLiveStderr.includes("abc.def.ghi") &&
      !encodedSensitiveLiveStderr.includes("C%3A%5CUsers"),
    "expected installed live console stderr redaction to omit URL-encoded sensitive values"
  );
  const encodedSensitiveBlobLiveStderr = redactLiveConsoleText(
    "Encoded callback https%3A%2F%2Fexample.test%2Fcallback%3Fphone%3D%2B91%2098765%2043210%26card%3D4111%201111%201111%201111%26file%3DC%3A%2FUsers%2Fparth%2F.zepo-live%2Ftrace.txt and C%3A%2FUsers%2Fparth%2F.zepo-live%2Freport.json",
    []
  );
  assert(
    encodedSensitiveBlobLiveStderr.includes("phone=<redacted-phone>") &&
      encodedSensitiveBlobLiveStderr.includes("card=<redacted-payment-number>") &&
      encodedSensitiveBlobLiveStderr.includes("file=<redacted-local-path>") &&
      encodedSensitiveBlobLiveStderr.includes("<redacted-local-path>") &&
      !encodedSensitiveBlobLiveStderr.includes("https%3A%2F%2Fexample.test") &&
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

  const { step: summaryFailureStep } = buildLiveReportStep({
    name: "cart",
    args: ["--data-dir", "C:\\Users\\parth\\.zepo-live", "--visible", "cart", "--json"],
    status: 0,
    stdout: JSON.stringify({ items: [] }),
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
      }
    },
    {
      name: "installed help",
      args: ["--help"],
      expect: ({ status, stdout }) => {
        assert(status === 0, "expected exit code 0");
        assert(stdout.includes("Developer CLI for user-directed Zepto workflows"), "expected CLI description");
        assert(stdout.includes("checkout"), "expected checkout command in help output");
      }
    },
    {
      name: "installed login help",
      args: ["login", "--help"],
      expect: ({ status, stdout, stderr }) => {
        assert(status === 0, "expected exit code 0");
        assert(stderr === "", "expected empty stderr");
        assert(stdout.includes("Open Zepto login and save the browser session"), "expected login description");
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
        assert(stdout.includes("Open Zepto address flow in the browser"), "expected address add description");
        assert(stdout.includes("--json"), "expected address add json option");
      }
    },
    {
      name: "installed checkout help",
      args: ["checkout", "--help"],
      expect: ({ status, stdout, stderr }) => {
        assert(status === 0, "expected exit code 0");
        assert(stderr === "", "expected empty stderr");
        assert(stdout.includes("Open Zepto checkout for user-completed payment"), "expected checkout description");
        assert(stdout.includes("--json"), "expected checkout json option");
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
          payload.next === "Run `zepo login` before account-dependent commands.",
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
      }
    },
    {
      name: "installed no-input address add",
      args: ["--data-dir", dataDir, "--no-input", "address", "add", "--json"],
      expect: (result) => {
        expectJsonError(result, "user_error", "Zepto address add requires interactive input.", "interactive_input_required");
      }
    },
    {
      name: "installed no-input checkout",
      args: ["--data-dir", dataDir, "--no-input", "checkout", "--json"],
      expect: (result) => {
        expectJsonError(result, "user_error", "Zepto checkout requires interactive input.", "interactive_input_required");
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
    const result = runInstalledCli(installedCliPath, args);
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
    env: {
      ...process.env,
      FORCE_COLOR: "0",
      NO_COLOR: "1"
    }
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
    env: {
      ...process.env,
      FORCE_COLOR: "0",
      NO_COLOR: "1"
    }
  });
}

function assertFreshCache(cache) {
  assert(cache?.searches === 0, "expected empty search cache");
  assert(cache?.cartSnapshots === 0, "expected empty cart snapshot cache");
  assert(cache?.addresses === 0, "expected empty address cache");
  assert(cache?.orders === 0, "expected empty order cache");
}

function assertFreshStatus(payload, expectedDataDir) {
  assertFreshCache(payload.cache);
  assert(payload.version === packageJson.version, "expected installed status version to match package.json");
  assert(payload.dataDir === expectedDataDir, "expected status to use disposable data dir");
  assert(payload.confirmedSession === false, "expected fresh data dir to be logged out");
  assert(payload.browserLock?.path === join(expectedDataDir, "browser.lock"), "expected browser lock path");
  assert(payload.browserLock?.present === false, "expected no browser lock");
  assert(payload.browserLock?.stale === false, "expected browser lock not stale");
  assert(payload.browserAutomation?.ready === true, "expected browser automation ready");
  assert(Array.isArray(payload.browserAutomation?.reasons), "expected browser automation reasons array");
  assert(payload.browserAutomation.reasons.length === 0, "expected no browser automation stop reasons");
  assert(payload.browserAutomation?.retryAfterMs === 0, "expected zero browser automation retry delay");
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
  assert(payload.browserAutomation?.ready === true, "expected doctor browser automation ready");
  assert(Array.isArray(payload.browserAutomation?.reasons), "expected doctor browser automation reasons array");
  assert(payload.browserAutomation.reasons.length === 0, "expected doctor no browser automation stop reasons");
  assert(payload.browserAutomation?.retryAfterMs === 0, "expected doctor zero browser automation retry delay");
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

function assertCheckoutHandoffContract(payload) {
  assert(payload.status === "checkout_handoff_returned", "expected installed checkout handoff status");
  assert(payload.payment === "handled_by_zepto", "expected installed Zepto-handled payment marker");
  assert(payload.paymentStatus === "not_observed_by_zepocli", "expected installed unobserved payment status");
  assert(payload.orderPlacement === "not_confirmed_by_zepocli", "expected installed unconfirmed order placement");
  assert(payload.orderStatusCommand === "zepo track", "expected installed track next command");
  assert(String(payload.next).includes("Complete payment in Zepto"), "expected installed checkout next-step guidance");
}

function installedLiveStatusDiagnosticsPayload() {
  return {
    version: packageJson.version,
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

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function assertDeepEqual(actual, expected, message) {
  assert(JSON.stringify(actual) === JSON.stringify(expected), message);
}
