import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const rootDir = resolve(import.meta.dirname, "..");
const packageJson = JSON.parse(readFileSync(resolve(rootDir, "package.json"), "utf8"));
const npmExecPath = process.env.npm_execpath;

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

  verifyInstalledCliEntryContract(installDir);
  await verifyInstalledCheckoutHandoffContract(installDir);
  verifyInstalledLiveVerifierContract(installDir);
  const runtimeModules = await loadRootRuntimeModules();
  verifyInstalledCli(zepoBin, runtimeModules);
} finally {
  removeTree(tempRoot);
}

function verifyInstalledCliEntryContract(prefixDir) {
  const packageDir = join(prefixDir, "node_modules", packageJson.name);
  const installedPackageJson = JSON.parse(readFileSync(join(packageDir, "package.json"), "utf8"));
  const installedCliPath = join(packageDir, "dist", "index.js");

  assert(installedPackageJson.bin?.zepo === "./dist/index.js", "expected installed package bin zepo entry");
  assert(existsSync(installedCliPath), "expected installed dist/index.js");
  assert(
    readFileSync(installedCliPath, "utf8").startsWith("#!/usr/bin/env node\n"),
    "expected installed CLI entry to keep node shebang"
  );
  console.log("pass installed CLI entry contract");
}

async function verifyInstalledCheckoutHandoffContract(prefixDir) {
  const checkoutModulePath = join(prefixDir, "node_modules", packageJson.name, "dist", "commands", "checkout.js");
  const { checkoutHandoffOutput } = await import(pathToFileURL(checkoutModulePath).href);
  assertCheckoutHandoffContract(checkoutHandoffOutput());
  console.log("pass installed checkout handoff contract");
}

function verifyInstalledLiveVerifierContract(prefixDir) {
  const packageDir = join(prefixDir, "node_modules", packageJson.name);
  const installedPackageJson = JSON.parse(readFileSync(join(packageDir, "package.json"), "utf8"));
  const liveReportUtilsPath = join(packageDir, "scripts", "live-report-utils.mjs");
  const liveVerifierPath = join(packageDir, "scripts", "verify-live-flow.mjs");

  assert(
    installedPackageJson.scripts?.["verify:live"] === "node scripts/verify-live-flow.mjs",
    "expected installed verify:live package script"
  );
  assert(existsSync(liveReportUtilsPath), "expected installed live-report-utils script");
  assert(existsSync(liveVerifierPath), "expected installed verify-live-flow script");

  const result = runNpm(["run", "--prefix", packageDir, "verify:live", "--", "--help"], { cwd: rootDir });
  assert(result.stdout.includes("human-controlled live verification"), "expected installed verify:live help output");
  assert(result.stdout.includes("--reorder-last"), "expected installed verify:live reorder option");
  assert(result.stdout.includes("omits raw page text"), "expected installed verify:live sanitized-report guidance");
  console.log("pass installed live verifier contract");
}

async function loadRootRuntimeModules() {
  const browser = await import(pathToFileURL(resolve(rootDir, "dist", "automation", "browser.js")).href);
  const paths = await import(pathToFileURL(resolve(rootDir, "dist", "config", "paths.js")).href);
  const sqlite = await import(pathToFileURL(resolve(rootDir, "dist", "storage", "sqlite.js")).href);

  return {
    headlessBrowserRunHistoryMetaKey: browser.HEADLESS_BROWSER_RUN_HISTORY_META_KEY,
    lastAccessChallengeMetaKey: browser.LAST_ACCESS_CHALLENGE_META_KEY,
    resolveAppPaths: paths.resolveAppPaths,
    SqliteStore: sqlite.SqliteStore
  };
}

function verifyInstalledCli(zepoBin, runtimeModules) {
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
      name: "installed doctor skip browser json",
      args: ["--data-dir", dataDir, "doctor", "--skip-browser", "--json"],
      expect: ({ status, stdout }) => {
        assert(status === 0, "expected exit code 0");
        const payload = parseJson(stdout, "stdout");
        assertDoctorReport(payload, dataDir);
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
        assert(String(payload.error?.hint).includes("zepo --data-dir <path> doctor"), "expected data-dir doctor hint");
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
      name: "installed json unknown option",
      args: ["--json", "status", "--bad-option"],
      expect: (result) => {
        expectJsonError(result, "invalid_input", "error: unknown option '--bad-option'", "invalid_input");
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
      name: "installed invalid phone prefill",
      args: ["--data-dir", dataDir, "login", "--phone", "abc", "--json"],
      expect: (result) => {
        expectJsonError(result, "user_error", "Phone number must be a valid 10-digit Indian mobile number.", "invalid_input");
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
      name: "installed access cooldown before browser",
      args: () => {
        const cooldownDataDir = join(tempRoot, "data-access-cooldown");
        setRuntimeMeta(runtimeModules, cooldownDataDir, runtimeModules.lastAccessChallengeMetaKey, String(Date.now()));
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
          runtimeModules.headlessBrowserRunHistoryMetaKey,
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
    }
  ];

  for (const check of checks) {
    const args = typeof check.args === "function" ? check.args() : check.args;
    const result = runInstalledCli(zepoBin, args);
    check.expect(result);
    console.log(`pass ${check.name}`);
  }
}

function resolveInstalledBin(prefixDir, commandName) {
  const binName = process.platform === "win32" ? `${commandName}.cmd` : commandName;
  return join(prefixDir, "node_modules", ".bin", binName);
}

function runInstalledCli(zepoBin, args) {
  const result = spawnInstalledBin(zepoBin, args, {
    cwd: rootDir,
    encoding: "utf8",
    env: {
      ...process.env,
      FORCE_COLOR: "0",
      NO_COLOR: "1"
    }
  });

  if (result.error) {
    throw result.error;
  }

  return normalizeResult(result);
}

function runNpm(args, options) {
  assert(npmExecPath, "expected npm_execpath to run npm package verification");
  return run(process.execPath, [npmExecPath, ...args], options);
}

function run(command, args, options) {
  const result = spawnSync(command, args, {
    ...options,
    encoding: "utf8"
  });

  if (result.error) {
    throw result.error;
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

function setRuntimeMeta(runtimeModules, targetDataDir, key, value) {
  const sqlite = new runtimeModules.SqliteStore(runtimeModules.resolveAppPaths(targetDataDir).dbPath);
  try {
    sqlite.setMeta(key, value);
  } finally {
    sqlite.close();
  }
}

function assertFreshCache(cache) {
  assert(cache?.searches === 0, "expected empty search cache");
  assert(cache?.cartSnapshots === 0, "expected empty cart snapshot cache");
  assert(cache?.addresses === 0, "expected empty address cache");
  assert(cache?.orders === 0, "expected empty order cache");
}

function assertFreshStatus(payload, expectedDataDir) {
  assertFreshCache(payload.cache);
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

function assertDoctorReport(payload, expectedDataDir) {
  assert(payload.ok === true, "expected doctor ok true");
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
  assert(!checkNames.includes("Playwright Chromium"), "expected browser check to be skipped");
}

function assertCheckoutHandoffContract(payload) {
  assert(payload.status === "checkout_handoff_returned", "expected installed checkout handoff status");
  assert(payload.payment === "handled_by_zepto", "expected installed Zepto-handled payment marker");
  assert(payload.paymentStatus === "not_observed_by_zepocli", "expected installed unobserved payment status");
  assert(payload.orderPlacement === "not_confirmed_by_zepocli", "expected installed unconfirmed order placement");
  assert(payload.orderStatusCommand === "zepo track", "expected installed track next command");
  assert(String(payload.next).includes("Complete payment in Zepto"), "expected installed checkout next-step guidance");
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
