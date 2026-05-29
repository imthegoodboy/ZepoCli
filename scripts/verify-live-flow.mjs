#!/usr/bin/env node
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

import {
  parseJsonFromOutput,
  redactArgsForLiveConsole,
  redactArgsForLiveReport,
  summarizeCommandError
} from "./live-report-utils.mjs";

const rootDir = resolve(import.meta.dirname, "..");
const cliPath = resolve(rootDir, "dist", "index.js");

const options = parseArgs(process.argv.slice(2));

if (options.help) {
  printHelp();
  process.exit(0);
}

validateOptions(options);

if (!options.dataDir) {
  console.error("Missing required --data-dir <path>.");
  console.error("Use a dedicated persistent data directory, for example: npm run verify:live -- --data-dir ./.zepo-live --login");
  process.exit(1);
}

if (!existsSync(cliPath)) {
  console.error("Compiled CLI was not found at dist/index.js. Run `npm run build` before `npm run verify:live`.");
  process.exit(1);
}

const reportPath = options.report ?? resolve(options.dataDir, "live-verification-report.json");
const report = {
  ok: true,
  generatedAt: new Date().toISOString(),
  dataDir: "<redacted-data-dir>",
  reportPath: "<redacted-report-path>",
  note:
    "Sanitized ZepoCli live verification report. It omits raw Zepto page text, addresses, cart item names, payment credentials, order ids, phone input, local filesystem paths, and unredacted workflow query arguments.",
  steps: []
};

await main();

mkdirSync(dirname(reportPath), { recursive: true });
writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
console.log(`\nLive verification report: ${reportPath}`);
process.exitCode = report.ok ? 0 : 1;

async function main() {
  console.log("ZepoCli live verification runner");
  console.log("This runs real CLI commands against Zepto with a human-controlled browser when needed.");
  console.log("It never enters OTPs, payment credentials, or clicks final Zepto payment/order controls.\n");

  if (!(await runStep("doctor", ["--data-dir", options.dataDir, "doctor", "--skip-browser", "--json"])).ok) {
    return;
  }

  const status = await runStep("status", ["--data-dir", options.dataDir, "status", "--json"]);
  if (!status.ok) {
    return;
  }

  if (status.payload?.confirmedSession !== true) {
    if (!options.login) {
      addManualFailure(
        "login",
        "No confirmed Zepto session is available.",
        "Rerun with --login so a human can complete Zepto login/OTP in the visible browser."
      );
      return;
    }

    const loginArgs = ["--data-dir", options.dataDir, "--visible", "login", "--json"];
    if (options.phone) {
      loginArgs.splice(loginArgs.length - 1, 0, "--phone", options.phone);
    }
    if (!(await runStep("login", loginArgs)).ok) {
      return;
    }
  }

  const liveStatus = await runStep("status live", [
    "--data-dir",
    options.dataDir,
    "--visible",
    "status",
    "--live",
    "--json"
  ]);

  if (liveStatus.payload?.liveSession?.state !== "logged-in") {
    addManualFailure(
      "live session",
      "Zepto live session was not verified as logged-in.",
      "Run `zepo status --live --visible --json` or `zepo login` before cart, address, checkout, or order verification."
    );
    return;
  }

  if (options.search) {
    if (!(await runStep("search", ["--data-dir", options.dataDir, "--visible", "search", options.search, "--json"])).ok) {
      return;
    }
  }

  if (options.addressAdd) {
    if (!(await runStep("address add", ["--data-dir", options.dataDir, "--visible", "address", "add", "--json"])).ok) {
      return;
    }
  }

  if (options.address) {
    if (!(await runStep("address use", [
      "--data-dir",
      options.dataDir,
      "--visible",
      "address",
      "use",
      options.address,
      "--json"
    ])).ok) {
      return;
    }
  } else if (options.addressList) {
    if (!(await runStep("address list", ["--data-dir", options.dataDir, "--visible", "address", "list", "--json"])).ok) {
      return;
    }
  }

  if (options.add) {
    if (!(await runStep("add", [
      "--data-dir",
      options.dataDir,
      "--visible",
      "add",
      options.add,
      "--quantity",
      String(options.quantity),
      "--json"
    ])).ok) {
      return;
    }
  }

  if (options.reorderLast) {
    console.error(
      "\nReorder verification clicks Zepto's explicit reorder/order-again control for the latest readable order and may add those items back to the cart. Review the visible browser before checkout."
    );
    if (!(await runStep("reorder", ["--data-dir", options.dataDir, "--visible", "reorder", "last", "--json"])).ok) {
      return;
    }
  }

  if (options.remove) {
    console.error(
      "\nRemove verification changes the Zepto cart by clicking a matching removable item row. Review the visible browser before checkout."
    );
    if (!(await runStep("remove", ["--data-dir", options.dataDir, "--visible", "remove", options.remove, "--json"])).ok) {
      return;
    }
  }

  if (options.clear) {
    console.error(
      "\nClear verification removes all detected Zepto cart items. Run it only when this test cart can be emptied."
    );
    if (!(await runStep("clear", ["--data-dir", options.dataDir, "--visible", "clear", "--json"])).ok) {
      return;
    }
  }

  if (options.cart || options.add || options.reorderLast || options.remove || options.clear) {
    if (!(await runStep("cart", ["--data-dir", options.dataDir, "--visible", "cart", "--json"])).ok) {
      return;
    }
  }

  if (options.checkout) {
    console.error(
      "\nCheckout verification opens Zepto checkout/payment in a visible browser. Complete only the Zepto-side actions you choose; ZepoCli will not click final payment or order-placement controls."
    );
    if (!(await runStep("checkout", ["--data-dir", options.dataDir, "--visible", "checkout", "--json"])).ok) {
      return;
    }
  }

  if (options.track) {
    if (!(await runStep("track", ["--data-dir", options.dataDir, "--visible", "track", "--json"])).ok) {
      return;
    }
  }

  if (options.history) {
    await runStep("history", ["--data-dir", options.dataDir, "--visible", "history", "--json"]);
  }
}

async function runStep(name, args) {
  console.log(`> zepo ${redactArgsForLiveConsole(args).join(" ")}`);
  const result = await runCli(args);
  const payload = parseJsonFromOutput(result.stdout);
  const errorPayload = parseJsonFromOutput(result.stderr)?.error;
  const step = {
    name,
    command: `zepo ${redactArgsForLiveReport(args).join(" ")}`,
    exitCode: result.status,
    ok: result.status === 0,
    ...(payload ? { summary: summarizePayload(name, payload) } : {}),
    ...(result.status !== 0 ? { error: summarizeCommandError(errorPayload, result.stderr, args) } : {})
  };
  report.steps.push(step);

  if (step.ok) {
    console.log(`pass ${name}`);
  } else {
    report.ok = false;
    console.log(`fail ${name}`);
  }

  return {
    ...step,
    payload
  };
}

function runCli(args) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(process.execPath, [cliPath, ...args], {
      cwd: rootDir,
      env: {
        ...process.env,
        FORCE_COLOR: "0",
        NO_COLOR: "1"
      },
      stdio: ["inherit", "pipe", "pipe"]
    });

    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
      process.stderr.write(chunk);
    });
    child.on("error", reject);
    child.on("close", (status) => {
      resolvePromise({
        status: status ?? 1,
        stdout: stdout.trim(),
        stderr: stderr.trim()
      });
    });
  });
}

function addManualFailure(name, message, hint) {
  report.ok = false;
  report.steps.push({
    name,
    command: "manual",
    exitCode: 1,
    ok: false,
    error: {
      code: "live_verification_incomplete",
      message,
      hint
    }
  });
  console.log(`fail ${name}`);
  console.log(hint);
}

function summarizePayload(name, payload) {
  if (name === "doctor") {
    const checks = Array.isArray(payload.checks) ? payload.checks : [];
    return {
      ok: payload.ok === true,
      warnings: checks.filter((check) => check.status === "warn").map((check) => check.name),
      failures: checks.filter((check) => check.status === "fail").map((check) => check.name)
    };
  }

  if (name === "status" || name === "status live") {
    return {
      confirmedSession: payload.confirmedSession === true,
      browserAutomationReady: payload.browserAutomation?.ready === true,
      liveSessionState: payload.liveSession?.state
    };
  }

  if (name === "search") {
    return {
      productCount: Array.isArray(payload) ? payload.length : 0
    };
  }

  if (name === "address add" || name === "address list") {
    const addresses = Array.isArray(payload) ? payload : [];
    return {
      addressCount: addresses.length,
      selectedCount: addresses.filter((address) => address.selected === true).length
    };
  }

  if (name === "address use") {
    return {
      selected: payload.selected === true,
      hasAddressText: typeof payload.text === "string" && payload.text.trim().length > 0
    };
  }

  if (name === "add") {
    return {
      productAdded: Boolean(payload.product),
      cartItemCount: Array.isArray(payload.cart?.items) ? payload.cart.items.length : 0
    };
  }

  if (name === "cart" || name === "reorder" || name === "remove" || name === "clear") {
    return {
      cartItemCount: Array.isArray(payload.items) ? payload.items.length : 0,
      hasTotal: typeof payload.total === "string"
    };
  }

  if (name === "checkout") {
    return {
      status: payload.status,
      paymentStatus: payload.paymentStatus,
      orderPlacement: payload.orderPlacement,
      orderStatusCommand: payload.orderStatusCommand
    };
  }

  if (name === "track" || name === "history") {
    const orders = Array.isArray(payload) ? payload : [];
    return {
      orderCount: orders.length,
      latestHasStatus: typeof orders[0]?.status === "string",
      latestHasEta: typeof orders[0]?.eta === "string"
    };
  }

  return {
    observed: true
  };
}

function parseArgs(args) {
  const parsed = {
    addressAdd: false,
    addressList: false,
    cart: false,
    checkout: false,
    help: false,
    history: false,
    login: false,
    quantity: 1,
    reorderLast: false,
    clear: false,
    track: false
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--help" || arg === "-h") {
      parsed.help = true;
    } else if (arg === "--data-dir") {
      parsed.dataDir = requireValue(args, ++index, arg);
    } else if (arg === "--report") {
      parsed.report = requireValue(args, ++index, arg);
    } else if (arg === "--login") {
      parsed.login = true;
    } else if (arg === "--phone") {
      parsed.phone = requireValue(args, ++index, arg);
    } else if (arg === "--search") {
      parsed.search = requireValue(args, ++index, arg);
    } else if (arg === "--address") {
      parsed.address = requireValue(args, ++index, arg);
    } else if (arg === "--address-add") {
      parsed.addressAdd = true;
    } else if (arg === "--address-list") {
      parsed.addressList = true;
    } else if (arg === "--add") {
      parsed.add = requireValue(args, ++index, arg);
    } else if (arg === "--quantity") {
      parsed.quantity = parseQuantity(requireValue(args, ++index, arg));
    } else if (arg === "--cart") {
      parsed.cart = true;
    } else if (arg === "--remove") {
      parsed.remove = requireValue(args, ++index, arg);
    } else if (arg === "--clear") {
      parsed.clear = true;
    } else if (arg === "--checkout") {
      parsed.checkout = true;
    } else if (arg === "--track") {
      parsed.track = true;
    } else if (arg === "--history") {
      parsed.history = true;
    } else if (arg === "--reorder-last") {
      parsed.reorderLast = true;
    } else {
      console.error(`Unknown option: ${arg}`);
      process.exit(1);
    }
  }

  return parsed;
}

function requireValue(args, index, option) {
  const value = args[index];
  if (!value || value.startsWith("--")) {
    console.error(`${option} requires a value.`);
    process.exit(1);
  }

  return value;
}

function parseQuantity(value) {
  const quantity = Number.parseInt(value, 10);
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > 12) {
    console.error("--quantity must be an integer from 1 to 12.");
    process.exit(1);
  }

  return quantity;
}

function validateOptions(parsed) {
  if (parsed.phone && !parsed.login) {
    console.error("--phone can only be used with --login.");
    process.exit(1);
  }

  if (parsed.clear && parsed.checkout) {
    console.error("--clear cannot be combined with --checkout because it empties the cart before checkout verification.");
    console.error("Run clear verification separately, or omit --clear for a checkout handoff run.");
    process.exit(1);
  }
}

function printHelp() {
  console.log(`Usage: npm run verify:live -- --data-dir <path> [options]

Runs an opt-in human-controlled live verification sequence against the compiled zepo CLI.

Required:
  --data-dir <path>     Dedicated persistent ZepoCli data directory

Options:
  --login               Run visible zepo login if no confirmed session exists
  --phone <number>      Prefill login phone through zepo login --phone
  --search <query>      Run visible product search
  --address-list        Run visible address list
  --address <query>     Select a saved address by visible text
  --address-add         Open the visible add-address flow
  --add <query>         Add a product to cart
  --quantity <number>   Quantity for --add, 1 to 12
  --cart                Read the cart
  --remove <query>      Remove a matching cart item
  --clear               Remove all detected cart items; cannot be combined with --checkout
  --checkout            Open checkout/payment handoff in a visible Zepto browser
  --track               Read latest order status
  --history             Read order history
  --reorder-last        Reorder the latest readable order and read the cart
  --report <path>       Write sanitized report to this path

Example:
  npm run build
  npm run verify:live -- --data-dir ./.zepo-live --login --search milk --address home --add "Amul Milk 500ml" --cart --checkout --track

For cart cleanup verification, run remove before checkout only when other test cart items remain. Run clear as a separate cleanup pass:
  npm run verify:live -- --data-dir ./.zepo-live --login --add "Amul Milk 500ml" --remove "Amul Milk" --cart
  npm run verify:live -- --data-dir ./.zepo-live --login --clear --cart

The report intentionally omits raw page text, addresses, cart item names, payment credentials, order ids, phone input, local filesystem paths, and unredacted workflow query arguments.`);
}
