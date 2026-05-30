export function parseJsonFromOutput(text) {
  const trimmed = String(text ?? "").trim();
  if (!trimmed) {
    return undefined;
  }

  const direct = tryParseJson(trimmed);
  if (direct !== undefined) {
    return direct;
  }

  const lines = trimmed.split(/\r?\n/);
  for (let start = lines.length - 1; start >= 0; start -= 1) {
    const candidate = lines.slice(start).join("\n").trim();
    if (!candidate.startsWith("{") && !candidate.startsWith("[")) {
      continue;
    }

    const parsed = tryParseJson(candidate);
    if (parsed !== undefined) {
      return parsed;
    }
  }

  return undefined;
}

export function summarizeCommandError(error, stderr, args = []) {
  const redactions = liveReportTextRedactions(args);
  const fallbackMessage = firstLine(stderr) ?? "Command failed.";

  if (isObject(error)) {
    const code = normalizeReportErrorCode(error.code);
    const message = hasReadableText(error.message) ? error.message : fallbackMessage;
    return {
      code,
      message: redactLiveReportText(message, redactions),
      ...(hasReadableText(error.hint) ? { hint: redactLiveReportText(error.hint, redactions) } : {}),
      ...(Number.isFinite(error.retryAfterMs) ? { retryAfterMs: error.retryAfterMs } : {})
    };
  }

  return {
    code: "command_failed",
    message: redactLiveReportText(fallbackMessage, redactions)
  };
}

const SAFE_REPORT_ERROR_CODES = new Set([
  "add_address_flow_unverified",
  "add_address_unavailable",
  "address_controls_unavailable",
  "address_match_ambiguous",
  "address_not_found",
  "address_selection_control_disabled",
  "address_selection_control_unavailable",
  "address_selection_control_unsafe",
  "address_selection_stale",
  "address_selection_unverified",
  "addresses_unreadable",
  "browser_launch_failed",
  "browser_lock_active",
  "browser_lock_failed",
  "cart_add_unverified",
  "cart_clear_incomplete",
  "cart_item_not_found",
  "cart_navigation_unverified",
  "cart_quantity_unverified",
  "cart_remove_control_disabled",
  "cart_remove_control_stale",
  "cart_remove_control_unavailable",
  "cart_remove_unverified",
  "cart_unavailable",
  "cart_unreadable",
  "checkout_cart_unreadable",
  "checkout_handoff_unverified",
  "checkout_unavailable",
  "command_failed",
  "delivery_location_required",
  "headless_browser_throttle",
  "interactive_input_required",
  "invalid_input",
  "live_add_contract_mismatch",
  "live_address_contract_mismatch",
  "live_cart_contract_mismatch",
  "live_checkout_contract_mismatch",
  "live_clear_contract_mismatch",
  "live_command_launch_failed",
  "live_command_timeout",
  "live_doctor_contract_mismatch",
  "live_history_contract_mismatch",
  "live_json_unexpected",
  "live_json_unreadable",
  "live_login_contract_mismatch",
  "live_reorder_contract_mismatch",
  "live_runner_failed",
  "live_search_contract_mismatch",
  "live_status_contract_mismatch",
  "live_summary_failed",
  "live_track_contract_mismatch",
  "live_verification_incomplete",
  "login_not_confirmed",
  "no_confirmed_session",
  "order_not_found",
  "order_status_unreadable",
  "orders_navigation_unavailable",
  "orders_unavailable",
  "orders_unreadable",
  "product_add_stale",
  "product_add_unavailable",
  "product_add_unmapped",
  "product_match_unconfirmed",
  "product_not_addable",
  "product_not_found",
  "product_quantity_stale",
  "product_quantity_unavailable",
  "product_unavailable",
  "reorder_cart_unreadable",
  "reorder_unavailable",
  "runtime_setup_failed",
  "search_results_unreadable",
  "session_save_failed",
  "unexpected_error",
  "unsupported_operation",
  "zepto_access_challenge",
  "zepto_access_cooldown",
  "zepto_access_protection",
  "zepto_login_required"
]);

function normalizeReportErrorCode(value) {
  if (typeof value === "string" && SAFE_REPORT_ERROR_CODES.has(value)) {
    return value;
  }

  return "command_failed";
}

export function summarizeLiveRunnerFailure(error) {
  return summarizeCommandError(
    {
      code: "live_runner_failed",
      message: errorMessage(error)
    },
    "",
    []
  );
}

export function buildLiveCommandLaunchFailureStep(name, args, error) {
  return {
    name,
    command: `zepo ${redactArgsForLiveReport(args).join(" ")}`,
    exitCode: 1,
    ok: false,
    error: summarizeCommandError(
      {
        code: "live_command_launch_failed",
        message: errorMessage(error)
      },
      "",
      args
    )
  };
}

export function buildLiveCommandTimeoutStep(name, args, timeoutMs) {
  return {
    name,
    command: `zepo ${redactArgsForLiveReport(args).join(" ")}`,
    exitCode: 1,
    ok: false,
    error: summarizeCommandError(
      {
        code: "live_command_timeout",
        message: `Command timed out after ${timeoutMs} ms.`,
        hint: "Increase --step-timeout only when a human-controlled Zepto step legitimately needs more time."
      },
      "",
      args
    )
  };
}

export function buildLiveReportStep({ name, args, status, stdout, stderr, summarizePayload }) {
  const payload = parseJsonFromOutput(stdout);
  const errorPayload = parseJsonFromOutput(stderr)?.error;
  const missingJsonEvidence = status === 0 && payload === undefined;
  const primitiveJsonEvidence =
    status === 0 && payload !== undefined && (payload === null || typeof payload !== "object");
  const payloadContractError =
    status === 0 && !missingJsonEvidence && !primitiveJsonEvidence
      ? validateLiveReportPayloadContract(name, payload)
      : undefined;
  const ok = status === 0 && !missingJsonEvidence && !primitiveJsonEvidence && !payloadContractError;
  const { summary, summaryError } = ok && summarizePayload ? summarizeStepPayload(name, payload, args, summarizePayload) : {};
  const stepOk = ok && !summaryError;
  const step = {
    name,
    command: `zepo ${redactArgsForLiveReport(args).join(" ")}`,
    exitCode: missingJsonEvidence || primitiveJsonEvidence || payloadContractError || summaryError ? 1 : status,
    ok: stepOk,
    ...(stepOk && summary !== undefined ? { summary } : {}),
    ...(status !== 0 ? { error: summarizeCommandError(errorPayload, stderr, args) } : {}),
    ...(missingJsonEvidence
      ? {
          error: {
            code: "live_json_unreadable",
            message: "Command exited successfully but did not emit readable JSON."
          }
        }
      : {}),
    ...(payloadContractError ? { error: payloadContractError } : {}),
    ...(summaryError ? { error: summaryError } : {}),
    ...(primitiveJsonEvidence
      ? {
          error: {
            code: "live_json_unexpected",
            message: "Command exited successfully but emitted JSON that was not an object or array."
          }
        }
      : {})
  };

  return {
    step,
    payload
  };
}

export function summarizeLiveReportCoverage(steps = []) {
  return summarizeLiveReportStepBooleans(steps, (step) => step.ok === true);
}

export function summarizeLiveReportAttempts(steps = []) {
  return summarizeLiveReportStepBooleans(steps, () => true);
}

export function summarizeLiveReportMissingCoverage(requested = {}, coverage = {}) {
  const summary = createLiveReportCapabilitySummary();

  for (const key of Object.keys(summary)) {
    summary[key] = requested?.[key] === true && coverage?.[key] !== true;
  }

  return summary;
}

export function hasLiveReportMissingCoverage(missingCoverage = {}) {
  return Object.values(missingCoverage).some((value) => value === true);
}

export function validateLiveReportAcceptance(report, options = {}) {
  if (!isObject(report)) {
    return {
      accepted: false,
      issues: [
        {
          code: "live_report_invalid",
          message: "Live report JSON must be an object."
        }
      ]
    };
  }

  const issues = [];
  const requested = report.requested;
  const coverage = report.coverage;
  const missingCoverage = report.missingCoverage;
  const steps = Array.isArray(report.steps) ? report.steps : undefined;

  if (report.ok !== true) {
    issues.push({
      code: "live_report_not_ok",
      message: "Live report ok must be true."
    });
  }

  if (hasReadableText(options.expectedVersion) && report.version !== options.expectedVersion) {
    issues.push({
      code: "live_report_version_mismatch",
      message: "Live report version does not match the installed package version."
    });
  }

  if (!isObject(requested) || !isObject(coverage) || !isObject(missingCoverage)) {
    issues.push({
      code: "live_report_contract_mismatch",
      message: "Live report must include requested, coverage, and missingCoverage objects."
    });
  } else {
    const expectedMissingCoverage = summarizeLiveReportMissingCoverage(requested, coverage);
    for (const key of Object.keys(expectedMissingCoverage)) {
      if (missingCoverage[key] !== expectedMissingCoverage[key]) {
        issues.push({
          code: "live_report_missing_coverage_mismatch",
          message: `Live report missingCoverage.${key} does not match requested and coverage.`
        });
      }

      if (requested[key] === true && coverage[key] !== true) {
        issues.push({
          code: "live_report_requested_coverage_missing",
          message: `Live report requested ${key} but coverage.${key} did not pass.`
        });
      }
    }

    if (hasLiveReportMissingCoverage(missingCoverage)) {
      issues.push({
        code: "live_report_missing_coverage",
        message: "Live report still has requested capabilities without passing coverage."
      });
    }
  }

  if (!steps) {
    issues.push({
      code: "live_report_contract_mismatch",
      message: "Live report must include a steps array."
    });
  } else if (isObject(requested)) {
    for (const requirement of LIVE_REPORT_ACCEPTANCE_REQUIREMENTS) {
      if (requested[requirement.capability] !== true) {
        continue;
      }

      const step = steps.find((candidate) => candidate?.name === requirement.step && candidate?.ok === true);
      if (!step) {
        issues.push({
          code: "live_report_step_missing",
          message: `Live report requested ${requirement.capability} but no passing ${requirement.step} step is present.`
        });
        continue;
      }

      if (requirement.accepts && !requirement.accepts(step)) {
        issues.push({
          code: "live_report_step_contract_mismatch",
          message: `Live report ${requirement.step} summary does not satisfy acceptance requirements.`
        });
      }
    }
  }

  return {
    accepted: issues.length === 0,
    issues
  };
}

export function summarizeLiveReportRequests(options = {}) {
  const summary = createLiveReportCapabilitySummary();
  summary.browserPreflight = true;
  summary.localStatus = true;
  summary.login = options.login === true;
  summary.search = hasReadableText(options.search);
  summary.addressAdd = options.addressAdd === true;
  summary.addressList = options.addressList === true;
  summary.addressUse = hasReadableText(options.address);
  summary.add = hasReadableText(options.add);
  summary.remove = hasReadableText(options.remove);
  summary.clear = options.clear === true;
  summary.checkoutHandoff = options.checkout === true;
  summary.track = options.track === true;
  summary.history = options.history === true;
  summary.reorder = options.reorderLast === true;
  summary.cart = options.cart === true || summary.add || summary.remove || summary.clear || summary.reorder;
  summary.liveSession =
    summary.login ||
    summary.search ||
    summary.addressAdd ||
    summary.addressList ||
    summary.addressUse ||
    summary.add ||
    summary.cart ||
    summary.remove ||
    summary.clear ||
    summary.checkoutHandoff ||
    summary.track ||
    summary.history ||
    summary.reorder;

  return summary;
}

export function adjustLiveReportRequestsForConfirmedSession(requested = {}, statusPayload = {}) {
  if (requested?.login !== true || statusPayload?.confirmedSession !== true) {
    return requested;
  }

  return {
    ...requested,
    login: false,
    liveSession: true
  };
}

function summarizeLiveReportStepBooleans(steps, includeStep) {
  const summary = createLiveReportCapabilitySummary();

  for (const step of steps) {
    if (!isObject(step) || !includeStep(step)) {
      continue;
    }

    const key = LIVE_REPORT_CAPABILITY_BY_STEP_NAME.get(step.name);
    if (key) {
      summary[key] = true;
    }
  }

  return summary;
}

function createLiveReportCapabilitySummary() {
  return {
    browserPreflight: false,
    localStatus: false,
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
    checkoutHandoff: false,
    track: false,
    history: false,
    reorder: false
  };
}

const LIVE_REPORT_CAPABILITY_BY_STEP_NAME = new Map([
  ["doctor", "browserPreflight"],
  ["status", "localStatus"],
  ["login", "login"],
  ["status live", "liveSession"],
  ["search", "search"],
  ["address add", "addressAdd"],
  ["address list", "addressList"],
  ["address use", "addressUse"],
  ["add", "add"],
  ["cart", "cart"],
  ["remove", "remove"],
  ["clear", "clear"],
  ["checkout", "checkoutHandoff"],
  ["track", "track"],
  ["history", "history"],
  ["reorder", "reorder"]
]);

const LIVE_REPORT_ACCEPTANCE_REQUIREMENTS = [
  {
    capability: "browserPreflight",
    step: "doctor",
    accepts: (step) =>
      step.summary?.ok === true &&
      step.summary?.browserAutomationReady === true &&
      step.summary?.playwrightChromiumPassed === true
  },
  {
    capability: "localStatus",
    step: "status",
    accepts: (step) => step.summary?.browserAutomationReady === true
  },
  {
    capability: "login",
    step: "login"
  },
  {
    capability: "liveSession",
    step: "status live",
    accepts: (step) => step.summary?.confirmedSession === true && step.summary?.liveSessionState === "logged-in"
  },
  {
    capability: "search",
    step: "search",
    accepts: (step) => step.summary?.productCount > 0
  },
  {
    capability: "addressAdd",
    step: "address add",
    accepts: (step) => step.summary?.addressCount > 0
  },
  {
    capability: "addressList",
    step: "address list",
    accepts: (step) => step.summary?.addressCount > 0
  },
  {
    capability: "addressUse",
    step: "address use",
    accepts: (step) => step.summary?.selected === true && step.summary?.hasAddressText === true
  },
  {
    capability: "add",
    step: "add",
    accepts: (step) => step.summary?.productAdded === true && step.summary?.cartItemCount > 0
  },
  {
    capability: "cart",
    step: "cart"
  },
  {
    capability: "remove",
    step: "remove"
  },
  {
    capability: "clear",
    step: "clear",
    accepts: (step) => step.summary?.cartItemCount === 0
  },
  {
    capability: "checkoutHandoff",
    step: "checkout",
    accepts: (step) =>
      step.summary?.status === "checkout_handoff_returned" &&
      step.summary?.paymentStatus === "not_observed_by_zepocli" &&
      step.summary?.orderPlacement === "not_confirmed_by_zepocli" &&
      step.summary?.orderStatusCommand === "zepo track"
  },
  {
    capability: "track",
    step: "track",
    accepts: (step) => step.summary?.latestHasStatus === true || step.summary?.latestHasEta === true
  },
  {
    capability: "history",
    step: "history"
  },
  {
    capability: "reorder",
    step: "reorder",
    accepts: (step) => step.summary?.cartItemCount > 0
  }
];

function summarizeStepPayload(name, payload, args, summarizePayload) {
  try {
    return {
      summary: summarizePayload(name, payload)
    };
  } catch (error) {
    return {
      summaryError: summarizeCommandError(
        {
          code: "live_summary_failed",
          message: errorMessage(error)
        },
        "",
        args
      )
    };
  }
}

function errorMessage(error) {
  if (error instanceof Error && hasReadableText(error.message)) {
    return error.message;
  }

  if (hasReadableText(error)) {
    return String(error);
  }

  return "Live report summary failed.";
}

function validateLiveReportPayloadContract(name, payload) {
  if (name === "login") {
    return validateLoginPayloadContract(payload);
  }

  if (name === "doctor") {
    return validateDoctorPayloadContract(payload);
  }

  if (name === "status") {
    return validateStatusPayloadContract(payload);
  }

  if (name === "status live") {
    return validateLiveStatusPayloadContract(payload);
  }

  if (name === "checkout") {
    return validateCheckoutPayloadContract(payload);
  }

  if (name === "track") {
    return validateTrackPayloadContract(payload);
  }

  if (name === "search") {
    return validateNonEmptyArrayPayload(
      payload,
      "live_search_contract_mismatch",
      "Search JSON did not include any product results."
    );
  }

  if (name === "add") {
    return validateAddPayloadContract(payload);
  }

  if (name === "address add" || name === "address list") {
    return validateAddressListPayloadContract(payload);
  }

  if (name === "address use") {
    return validateAddressUsePayloadContract(payload);
  }

  if (name === "reorder") {
    return validateReorderPayloadContract(payload);
  }

  if (name === "cart" || name === "remove") {
    return validateCartSnapshotPayloadContract(payload);
  }

  if (name === "clear") {
    return validateClearPayloadContract(payload);
  }

  if (name === "history") {
    return validateHistoryPayloadContract(payload);
  }

  return undefined;
}

function validateLoginPayloadContract(payload) {
  if (
    isObject(payload) &&
    payload.status === "session_saved" &&
    payload.sessionSaved === true &&
    payload.confirmedSession === true
  ) {
    return undefined;
  }

  return {
    code: "live_login_contract_mismatch",
    message: "Login JSON did not confirm a saved Zepto session."
  };
}

function validateDoctorPayloadContract(payload) {
  if (
    isObject(payload) &&
    payload.ok === true &&
    Array.isArray(payload.checks) &&
    hasAutomationDiagnostics(payload) &&
    payload.browserAutomation.ready === true &&
    hasPassingCheck(payload, "Playwright Chromium")
  ) {
    return undefined;
  }

  return {
    code: "live_doctor_contract_mismatch",
    message: "Doctor JSON did not report ready browser automation and passing Playwright Chromium checks."
  };
}

function validateStatusPayloadContract(payload) {
  if (isObject(payload) && typeof payload.confirmedSession === "boolean" && hasStatusDiagnostics(payload)) {
    return undefined;
  }

  return {
    code: "live_status_contract_mismatch",
    message: "Status JSON did not include expected session and browser automation fields."
  };
}

function validateLiveStatusPayloadContract(payload) {
  if (
    isObject(payload) &&
    hasStatusDiagnostics(payload) &&
    payload.confirmedSession === true &&
    payload.liveSession?.checked === true &&
    payload.liveSession?.state === "logged-in"
  ) {
    return undefined;
  }

  return {
    code: "live_status_contract_mismatch",
    message: "Live status JSON did not verify a logged-in Zepto session."
  };
}

function validateCheckoutPayloadContract(payload) {
  if (
    payload?.status === "checkout_handoff_returned" &&
    payload?.payment === "handled_by_zepto" &&
    payload?.paymentStatus === "not_observed_by_zepocli" &&
    payload?.orderPlacement === "not_confirmed_by_zepocli" &&
    payload?.orderStatusCommand === "zepo track"
  ) {
    return undefined;
  }

  return {
    code: "live_checkout_contract_mismatch",
    message: "Checkout JSON did not preserve the Zepto payment and order-placement handoff contract."
  };
}

function validateTrackPayloadContract(payload) {
  const latest = Array.isArray(payload) ? payload[0] : undefined;
  if (hasReadableText(latest?.status) || hasReadableText(latest?.eta)) {
    return undefined;
  }

  return {
    code: "live_track_contract_mismatch",
    message: "Track JSON did not include a latest order with readable status or ETA."
  };
}

function validateAddPayloadContract(payload) {
  if (
    isObject(payload) &&
    isObject(payload.product) &&
    isObject(payload.cart) &&
    Array.isArray(payload.cart.items) &&
    payload.cart.items.length > 0
  ) {
    return undefined;
  }

  return {
    code: "live_add_contract_mismatch",
    message: "Add JSON did not include an added product and readable cart items."
  };
}

function validateAddressListPayloadContract(payload) {
  if (Array.isArray(payload) && payload.some((address) => hasReadableText(address?.text))) {
    return undefined;
  }

  return {
    code: "live_address_contract_mismatch",
    message: "Address JSON did not include any readable addresses."
  };
}

function validateAddressUsePayloadContract(payload) {
  if (isObject(payload) && payload.selected === true && hasReadableText(payload.text)) {
    return undefined;
  }

  return {
    code: "live_address_contract_mismatch",
    message: "Address selection JSON did not include a selected readable address."
  };
}

function validateReorderPayloadContract(payload) {
  if (isObject(payload) && Array.isArray(payload.items) && payload.items.length > 0) {
    return undefined;
  }

  return {
    code: "live_reorder_contract_mismatch",
    message: "Reorder JSON did not include readable cart items."
  };
}

function validateCartSnapshotPayloadContract(payload) {
  if (isObject(payload) && Array.isArray(payload.items)) {
    return undefined;
  }

  return {
    code: "live_cart_contract_mismatch",
    message: "Cart JSON did not include a readable cart item array."
  };
}

function validateClearPayloadContract(payload) {
  if (isObject(payload) && Array.isArray(payload.items) && payload.items.length === 0) {
    return undefined;
  }

  return {
    code: "live_clear_contract_mismatch",
    message: "Clear JSON did not show an empty cart."
  };
}

function validateHistoryPayloadContract(payload) {
  if (Array.isArray(payload)) {
    return undefined;
  }

  return {
    code: "live_history_contract_mismatch",
    message: "History JSON did not include an order-history array."
  };
}

function validateNonEmptyArrayPayload(payload, code, message) {
  if (Array.isArray(payload) && payload.length > 0) {
    return undefined;
  }

  return {
    code,
    message
  };
}

function isObject(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasStatusDiagnostics(payload) {
  return hasAutomationDiagnostics(payload) && hasCacheDiagnostics(payload);
}

function hasAutomationDiagnostics(payload) {
  return (
    hasReadableText(payload.version) &&
    isObject(payload.browserAutomation) &&
    typeof payload.browserAutomation.ready === "boolean" &&
    Array.isArray(payload.browserAutomation.reasons) &&
    Number.isFinite(payload.browserAutomation.retryAfterMs) &&
    isObject(payload.browserLock) &&
    typeof payload.browserLock.present === "boolean" &&
    typeof payload.browserLock.stale === "boolean" &&
    isObject(payload.headlessBrowserThrottle) &&
    Number.isFinite(payload.headlessBrowserThrottle.windowMs) &&
    Number.isFinite(payload.headlessBrowserThrottle.limit) &&
    Number.isFinite(payload.headlessBrowserThrottle.recentRuns) &&
    typeof payload.headlessBrowserThrottle.throttleActive === "boolean" &&
    Number.isFinite(payload.headlessBrowserThrottle.retryAfterMs) &&
    isObject(payload.accessChallenge) &&
    typeof payload.accessChallenge.detected === "boolean" &&
    typeof payload.accessChallenge.cooldownActive === "boolean" &&
    Number.isFinite(payload.accessChallenge.retryAfterMs)
  );
}

function hasPassingCheck(payload, name) {
  return (
    Array.isArray(payload.checks) &&
    payload.checks.some((check) => isObject(check) && check.name === name && check.status === "pass")
  );
}

function hasCacheDiagnostics(payload) {
  return (
    isObject(payload.cache) &&
    Number.isFinite(payload.cache.searches) &&
    Number.isFinite(payload.cache.cartSnapshots) &&
    Number.isFinite(payload.cache.addresses) &&
    Number.isFinite(payload.cache.orders)
  );
}

function hasReadableText(value) {
  return typeof value === "string" && value.trim().length > 0;
}

export function redactArgsForLiveConsole(args) {
  return redactArgsForLiveReport(args);
}

export function redactLiveConsoleText(value, args = []) {
  return redactLiveReportText(value, liveReportTextRedactions(args));
}

export function createLiveConsoleTextRedactor(args = [], write, options = {}) {
  let pending = "";
  const immediate = options.immediate === true;

  return {
    write(chunk) {
      const text = String(chunk ?? "");
      if (!text) {
        return;
      }

      if (immediate) {
        write(redactLiveConsoleText(text, args));
        return;
      }

      pending += text;
      const newlineIndex = Math.max(pending.lastIndexOf("\n"), pending.lastIndexOf("\r"));
      if (newlineIndex >= 0) {
        const flushable = pending.slice(0, newlineIndex + 1);
        pending = pending.slice(newlineIndex + 1);
        write(redactLiveConsoleText(flushable, args));
      }

      if (pending.length > 4096) {
        const flushable = pending.slice(0, -1024);
        pending = pending.slice(-1024);
        write(redactLiveConsoleText(flushable, args));
      }
    },
    flush() {
      if (!pending) {
        return;
      }

      write(redactLiveConsoleText(pending, args));
      pending = "";
    }
  };
}

export function redactArgsForLiveReport(args) {
  const redacted = redactOptionValues(
    args,
    new Map([
      ["--data-dir", "<redacted-data-dir>"],
      ["--phone", "<redacted-phone>"],
      ["--report", "<redacted-report-path>"]
    ])
  );
  const positionals = collectPositionals(redacted);
  const command = positionals[0]?.value;

  if (command === "search" || command === "add") {
    redactPositional(redacted, positionals[1], "<redacted-query>");
  } else if (command === "remove") {
    redactPositional(redacted, positionals[1], "<redacted-cart-query>");
  } else if (command === "address" && positionals[1]?.value === "use") {
    redactPositional(redacted, positionals[2], "<redacted-address-query>");
  }

  return redacted;
}

function tryParseJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

function firstLine(value) {
  return String(value ?? "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find(Boolean);
}

function redactOptionValues(args, redactions) {
  const result = [...args];
  for (let index = 0; index < result.length; index += 1) {
    const replacement = redactions.get(result[index]);
    if (replacement !== undefined && index + 1 < result.length) {
      result[index + 1] = replacement;
      index += 1;
    }
  }

  return result;
}

function liveReportTextRedactions(args) {
  const redactions = [];
  collectOptionValueRedactions(args, redactions, {
    "--data-dir": "<redacted-data-dir>",
    "--phone": "<redacted-phone>",
    "--report": "<redacted-report-path>"
  });

  const positionals = collectPositionals(args);
  const command = positionals[0]?.value;
  if (command === "search" || command === "add") {
    addRedaction(redactions, positionals[1]?.value, "<redacted-query>");
  } else if (command === "remove") {
    addRedaction(redactions, positionals[1]?.value, "<redacted-cart-query>");
  } else if (command === "address" && positionals[1]?.value === "use") {
    addRedaction(redactions, positionals[2]?.value, "<redacted-address-query>");
  }

  return redactions.sort((left, right) => right.value.length - left.value.length);
}

function collectOptionValueRedactions(args, redactions, replacements) {
  for (let index = 0; index < args.length; index += 1) {
    const replacement = replacements[args[index]];
    if (replacement !== undefined) {
      addRedaction(redactions, args[index + 1], replacement);
      index += 1;
    }
  }
}

function addRedaction(redactions, value, replacement) {
  const text = String(value ?? "");
  if (!text || text.trim().length === 0 || text.startsWith("<redacted-")) {
    return;
  }

  for (const variant of redactionVariants(text)) {
    addRedactionVariant(redactions, variant, replacement);
  }
}

function redactionVariants(value) {
  const variants = [value];
  const encoded = encodeURIComponent(value);
  if (encoded !== value) {
    variants.push(encoded);
    variants.push(encoded.replace(/%20/g, "+"));
  }

  return [...new Set(variants)];
}

function addRedactionVariant(redactions, value, replacement) {
  if (redactions.some((redaction) => redaction.value === value)) {
    return;
  }
  redactions.push({
    value,
    replacement
  });
}

function redactText(value, redactions) {
  let redacted = String(value ?? "");
  for (const redaction of redactions) {
    redacted = redacted.split(redaction.value).join(redaction.replacement);
  }

  return redacted;
}

function redactLiveReportText(value, redactions) {
  return collapseRedactedPathSuffixes(redactGenericSensitiveText(redactText(value, redactions)));
}

function redactGenericSensitiveText(value) {
  return redactGenericPlainSensitiveText(redactEncodedSensitiveParameterValues(redactEncodedSensitiveFragments(value)));
}

function redactGenericPlainSensitiveText(value) {
  return String(value ?? "")
    .replace(/\border(?:\s*(?:#|ID:?)?)\s*((?=[A-Z0-9-]*\d)[A-Z0-9-]{4,})\b/gi, (match) =>
      match.startsWith("Order") ? "Order <redacted-order-id>" : "order <redacted-order-id>"
    )
    .replace(/\bZEP(?=[A-Z0-9-]*\d)[A-Z0-9-]{4,}\b/gi, "<redacted-order-id>")
    .replace(
      /\b((?:otp|one[-\s]*time(?:\s+(?:password|code))?|verification code|passcode|upi\s*pin|atm\s*pin|cvv|cvc)\s*(?:is|:|=|-)?\s*)\d{3,8}\b/gi,
      "$1<redacted-verification-code>"
    )
    .replace(/(?<!\d)(?:\+?91[\s-]?|0)?[6-9]\d{4}[\s-]?\d{5}(?!\d)/g, "<redacted-phone>")
    .replace(/\bnpm_[A-Za-z0-9]{20,}\b/g, "<redacted-npm-token>")
    .replace(/\b\d(?:[ -]?\d){12,18}\b/g, "<redacted-payment-number>")
    .replace(/(?<![\w.-])[\w.-]{2,}@[A-Za-z][A-Za-z0-9.-]{1,}(?![\w.-])/g, "<redacted-payment-handle>")
    .replace(/file:\/\/\/[A-Za-z]:[\\/](?![\\/])[^\r\n"',;<>|]+/gi, redactLocalPathMatch)
    .replace(/(?<![A-Za-z])[A-Za-z]:[\\/](?![\\/])[^\r\n"',;<>|]+/g, redactLocalPathMatch)
    .replace(/\/(?:Users|home|tmp|var|private|workspace|mnt)\/[^\r\n"',;<>|]+/g, redactLocalPathMatch)
    .replace(/(?<![\w.-])\.{1,2}[\\/][^\r\n"',;<>|]+/g, redactLocalPathMatch)
    .replace(/(?<![\w.-])\.zepo-live[\\/][^\r\n"',;<>|]+/g, redactLocalPathMatch);
}

function redactEncodedSensitiveParameterValues(value) {
  return String(value ?? "").replace(
    /\b((?:phone|mobile|tel|otp|pin|cvv|cvc|card|payment|upi|auth|session|token|jwt|access[-_]?token|refresh[-_]?token|id[-_]?token|path|file|data[-_]?dir|report(?:[-_]?path)?)\s*(?:=|%3[Dd]))([^&\s"'<>]+)/gi,
    (match, prefix, encodedValue) => {
      const decoded = decodeQueryValue(encodedValue);
      if (!decoded) {
        return match;
      }

      if (/(?:auth|session|token|jwt)/i.test(prefix)) {
        return `${prefix}<redacted-auth-token>`;
      }

      const redacted = redactGenericPlainSensitiveText(decoded);
      if (
        redacted === decoded &&
        /(?:otp|pin|cvv|cvc)/i.test(prefix) &&
        /^\d{3,8}$/.test(decoded.trim())
      ) {
        return `${prefix}<redacted-verification-code>`;
      }

      return redacted === decoded ? match : `${prefix}${redacted}`;
    }
  );
}

function redactEncodedSensitiveFragments(value) {
  return String(value ?? "").replace(/[^\s"',;<>]*%[0-9A-Fa-f]{2}[^\s"',;<>]*/g, (match) => {
    const decoded = decodeQueryValue(match);
    if (!decoded || decoded === match) {
      return match;
    }

    const redacted = redactGenericPlainSensitiveText(redactEncodedSensitiveParameterValues(decoded));
    return redacted === decoded ? match : redacted;
  });
}

function decodeQueryValue(value) {
  try {
    return decodeURIComponent(String(value).replace(/\+/g, " "));
  } catch {
    return undefined;
  }
}

function collapseRedactedPathSuffixes(value) {
  return String(value ?? "").replace(
    /<redacted-(data-dir|report-path|local-path)>(?:[\\/][^\r\n"'<> ]+)*/g,
    (_match, label) => `<redacted-${label}>`
  );
}

function redactLocalPathMatch(value) {
  const connector = value.match(/\s+(?:and|or|with|after|before|near)\s+/i);
  if (connector?.index !== undefined) {
    return `${redactLocalPathMatch(value.slice(0, connector.index))}${value.slice(connector.index)}`;
  }

  const punctuation = value.match(/[.,;:!?)]$/)?.[0] ?? "";
  return `<redacted-local-path>${punctuation}`;
}

function collectPositionals(args) {
  const valueOptions = new Set(["--data-dir", "--phone", "--quantity", "--report", "--timeout"]);
  const positionals = [];
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (valueOptions.has(arg)) {
      index += 1;
      continue;
    }

    if (arg.startsWith("-")) {
      continue;
    }

    positionals.push({
      index,
      value: arg
    });
  }

  return positionals;
}

function redactPositional(args, positional, replacement) {
  if (positional) {
    args[positional.index] = replacement;
  }
}
