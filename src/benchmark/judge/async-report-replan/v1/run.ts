import { sha256Text } from "../../../fs";
import { accountingStateFromJudgeState, buildAccounting, evidenceRef, normalizeUsage } from "./accounting";
import { canonicalJson } from "./canonical";
import { projectReplanEvidence } from "./evidence";
import { asyncReportJudgeEnv, httpAsyncReportJudgeCompletion } from "./llm";
import { evaluationPlan, evaluationPlanHash } from "./plan";
import { fixedRubricHashes, replanScorePrompt, resultBase, scoreReplanEvidence } from "./score";
import { calibrationIdentity } from "./calibration";
import type { AsyncReportAccounting, JudgeCompletionWithUsage, RawReplanAttempt, ReplanEvidence } from "./types";
import type { JudgeResultV1 } from "../../../outcome/v1/contract";

export type AsyncReportAttemptRun = {
  evidence?: ReplanEvidence;
  result: JudgeResultV1;
  accounting: AsyncReportAccounting;
};

function safeBlindCaseId(value: unknown): string {
  return typeof value === "string" && /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(value) ? value : "indeterminate";
}

async function diagnosticResult(judge: { id: string; version: string }, rubricHash: string, inputHash: string, state: "indeterminate" | "judge-unavailable" | "not-run", reason: string): Promise<JudgeResultV1> {
  return resultBase(judge, await sha256Text(`${state}:${reason}`), rubricHash, inputHash, state, 0, reason);
}

export async function runAsyncReportReplanAttempt(raw: RawReplanAttempt, options: {
  env?: Record<string, string | undefined>;
  complete?: JudgeCompletionWithUsage;
  calibration?: { id: string; version: string; hash: string; status: "qualified" | "diagnostic" | "not-run"; calls?: number };
  now?: () => number;
} = {}): Promise<AsyncReportAttemptRun> {
  const start = options.now?.() ?? performance.now();
  const env = asyncReportJudgeEnv(options.env ?? Bun.env);
  const judge = { id: "judge-agent/async-report-replan/v1", version: "v1" };
  const provider = { ...judge, model: env.model ?? null };
  const [planHash, rubric, calibrationDefault] = await Promise.all([evaluationPlanHash(), fixedRubricHashes(), calibrationIdentity()]);
  const calibration = options.calibration ?? { ...calibrationDefault, status: env.calibrationStatus, calls: 0 };
  const projected = await projectReplanEvidence(raw);
  const blindCaseId = safeBlindCaseId(raw?.blind_case_id);
  const elapsed = () => Math.max(0, (options.now?.() ?? performance.now()) - start);
  if (!projected.ok) {
    const result = await diagnosticResult(judge, rubric.hash, projected.evidence_hash, "indeterminate", projected.reason);
    return {
      result,
      accounting: buildAccounting({ state: "indeterminate", blind_case_id: blindCaseId, plan: { id: evaluationPlan.id, version: evaluationPlan.version, hash: planHash }, evidence: { schema_version: "replan-evidence/v1", hash: projected.evidence_hash }, rubric: { id: "async-report-replan-rubric", version: "v1", hash: rubric.hash }, prompt_hash: result.prompt_hash, input_hash: projected.evidence_hash, provider, calibration, calls: { calibration: calibration.calls ?? 0, scoring: 0 }, duration_ms: elapsed(), failure_reason: projected.reason }),
    };
  }
  const evidence = projected.evidence;
  const inputHash = await sha256Text(canonicalJson({ plan_hash: planHash, evidence_hash: evidence.evidence_hash, rubric_hash: rubric.hash }));
  if (evidence.execution_health !== "healthy") {
    const result = await diagnosticResult(judge, rubric.hash, inputHash, "indeterminate", "attempt execution is not healthy");
    return { evidence, result, accounting: buildAccounting({ state: "indeterminate", blind_case_id: evidence.blind_case_id, plan: { id: evaluationPlan.id, version: evaluationPlan.version, hash: planHash }, evidence: evidenceRef(evidence), rubric: { id: "async-report-replan-rubric", version: "v1", hash: rubric.hash }, prompt_hash: result.prompt_hash, input_hash: inputHash, provider, calibration, calls: { calibration: calibration.calls ?? 0, scoring: 0 }, duration_ms: elapsed(), failure_reason: "attempt execution is not healthy" }) };
  }
  if (calibration.status !== "qualified") {
    const result = await diagnosticResult(judge, rubric.hash, inputHash, "indeterminate", `calibration is ${calibration.status}; scoring is diagnostic only`);
    return { evidence, result, accounting: buildAccounting({ state: "indeterminate", blind_case_id: evidence.blind_case_id, plan: { id: evaluationPlan.id, version: evaluationPlan.version, hash: planHash }, evidence: evidenceRef(evidence), rubric: { id: "async-report-replan-rubric", version: "v1", hash: rubric.hash }, prompt_hash: result.prompt_hash, input_hash: inputHash, provider, calibration, calls: { calibration: calibration.calls ?? 0, scoring: 0 }, duration_ms: elapsed(), failure_reason: "calibration is not qualified" }) };
  }
  if (!options.complete && !env.real) {
    const result = await diagnosticResult(judge, rubric.hash, inputHash, "not-run", "real scoring requires LORELUM_JUDGE_REAL=1");
    return { evidence, result, accounting: buildAccounting({ state: "not-run", blind_case_id: evidence.blind_case_id, plan: { id: evaluationPlan.id, version: evaluationPlan.version, hash: planHash }, evidence: evidenceRef(evidence), rubric: { id: "async-report-replan-rubric", version: "v1", hash: rubric.hash }, prompt_hash: result.prompt_hash, input_hash: inputHash, provider, calibration, calls: { calibration: calibration.calls ?? 0, scoring: 0 }, duration_ms: elapsed(), failure_reason: "real scoring requires LORELUM_JUDGE_REAL=1" }) };
  }
  if (!options.complete && (!env.baseUrl || !env.apiKey || !env.model)) {
    const result = await diagnosticResult(judge, rubric.hash, inputHash, "judge-unavailable", "Judge configuration is unavailable");
    return { evidence, result, accounting: buildAccounting({ state: "judge-unavailable", blind_case_id: evidence.blind_case_id, plan: { id: evaluationPlan.id, version: evaluationPlan.version, hash: planHash }, evidence: evidenceRef(evidence), rubric: { id: "async-report-replan-rubric", version: "v1", hash: rubric.hash }, prompt_hash: result.prompt_hash, input_hash: inputHash, provider, calibration, calls: { calibration: calibration.calls ?? 0, scoring: 0 }, duration_ms: elapsed(), failure_reason: "Judge configuration is unavailable" }) };
  }
  const promptHash = await sha256Text(replanScorePrompt(evidence, await (await import("./rubric")).loadRubric()));
  try {
    const complete = options.complete ?? httpAsyncReportJudgeCompletion(options.env ?? Bun.env);
    const scored = await scoreReplanEvidence({ evidence, rubric: await (await import("./rubric")).loadRubric(), rubric_hash: rubric.hash, input_hash: inputHash, judge, complete });
    const state = accountingStateFromJudgeState(scored.result.state);
    return { evidence, result: scored.result, accounting: buildAccounting({ state, blind_case_id: evidence.blind_case_id, plan: { id: evaluationPlan.id, version: evaluationPlan.version, hash: planHash }, evidence: evidenceRef(evidence), rubric: { id: "async-report-replan-rubric", version: "v1", hash: rubric.hash }, prompt_hash: scored.prompt_hash, input_hash: inputHash, provider, calibration, calls: { calibration: calibration.calls ?? 0, scoring: 1 }, duration_ms: elapsed(), usage: normalizeUsage(scored.usage) }) };
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    const result = await diagnosticResult(judge, rubric.hash, inputHash, "judge-unavailable", "structured Judge output was unavailable or invalid");
    return { evidence, result, accounting: buildAccounting({ state: "judge-unavailable", blind_case_id: evidence.blind_case_id, plan: { id: evaluationPlan.id, version: evaluationPlan.version, hash: planHash }, evidence: evidenceRef(evidence), rubric: { id: "async-report-replan-rubric", version: "v1", hash: rubric.hash }, prompt_hash: promptHash, input_hash: inputHash, provider, calibration, calls: { calibration: calibration.calls ?? 0, scoring: 1 }, duration_ms: elapsed(), failure_reason: reason }) };
  }
}

if (import.meta.main) {
  const inputPath = Bun.argv[2];
  if (!inputPath) {
    console.error("usage: bun run src/benchmark/judge/async-report-replan/v1/run.ts <private-attempt.json>");
    process.exit(2);
  }
  const raw = await Bun.file(inputPath).json() as RawReplanAttempt;
  const output = await runAsyncReportReplanAttempt(raw);
  console.log(JSON.stringify(output, null, 2));
}
