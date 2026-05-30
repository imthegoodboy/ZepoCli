import { execFileSync, spawnSync } from "node:child_process";
import { readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { basename, extname, join, relative, resolve } from "node:path";

import { describe, expect, it } from "vitest";

import packageJson from "../package.json" with { type: "json" };

const rootDir = resolve(import.meta.dirname, "..");
const skippedSecretScanDirectories = new Set([".git", "coverage", "dist", "node_modules"]);
const scannedTextFileExtensions = new Set([
  ".json",
  ".md",
  ".mjs",
  ".ts",
  ".tsx",
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
      zepo: "./dist/index.js"
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
    expect(readFileSync(resolve(rootDir, ".npmrc.example"), "utf8")).toContain("${NPM_TOKEN}");
    expect(readFileSync(resolve(rootDir, ".env.example"), "utf8")).toContain("NPM_TOKEN=");

    const leakedTokens = collectProjectTextFiles(rootDir).flatMap((filePath) => {
      const text = readFileSync(filePath, "utf8");
      const matches = text.match(/npm_[A-Za-z0-9]{20,}/g) ?? [];

      return matches.map((match) => `${relative(rootDir, filePath)}:${match}`);
    });

    expect(leakedTokens).toEqual([]);
  });

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

    const checkScript = packageJson.scripts?.check ?? "";

    for (const gate of [
      "npm run verify:secrets",
      "npm run build",
      "npm test",
      "npm run verify:cli",
      "npm run verify:package",
      "node dist/index.js --help",
      "npm run verify:audit",
      "npm pack --dry-run"
    ]) {
      expect(checkScript).toContain(gate);
    }

    expect(checkScript).not.toContain("verify:live");
  });

  it("exposes audit verification and keeps live verification opt-in", () => {
    expect(packageJson.scripts?.["verify:audit"]).toBe("npm audit --omit=dev");
    expect(packageJson.scripts?.["verify:live"]).toBe("node scripts/verify-live-flow.mjs");
    expect(packageJson.files).toContain("README.md");
    expect(packageJson.files).toContain("LICENSE");
    expect(packageJson.files).toContain("scripts/clean-dist.mjs");
    expect(packageJson.files).toContain("scripts/normalize-cli-entry.mjs");
    expect(packageJson.files).toContain("scripts/live-report-utils.mjs");
    expect(packageJson.files).toContain("scripts/verify-live-flow.mjs");
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
    expect(verifier).toContain("isLocalSecretConfigName");
    expect(verifier).toContain("npmTokenPattern");
    expect(verifier).toContain(".npmrc.example");
    expect(verifier).toContain(".env.example");
    expect(verifier).toContain("<redacted-npm-token>");
    expect(verifier).not.toContain("console.error(line)");
  });

  it("redacts npm-shaped tokens when secret verification fails", () => {
    const fixturePath = resolve(rootDir, "secret-scan-fixture.mjs");
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
  });

  it("keeps installed package verification checking shipped README guidance", () => {
    const verifier = readFileSync(resolve(rootDir, "scripts", "verify-package.mjs"), "utf8");

    expect(verifier).toContain("verifyInstalledReadmeContract");
    expect(verifier).toContain("expected installed package README");
    expect(verifier).toContain("Safe-click checks inspect visible text");
    expect(verifier).toContain("Human and JSON error text redact sensitive-looking order-id, phone, OTP/PIN/CVV, payment-number, payment-handle");
    expect(verifier).toContain("auth/session/token URL parameters, and local-path values");
    expect(verifier).toContain("including URL/query-string encoded forms of those values");
    expect(verifier).toContain("Persistent log object values, Error messages/stacks, and message strings are redacted with the same sensitive-looking order-id, phone, OTP/PIN/CVV, payment-number, payment-handle");
    expect(verifier).toContain("auth/session/token URL-parameter, and local-path rules");
    expect(verifier).toContain("`checkout and pay`, or amount-bearing pay text");
    expect(verifier).toContain("unrelated cart/checkout/order/bill/payment text");
    expect(verifier).toContain("expected installed promotional checkout label to be rejected");
    expect(verifier).toContain("expected installed continue-to-pay label to be unsafe");
    expect(verifier).toContain("verifyInstalledAddressAutomationContract");
    expect(verifier).toContain("expected installed address automation label to be unsafe");
    expect(verifier).toContain("`browserAutomation.ready === true` plus a passing `Playwright Chromium` check");
    expect(verifier).toContain('paymentStatus: \\"not_observed_by_zepocli\\"');
    expect(verifier).toContain("--choose-add");
    expect(verifier).toContain("--choose-add can only be used with --add.");
    expect(verifier).toContain("expected installed verify:live compatible phone to pass phone parsing");
    expect(verifier).toContain("accepts 10-digit, +91, or leading-0 Indian mobile formats");
    expect(verifier).toContain("expected installed verify:live step-timeout option");
    expect(verifier).toContain("expected installed verify:live command-timeout code guidance");
    expect(verifier).toContain("expected installed verify:live help to mention silent npm invocation for shared logs");
    expect(verifier).toContain("expected installed live verifier to sanitize report write failures");
    expect(verifier).toContain("expected installed live verifier to write sanitized partial reports on interrupts");
    expect(verifier).toContain("expected installed doctor live report contract to require browser automation readiness");
    expect(verifier).toContain("installed status malformed stale browser lock json");
    expect(verifier).toContain("expected installed stale malformed lock not to block automation");
    expect(verifier).toContain("installed global json no session nested address list");
    expect(verifier).toContain("installed json encoded sensitive unknown option redaction");
    expect(verifier).toContain("expected installed JSON parser error to omit encoded phone value");
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
    expect(verifier).toContain("createLiveConsoleTextRedactor");
    expect(verifier).toContain("redactArgsForLiveConsole");
    expect(verifier).toContain("redactLiveConsoleText");
    expect(verifier).toContain("expected installed live console command redaction to omit local paths and phone input");
    expect(verifier).toContain("expected installed live console command redaction to omit workflow queries");
    expect(verifier).toContain("expected installed live report command redaction to handle global timeout before workflow commands");
    expect(verifier).toContain("expected installed live console stderr redaction to omit workflow queries and local paths");
    expect(verifier).toContain("expected installed live console stderr redaction to omit URL-encoded workflow queries");
    expect(verifier).toContain("expected installed live console stderr redaction to omit URL-encoded sensitive values");
    expect(verifier).toContain("expected installed live console stderr stream redaction to handle split workflow queries");
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
    expect(cliVerifier).toContain("expected JSON runtime setup error to omit raw data-dir path");
    expect(cliVerifier).toContain("human runtime setup redaction");
    expect(cliVerifier).toContain("expected human runtime setup error to omit raw data-dir path");
    expect(cliVerifier).toContain("human invalid phone prefill redaction");
    expect(cliVerifier).toContain("expected human phone error to omit raw phone-shaped value");

    expect(runtime).toContain("redactSensitiveValue");
    expect(redaction).toContain("redactSensitiveError");
    expect(redaction).toContain("redactEncodedSensitiveParameterValues");
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
    expect(liveVerifier).toContain("COMMAND_TIMEOUT_FORCE_KILL_GRACE_MS = 5_000");
    expect(liveVerifier).toContain('child.kill("SIGTERM")');
    expect(liveVerifier).toContain('child.kill("SIGKILL")');
    expect(liveVerifier).toContain("clearForceKillTimer(forceKill)");
    expect(liveVerifier).toContain("reject(liveCommandTimeoutError(options.stepTimeoutMs))");
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
