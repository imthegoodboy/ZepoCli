import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const rootDir = resolve(import.meta.dirname, "..");
const cliPath = resolve(rootDir, "dist", "index.js");
const packageJson = JSON.parse(readFileSync(resolve(rootDir, "package.json"), "utf8"));
const CLI_COMMAND_TIMEOUT_MS = 120_000;
const { checkoutHandoffOutput } = await import(pathToFileURL(resolve(rootDir, "dist", "commands", "checkout.js")).href);
const { HEADLESS_BROWSER_RUN_HISTORY_META_KEY, LAST_ACCESS_CHALLENGE_META_KEY } = await import(
  pathToFileURL(resolve(rootDir, "dist", "automation", "browser.js")).href
);
const { resolveAppPaths } = await import(pathToFileURL(resolve(rootDir, "dist", "config", "paths.js")).href);
const { SqliteStore } = await import(pathToFileURL(resolve(rootDir, "dist", "storage", "sqlite.js")).href);

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

verifyLocalCliEntryContract();

const checks = [
  {
    name: "checkout handoff contract",
    args: undefined,
    expect: () => {
      assertCheckoutHandoffContract(checkoutHandoffOutput());
    }
  },
  {
    name: "help",
    args: ["--help"],
    expect: ({ status, stdout }) => {
      assert(status === 0, "expected exit code 0");
      assert(stdout.includes("Developer CLI for user-directed Zepto workflows"), "expected CLI description");
      assert(stdout.includes("--no-input"), "expected --no-input in help output");
      assert(stdout.includes("checkout"), "expected checkout command in help output");
    }
  },
  {
    name: "login help",
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
    name: "logout help",
    args: ["logout", "--help"],
    expect: ({ status, stdout, stderr }) => {
      assert(status === 0, "expected exit code 0");
      assert(stderr === "", "expected empty stderr");
      assert(stdout.includes("Remove the locally saved Zepto session"), "expected logout description");
      assert(stdout.includes("--json"), "expected logout json option");
    }
  },
  {
    name: "status help",
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
    name: "doctor help",
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
    name: "search help",
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
    name: "add help",
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
    name: "cart help",
    args: ["cart", "--help"],
    expect: ({ status, stdout, stderr }) => {
      assert(status === 0, "expected exit code 0");
      assert(stderr === "", "expected empty stderr");
      assert(stdout.includes("Show Zepto cart"), "expected cart description");
      assert(stdout.includes("--json"), "expected cart json option");
    }
  },
  {
    name: "remove help",
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
    name: "clear help",
    args: ["clear", "--help"],
    expect: ({ status, stdout, stderr }) => {
      assert(status === 0, "expected exit code 0");
      assert(stderr === "", "expected empty stderr");
      assert(stdout.includes("Remove all detected items from the Zepto cart"), "expected clear description");
      assert(stdout.includes("--json"), "expected clear json option");
    }
  },
  {
    name: "address help",
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
    name: "address list help",
    args: ["address", "list", "--help"],
    expect: ({ status, stdout, stderr }) => {
      assert(status === 0, "expected exit code 0");
      assert(stderr === "", "expected empty stderr");
      assert(stdout.includes("List addresses detected from Zepto"), "expected address list description");
      assert(stdout.includes("--json"), "expected address list json option");
    }
  },
  {
    name: "address use help",
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
    name: "address add help",
    args: ["address", "add", "--help"],
    expect: ({ status, stdout, stderr }) => {
      assert(status === 0, "expected exit code 0");
      assert(stderr === "", "expected empty stderr");
      assert(stdout.includes("Open Zepto address flow in the browser"), "expected address add description");
      assert(stdout.includes("--json"), "expected address add json option");
    }
  },
  {
    name: "checkout help",
    args: ["checkout", "--help"],
    expect: ({ status, stdout, stderr }) => {
      assert(status === 0, "expected exit code 0");
      assert(stderr === "", "expected empty stderr");
      assert(stdout.includes("Open Zepto checkout for user-completed payment"), "expected checkout description");
      assert(stdout.includes("--json"), "expected checkout json option");
    }
  },
  {
    name: "track help",
    args: ["track", "--help"],
    expect: ({ status, stdout, stderr }) => {
      assert(status === 0, "expected exit code 0");
      assert(stderr === "", "expected empty stderr");
      assert(stdout.includes("Show latest Zepto order status"), "expected track description");
      assert(stdout.includes("--json"), "expected track json option");
    }
  },
  {
    name: "history help",
    args: ["history", "--help"],
    expect: ({ status, stdout, stderr }) => {
      assert(status === 0, "expected exit code 0");
      assert(stderr === "", "expected empty stderr");
      assert(stdout.includes("Show Zepto order history"), "expected history description");
      assert(stdout.includes("--json"), "expected history json option");
    }
  },
  {
    name: "reorder help",
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
    name: "version",
    args: ["--version"],
    expect: ({ status, stdout, stderr }) => {
      assert(status === 0, "expected exit code 0");
      assert(stderr === "", "expected empty stderr");
      assert(stdout === packageJson.version, "expected CLI version to match package.json");
    }
  },
  {
    name: "status human",
    args: ({ dataDir }) => ["--data-dir", dataDir, "status"],
    expect: ({ status, stdout, stderr }) => {
      assert(status === 0, "expected exit code 0");
      assert(stderr === "", "expected empty stderr");
      assert(stdout.includes(`Version: ${packageJson.version}`), "expected status to print package version");
      assert(stdout.includes("Confirmed session:"), "expected status readiness output");
    }
  },
  {
    name: "doctor skip browser human",
    args: ({ dataDir }) => ["--data-dir", dataDir, "doctor", "--skip-browser"],
    expect: ({ status, stdout, stderr }) => {
      assert(status === 0, "expected exit code 0");
      assert(stderr === "", "expected empty stderr");
      assert(stdout.includes("ZepoCli doctor"), "expected doctor heading");
      assert(stdout.includes(`Version: ${packageJson.version}`), "expected doctor to print package version");
    }
  },
  {
    name: "status json",
    args: ({ dataDir }) => ["--data-dir", dataDir, "status", "--json"],
    expect: ({ status, stdout }, { dataDir }) => {
      assert(status === 0, "expected exit code 0");
      const payload = parseJson(stdout, "stdout");
      assertFreshStatus(payload, dataDir);
    }
  },
  {
    name: "global json status",
    args: ({ dataDir }) => ["--data-dir", dataDir, "--json", "status"],
    expect: ({ status, stdout, stderr }, { dataDir }) => {
      assert(status === 0, "expected exit code 0");
      assert(stderr === "", "expected empty stderr");
      const payload = parseJson(stdout, "stdout");
      assertFreshStatus(payload, dataDir);
    }
  },
  {
    name: "global json no session cart",
    args: ({ dataDir }) => ["--data-dir", dataDir, "--json", "cart"],
    expect: (result) => {
      expectJsonError(result, "user_error", "No confirmed Zepto session found.", "no_confirmed_session");
    }
  },
  {
    name: "global json no session nested address list",
    args: ({ dataDir }) => ["--data-dir", dataDir, "--json", "address", "list"],
    expect: (result) => {
      expectJsonError(result, "user_error", "No confirmed Zepto session found.", "no_confirmed_session");
    }
  },
  {
    name: "status live skipped json",
    args: ({ dataDir }) => ["--data-dir", dataDir, "status", "--live", "--json"],
    expect: ({ status, stdout, stderr }, { dataDir }) => {
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
    name: "status old active browser lock json",
    args: ({ dataDir }) => {
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
    expect: ({ status, stdout }, { dataDir }) => {
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
    }
  },
  {
    name: "status malformed stale browser lock json",
    args: ({ dataDir }) => {
      const lockPath = join(dataDir, "browser.lock");
      writeFileSync(lockPath, "{}");
      utimesSync(lockPath, new Date(10_000), new Date(10_000));
      return ["--data-dir", dataDir, "status", "--json"];
    },
    expect: ({ status, stdout }, { dataDir }) => {
      assert(status === 0, "expected exit code 0");
      const payload = parseJson(stdout, "stdout");
      assert(payload.browserLock?.path === join(dataDir, "browser.lock"), "expected malformed lock path");
      assert(payload.browserLock?.present === true, "expected malformed lock present");
      assert(payload.browserLock?.stale === true, "expected malformed lock to be stale");
      assert(payload.browserLock?.staleReason === "expired", "expected malformed lock expired stale reason");
      assert(typeof payload.browserLock?.createdAt === "string", "expected malformed lock createdAt from mtime");
      assert(payload.browserAutomation?.ready === true, "expected stale malformed lock not to block automation");
      assert(
        !payload.browserAutomation?.reasons?.includes("browser_lock_active"),
        "expected stale malformed lock not to report active lock reason"
      );
    }
  },
  {
    name: "doctor skip browser json",
    args: ({ dataDir }) => ["--data-dir", dataDir, "doctor", "--skip-browser", "--json"],
    expect: ({ status, stdout }, { dataDir }) => {
      assert(status === 0, "expected exit code 0");
      const payload = parseJson(stdout, "stdout");
      assertDoctorReport(payload, dataDir);
    }
  },
  {
    name: "doctor browser json",
    args: ({ dataDir }) => ["--data-dir", dataDir, "doctor", "--json"],
    expect: ({ status, stdout }, { dataDir }) => {
      assert(status === 0, "expected exit code 0");
      const payload = parseJson(stdout, "stdout");
      assertDoctorReport(payload, dataDir, { browser: true });
    }
  },
  {
    name: "logout json",
    args: ({ dataDir }) => ["--data-dir", dataDir, "logout", "--json"],
    expect: ({ status, stdout, stderr }) => {
      assert(status === 0, "expected exit code 0");
      assert(stderr === "", "expected empty stderr");
      const payload = parseJson(stdout, "stdout");
      assert(payload.status === "session_removed", "expected logout status");
      assert(payload.sessionRemoved === true, "expected logout confirmation");
      assert(payload.cacheCleared === true, "expected logout cache cleanup confirmation");
      assert(
        payload.next === "Run `zepo login` before account-dependent commands.",
        "expected logout next-step guidance"
      );
    }
  },
  {
    name: "logout active browser lock json",
    args: ({ dataDir }) => {
      const authStatePath = join(dataDir, "storage", "auth-state.json");
      const profileFile = join(dataDir, "storage", "browser-profile", "Default", "Cookies");
      mkdirSync(join(dataDir, "storage", "browser-profile", "Default"), { recursive: true });
      writeFileSync(authStatePath, "{}");
      writeFileSync(profileFile, "cookie-data");
      writeFileSync(
        join(dataDir, "browser.lock"),
        JSON.stringify({
          token: "active",
          pid: process.pid,
          createdAt: Date.now()
        })
      );
      return ["--data-dir", dataDir, "logout", "--json"];
    },
    expect: (result, { dataDir }) => {
      expectJsonError(
        result,
        "user_error",
        "Another ZepoCli browser command is already running for this data directory.",
        "browser_lock_active"
      );
      assert(existsSync(join(dataDir, "storage", "auth-state.json")), "expected auth state to be preserved");
      assert(
        existsSync(join(dataDir, "storage", "browser-profile", "Default", "Cookies")),
        "expected browser profile data to be preserved"
      );
    }
  },
  {
    name: "json invalid input",
    args: ["--timeout", "1e3", "status", "--json"],
    expect: (result) => {
      const payload = expectJsonError(result, "invalid_input", "Invalid input.", "invalid_input");
      assert(payload.error?.issues?.[0]?.path === "timeout", "expected timeout validation issue");
      assert(
        payload.error?.issues?.[0]?.message === "must be a decimal integer number of milliseconds",
        "expected timeout format message"
      );
    }
  },
  {
    name: "json invalid timeout range",
    args: ["--timeout", "999", "status", "--json"],
    expect: (result) => {
      const payload = expectJsonError(result, "invalid_input", "Invalid input.", "invalid_input");
      assert(payload.error?.issues?.[0]?.path === "timeout", "expected timeout validation issue");
      assert(payload.error?.issues?.[0]?.message === "must be at least 1000 ms", "expected timeout minimum message");
    }
  },
  {
    name: "json blank data dir",
    args: ["--data-dir", "   ", "status", "--json"],
    expect: (result) => {
      const payload = expectJsonError(result, "invalid_input", "Invalid input.", "invalid_input");
      assert(payload.error?.issues?.[0]?.path === "dataDir", "expected dataDir validation issue");
      assert(payload.error?.issues?.[0]?.message === "must not be blank", "expected blank data dir message");
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
    name: `json blank ${testCase.name} query`,
    args: ({ dataDir }) => ["--data-dir", dataDir, ...testCase.args],
    expect: (result) => {
      expectJsonError(result, "user_error", testCase.message, "invalid_input");
      assert(!result.stderr.includes("No confirmed Zepto session found."), "expected blank query to fail before session work");
    }
  })),
  {
    name: "json unknown command",
    args: ["--json", "not-a-command"],
    expect: (result) => {
      expectJsonError(result, "invalid_input", "error: unknown command 'not-a-command'", "invalid_input");
    }
  },
  {
    name: "json unknown option",
    args: ["--json", "status", "--bad-option"],
    expect: (result) => {
      expectJsonError(result, "invalid_input", "error: unknown option '--bad-option'", "invalid_input");
    }
  },
  {
    name: "json encoded sensitive unknown option redaction",
    args: ["--json", "status", "--phone=%2B91+98765+43210"],
    expect: (result) => {
      expectJsonError(result, "invalid_input", "error: unknown option '--phone=<redacted-phone>'", "invalid_input");
      assert(!result.stderr.includes("%2B91"), "expected JSON parser error to omit encoded phone value");
      assert(!result.stderr.includes("98765+43210"), "expected JSON parser error to omit plus-encoded phone value");
    }
  },
  {
    name: "json missing nested argument",
    args: ({ dataDir }) => ["--data-dir", dataDir, "--json", "address", "use"],
    expect: (result) => {
      expectJsonError(result, "invalid_input", "error: missing required argument 'query'", "invalid_input");
    }
  },
  {
    name: "json unknown nested command",
    args: ({ dataDir }) => ["--data-dir", dataDir, "--json", "address", "nope"],
    expect: (result) => {
      expectJsonError(result, "invalid_input", "error: unknown command 'nope'", "invalid_input");
    }
  },
  {
    name: "json unsupported reorder target",
    args: ({ dataDir }) => ["--data-dir", dataDir, "reorder", "previous", "--json"],
    expect: (result) => {
      expectJsonError(result, "user_error", "Only `zepo reorder last` is supported.", "unsupported_operation");
    }
  },
  {
    name: "json runtime setup error",
    args: ({ dataDir }) => {
      const blockedPath = join(dataDir, "blocked-file");
      writeFileSync(blockedPath, "not a directory");
      return ["--data-dir", blockedPath, "status", "--json"];
    },
    expect: (result, { dataDir }) => {
      const blockedPath = join(dataDir, "blocked-file");
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
      assert(!result.stderr.includes(blockedPath), "expected JSON runtime setup error to omit raw data-dir path");
      assert(String(payload.error?.hint).includes("zepo --data-dir <path> doctor"), "expected data-dir doctor hint");
    }
  },
  {
    name: "human runtime setup redaction",
    args: ({ dataDir }) => {
      const blockedPath = join(dataDir, "blocked-file");
      writeFileSync(blockedPath, "not a directory");
      return ["--data-dir", blockedPath, "status"];
    },
    expect: (result, { dataDir }) => {
      const blockedPath = join(dataDir, "blocked-file");
      assert(result.status === 1, "expected exit code 1");
      assert(result.stdout === "", "expected empty stdout");
      assert(result.stderr.includes("Could not initialize local ZepoCli storage"), "expected runtime setup message");
      assert(result.stderr.includes("<redacted-local-path>"), "expected human redacted data-dir path");
      assert(!result.stderr.includes(blockedPath), "expected human runtime setup error to omit raw data-dir path");
      assert(result.stderr.includes("zepo --data-dir <path> doctor"), "expected data-dir doctor hint");
    }
  },
  {
    name: "json no session",
    args: ({ dataDir }) => ["--data-dir", dataDir, "cart", "--json"],
    expect: (result) => {
      expectJsonError(result, "user_error", "No confirmed Zepto session found.", "no_confirmed_session");
    }
  },
  ...accountDependentNoSessionCommands.map((command) => ({
    name: `no session ${command.name}`,
    args: ({ dataDir }) => ["--data-dir", dataDir, ...command.args],
    expect: (result) => {
      expectJsonError(result, "user_error", "No confirmed Zepto session found.", "no_confirmed_session");
    }
  })),
  {
    name: "no input login",
    args: ({ dataDir }) => ["--data-dir", dataDir, "--no-input", "login", "--json"],
    expect: (result) => {
      expectJsonError(result, "user_error", "Zepto login requires interactive input.", "interactive_input_required");
    }
  },
  {
    name: "invalid phone prefill",
    args: ({ dataDir }) => ["--data-dir", dataDir, "login", "--phone", "phone 9876543210", "--json"],
    expect: (result) => {
      const payload = expectJsonError(
        result,
        "user_error",
        "Phone number must be a valid 10-digit Indian mobile number.",
        "invalid_input"
      );
      assert(String(payload.error?.hint).includes("<redacted-phone>"), "expected redacted phone hint");
      assert(!result.stderr.includes("9876543210"), "expected JSON phone error to omit raw phone-shaped value");
    }
  },
  {
    name: "human invalid phone prefill redaction",
    args: ({ dataDir }) => ["--data-dir", dataDir, "login", "--phone", "phone 9876543210"],
    expect: (result) => {
      assert(result.status === 1, "expected exit code 1");
      assert(result.stdout === "", "expected empty stdout");
      assert(result.stderr.includes("Phone number must be a valid 10-digit Indian mobile number."), "expected phone message");
      assert(result.stderr.includes("<redacted-phone>"), "expected human redacted phone hint");
      assert(!result.stderr.includes("9876543210"), "expected human phone error to omit raw phone-shaped value");
    }
  },
  {
    name: "no input address add",
    args: ({ dataDir }) => ["--data-dir", dataDir, "--no-input", "address", "add", "--json"],
    expect: (result) => {
      expectJsonError(result, "user_error", "Zepto address add requires interactive input.", "interactive_input_required");
    }
  },
  {
    name: "no input checkout",
    args: ({ dataDir }) => ["--data-dir", dataDir, "--no-input", "checkout", "--json"],
    expect: (result) => {
      expectJsonError(result, "user_error", "Zepto checkout requires interactive input.", "interactive_input_required");
    }
  },
  {
    name: "no input choose",
    args: ({ dataDir }) => ["--data-dir", dataDir, "--no-input", "add", "milk", "--choose", "--json"],
    expect: (result) => {
      expectJsonError(result, "user_error", "Interactive product selection requires input.", "interactive_input_required");
    }
  },
  {
    name: "invalid search limit json",
    args: ({ dataDir }) => ["--data-dir", dataDir, "search", "milk", "--limit", "0", "--json"],
    expect: (result) => {
      expectJsonError(result, "user_error", "Search limit must be an integer from 1 to 50.", "invalid_input");
    }
  },
  {
    name: "invalid search limit format json",
    args: ({ dataDir }) => ["--data-dir", dataDir, "search", "milk", "--limit", "1e1", "--json"],
    expect: (result) => {
      expectJsonError(result, "user_error", "Search limit must be an integer from 1 to 50.", "invalid_input");
    }
  },
  {
    name: "json access cooldown before browser",
    args: ({ dataDir }) => {
      setRuntimeMeta(dataDir, LAST_ACCESS_CHALLENGE_META_KEY, String(Date.now()));
      return ["--data-dir", dataDir, "search", "milk", "--json"];
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
    name: "json headless throttle before browser",
    args: ({ dataDir }) => {
      setRuntimeMeta(
        dataDir,
        HEADLESS_BROWSER_RUN_HISTORY_META_KEY,
        JSON.stringify(Array.from({ length: 8 }, (_, index) => Date.now() - index))
      );
      return ["--data-dir", dataDir, "search", "milk", "--json"];
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
    name: "invalid add quantity cap",
    args: ({ dataDir }) => ["--data-dir", dataDir, "add", "milk", "--quantity", "13", "--json"],
    expect: (result) => {
      expectJsonError(result, "user_error", "Quantity must be an integer from 1 to 12.", "invalid_input");
    }
  },
  {
    name: "invalid add quantity format",
    args: ({ dataDir }) => ["--data-dir", dataDir, "add", "milk", "--quantity", "0x2", "--json"],
    expect: (result) => {
      expectJsonError(result, "user_error", "Quantity must be an integer from 1 to 12.", "invalid_input");
    }
  }
];

for (const check of checks) {
  const dataDir = mkdtempSync(join(tmpdir(), "zepo-cli-smoke-"));
  try {
    const args = typeof check.args === "function" ? check.args({ dataDir }) : check.args;
    const result = args ? runCli(args) : { status: 0, stdout: "", stderr: "" };
    check.expect(result, { dataDir });
    console.log(`pass ${check.name}`);
  } finally {
    removeTree(dataDir);
  }
}

// Some imported runtime dependencies can leave native process state alive even after
// the smoke checks finish. Exit explicitly so the release gate cannot hang after passing.
process.exit(0);

function runCli(args) {
  const result = spawnSync(process.execPath, [cliPath, ...args], {
    cwd: rootDir,
    encoding: "utf8",
    killSignal: "SIGTERM",
    timeout: CLI_COMMAND_TIMEOUT_MS,
    env: {
      ...process.env,
      FORCE_COLOR: "0",
      NO_COLOR: "1"
    }
  });

  if (result.error) {
    throwSpawnError(result.error, process.execPath, [cliPath, ...args], CLI_COMMAND_TIMEOUT_MS);
  }

  return {
    status: result.status ?? 1,
    stdout: result.stdout.trim(),
    stderr: result.stderr.trim()
  };
}

function throwSpawnError(error, command, args, timeoutMs) {
  if (error && error.code === "ETIMEDOUT") {
    throw new Error(`Command timed out after ${timeoutMs} ms: ${command} ${args.join(" ")}`);
  }

  throw error;
}

function verifyLocalCliEntryContract() {
  assert(packageJson.bin?.zepo === "./dist/index.js", "expected package bin zepo to point at dist/index.js");
  const compiledEntry = readFileSync(cliPath, "utf8");
  assert(compiledEntry.startsWith("#!/usr/bin/env node\n"), "expected compiled CLI entry to keep node shebang");
  console.log("pass local CLI entry contract");
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

function setRuntimeMeta(dataDir, key, value) {
  const sqlite = new SqliteStore(resolveAppPaths(dataDir).dbPath);
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

function assertFreshStatus(payload, dataDir) {
  assertFreshCache(payload.cache);
  assert(payload.version === packageJson.version, "expected status version to match package.json");
  assert(payload.dataDir === dataDir, "expected status to use disposable data dir");
  assert(payload.confirmedSession === false, "expected fresh data dir to be logged out");
  assert(payload.browserLock?.path === join(dataDir, "browser.lock"), "expected browser lock path");
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

function assertDoctorReport(payload, dataDir, options = { browser: false }) {
  assert(payload.ok === true, "expected doctor ok true");
  assert(payload.version === packageJson.version, "expected doctor version to match package.json");
  assert(payload.dataDir === dataDir, "expected doctor data dir");
  assert(payload.browserLock?.path === join(dataDir, "browser.lock"), "expected doctor browser lock path");
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
  assert(payload.status === "checkout_handoff_returned", "expected checkout handoff status");
  assert(payload.payment === "handled_by_zepto", "expected Zepto-handled payment marker");
  assert(payload.paymentStatus === "not_observed_by_zepocli", "expected unobserved payment status");
  assert(payload.orderPlacement === "not_confirmed_by_zepocli", "expected unconfirmed order placement");
  assert(payload.orderStatusCommand === "zepo track", "expected track next command");
  assert(String(payload.next).includes("Complete payment in Zepto"), "expected checkout handoff next-step guidance");
}

function parseJson(text, streamName) {
  try {
    return JSON.parse(text);
  } catch (error) {
    throw new Error(`Could not parse ${streamName} as JSON: ${text}`);
  }
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function removeTree(path) {
  rmSync(path, {
    recursive: true,
    force: true,
    maxRetries: 10,
    retryDelay: 100
  });
}
