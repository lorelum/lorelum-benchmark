import { sha256Text } from "../../../fs";
import { accountingStateFromJudgeState, buildAccounting, evidenceRef } from "./accounting";
import { projectReplanEvidence } from "./evidence";
import { asyncReportJudgeEnv, httpAsyncReportJudgeCompletion } from "./llm";
import { evaluationPlan, evaluationPlanHash } from "./plan";
import { fixedRubricHashes, replanScorePrompt, resultBase } from "./score";
import { isOpaqueBlindCaseId } from "./canonical";
import { buildAsyncReportJudgeInput, scoreValidatedInput } from "./provider";
import { loadRubric } from "./rubric";
import { calibrationAttestationKey, calibrationIdentity, calibrationScope, resolveCalibrationStatus } from "./calibration";
import type { AsyncReportAccounting, CalibrationReport, JudgeCompletionWithUsage, RawReplanAttempt, ReplanEvidence } from "./types";
import type { JudgeResultV1 } from "../../../outcome/v1/contract";

export type AsyncReportAttemptRun = { evidence?: ReplanEvidence; result: JudgeResultV1; accounting: AsyncReportAccounting };

function safeBlindCaseId(value: unknown): string {
  return isOpaqueBlindCaseId(value) ? value : "indeterminate";
}

async function diagnosticResult(judge: { id: string; version: string }, rubricHash: string, inputHash: string, state: "indeterminate" | "judge-unavailable" | "not-run", reason: string, promptHash?: string): Promise<JudgeResultV1> {
  return resultBase(judge, promptHash ?? await sha256Text(`${state}:${reason}`), rubricHash, inputHash, state, 0, reason);
}

export async function runAsyncReportReplanAttempt(raw: RawReplanAttempt, options: {
  env?: Record<string, string | undefined>;
  complete?: JudgeCompletionWithUsage;
  mode?: "mock" | "real";
  calibration?: CalibrationReport;
  now?: () => number;
} = {}): Promise<AsyncReportAttemptRun> {
  const start = options.now?.() ?? performance.now();
  const env = asyncReportJudgeEnv(options.env ?? Bun.env);
  const mode = options.mode ?? (options.complete ? undefined : env.real ? "real" : undefined);
  const calibrationMode = mode === "real" ? "real" : "mock";
  const attestationKey = calibrationAttestationKey(calibrationMode, options.env ?? Bun.env);
  const judge = { id: "judge-agent/async-report-replan/v1", version: "v1" };
  const provider = { ...judge, model: env.model ?? null };
  const [planHash, rubric, rubricDocument] = await Promise.all([evaluationPlanHash(), fixedRubricHashes(), loadRubric()]);
  const calibration = await resolveCalibrationStatus(options.calibration, calibrationScope(mode === "real" ? env.model ?? null : "mock"), attestationKey);
  const projected = await projectReplanEvidence(raw);
  const blindCaseId = safeBlindCaseId(raw?.blind_case_id);
  const elapsed = () => Math.max(0, (options.now?.() ?? performance.now()) - start);
  const baseRefs = { plan: { id: evaluationPlan.id, version: evaluationPlan.version, hash: planHash }, rubric: { id: "async-report-replan-rubric", version: "v1", hash: rubric.hash }, calibration };

  if (!projected.ok) {
    const result = await diagnosticResult(judge, rubric.hash, projected.evidence_hash, "indeterminate", projected.reason);
    return { result, accounting: buildAccounting({ state: "indeterminate", blind_case_id: blindCaseId, ...baseRefs, evidence: { schema_version: "replan-evidence/v1", hash: projected.evidence_hash }, prompt_hash: result.prompt_hash, input_hash: projected.evidence_hash, provider, calls: { calibration: calibration.calls, scoring: 0 }, duration_ms: elapsed(), failure_reason: projected.reason }) };
  }

  const evidence = projected.evidence;
  const promptHash = await sha256Text(replanScorePrompt(evidence, rubricDocument));
  let input;
  try {
    input = await buildAsyncReportJudgeInput(evidence);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    const result = await diagnosticResult(judge, rubric.hash, evidence.evidence_hash, "indeterminate", "public-only Judge input validation failed", promptHash);
    return { evidence, result, accounting: buildAccounting({ state: "indeterminate", blind_case_id: evidence.blind_case_id, ...baseRefs, evidence: evidenceRef(evidence), prompt_hash: result.prompt_hash, input_hash: evidence.evidence_hash, provider, calls: { calibration: calibration.calls, scoring: 0 }, duration_ms: elapsed(), failure_reason: reason }) };
  }
  const inputHash = input.input_hash;
  if (evidence.execution_health !== "healthy") {
    const result = await diagnosticResult(judge, rubric.hash, inputHash, "indeterminate", "attempt execution is not healthy", promptHash);
    return { evidence, result, accounting: buildAccounting({ state: "indeterminate", blind_case_id: evidence.blind_case_id, ...baseRefs, evidence: evidenceRef(evidence), prompt_hash: result.prompt_hash, input_hash: inputHash, provider, calls: { calibration: calibration.calls, scoring: 0 }, duration_ms: elapsed(), failure_reason: result.reason }) };
  }
  if (options.complete && mode !== "mock") {
    const result = await diagnosticResult(judge, rubric.hash, inputHash, "not-run", "injected Judge completion requires explicit mode=mock", promptHash);
    return { evidence, result, accounting: buildAccounting({ state: "not-run", blind_case_id: evidence.blind_case_id, ...baseRefs, evidence: evidenceRef(evidence), prompt_hash: result.prompt_hash, input_hash: inputHash, provider, calls: { calibration: calibration.calls, scoring: 0 }, duration_ms: elapsed(), failure_reason: result.reason }) };
  }
  if (!options.complete && mode !== "real") {
    const result = await diagnosticResult(judge, rubric.hash, inputHash, "not-run", "real scoring requires LORELUM_JUDGE_REAL=1", promptHash);
    return { evidence, result, accounting: buildAccounting({ state: "not-run", blind_case_id: evidence.blind_case_id, ...baseRefs, evidence: evidenceRef(evidence), prompt_hash: result.prompt_hash, input_hash: inputHash, provider, calls: { calibration: calibration.calls, scoring: 0 }, duration_ms: elapsed(), failure_reason: result.reason }) };
  }
  if (mode === "real" && !env.real) {
    const result = await diagnosticResult(judge, rubric.hash, inputHash, "not-run", "real scoring requires LORELUM_JUDGE_REAL=1", promptHash);
    return { evidence, result, accounting: buildAccounting({ state: "not-run", blind_case_id: evidence.blind_case_id, ...baseRefs, evidence: evidenceRef(evidence), prompt_hash: result.prompt_hash, input_hash: inputHash, provider, calls: { calibration: calibration.calls, scoring: 0 }, duration_ms: elapsed(), failure_reason: result.reason }) };
  }
  if (mode === "real" && (!env.baseUrl || !env.apiKey || !env.model)) {
    const result = await diagnosticResult(judge, rubric.hash, inputHash, "judge-unavailable", "Judge configuration is unavailable", promptHash);
    return { evidence, result, accounting: buildAccounting({ state: "judge-unavailable", blind_case_id: evidence.blind_case_id, ...baseRefs, evidence: evidenceRef(evidence), prompt_hash: result.prompt_hash, input_hash: inputHash, provider, calls: { calibration: calibration.calls, scoring: 0 }, duration_ms: elapsed(), failure_reason: result.reason }) };
  }
  if (calibration.status !== "qualified") {
    const result = await diagnosticResult(judge, rubric.hash, inputHash, "indeterminate", calibration.reason ?? "calibration is not qualified", promptHash);
    return { evidence, result, accounting: buildAccounting({ state: "indeterminate", blind_case_id: evidence.blind_case_id, ...baseRefs, evidence: evidenceRef(evidence), prompt_hash: result.prompt_hash, input_hash: inputHash, provider, calls: { calibration: calibration.calls, scoring: 0 }, duration_ms: elapsed(), failure_reason: result.reason }) };
  }

  try {
    const complete = options.complete ?? httpAsyncReportJudgeCompletion(options.env ?? Bun.env);
    const scored = await scoreValidatedInput(input, { judge, rubric_hash: rubric.hash, input_hash: inputHash }, complete, options.calibration, calibrationScope(mode === "real" ? env.model ?? null : "mock"), attestationKey, mode!, options.env ?? Bun.env);
    const state = accountingStateFromJudgeState(scored.result.state);
    return { evidence, result: scored.result, accounting: buildAccounting({ state, blind_case_id: evidence.blind_case_id, ...baseRefs, evidence: evidenceRef(evidence), prompt_hash: scored.prompt_hash, input_hash: inputHash, provider, calls: { calibration: calibration.calls, scoring: 1 }, duration_ms: elapsed(), usage: scored.usage, ...(scored.result.state === "observed" ? {} : { failure_reason: scored.result.reason ?? "Judge did not produce an observed result" }) }) };
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    const result = await diagnosticResult(judge, rubric.hash, inputHash, "judge-unavailable", "structured Judge output was unavailable or invalid", promptHash);
    return { evidence, result, accounting: buildAccounting({ state: "judge-unavailable", blind_case_id: evidence.blind_case_id, ...baseRefs, evidence: evidenceRef(evidence), prompt_hash: result.prompt_hash, input_hash: inputHash, provider, calls: { calibration: calibration.calls, scoring: 1 }, duration_ms: elapsed(), failure_reason: reason }) };
  }
}

if (import.meta.main) {
  const inputPath = Bun.argv[2];
  const calibrationPath = Bun.argv[3];
  if (!inputPath) {
    console.error("usage: bun run src/benchmark/judge/async-report-replan/v1/run.ts <private-attempt.json> [calibration-report.json]");
    process.exit(2);
  }
  const calibration = calibrationPath ? await Bun.file(calibrationPath).json() as CalibrationReport : undefined;
  console.log(JSON.stringify(await runAsyncReportReplanAttempt(await Bun.file(inputPath).json() as RawReplanAttempt, { calibration }), null, 2));
}
