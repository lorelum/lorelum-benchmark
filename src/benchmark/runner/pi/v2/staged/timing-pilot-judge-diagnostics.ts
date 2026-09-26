import { join } from "node:path";
import { workspaceRoot } from "../../../../fs";
import { asyncReportJudgeEnv, httpAsyncReportJudgeCompletion } from "../../../../judge/async-report-replan/v1/llm";
import { calibrationAttestationKey, calibrationScope, loadCalibrationFixtures, runCalibration, verifyCalibrationSnapshot, type CalibrationFixtureId, type CalibrationThresholds } from "../../../../judge/async-report-replan/v1/calibration";
import { buildAsyncReportJudgeInput, scoreForCalibration } from "../../../../judge/async-report-replan/v1/provider";
import { fixedRubricHashes, assertReplanScoredOutput } from "../../../../judge/async-report-replan/v1/score";
import { redactAbsolutePaths, redactSensitiveCredentials } from "../../../../judge/privacy";
import { runAsyncReportReplanAttempt } from "../../../../judge/async-report-replan/v1/run";
import type { AsyncReportAccounting, CalibrationReport, JudgeCompletionWithUsage, JudgeUsage, RawReplanAttempt, ReplanEvidence, UsageValue } from "../../../../judge/async-report-replan/v1/types";
import type { JudgeResultV1 } from "../../../../outcome/v1/contract";

export const timingPilotJudgeCalibrationDiagnosticsSchema = "async-report-timing-pilot-judge-calibration-diagnostics/v1" as const;

export type SafeJudgeFailure = Readonly<{
  stage: "input" | "request" | "response" | "scoring" | "runner";
  code: "timeout" | "http_error" | "transport_error" | "response_parse_error" | "empty_response" | "invalid_structured_output" | "precondition_rejected" | "unknown";
  http_status?: number;
}>;

export type CalibrationGateCheck = Readonly<{
  id: "reference_minimum" | "equivalent_distance" | "anti_pattern_maximum" | "reference_separation";
  observed: number | null;
  operator: ">=" | "<=";
  threshold: number;
  status: "passed" | "failed" | "not_evaluable";
}>;

export type CalibrationCallObservation = Readonly<{
  call_index: number;
  fixture_group: CalibrationFixtureId | "unmapped";
  opaque_case_id: string;
  repetition: number;
  status: "observed" | "indeterminate" | "unavailable";
  score: number | null;
  confidence: number | null;
  criteria: readonly Readonly<{ id: string; points: number; max_points: number; rationale: string }>[];
  prompt_hash: string | null;
  input_hash: string | null;
  duration_ms: number;
  usage: Readonly<Record<keyof JudgeUsage, UsageValue>>;
  failure?: SafeJudgeFailure;
  reason?: string;
}>;

export type JudgeCalibrationDiagnostics = Readonly<{
  schema_version: typeof timingPilotJudgeCalibrationDiagnosticsSchema;
  status: "captured" | "details_unavailable";
  reason?: "cached_report_without_sidecar" | "calibration_run_failed";
  calibration: Readonly<{
    id: string;
    version: string;
    hash: string | null;
    status: CalibrationReport["status"] | "unavailable";
    model: string | null;
    calls: number;
    duration_ms: number;
    usage: Readonly<Record<keyof JudgeUsage, UsageValue>>;
    medians: CalibrationReport["medians"];
    report_reason?: string;
  }>;
  contract_snapshot_verified: boolean | null;
  thresholds: CalibrationThresholds | null;
  gate_checks: readonly CalibrationGateCheck[];
  observations: readonly CalibrationCallObservation[];
  failure?: SafeJudgeFailure;
}>;

export type JudgeAttemptDiagnostics = Readonly<{
  call_attempted: boolean;
  duration_ms: number;
  failure?: SafeJudgeFailure;
}>;

const calibrationManifestPath = join(workspaceRoot, "src/benchmark/judge/async-report-replan/v1/private/calibration/manifest.json");

function privateDiagnosticText(value: string): string {
  return redactSensitiveCredentials(redactAbsolutePaths(value)).replace(/https?:\/\/[^\s<>"\']+/gi, "[redacted-url]");
}

function safeErrorText(error: unknown): { name: string; message: string } {
  return error instanceof Error ? { name: error.name, message: error.message } : { name: "UnknownError", message: String(error) };
}

export function classifyJudgeFailure(error: unknown, defaultStage: SafeJudgeFailure["stage"] = "request"): SafeJudgeFailure {
  const { name, message } = safeErrorText(error);
  const http = /\bHTTP\s+(\d{3})\b/i.exec(message);
  if (http) return { stage: "request", code: "http_error", http_status: Number(http[1]) };
  if (name === "AbortError" || /\b(?:timeout|timed out|aborted)\b/i.test(message)) return { stage: "request", code: "timeout" };
  if (/no structured content/i.test(message)) return { stage: "response", code: "empty_response" };
  if (name === "SyntaxError" || /json parse|unexpected token|unexpected end of json/i.test(message)) return { stage: "response", code: "response_parse_error" };
  if (/Invalid async-report replan Judge output/i.test(message)) return { stage: "response", code: "invalid_structured_output" };
  if (name === "TypeError" || /fetch failed|network error|connection refused/i.test(message)) return { stage: "request", code: "transport_error" };
  if (/evidence|provenance|input validation|calibration/i.test(message)) return { stage: "input", code: "precondition_rejected" };
  return { stage: defaultStage, code: "unknown" };
}

function failureLabel(failure: SafeJudgeFailure): string {
  return failure.http_status === undefined ? `${failure.stage}/${failure.code}` : `${failure.stage}/${failure.code} (HTTP ${failure.http_status})`;
}

function emptyUsage(): Record<keyof JudgeUsage, UsageValue> {
  return { input_tokens: "unavailable", output_tokens: "unavailable", total_tokens: "unavailable", cost_usd: "unavailable" };
}

function safeUsage(value?: Partial<JudgeUsage>): Record<keyof JudgeUsage, UsageValue> {
  const result = emptyUsage();
  if (!value) return result;
  for (const key of Object.keys(result) as Array<keyof JudgeUsage>) {
    const field = value[key];
    if (typeof field === "number" && Number.isFinite(field) && field >= 0) result[key] = field;
    else if (field === "unavailable") result[key] = field;
  }
  return result;
}

export async function readCalibrationThresholds(): Promise<CalibrationThresholds | null> {
  try {
    const value = await Bun.file(calibrationManifestPath).json() as { thresholds?: unknown };
    const thresholds = value.thresholds;
    if (!thresholds || typeof thresholds !== "object" || Array.isArray(thresholds)) return null;
    const candidate = thresholds as Record<string, unknown>;
    if ([candidate.reference_min, candidate.equivalent_max_difference, candidate.anti_pattern_max, candidate.reference_min_difference].some((field) => typeof field !== "number" || !Number.isFinite(field))) return null;
    return {
      reference_min: candidate.reference_min as number,
      equivalent_max_difference: candidate.equivalent_max_difference as number,
      anti_pattern_max: candidate.anti_pattern_max as number,
      reference_min_difference: candidate.reference_min_difference as number,
    };
  } catch {
    return null;
  }
}

export function evaluateCalibrationGateChecks(medians: CalibrationReport["medians"], thresholds: CalibrationThresholds | null): CalibrationGateCheck[] {
  if (!thresholds) return [];
  const reference = medians.reference;
  const equivalent = medians.equivalent;
  const antiPattern = medians["anti-pattern"];
  const check = (id: CalibrationGateCheck["id"], observed: number | null, operator: CalibrationGateCheck["operator"], threshold: number, passed: boolean | null): CalibrationGateCheck => ({
    id, observed, operator, threshold,
    status: passed === null ? "not_evaluable" : passed ? "passed" : "failed",
  });
  return [
    check("reference_minimum", reference ?? null, ">=", thresholds.reference_min, reference === undefined ? null : reference >= thresholds.reference_min),
    check("equivalent_distance", reference === undefined || equivalent === undefined ? null : Math.abs(reference - equivalent), "<=", thresholds.equivalent_max_difference, reference === undefined || equivalent === undefined ? null : Math.abs(reference - equivalent) <= thresholds.equivalent_max_difference),
    check("anti_pattern_maximum", antiPattern ?? null, "<=", thresholds.anti_pattern_max, antiPattern === undefined ? null : antiPattern <= thresholds.anti_pattern_max),
    check("reference_separation", reference === undefined || antiPattern === undefined ? null : reference - antiPattern, ">=", thresholds.reference_min_difference, reference === undefined || antiPattern === undefined ? null : reference - antiPattern >= thresholds.reference_min_difference),
  ];
}

function gateLabel(id: CalibrationGateCheck["id"]): string {
  switch (id) {
    case "reference_minimum": return "Reference-group minimum score";
    case "equivalent_distance": return "Equivalent-group distance from reference";
    case "anti_pattern_maximum": return "Anti-pattern maximum score";
    case "reference_separation": return "Reference/anti-pattern separation";
  }
}

function mdCell(value: string): string {
  return value.replaceAll("|", "\\|").replaceAll("\r", " ").replaceAll("\n", " ");
}

export function renderJudgeCalibrationDiagnosticsMarkdown(diagnostics: JudgeCalibrationDiagnostics): string {
  const lines = [
    "# Judge calibration diagnostics (private)",
    "",
    "This host-side artifact is not sent to the Judge or Agent. It contains criterion-level rationales; keep it in ignored scratch/private storage.",
    "",
    `- detail status: ${diagnostics.status}`,
    ...(diagnostics.reason ? [`- detail reason: ${diagnostics.reason}`] : []),
    `- calibration: ${diagnostics.calibration.id} ${diagnostics.calibration.version}`,
    `- calibration hash: ${diagnostics.calibration.hash ?? "unavailable"}`,
    `- Judge model: ${diagnostics.calibration.model ?? "unavailable"}`,
    `- qualification status: ${diagnostics.calibration.status}`,
    `- calls / duration: ${diagnostics.calibration.calls} / ${diagnostics.calibration.duration_ms} ms`,
    `- usage input/output/total/cost: ${diagnostics.calibration.usage.input_tokens} / ${diagnostics.calibration.usage.output_tokens} / ${diagnostics.calibration.usage.total_tokens} / ${diagnostics.calibration.usage.cost_usd}`,
    `- calibration snapshot verified: ${diagnostics.contract_snapshot_verified}`,
    ...(diagnostics.calibration.report_reason ? [`- report reason: ${diagnostics.calibration.report_reason}`] : []),
    "",
    "## Calibration gate checks",
    "",
    "| Check | Observed | Requirement | Result |",
    "|---|---:|---:|---|",
    ...diagnostics.gate_checks.map((entry) => `| ${gateLabel(entry.id)} | ${entry.observed ?? "not available"} | ${entry.operator} ${entry.threshold} | ${entry.status} |`),
    "",
    "## Individual Judge calls",
    "",
  ];
  if (diagnostics.observations.length === 0) lines.push("No per-call scoring details were captured.", "");
  for (const observation of diagnostics.observations) {
    lines.push(`### Call ${observation.call_index}: ${observation.fixture_group}, repetition ${observation.repetition}`, "", `- opaque case id: ${observation.opaque_case_id}`, `- status / score / confidence: ${observation.status} / ${observation.score ?? "unavailable"} / ${observation.confidence ?? "unavailable"}`, `- duration: ${observation.duration_ms} ms`, `- usage input/output/total/cost: ${observation.usage.input_tokens} / ${observation.usage.output_tokens} / ${observation.usage.total_tokens} / ${observation.usage.cost_usd}`, `- prompt/input hash: ${observation.prompt_hash ?? "unavailable"} / ${observation.input_hash ?? "unavailable"}`);
    if (observation.failure) lines.push(`- failure: ${failureLabel(observation.failure)}`);
    if (observation.reason) lines.push(`- result reason: ${mdCell(observation.reason)}`);
    if (observation.criteria.length > 0) {
      lines.push("", "| Criterion | Points | Judge rationale |", "|---|---:|---|");
      for (const criterion of observation.criteria) lines.push(`| ${mdCell(criterion.id)} | ${criterion.points}/${criterion.max_points} | ${mdCell(criterion.rationale)} |`);
    }
    lines.push("");
  }
  if (diagnostics.failure) lines.push("## Calibration runner failure", "", `- ${failureLabel(diagnostics.failure)}`, "");
  lines.push("Raw prompt, full provider response, endpoint, and credentials are intentionally not stored.", "");
  return `${lines.join("\n")}\n`;
}

function diagnosticsFromCachedReport(report: CalibrationReport): JudgeCalibrationDiagnostics {
  return {
    schema_version: timingPilotJudgeCalibrationDiagnosticsSchema,
    status: "details_unavailable",
    reason: "cached_report_without_sidecar",
    calibration: {
      id: report.id, version: report.version, hash: report.hash, status: report.status,
      model: report.scope.model, calls: report.calls, duration_ms: report.duration_ms,
      usage: safeUsage(report.usage), medians: report.medians,
      ...(report.reason ? { report_reason: privateDiagnosticText(report.reason).slice(0, 240) } : {}),
    },
    contract_snapshot_verified: null,
    thresholds: null,
    gate_checks: [],
    observations: [],
  };
}

export function createCachedReportDiagnostics(report: CalibrationReport): JudgeCalibrationDiagnostics {
  return diagnosticsFromCachedReport(report);
}

function safeObservation(input: CalibrationCallObservation): CalibrationCallObservation {
  return {
    ...input,
    criteria: input.criteria.map((criterion) => ({ ...criterion, rationale: privateDiagnosticText(criterion.rationale).slice(0, 500) })),
    ...(input.reason ? { reason: privateDiagnosticText(input.reason).slice(0, 240) } : {}),
  };
}

export async function runRealCalibrationWithDiagnostics(options: {
  env?: Record<string, string | undefined>;
  complete?: JudgeCompletionWithUsage;
} = {}): Promise<{ report: CalibrationReport; diagnostics: JudgeCalibrationDiagnostics }> {
  const env = options.env ?? Bun.env;
  const resolved = asyncReportJudgeEnv(env);
  let contractSnapshotVerified = false;
  let fixtureByCaseId = new Map<string, { id: CalibrationFixtureId; evidence: ReplanEvidence }>();
  let thresholds: CalibrationThresholds | null = null;
  try {
    contractSnapshotVerified = await verifyCalibrationSnapshot();
    if (contractSnapshotVerified) {
      const fixtures = await loadCalibrationFixtures();
      fixtureByCaseId = new Map(fixtures.map((fixture) => [fixture.evidence.blind_case_id, { id: fixture.id, evidence: fixture.evidence }]));
      thresholds = await readCalibrationThresholds();
    }
  } catch {
    contractSnapshotVerified = false;
  }
  let complete: JudgeCompletionWithUsage | undefined;
  const rubric = await fixedRubricHashes();
  const repetitions = new Map<string, number>();
  const observations: CalibrationCallObservation[] = [];
  const report = await runCalibration({
    mode: "real",
    env,
    scope: calibrationScope(resolved.model ?? null),
    attestation_key: calibrationAttestationKey("real", env),
    score: async (evidence, capability) => {
      const fixture = fixtureByCaseId.get(evidence.blind_case_id);
      const group: CalibrationFixtureId | "unmapped" = fixture?.id ?? "unmapped";
      const repetition = (repetitions.get(group) ?? 0) + 1;
      repetitions.set(group, repetition);
      const callIndex = observations.length + 1;
      const started = performance.now();
      let failure: SafeJudgeFailure | undefined;
      try {
        complete ??= options.complete ?? httpAsyncReportJudgeCompletion(env);
        const observedComplete: JudgeCompletionWithUsage = async (system, user) => {
          try {
            const response = await complete!(system, user);
            try { assertReplanScoredOutput(response.output); }
            catch (error) { failure = classifyJudgeFailure(error, "response"); }
            return response;
          } catch (error) {
            failure = classifyJudgeFailure(error, "request");
            throw error;
          }
        };
        const input = await buildAsyncReportJudgeInput(evidence);
        const scored = await scoreForCalibration(input, {
          judge: { id: "judge-agent/async-report-replan/v1", version: "v1" },
          rubric_hash: rubric.hash,
          input_hash: input.input_hash,
        }, observedComplete, capability);
        const result = scored.result;
        const observation: CalibrationCallObservation = {
          call_index: callIndex,
          fixture_group: group,
          opaque_case_id: evidence.blind_case_id,
          repetition,
          status: result.state === "observed" ? "observed" : result.state === "indeterminate" ? "indeterminate" : "unavailable",
          score: result.state === "observed" ? result.score : null,
          confidence: result.confidence,
          criteria: result.criteria.map((criterion) => ({ id: criterion.id, points: criterion.points, max_points: criterion.max_points, rationale: criterion.rationale })),
          prompt_hash: result.prompt_hash,
          input_hash: result.input_hash,
          duration_ms: Math.max(0, Math.round(performance.now() - started)),
          usage: safeUsage(scored.usage),
          ...(failure ? { failure } : {}),
          ...(result.reason ? { reason: result.reason } : {}),
        };
        observations.push(safeObservation(observation));
        return scored;
      } catch (error) {
        observations.push({
          call_index: callIndex,
          fixture_group: group,
          opaque_case_id: evidence.blind_case_id,
          repetition,
          status: "unavailable",
          score: null,
          confidence: null,
          criteria: [],
          prompt_hash: null,
          input_hash: null,
          duration_ms: Math.max(0, Math.round(performance.now() - started)),
          usage: emptyUsage(),
          failure: failure ?? classifyJudgeFailure(error, "scoring"),
        });
        throw error;
      }
    },
  });
  const gateChecks = evaluateCalibrationGateChecks(report.medians, thresholds);
  const diagnostics: JudgeCalibrationDiagnostics = {
    schema_version: timingPilotJudgeCalibrationDiagnosticsSchema,
    status: "captured",
    calibration: {
      id: report.id, version: report.version, hash: report.hash, status: report.status,
      model: report.scope.model, calls: report.calls, duration_ms: report.duration_ms,
      usage: safeUsage(report.usage), medians: report.medians,
      ...(report.reason ? { report_reason: privateDiagnosticText(report.reason).slice(0, 240) } : {}),
    },
    contract_snapshot_verified: contractSnapshotVerified,
    thresholds,
    gate_checks: gateChecks,
    observations,
  };
  return { report, diagnostics };
}

export async function runAsyncReportReplanAttemptWithDiagnostics(raw: RawReplanAttempt, options: {
  env?: Record<string, string | undefined>;
  complete?: JudgeCompletionWithUsage;
  mode?: "mock" | "real";
  calibration?: CalibrationReport;
  now?: () => number;
} = {}): Promise<{ result: JudgeResultV1; accounting: AsyncReportAccounting; evidence?: unknown; diagnostics: JudgeAttemptDiagnostics }> {
  const env = options.env ?? Bun.env;
  const mode = options.mode ?? (options.complete ? undefined : asyncReportJudgeEnv(env).real ? "real" : undefined);
  let callAttempted = false;
  let failure: SafeJudgeFailure | undefined;
  const started = performance.now();
  const complete: JudgeCompletionWithUsage = async (system, user) => {
    try {
      const delegate = options.complete ?? httpAsyncReportJudgeCompletion(env);
      callAttempted = true;
      const response = await delegate(system, user);
      try { assertReplanScoredOutput(response.output); }
      catch (error) { failure = classifyJudgeFailure(error, "response"); }
      return response;
    } catch (error) {
      failure = classifyJudgeFailure(error, "request");
      throw error;
    }
  };
  const attempt = await runAsyncReportReplanAttempt(raw, { ...options, env, mode, complete });
  if (callAttempted && attempt.result.state === "judge-unavailable" && !failure) failure = { stage: "scoring", code: "invalid_structured_output" };
  if (!callAttempted && attempt.result.state === "indeterminate") failure = { stage: "input", code: "precondition_rejected" };
  const safeAccounting = attempt.accounting.failure_reason
    ? { ...attempt.accounting, failure_reason: failure ? failureLabel(failure) : "Judge returned a non-observed result; see private diagnostics" }
    : attempt.accounting;
  return {
    ...attempt,
    accounting: safeAccounting,
    diagnostics: { call_attempted: callAttempted, duration_ms: Math.max(0, Math.round(performance.now() - started)), ...(failure ? { failure } : {}) },
  };
}

export function calibrationDiagnosticsForPreflightError(error: unknown): JudgeCalibrationDiagnostics {
  return {
    schema_version: timingPilotJudgeCalibrationDiagnosticsSchema,
    status: "details_unavailable",
    reason: "calibration_run_failed",
    calibration: {
      id: "async-report-replan-judge-calibration", version: "v1", hash: null,
      status: "unavailable", model: null, calls: 0, duration_ms: 0,
      usage: emptyUsage(), medians: {},
      report_reason: "Calibration orchestration failed before a report was returned.",
    },
    contract_snapshot_verified: null,
    thresholds: null,
    gate_checks: [],
    observations: [],
    failure: classifyJudgeFailure(error, "runner"),
  };
}
