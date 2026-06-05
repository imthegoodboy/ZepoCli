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

export const LIVE_REPORT_NOTE =
  "Sanitized ZepoCli live verification report. It omits raw Zepto page text, addresses, cart item names, payment credentials, order ids, phone input, local filesystem paths, standalone percent-encoded sensitive fragments, and unredacted workflow query arguments. It also redacts npm-token-shaped values.";
const LIVE_REPORT_GENERATED_AT_FUTURE_SKEW_MS = 5 * 60 * 1_000;
const LIVE_REPORT_ERROR_RETRY_AFTER_MAX_MS = 60 * 60 * 1_000;
const LIVE_CONSOLE_BUFFERED_TAIL_CHARS = 1024;
const LIVE_CONSOLE_BUFFERED_FLUSH_CHARS = 4096;
const LIVE_REPORT_PRODUCTION_SCOPE_CAPABILITIES = [
  "browserPreflight",
  "localStatus",
  "liveSession",
  "search",
  "addressUse",
  "add",
  "cart",
  "checkoutHandoff",
  "track"
];
const LIVE_REPORT_PRODUCTION_SCOPE_EXCLUDED_CAPABILITIES = [
  "addressAdd",
  "addressList",
  "remove",
  "clear",
  "history",
  "reorder"
];
const LIVE_REPORT_PRODUCTION_SCOPE_CHECKOUT_WAIT_COMMAND_PATTERN =
  /^zepo --data-dir <redacted-data-dir>(?: --browser-locale <redacted-browser-locale>)?(?: --browser-timezone <redacted-browser-timezone>)? --visible checkout(?: --remove-limit-items)? --wait --json$/;
const LIVE_REPORT_ADDRESS_DETAIL_PATTERN =
  /\b(house|flat|road|street|lane|layout|sector|phase|apartment|building|floor|tower|block|wing|society|colony|landmark|near|opposite|pin|pincode|postal\s+code|india)\b|\b[a-z]\s*[-/]\s*\d{2,}\b|\d{3,}/i;
const LIVE_REPORT_ADDRESS_PLACEHOLDER_PATTERN =
  /^(add|select|enter|use|choose|set|change)\b.*\b(address|location)\b|^(delivery address|saved addresses|select location|add address)$/i;
const LIVE_REPORT_ADDRESS_UNIT_PATTERN =
  /\b\d+(?:\.\d+)?\s?(?:ml|l|ltr|litre|litres|liter|liters|g|gm|gms|gram|grams|kg|kgs|pc|pcs|piece|pieces|pack|packs|packet|packets|bottle|bottles|box|boxes|can|cans|jar|jars|pouch|pouches|sachet|sachets|dozen|tablet|tablets|tabs|capsule|capsules)\b/i;
const LIVE_REPORT_ADDRESS_NON_ADDRESS_PATTERN =
  /\b(add|cart|checkout|payment|pay|order summary|bill summary|item total|grand total|to pay|coupon|delivery fee|delivery charge|handling fee|platform fee|recommended|sponsored|popular picks|you may also like|out of stock)\b|₹|\brs\.?\s?\d|\binr\s?\d/i;

export function summarizeCommandError(error, stderr, args = []) {
  const redactions = liveReportTextRedactions(args);
  const fallbackMessage = commandFailureMessage(undefined, stderr, redactions);

  if (isObject(error)) {
    const code = normalizeReportErrorCode(error.code);
    const message = commandFailureMessage(hasReadableText(error.message) ? error.message : undefined, stderr, redactions);
    return {
      code,
      message,
      ...(hasReadableText(error.hint) ? { hint: redactLiveReportText(error.hint, redactions) } : {}),
      ...(Number.isFinite(error.retryAfterMs) ? { retryAfterMs: error.retryAfterMs } : {})
    };
  }

  return {
    code: "command_failed",
    message: fallbackMessage
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
  "cart_limit_exceeded",
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
  "visible_browser_required",
  "zepto_access_challenge",
  "zepto_access_cooldown",
  "zepto_navigation_timeout",
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

export function buildLiveCommandTimeoutOrErrorStep({
  name,
  args,
  timeoutMs,
  stdout,
  stderr,
  summarizePayload
}) {
  if (typeof parseJsonFromOutput(stderr)?.error === "object") {
    return buildLiveReportStep({
      name,
      args,
      status: 1,
      stdout,
      stderr,
      summarizePayload
    }).step;
  }

  return buildLiveCommandTimeoutStep(name, args, timeoutMs);
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
  const manualEvidence = buildLiveReportManualEvidence(name, payload, payloadContractError);
  const ok = status === 0 && !missingJsonEvidence && !primitiveJsonEvidence && !payloadContractError;
  const { summary, summaryError } = ok && summarizePayload ? summarizeStepPayload(name, payload, args, summarizePayload) : {};
  const stepOk = ok && !summaryError;
  const step = {
    name,
    command: `zepo ${redactArgsForLiveReport(args).join(" ")}`,
    exitCode: missingJsonEvidence || primitiveJsonEvidence || payloadContractError || summaryError ? 1 : status,
    ok: stepOk,
    ...(stepOk && summary !== undefined ? { summary } : {}),
    ...(manualEvidence !== undefined ? { manualEvidence } : {}),
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

function buildLiveReportManualEvidence(name, payload, payloadContractError) {
  if (
    name !== "checkout" ||
    payloadContractError?.code !== "live_verification_incomplete" ||
    payload?.status !== "checkout_manual_action_required"
  ) {
    return undefined;
  }

  return {
    status: payload.status,
    humanActionRequired: payload.humanActionRequired,
    automationBoundary: payload.automationBoundary,
    handoffUrl: payload.handoffUrl,
    handoffSurface: payload.handoffSurface,
    browserOpenAfterReturn: payload.browserOpenAfterReturn,
    checkoutWaitCompleted: payload.checkoutWaitCompleted,
    cartPrecondition: payload.cartPrecondition,
    paymentStatus: payload.paymentStatus,
    orderPlacement: payload.orderPlacement,
    orderStatusCommand: payload.orderStatusCommand
  };
}

export function summarizeLiveReportCoverage(steps = []) {
  return summarizeLiveReportStepBooleans(steps, liveReportStepHasPassingCoverage);
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
  const attempted = report.attempted;
  const coverage = report.coverage;
  const missingCoverage = report.missingCoverage;
  const steps = Array.isArray(report.steps) ? report.steps : undefined;

  if (report.ok !== true) {
    issues.push({
      code: "live_report_not_ok",
      message: "Live report ok must be true."
    });
  }

  if (!hasReadableText(options.expectedVersion)) {
    issues.push({
      code: "live_report_expected_version_missing",
      message: "Live report acceptance requires the expected package version."
    });
  } else if (report.version !== options.expectedVersion) {
    issues.push({
      code: "live_report_version_mismatch",
      message: "Live report version does not match the installed package version."
    });
  }

  if (containsSensitiveLiveReportText(report)) {
    issues.push({
      code: "live_report_sensitive_text",
      message: "Live report contains sensitive-looking text that should have been redacted."
    });
  }
  validateLiveReportAcceptedSchema(report, issues);

  if (!isObject(requested) || !isObject(attempted) || !isObject(coverage) || !isObject(missingCoverage)) {
    issues.push({
      code: "live_report_contract_mismatch",
      message: "Live report must include requested, attempted, coverage, and missingCoverage objects."
    });
  }

  if (isObject(requested) && isObject(coverage) && isObject(missingCoverage)) {
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
    if (report.ok === true) {
      validateLiveReportOkStepSetContract(steps, issues);
      validateLiveReportUniqueStepNamesContract(steps, issues);
      validateLiveReportStepOrderContract(steps, issues);
      validateLiveReportPassingStepContracts(steps, issues);
    }

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
        addLiveReportStepContractMismatchIssue(issues);
      }
    }
  }

  if (steps && isObject(attempted)) {
    const expectedAttempted = summarizeLiveReportAttempts(steps);
    for (const key of Object.keys(expectedAttempted)) {
      if (attempted[key] !== expectedAttempted[key]) {
        issues.push({
          code: "live_report_attempted_mismatch",
          message: `Live report attempted.${key} does not match the steps array.`
        });
      }
    }
  }

  if (steps && isObject(coverage)) {
    const expectedCoverage = summarizeLiveReportCoverage(steps);
    for (const key of Object.keys(expectedCoverage)) {
      if (coverage[key] !== expectedCoverage[key]) {
        issues.push({
          code: "live_report_coverage_mismatch",
          message: `Live report coverage.${key} does not match the steps array.`
        });
      }
    }
  }

  if (options.requireProductionScope === true && isObject(requested) && isObject(coverage)) {
    validateLiveReportProductionScopeCoverage(requested, coverage, issues);
  }

  if (
    options.requireProductionScope === true &&
    isObject(requested) &&
    isObject(attempted) &&
    isObject(coverage)
  ) {
    validateLiveReportProductionScopeExclusions(requested, attempted, coverage, issues);
  }

  if (options.requireProductionScope === true && steps) {
    validateLiveReportProductionScopeCartState(steps, issues);
    validateLiveReportProductionScopeCheckoutWait(steps, issues);
  }

  if (options.requireProductionScope === true && options.maxAgeMs === undefined) {
    issues.push({
      code: "live_report_production_scope_freshness_missing",
      message: "Production-scope live report acceptance requires a max age freshness window."
    });
  }

  if (options.maxAgeMs !== undefined) {
    validateLiveReportFreshness(report, options.maxAgeMs, issues);
  }

  return {
    accepted: issues.length === 0,
    issues
  };
}

function validateLiveReportProductionScopeCoverage(requested, coverage, issues) {
  if (!LIVE_REPORT_PRODUCTION_SCOPE_CAPABILITIES.every((key) => requested[key] === true && coverage[key] === true)) {
    issues.push({
      code: "live_report_production_scope_missing",
      message: "Live report does not prove the requested and passing production workflow coverage."
    });
  }
}

function validateLiveReportProductionScopeExclusions(requested, attempted, coverage, issues) {
  if (
    LIVE_REPORT_PRODUCTION_SCOPE_EXCLUDED_CAPABILITIES.some(
      (key) => requested[key] === true || attempted[key] === true || coverage[key] === true
    )
  ) {
    issues.push({
      code: "live_report_production_scope_extra",
      message: "Live report includes focused workflows that are not part of the final production scope."
    });
  }
}

function validateLiveReportProductionScopeCartState(steps, issues) {
  const cartStep = steps.find((step) => step?.name === "cart" && step?.ok === true);
  if (!cartStep || cartStep.summary?.cartItemCount > 0) {
    return;
  }

  issues.push({
    code: "live_report_production_scope_cart_empty",
    message: "Live report production-scope cart evidence must show at least one cart item."
  });
}

function validateLiveReportProductionScopeCheckoutWait(steps, issues) {
  const checkoutStep = steps.find((step) => step?.name === "checkout" && step?.ok === true);
  if (
    !checkoutStep ||
    (LIVE_REPORT_PRODUCTION_SCOPE_CHECKOUT_WAIT_COMMAND_PATTERN.test(checkoutStep.command) &&
      checkoutStep.summary?.checkoutWaitCompleted === true)
  ) {
    return;
  }

  issues.push({
    code: "live_report_production_scope_checkout_wait_missing",
    message:
      "Production-scope checkout evidence must use explicit checkout wait and preserve checkoutWaitCompleted: true so a human can complete Zepto-side checkout/payment before tracking."
  });
}

function validateLiveReportFreshness(report, maxAgeMs, issues) {
  if (!Number.isFinite(maxAgeMs) || maxAgeMs <= 0) {
    issues.push({
      code: "live_report_max_age_invalid",
      message: "Live report max age must be a positive duration."
    });
    return;
  }

  const generatedAtMs = parseLiveReportGeneratedAtMs(report?.generatedAt);
  if (generatedAtMs === undefined) {
    return;
  }

  if (Date.now() - generatedAtMs > maxAgeMs) {
    issues.push({
      code: "live_report_stale",
      message: "Live report generatedAt is older than the allowed freshness window."
    });
  }
}

function validateLiveReportAcceptedSchema(report, issues) {
  validateAllowedLiveReportKeys(report, LIVE_REPORT_TOP_LEVEL_KEYS, issues);
  validateLiveReportMetadataContract(report, issues);

  for (const value of [report.requested, report.attempted, report.coverage, report.missingCoverage]) {
    if (isObject(value)) {
      validateAllowedLiveReportKeys(value, LIVE_REPORT_CAPABILITY_KEYS, issues);
      validateLiveReportCapabilitySummaryContract(value, issues);
    }
  }

  if (!Array.isArray(report.steps)) {
    return;
  }

  for (const step of report.steps) {
    if (!isObject(step)) {
      continue;
    }

    validateAllowedLiveReportKeys(step, LIVE_REPORT_STEP_KEYS, issues);
    validateLiveReportStepResultContract(step, issues);
    validateLiveReportCommandContract(step, issues);
    if (isObject(step.error)) {
      validateAllowedLiveReportKeys(step.error, LIVE_REPORT_ERROR_KEYS, issues);
      validateLiveReportErrorContract(step.error, issues);
    }
    if (isObject(step.manualEvidence)) {
      validateAllowedLiveReportKeys(step.manualEvidence, LIVE_REPORT_MANUAL_EVIDENCE_KEYS, issues);
      validateLiveReportManualEvidenceContract(step, issues);
    } else if (step.manualEvidence !== undefined) {
      addLiveReportStepContractMismatchIssue(issues);
    }

    validateLiveReportStepSummaryContract(step, issues);
  }
}

function validateLiveReportOkStepSetContract(steps, issues) {
  if (
    steps.some(
      (step) => !isObject(step) || !LIVE_REPORT_CAPABILITY_BY_STEP_NAME.has(step.name) || step.ok !== true
    )
  ) {
    addLiveReportOkStepMismatchIssue(issues);
  }
}

function addLiveReportOkStepMismatchIssue(issues) {
  if (!issues.some((issue) => issue.code === "live_report_ok_step_mismatch")) {
    issues.push({
      code: "live_report_ok_step_mismatch",
      message: "Live report ok=true must contain only passing known workflow steps."
    });
  }
}

function validateLiveReportUniqueStepNamesContract(steps, issues) {
  const names = new Set();
  for (const step of steps) {
    if (!isObject(step) || !hasReadableText(step.name)) {
      continue;
    }

    if (names.has(step.name)) {
      addLiveReportStepUniquenessMismatchIssue(issues);
      return;
    }
    names.add(step.name);
  }
}

function addLiveReportStepUniquenessMismatchIssue(issues) {
  if (!issues.some((issue) => issue.code === "live_report_step_uniqueness_mismatch")) {
    issues.push({
      code: "live_report_step_uniqueness_mismatch",
      message: "Live report ok=true must not contain duplicate workflow steps."
    });
  }
}

function validateLiveReportStepOrderContract(steps, issues) {
  let previousOrder = -1;
  for (const step of steps) {
    if (!isObject(step) || !hasReadableText(step.name)) {
      continue;
    }

    const order = LIVE_REPORT_STEP_ORDER_BY_NAME.get(step.name);
    if (order === undefined) {
      continue;
    }

    if (order < previousOrder) {
      addLiveReportStepOrderMismatchIssue(issues);
      return;
    }
    previousOrder = order;
  }
}

function addLiveReportStepOrderMismatchIssue(issues) {
  if (!issues.some((issue) => issue.code === "live_report_step_order_mismatch")) {
    issues.push({
      code: "live_report_step_order_mismatch",
      message: "Live report ok=true workflow steps must follow the live runner order."
    });
  }
}

function liveReportStepHasPassingCoverage(step) {
  if (step?.ok !== true) {
    return false;
  }

  if (!liveReportStepSatisfiesCoverageContract(step)) {
    return false;
  }

  const requirement = LIVE_REPORT_ACCEPTANCE_REQUIREMENT_BY_STEP_NAME.get(step.name);
  return !requirement?.accepts || requirement.accepts(step);
}

function liveReportStepSatisfiesCoverageContract(step) {
  if (!isObject(step?.summary)) {
    return false;
  }

  const issues = [];
  validateLiveReportStepResultContract(step, issues);
  validateLiveReportCommandContract(step, issues);
  validateLiveReportStepSummaryContract(step, issues);
  return issues.length === 0;
}

function validateLiveReportPassingStepContracts(steps, issues) {
  for (const step of steps) {
    if (!isObject(step) || step.ok !== true) {
      continue;
    }

    const requirement = LIVE_REPORT_ACCEPTANCE_REQUIREMENT_BY_STEP_NAME.get(step.name);
    if (requirement?.accepts && !requirement.accepts(step)) {
      addLiveReportStepContractMismatchIssue(issues);
      return;
    }
  }
}

function addLiveReportStepContractMismatchIssue(issues) {
  if (!issues.some((issue) => issue.code === "live_report_step_contract_mismatch")) {
    issues.push({
      code: "live_report_step_contract_mismatch",
      message: "Live report step summary does not satisfy acceptance requirements."
    });
  }
}

function validateLiveReportStepSummaryContract(step, issues) {
  if (!isObject(step.summary)) {
    return;
  }

  const expectedSummaryKeys =
    LIVE_REPORT_SUMMARY_KEYS_BY_STEP_NAME.get(step.name) ?? LIVE_REPORT_FALLBACK_SUMMARY_KEYS;
  const requiredSummaryKeys =
    LIVE_REPORT_REQUIRED_SUMMARY_KEYS_BY_STEP_NAME.get(step.name) ?? LIVE_REPORT_FALLBACK_SUMMARY_KEYS;
  validateAllowedLiveReportKeys(step.summary, expectedSummaryKeys, issues);
  validateLiveReportSummaryRequiredKeysContract(step.summary, requiredSummaryKeys, issues);
  validateLiveReportSummaryValueContract(step.summary, issues);
  validateLiveReportSummaryConsistencyContract(step.name, step.summary, issues);
}

function validateLiveReportSummaryRequiredKeysContract(summary, expectedKeys, issues) {
  for (const key of expectedKeys) {
    if (!Object.hasOwn(summary, key)) {
      addLiveReportStepContractMismatchIssue(issues);
      return;
    }
  }
}

function validateLiveReportSummaryValueContract(summary, issues) {
  for (const [key, value] of Object.entries(summary)) {
    if (LIVE_REPORT_BOOLEAN_SUMMARY_KEYS.has(key)) {
      if (typeof value !== "boolean") {
        addLiveReportStepContractMismatchIssue(issues);
        return;
      }
    } else if (LIVE_REPORT_NON_NEGATIVE_INTEGER_SUMMARY_KEYS.has(key)) {
      const max = LIVE_REPORT_NON_NEGATIVE_INTEGER_SUMMARY_MAX_BY_KEY.get(key);
      if (!Number.isInteger(value) || value < 0 || (max !== undefined && value > max)) {
        addLiveReportStepContractMismatchIssue(issues);
        return;
      }
    } else if (LIVE_REPORT_STRING_SUMMARY_KEYS.has(key)) {
      if (!hasReadableText(value) || !isAllowedLiveReportStringSummaryValue(key, value)) {
        addLiveReportStepContractMismatchIssue(issues);
        return;
      }
    } else if (LIVE_REPORT_STRING_ARRAY_SUMMARY_KEYS.has(key)) {
      if (
        !Array.isArray(value) ||
        value.some((item) => !hasReadableText(item)) ||
        !isAllowedLiveReportStringArraySummaryValue(key, value)
      ) {
        addLiveReportStepContractMismatchIssue(issues);
        return;
      }
    }
  }
}

function isAllowedLiveReportStringSummaryValue(key, value) {
  const allowed = LIVE_REPORT_STRING_SUMMARY_ALLOWED_VALUES_BY_KEY.get(key);
  return allowed === undefined || allowed.has(value);
}

function isAllowedLiveReportStringArraySummaryValue(key, value) {
  const allowed = LIVE_REPORT_STRING_ARRAY_SUMMARY_ALLOWED_VALUES_BY_KEY.get(key);
  return allowed === undefined || (value.length <= allowed.size && value.every((item) => allowed.has(item)));
}

function validateLiveReportSummaryConsistencyContract(name, summary, issues) {
  if (name === "doctor") {
    if (
      (summary.ok === true && Array.isArray(summary.failures) && summary.failures.length > 0) ||
      (summary.playwrightChromiumPassed === true &&
        Array.isArray(summary.failures) &&
        summary.failures.includes("Playwright Chromium"))
    ) {
      addLiveReportStepContractMismatchIssue(issues);
    }
    return;
  }

  if (name === "search") {
    if (
      Number.isInteger(summary.productCount) &&
      Number.isInteger(summary.productDetailCount) &&
      summary.productDetailCount !== summary.productCount
    ) {
      addLiveReportStepContractMismatchIssue(issues);
    }
    return;
  }

  if (name === "add") {
    if (
      (summary.productAdded === true && summary.productHasDetail !== true) ||
      (summary.productHasDetail === true && summary.productAdded !== true)
    ) {
      addLiveReportStepContractMismatchIssue(issues);
    }
    return;
  }

  if (name === "address add" || name === "address list") {
    if (
      Number.isInteger(summary.addressCount) &&
      Number.isInteger(summary.selectedCount) &&
      (summary.selectedCount > summary.addressCount ||
        (summary.addressCount === 0 && summary.hasAddressDetail === true) ||
        (summary.addressCount > 0 && summary.hasAddressDetail !== true))
    ) {
      addLiveReportStepContractMismatchIssue(issues);
    }
    return;
  }

  if (name === "address use") {
    if (
      (summary.hasAddressDetail === true && summary.hasAddressText !== true) ||
      (summary.selected === true && summary.hasAddressDetail !== true)
    ) {
      addLiveReportStepContractMismatchIssue(issues);
    }
    return;
  }

  if (name === "status") {
    if (summary.liveSessionState !== undefined && summary.liveSessionState !== "skipped") {
      addLiveReportStepContractMismatchIssue(issues);
    }
    return;
  }

  if (name === "track" || name === "history") {
    const latestHasOrderEvidence = summary.latestHasStatus === true || summary.latestHasEta === true;
    if (
      Number.isInteger(summary.orderCount) &&
      ((summary.orderCount === 0 && latestHasOrderEvidence) ||
        (summary.orderCount > 0 && !latestHasOrderEvidence))
    ) {
      addLiveReportStepContractMismatchIssue(issues);
    }
  }
}

function validateLiveReportCapabilitySummaryContract(value, issues) {
  for (const key of LIVE_REPORT_CAPABILITY_KEYS) {
    if (typeof value[key] !== "boolean") {
      addLiveReportCapabilitySummaryMismatchIssue(issues);
      return;
    }
  }
}

function addLiveReportCapabilitySummaryMismatchIssue(issues) {
  if (!issues.some((issue) => issue.code === "live_report_capability_summary_mismatch")) {
    issues.push({
      code: "live_report_capability_summary_mismatch",
      message: "Live report capability summaries must include complete boolean fields."
    });
  }
}

function validateLiveReportMetadataContract(report, issues) {
  if (
    !isValidLiveReportGeneratedAt(report.generatedAt) ||
    report.dataDir !== "<redacted-data-dir>" ||
    report.reportPath !== "<redacted-report-path>" ||
    report.note !== LIVE_REPORT_NOTE
  ) {
    addLiveReportMetadataMismatchIssue(issues);
  }
}

function isValidLiveReportGeneratedAt(value) {
  const parsedTime = parseLiveReportGeneratedAtMs(value);
  return parsedTime !== undefined && parsedTime <= Date.now() + LIVE_REPORT_GENERATED_AT_FUTURE_SKEW_MS;
}

function parseLiveReportGeneratedAtMs(value) {
  if (!hasReadableText(value)) {
    return undefined;
  }

  const parsed = new Date(value);
  const parsedTime = parsed.getTime();
  if (!Number.isFinite(parsedTime) || parsed.toISOString() !== value) {
    return undefined;
  }

  return parsedTime;
}

function addLiveReportMetadataMismatchIssue(issues) {
  if (!issues.some((issue) => issue.code === "live_report_metadata_mismatch")) {
    issues.push({
      code: "live_report_metadata_mismatch",
      message:
        "Live report metadata must include a non-future generatedAt, redacted data/report path markers, and the runner note."
    });
  }
}

function validateLiveReportStepResultContract(step, issues) {
  if (
    !hasReadableText(step.name) ||
    typeof step.ok !== "boolean" ||
    !Number.isInteger(step.exitCode) ||
    step.exitCode < 0 ||
    step.exitCode > 255
  ) {
    addLiveReportStepResultMismatchIssue(issues);
    return;
  }

  if (step.ok === true) {
    if (step.exitCode !== 0 || !isObject(step.summary) || step.error !== undefined || step.manualEvidence !== undefined) {
      addLiveReportStepResultMismatchIssue(issues);
    }
    return;
  }

  if (step.exitCode === 0 || !isObject(step.error) || step.summary !== undefined) {
    addLiveReportStepResultMismatchIssue(issues);
  }
}

function validateLiveReportManualEvidenceContract(step, issues) {
  if (
    step.name === "checkout" &&
    step.ok === false &&
    step.exitCode === 1 &&
    step.error?.code === "live_verification_incomplete" &&
    step.manualEvidence?.status === "checkout_manual_action_required" &&
    step.manualEvidence?.humanActionRequired === true &&
    step.manualEvidence?.automationBoundary === "zepocli_did_not_click_payment_or_order_controls" &&
    step.manualEvidence?.handoffUrl === "https://www.zepto.com/?cart=open" &&
    step.manualEvidence?.handoffSurface === "visible_zepto_browser" &&
    step.manualEvidence?.browserOpenAfterReturn === false &&
    typeof step.manualEvidence?.checkoutWaitCompleted === "boolean" &&
    step.manualEvidence?.cartPrecondition === "non_empty_cart_verified" &&
    step.manualEvidence?.paymentStatus === "not_observed_by_zepocli" &&
    step.manualEvidence?.orderPlacement === "not_confirmed_by_zepocli" &&
    step.manualEvidence?.orderStatusCommand === "zepo track"
  ) {
    return;
  }

  addLiveReportStepContractMismatchIssue(issues);
}

function addLiveReportStepResultMismatchIssue(issues) {
  if (!issues.some((issue) => issue.code === "live_report_step_result_mismatch")) {
    issues.push({
      code: "live_report_step_result_mismatch",
      message: "Live report steps must include consistent exitCode, ok, summary, and error fields."
    });
  }
}

function validateLiveReportErrorContract(error, issues) {
  if (
    !hasReadableText(error.code) ||
    !SAFE_REPORT_ERROR_CODES.has(error.code) ||
    !hasReadableText(error.message) ||
    (error.hint !== undefined && !hasReadableText(error.hint)) ||
    (error.retryAfterMs !== undefined &&
      (!Number.isInteger(error.retryAfterMs) ||
        error.retryAfterMs < 0 ||
        error.retryAfterMs > LIVE_REPORT_ERROR_RETRY_AFTER_MAX_MS))
  ) {
    addLiveReportErrorMismatchIssue(issues);
  }
}

function addLiveReportErrorMismatchIssue(issues) {
  if (!issues.some((issue) => issue.code === "live_report_error_mismatch")) {
    issues.push({
      code: "live_report_error_mismatch",
      message: "Live report error objects must keep stable code, message, hint, and retryAfterMs fields."
    });
  }
}

function validateLiveReportCommandContract(step, issues) {
  if (!hasReadableText(step.command)) {
    addLiveReportCommandMismatchIssue(issues);
    return;
  }

  if (step.command === "manual") {
    if (step.ok === true || !LIVE_REPORT_MANUAL_STEP_NAMES.has(step.name)) {
      addLiveReportCommandMismatchIssue(issues);
    }
    return;
  }

  if (step.command === "internal") {
    if (step.ok === true || !LIVE_REPORT_INTERNAL_STEP_NAMES.has(step.name)) {
      addLiveReportCommandMismatchIssue(issues);
    }
    return;
  }

  const pattern = LIVE_REPORT_COMMAND_PATTERN_BY_STEP_NAME.get(step.name);
  if (!pattern || !pattern.test(step.command)) {
    addLiveReportCommandMismatchIssue(issues);
  }
}

function addLiveReportCommandMismatchIssue(issues) {
  if (!issues.some((issue) => issue.code === "live_report_command_mismatch")) {
    issues.push({
      code: "live_report_command_mismatch",
      message: "Live report command strings must match the redacted command contract."
    });
  }
}

function validateAllowedLiveReportKeys(value, allowedKeys, issues) {
  if (!Object.keys(value).some((key) => !allowedKeys.has(key))) {
    return;
  }

  if (!issues.some((issue) => issue.code === "live_report_unexpected_field")) {
    issues.push({
      code: "live_report_unexpected_field",
      message: "Live report contains fields outside the accepted schema."
    });
  }
}

function containsSensitiveLiveReportText(value, seen = new Set()) {
  if (typeof value === "string") {
    return redactLiveReportText(value, []) !== value;
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    const text = String(value);
    return redactLiveReportText(text, []) !== text;
  }

  if (Array.isArray(value)) {
    return value.some((item) => containsSensitiveLiveReportText(item, seen));
  }

  if (!isObject(value) || seen.has(value)) {
    return false;
  }

  seen.add(value);
  return Object.entries(value).some(
    ([key, item]) => redactLiveReportText(key, []) !== key || containsSensitiveLiveReportText(item, seen)
  );
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

const LIVE_REPORT_TOP_LEVEL_KEYS = new Set([
  "ok",
  "version",
  "generatedAt",
  "dataDir",
  "reportPath",
  "note",
  "requested",
  "attempted",
  "coverage",
  "missingCoverage",
  "steps"
]);
const LIVE_REPORT_CAPABILITY_KEYS = new Set(Object.keys(createLiveReportCapabilitySummary()));
const LIVE_REPORT_STEP_KEYS = new Set(["name", "command", "exitCode", "ok", "summary", "error", "manualEvidence"]);
const LIVE_REPORT_ERROR_KEYS = new Set(["code", "message", "hint", "retryAfterMs"]);
const LIVE_REPORT_MANUAL_EVIDENCE_KEYS = new Set([
  "status",
  "humanActionRequired",
  "automationBoundary",
  "handoffUrl",
  "handoffSurface",
  "browserOpenAfterReturn",
  "checkoutWaitCompleted",
  "cartPrecondition",
  "paymentStatus",
  "orderPlacement",
  "orderStatusCommand"
]);
const LIVE_REPORT_FALLBACK_SUMMARY_KEYS = new Set(["observed"]);
const LIVE_REPORT_MANUAL_STEP_NAMES = new Set(["session precondition", "live session"]);
const LIVE_REPORT_INTERNAL_STEP_NAMES = new Set(["live runner"]);
const LIVE_REPORT_BROWSER_CONTEXT_COMMAND_PATTERN_SOURCE =
  "(?: --browser-locale <redacted-browser-locale>)?(?: --browser-timezone <redacted-browser-timezone>)?";
const LIVE_REPORT_COMMAND_PATTERN_BY_STEP_NAME = new Map([
  ["doctor", liveCommandPattern("(?:--visible )?doctor --json")],
  ["status", liveCommandPattern("(?:--visible )?status --json")],
  ["login", liveCommandPattern("--visible login(?: --phone <redacted-phone>)? --json")],
  ["status live", liveCommandPattern("--visible status --live --json")],
  ["search", liveCommandPattern("--visible search <redacted-query> --json")],
  ["address add", liveCommandPattern("--visible address add --json")],
  ["address list", liveCommandPattern("--visible address list --json")],
  ["address use", liveCommandPattern("--visible address use <redacted-address-query> --json")],
  [
    "add",
    liveCommandPattern(
      "--visible add <redacted-query> --quantity (?:[1-9]|1[0-2])(?: --remove-limit-items)?(?: --choose)? --json"
    )
  ],
  ["cart", liveCommandPattern("--visible cart(?: --remove-limit-items)? --json")],
  ["remove", liveCommandPattern("--visible remove <redacted-cart-query> --json")],
  ["clear", liveCommandPattern("--visible clear --json")],
  ["checkout", liveCommandPattern("--visible checkout(?: --remove-limit-items)?(?: --wait)? --json")],
  ["track", liveCommandPattern("--visible track --json")],
  ["history", liveCommandPattern("--visible history --json")],
  ["reorder", liveCommandPattern("--visible reorder last --json")]
]);
const LIVE_REPORT_SUMMARY_KEYS_BY_STEP_NAME = new Map([
  ["doctor", new Set(["ok", "browserAutomationReady", "playwrightChromiumPassed", "warnings", "failures"])],
  ["status", new Set(["confirmedSession", "browserAutomationReady", "liveSessionState"])],
  ["login", new Set(["sessionSaved", "confirmedSession"])],
  ["status live", new Set(["confirmedSession", "browserAutomationReady", "liveSessionState"])],
  ["search", new Set(["productCount", "productDetailCount"])],
  ["address add", new Set(["addressCount", "selectedCount", "hasAddressDetail"])],
  ["address list", new Set(["addressCount", "selectedCount", "hasAddressDetail"])],
  ["address use", new Set(["selected", "hasAddressText", "hasAddressDetail"])],
  ["add", new Set(["productAdded", "productHasDetail", "cartItemCount"])],
  ["cart", new Set(["cartItemCount", "hasTotal"])],
  ["remove", new Set(["cartItemCount", "hasTotal"])],
  ["clear", new Set(["cartItemCount", "hasTotal"])],
  [
    "checkout",
    new Set([
      "status",
      "humanActionRequired",
      "automationBoundary",
      "handoffUrl",
      "handoffSurface",
      "browserOpenAfterReturn",
      "checkoutWaitCompleted",
      "cartPrecondition",
      "paymentStatus",
      "orderPlacement",
      "orderStatusCommand"
    ])
  ],
  ["track", new Set(["orderCount", "latestHasStatus", "latestHasEta"])],
  ["history", new Set(["orderCount", "latestHasStatus", "latestHasEta"])],
  ["reorder", new Set(["cartItemCount", "hasTotal"])]
]);

function liveCommandPattern(commandPatternSource) {
  return new RegExp(
    `^zepo --data-dir <redacted-data-dir>${LIVE_REPORT_BROWSER_CONTEXT_COMMAND_PATTERN_SOURCE} ${commandPatternSource}$`
  );
}

const LIVE_REPORT_REQUIRED_SUMMARY_KEYS_BY_STEP_NAME = new Map([
  ["doctor", new Set(["ok", "browserAutomationReady", "playwrightChromiumPassed", "warnings", "failures"])],
  ["status", new Set(["confirmedSession", "browserAutomationReady"])],
  ["login", new Set(["sessionSaved", "confirmedSession"])],
  ["status live", new Set(["confirmedSession", "browserAutomationReady", "liveSessionState"])],
  ["search", new Set(["productCount", "productDetailCount"])],
  ["address add", new Set(["addressCount", "selectedCount", "hasAddressDetail"])],
  ["address list", new Set(["addressCount", "selectedCount", "hasAddressDetail"])],
  ["address use", new Set(["selected", "hasAddressText", "hasAddressDetail"])],
  ["add", new Set(["productAdded", "productHasDetail", "cartItemCount"])],
  ["cart", new Set(["cartItemCount", "hasTotal"])],
  ["remove", new Set(["cartItemCount", "hasTotal"])],
  ["clear", new Set(["cartItemCount", "hasTotal"])],
  [
    "checkout",
    new Set([
      "status",
      "humanActionRequired",
      "automationBoundary",
      "handoffUrl",
      "handoffSurface",
      "browserOpenAfterReturn",
      "checkoutWaitCompleted",
      "cartPrecondition",
      "paymentStatus",
      "orderPlacement",
      "orderStatusCommand"
    ])
  ],
  ["track", new Set(["orderCount", "latestHasStatus", "latestHasEta"])],
  ["history", new Set(["orderCount", "latestHasStatus", "latestHasEta"])],
  ["reorder", new Set(["cartItemCount", "hasTotal"])]
]);
const LIVE_REPORT_BOOLEAN_SUMMARY_KEYS = new Set([
  "browserAutomationReady",
  "browserOpenAfterReturn",
  "checkoutWaitCompleted",
  "confirmedSession",
  "hasAddressDetail",
  "hasAddressText",
  "hasTotal",
  "humanActionRequired",
  "latestHasEta",
  "latestHasStatus",
  "observed",
  "ok",
  "playwrightChromiumPassed",
  "productAdded",
  "productHasDetail",
  "selected",
  "sessionSaved"
]);
const LIVE_REPORT_NON_NEGATIVE_INTEGER_SUMMARY_KEYS = new Set([
  "addressCount",
  "cartItemCount",
  "orderCount",
  "productCount",
  "productDetailCount",
  "selectedCount"
]);
const LIVE_REPORT_NON_NEGATIVE_INTEGER_SUMMARY_MAX_BY_KEY = new Map([
  ["addressCount", 200],
  ["cartItemCount", 200],
  ["orderCount", 200],
  ["productCount", 50],
  ["productDetailCount", 50],
  ["selectedCount", 200]
]);
const LIVE_REPORT_STRING_SUMMARY_KEYS = new Set([
  "liveSessionState",
  "automationBoundary",
  "handoffUrl",
  "handoffSurface",
  "cartPrecondition",
  "orderPlacement",
  "orderStatusCommand",
  "paymentStatus",
  "status"
]);
const LIVE_REPORT_STRING_ARRAY_SUMMARY_KEYS = new Set(["failures", "warnings"]);
const LIVE_REPORT_DOCTOR_CHECK_NAMES = new Set([
  "Node.js",
  "Data directory",
  "SQLite",
  "Zepto session",
  "Browser automation lock",
  "Headless browser throttle",
  "Zepto access challenge",
  "Playwright Chromium"
]);
const LIVE_REPORT_STRING_SUMMARY_ALLOWED_VALUES_BY_KEY = new Map([
  ["liveSessionState", new Set(["skipped", "logged-in", "login-required", "unknown"])],
  ["automationBoundary", new Set(["zepocli_did_not_click_payment_or_order_controls"])],
  ["handoffUrl", new Set(["https://www.zepto.com/?cart=open"])],
  ["handoffSurface", new Set(["visible_zepto_browser"])],
  ["cartPrecondition", new Set(["non_empty_cart_verified"])],
  ["orderPlacement", new Set(["not_confirmed_by_zepocli"])],
  ["orderStatusCommand", new Set(["zepo track"])],
  ["paymentStatus", new Set(["not_observed_by_zepocli"])],
  ["status", new Set(["checkout_handoff_returned"])]
]);
const LIVE_REPORT_STRING_ARRAY_SUMMARY_ALLOWED_VALUES_BY_KEY = new Map([
  ["failures", LIVE_REPORT_DOCTOR_CHECK_NAMES],
  ["warnings", LIVE_REPORT_DOCTOR_CHECK_NAMES]
]);

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

const LIVE_REPORT_STEP_ORDER_BY_NAME = new Map([
  ["doctor", 0],
  ["status", 1],
  ["login", 2],
  ["status live", 3],
  ["address add", 4],
  ["address list", 5],
  ["address use", 5],
  ["search", 6],
  ["add", 7],
  ["reorder", 8],
  ["remove", 9],
  ["clear", 10],
  ["cart", 11],
  ["checkout", 12],
  ["track", 13],
  ["history", 14]
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
    step: "login",
    accepts: (step) => step.summary?.sessionSaved === true && step.summary?.confirmedSession === true
  },
  {
    capability: "liveSession",
    step: "status live",
    accepts: (step) =>
      step.summary?.confirmedSession === true &&
      step.summary?.browserAutomationReady === true &&
      step.summary?.liveSessionState === "logged-in"
  },
  {
    capability: "search",
    step: "search",
    accepts: (step) => step.summary?.productCount > 0 && step.summary?.productDetailCount > 0
  },
  {
    capability: "addressAdd",
    step: "address add",
    accepts: (step) => step.summary?.addressCount > 0 && step.summary?.hasAddressDetail === true
  },
  {
    capability: "addressList",
    step: "address list",
    accepts: (step) => step.summary?.addressCount > 0 && step.summary?.hasAddressDetail === true
  },
  {
    capability: "addressUse",
    step: "address use",
    accepts: (step) =>
      step.summary?.selected === true &&
      step.summary?.hasAddressText === true &&
      step.summary?.hasAddressDetail === true
  },
  {
    capability: "add",
    step: "add",
    accepts: (step) =>
      step.summary?.productAdded === true &&
      step.summary?.productHasDetail === true &&
      step.summary?.cartItemCount > 0
  },
  {
    capability: "cart",
    step: "cart",
    accepts: (step) => step.summary?.cartItemCount > 0
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
      step.summary?.humanActionRequired === true &&
      step.summary?.automationBoundary === "zepocli_did_not_click_payment_or_order_controls" &&
      step.summary?.handoffUrl === "https://www.zepto.com/?cart=open" &&
      step.summary?.handoffSurface === "visible_zepto_browser" &&
      step.summary?.browserOpenAfterReturn === false &&
      typeof step.summary?.checkoutWaitCompleted === "boolean" &&
      step.summary?.cartPrecondition === "non_empty_cart_verified" &&
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

const LIVE_REPORT_ACCEPTANCE_REQUIREMENT_BY_STEP_NAME = new Map(
  LIVE_REPORT_ACCEPTANCE_REQUIREMENTS.map((requirement) => [requirement.step, requirement])
);

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
    return validateNonEmptyReadableProductArrayPayload(
      payload,
      "live_search_contract_mismatch",
      "Search JSON did not include readable product results with price or unit detail."
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

  if (name === "cart") {
    return validateNonEmptyCartSnapshotPayloadContract(payload);
  }

  if (name === "remove") {
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
  if (
    isObject(payload) &&
    typeof payload.confirmedSession === "boolean" &&
    hasStatusDiagnostics(payload) &&
    payload.browserAutomation.ready === true
  ) {
    return undefined;
  }

  return {
    code: "live_status_contract_mismatch",
    message: "Status JSON did not report ready browser automation."
  };
}

function validateLiveStatusPayloadContract(payload) {
  if (
    isObject(payload) &&
    hasStatusDiagnostics(payload) &&
    payload.browserAutomation.ready === true &&
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
    payload?.humanActionRequired === true &&
    payload?.automationBoundary === "zepocli_did_not_click_payment_or_order_controls" &&
    payload?.handoffUrl === "https://www.zepto.com/?cart=open" &&
    payload?.handoffSurface === "visible_zepto_browser" &&
    payload?.browserOpenAfterReturn === false &&
    typeof payload?.checkoutWaitCompleted === "boolean" &&
    payload?.cartPrecondition === "non_empty_cart_verified" &&
    payload?.paymentStatus === "not_observed_by_zepocli" &&
    payload?.orderPlacement === "not_confirmed_by_zepocli" &&
    payload?.orderStatusCommand === "zepo track"
  ) {
    return undefined;
  }

  if (
    payload?.status === "checkout_manual_action_required" &&
    payload?.payment === "handled_by_zepto" &&
    payload?.humanActionRequired === true &&
    payload?.automationBoundary === "zepocli_did_not_click_payment_or_order_controls" &&
    payload?.handoffUrl === "https://www.zepto.com/?cart=open" &&
    payload?.handoffSurface === "visible_zepto_browser" &&
    payload?.browserOpenAfterReturn === false &&
    typeof payload?.checkoutWaitCompleted === "boolean" &&
    payload?.cartPrecondition === "non_empty_cart_verified" &&
    payload?.paymentStatus === "not_observed_by_zepocli" &&
    payload?.orderPlacement === "not_confirmed_by_zepocli" &&
    payload?.orderStatusCommand === "zepo track"
  ) {
    return {
      code: "live_verification_incomplete",
      message: "Checkout requires manual Zepto payment-control action and is not checkout handoff coverage."
    };
  }

  return {
    code: "live_checkout_contract_mismatch",
    message: "Checkout JSON did not preserve the Zepto cart, payment, and order-placement handoff contract."
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
    hasReadableProduct(payload.product) &&
    isReadableCartSnapshotPayload(payload.cart) &&
    payload.cart.items.length > 0
  ) {
    return undefined;
  }

  return {
    code: "live_add_contract_mismatch",
    message: "Add JSON did not include an added product with price or unit detail and readable cart items."
  };
}

function validateAddressListPayloadContract(payload) {
  if (Array.isArray(payload) && payload.length > 0 && payload.every(hasReadableAddressPayload)) {
    return undefined;
  }

  return {
    code: "live_address_contract_mismatch",
    message: "Address JSON did not include address records with readable address detail."
  };
}

function validateAddressUsePayloadContract(payload) {
  if (isObject(payload) && payload.selected === true && hasLiveReportAddressDetailText(payload.text)) {
    return undefined;
  }

  return {
    code: "live_address_contract_mismatch",
    message: "Address selection JSON did not include a selected address with readable address detail."
  };
}

function validateReorderPayloadContract(payload) {
  if (isReadableCartSnapshotPayload(payload) && payload.items.length > 0) {
    return undefined;
  }

  return {
    code: "live_reorder_contract_mismatch",
    message: "Reorder JSON did not include readable cart items."
  };
}

function validateCartSnapshotPayloadContract(payload) {
  if (isReadableCartSnapshotPayload(payload)) {
    return undefined;
  }

  return {
    code: "live_cart_contract_mismatch",
    message: "Cart JSON did not include a readable cart item array."
  };
}

function validateNonEmptyCartSnapshotPayloadContract(payload) {
  if (isReadableCartSnapshotPayload(payload) && payload.items.length > 0) {
    return undefined;
  }

  return {
    code: "live_cart_contract_mismatch",
    message: "Cart JSON did not include readable non-empty cart items."
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
  if (Array.isArray(payload) && payload.every(isReadableHistoryOrderPayload)) {
    return undefined;
  }

  return {
    code: "live_history_contract_mismatch",
    message: "History JSON did not include a readable order-history array."
  };
}

function validateNonEmptyReadableProductArrayPayload(payload, code, message) {
  if (Array.isArray(payload) && payload.length > 0 && payload.every(hasReadableProduct)) {
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

function hasReadableProduct(value) {
  return (
    isObject(value) &&
    hasReadableText(value.name) &&
    (hasReadableText(value.price) || hasReadableText(value.unit))
  );
}

function isReadableCartSnapshotPayload(payload) {
  return isObject(payload) && Array.isArray(payload.items) && payload.items.every(hasReadableCartItemPayload);
}

function hasReadableCartItemPayload(value) {
  return isObject(value) && hasReadableText(value.name);
}

function hasReadableAddressPayload(value) {
  return isObject(value) && hasLiveReportAddressDetailText(value.text);
}

function isReadableHistoryOrderPayload(value) {
  return (
    isObject(value) &&
    (hasReadableText(value.status) || hasReadableText(value.eta))
  );
}

export function hasLiveReportAddressDetailText(value) {
  if (!hasReadableText(value)) {
    return false;
  }

  const normalized = value.replace(/\s+/g, " ").trim();
  return (
    normalized.length > 12 &&
    normalized.length < 400 &&
    LIVE_REPORT_ADDRESS_DETAIL_PATTERN.test(normalized) &&
    !LIVE_REPORT_ADDRESS_PLACEHOLDER_PATTERN.test(normalized) &&
    !LIVE_REPORT_ADDRESS_UNIT_PATTERN.test(normalized) &&
    !LIVE_REPORT_ADDRESS_NON_ADDRESS_PATTERN.test(normalized)
  );
}

function hasStatusDiagnostics(payload) {
  return hasAutomationDiagnostics(payload) && hasCacheDiagnostics(payload);
}

function hasAutomationDiagnostics(payload) {
  return (
    hasReadableText(payload.version) &&
    hasBrowserAutomationModeDiagnostics(payload.browserAutomationMode) &&
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

function hasBrowserAutomationModeDiagnostics(value) {
  if (!isObject(value)) {
    return false;
  }

  if (value.default !== "background_headless") {
    return false;
  }

  if (value.current !== "background_headless" && value.current !== "visible_human_controlled") {
    return false;
  }

  return value.visibleRequested === (value.current === "visible_human_controlled");
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

function commandFailureMessage(preferred, stderr, redactions) {
  const candidates = [];
  if (hasReadableText(preferred)) {
    candidates.push(preferred);
  }
  candidates.push(...stderrLines(stderr));

  for (const candidate of candidates) {
    const redacted = redactLiveReportText(candidate, redactions).trim();
    if (isInformativeCommandFailureLine(redacted)) {
      return redacted;
    }
  }

  return "Command failed.";
}

function stderrLines(value) {
  return String(value ?? "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function isInformativeCommandFailureLine(value) {
  const text = String(value ?? "").trim();
  if (!text) {
    return false;
  }

  const withoutRedactedPaths = text.replace(/<redacted-(?:data-dir|report-path|local-path)>/g, "");
  const remainingText = withoutRedactedPaths.replace(/[0-9\s:.,;!?()[\]{}'"<>\\/|`~^_-]+/g, "");
  return /[A-Za-z]/.test(remainingText);
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
  const redactions = liveReportTextRedactions(args);
  const redactPending = (value) => redactLiveReportText(value, redactions);

  return {
    write(chunk) {
      const text = String(chunk ?? "");
      if (!text) {
        return;
      }

      if (immediate) {
        pending += text;
        flushImmediateLiveConsolePending();
        return;
      }

      pending += text;
      const newlineIndex = Math.max(pending.lastIndexOf("\n"), pending.lastIndexOf("\r"));
      if (newlineIndex >= 0) {
        const flushable = pending.slice(0, newlineIndex + 1);
        pending = pending.slice(newlineIndex + 1);
        write(redactPending(flushable));
      }

      if (pending.length > LIVE_CONSOLE_BUFFERED_FLUSH_CHARS) {
        const tailLength = Math.max(LIVE_CONSOLE_BUFFERED_TAIL_CHARS, liveConsoleSensitiveTailLength(pending, redactions));
        if (pending.length > tailLength) {
          const flushable = pending.slice(0, -tailLength);
          pending = pending.slice(-tailLength);
          write(redactPending(flushable));
        }
      }
    },
    flush() {
      if (!pending) {
        return;
      }

      write(redactPending(pending));
      pending = "";
    }
  };

  function flushImmediateLiveConsolePending() {
    const tailLength = liveConsoleSensitiveTailLength(pending, redactions);
    if (pending.length <= tailLength) {
      return;
    }

    const flushable = pending.slice(0, pending.length - tailLength);
    pending = tailLength > 0 ? pending.slice(-tailLength) : "";
    write(redactPending(flushable));
  }
}

export function redactArgsForLiveReport(args) {
  const redacted = redactOptionValues(
    args,
    new Map([
      ["--browser-locale", "<redacted-browser-locale>"],
      ["--browser-timezone", "<redacted-browser-timezone>"],
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

function redactOptionValues(args, redactions) {
  const result = [...args];
  for (let index = 0; index < result.length; index += 1) {
    const arg = result[index];
    const replacement = redactions.get(arg);
    if (replacement !== undefined && index + 1 < result.length) {
      result[index + 1] = replacement;
      index += 1;
      continue;
    }

    const assignment = splitValueOptionAssignment(arg);
    const assignmentReplacement = assignment ? redactions.get(assignment.option) : undefined;
    if (assignment && assignmentReplacement !== undefined) {
      result[index] = `${assignment.option}=${assignmentReplacement}`;
    }
  }

  return result;
}

function liveReportTextRedactions(args) {
  const redactions = [];
  collectOptionValueRedactions(args, redactions, {
    "--browser-locale": "<redacted-browser-locale>",
    "--browser-timezone": "<redacted-browser-timezone>",
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
    const arg = args[index];
    const replacement = replacements[arg];
    if (replacement !== undefined) {
      addRedaction(redactions, args[index + 1], replacement);
      index += 1;
      continue;
    }

    const assignment = splitValueOptionAssignment(arg);
    const assignmentReplacement = assignment ? replacements[assignment.option] : undefined;
    if (assignment && assignmentReplacement !== undefined) {
      addRedaction(redactions, assignment.value, assignmentReplacement);
    }
  }
}

function splitValueOptionAssignment(arg) {
  const text = String(arg ?? "");
  const equalsIndex = text.indexOf("=");
  if (equalsIndex <= 0 || !text.startsWith("--")) {
    return undefined;
  }

  return {
    option: text.slice(0, equalsIndex),
    value: text.slice(equalsIndex + 1)
  };
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

function liveConsoleSensitiveTailLength(value, redactions) {
  const text = String(value ?? "");
  let length = 0;

  for (const redaction of redactions) {
    length = Math.max(length, redactionPrefixTailLength(text, redaction.value));
  }

  for (const pattern of LIVE_CONSOLE_SENSITIVE_TAIL_PATTERNS) {
    const match = text.match(pattern);
    if (match?.index !== undefined) {
      length = Math.max(length, text.length - match.index);
    }
  }

  return length;
}

function redactionPrefixTailLength(text, redactionValue) {
  const sensitive = String(redactionValue ?? "");
  const maxLength = Math.min(text.length, Math.max(0, sensitive.length - 1));

  for (let length = maxLength; length > 0; length -= 1) {
    if (sensitive.startsWith(text.slice(-length))) {
      return length;
    }
  }

  return 0;
}

const LIVE_CONSOLE_SENSITIVE_TAIL_PATTERNS = [
  /\bn(?:p(?:m_?)?)?$/,
  /\bnpm_[A-Za-z0-9]*$/,
  /\border\s*(?:#|ID:?)\s*[A-Z0-9-]*$/i,
  /\bZEP[A-Z0-9-]*$/i,
  /\b(?:otp|one[-\s]*time(?:\s+(?:password|code))?|verification code|passcode|upi\s*pin|atm\s*pin|cvv|cvc)\s*(?:is|:|=|-)?\s*\d{0,8}$/i,
  /(?<!\d)(?:\+?9(?:1[\s-]?)?|0)$/,
  /(?<!\d)(?:\+?91[\s-]?|0)?[6-9][\d\s-]*$/,
  /\b\d(?:[ -]?\d){3,18}$/,
  /(?<![\w.-])[\w.-]{2,}@[A-Za-z]?[A-Za-z0-9.-]*$/,
  /file:\/\/\/[A-Za-z]:[\\/](?![\\/])[^\r\n"',;<>|]*$/i,
  /(?<![A-Za-z])[A-Za-z]:[\\/](?![\\/])[^\r\n"',;<>|]*$/,
  /\/(?:Users|home|tmp|var|private|workspace|mnt|opt|root)\/[^\r\n"',;<>|]*$/,
  /(?<![\w.-])\.{1,2}[\\/][^\r\n"',;<>|]*$/,
  /(?<![\w.-])\.zept?o(?:-[A-Za-z0-9._-]+)?(?:[\\/][^\r\n"',;<>|]*)?$/,
  /\b(?:phone|mobile|tel|otp|pin|cvv|cvc|card|payment|upi|auth|session|password|passwd|passphrase|pwd|secret|credential|token|jwt|access[-_]?token|refresh[-_]?token|id[-_]?token|path|file|data[-_]?dir|report(?:[-_]?path)?)\s*(?:=|%3[Dd])[^&\s"'<>]*$/i,
  /[^\s"',;<>]*%[0-9A-Fa-f]{0,2}[^\s"',;<>]*$/
];

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
    .replace(/\/(?:Users|home|tmp|var|private|workspace|mnt|opt|root)\/[^\r\n"',;<>|]+/g, redactLocalPathMatch)
    .replace(/(?<![\w.-])\.{1,2}[\\/][^\r\n"',;<>|]+/g, redactLocalPathMatch)
    .replace(/(?<![\w.-])\.zept?o(?:-[A-Za-z0-9._-]+)?(?:[\\/][^\r\n"',;<>|]+)?/g, redactLocalPathMatch);
}

function redactEncodedSensitiveParameterValues(value) {
  return String(value ?? "").replace(
    /\b((?:phone|mobile|tel|otp|pin|cvv|cvc|card|payment|upi|auth|session|password|passwd|passphrase|pwd|secret|credential|token|jwt|access[-_]?token|refresh[-_]?token|id[-_]?token|path|file|data[-_]?dir|report(?:[-_]?path)?)\s*(?:=|%3[Dd]))([^&\s"'<>]+)/gi,
    (match, prefix, encodedValue) => {
      const decoded = decodeQueryValue(encodedValue);
      if (!decoded) {
        return match;
      }

      if (/(?:auth|session|password|passwd|passphrase|pwd|secret|credential|token|jwt)/i.test(prefix)) {
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
    const separator = connector[0];
    const suffix = value.slice(connector.index + separator.length);
    return `${redactLocalPathMatch(value.slice(0, connector.index))}${separator}${
      startsWithLocalPathLikeText(suffix) ? redactLocalPathMatch(suffix) : suffix
    }`;
  }

  const punctuation = value.match(/[.,;:!?)]$/)?.[0] ?? "";
  return `<redacted-local-path>${punctuation}`;
}

function startsWithLocalPathLikeText(value) {
  return /^(?:file:\/\/\/[A-Za-z]:[\\/]|[A-Za-z]:[\\/]|\/(?:Users|home|tmp|var|private|workspace|mnt|opt|root)\/|\.{1,2}[\\/]|\.zept?o(?:[\\/.-]|$))/i.test(
    String(value ?? "")
  );
}

function collectPositionals(args) {
  const valueOptions = new Set([
    "--browser-locale",
    "--browser-timezone",
    "--data-dir",
    "--phone",
    "--quantity",
    "--report",
    "--timeout"
  ]);
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
