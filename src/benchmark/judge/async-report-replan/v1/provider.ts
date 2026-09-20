import type { JudgeContext, JudgeProvider } from "../../provider";
import { buildJudgeInput, type JudgeInput, type PublicRunMaterial } from "../../input";
import { sha256Text } from "../../../fs";
import { assertReplanEvidenceIntegrity } from "./evidence";
import { canonicalJson } from "./canonical";
import { asyncReportJudgeEnv, httpAsyncReportJudgeCompletion } from "./llm";
import { fixedRubricHashes, scoreReplanEvidence, resultBase, replanScorePrompt } from "./score";
import { loadRubric, rubricText } from "./rubric";
import { resolveCalibrationStatus } from "./calibration";
import { evaluationPlanHash } from "./plan";
import type { CalibrationReport, JudgeCompletionWithUsage, ReplanEvidence } from "./types";

const taskObjective = "Evaluate post-constraint replan quality only; async-report semantic correctness is outside this Judge.";

export type AsyncReportProviderOptions = {
  env?: Record<string, string | undefined>;
  complete?: JudgeCompletionWithUsage;
  calibration?: CalibrationReport;
};

export type ParsedReplanInput = { evidence: ReplanEvidence; input: JudgeInput };

export async function replanInputHash(input: Pick<JudgeInput, "task_md" | "candidate_diff" | "rubric" | "material">): Promise<string> {
  return sha256Text(canonicalJson({ schema_version: "async-report-replan-judge-input/v1", task_md: input.task_md, candidate_diff: input.candidate_diff, rubric: input.rubric, material: input.material.map((item) => ({ path: item.path, kind: item.kind, content: item.content ?? "" })) }));
}

/** Rebuilds the shared Judge input so every scoring path crosses the public-only allowlist. */
export async function parseBridgeEvidence(input: JudgeInput): Promise<ParsedReplanInput> {
  if (!input.rubric) throw new Error("async-report replan rubric is missing");
  if (input.task_md !== taskObjective) throw new Error("async-report replan task objective is not the frozen v1 objective");
  const validated = await buildJudgeInput({ task_md: input.task_md, candidate_diff: input.candidate_diff, rubric: input.rubric, material: input.material });
  if (await replanInputHash(validated) !== input.input_hash) throw new Error("async-report replan input hash mismatch");
  const value = JSON.parse(validated.candidate_diff) as unknown;
  return { evidence: await assertReplanEvidenceIntegrity(value), input: validated };
}

export async function buildAsyncReportJudgeInput(evidence: ReplanEvidence, material: PublicRunMaterial[] = []): Promise<JudgeInput> {
  const validatedEvidence = await assertReplanEvidenceIntegrity(evidence);
  const base = await buildJudgeInput({ task_md: taskObjective, candidate_diff: canonicalJson(validatedEvidence), rubric: await rubricText(), material });
  return { ...base, input_hash: await replanInputHash(base) };
}

export function createAsyncReportReplanProvider(options: AsyncReportProviderOptions = {}): JudgeProvider & { scoreInput: typeof scoreValidatedInput; planHash: () => Promise<string> } {
  const env = options.env ?? Bun.env;
  const resolvedEnv = asyncReportJudgeEnv(env);
  const complete = options.complete;
  return {
    id: "judge-agent/async-report-replan/v1",
    version: "v1",
    async rubricText() { return rubricText(); },
    async promptFor(input: JudgeInput) {
      const parsed = await parseBridgeEvidence(input);
      return replanScorePrompt(parsed.evidence, await loadRubric(), parsed.input.material);
    },
    async score(input: JudgeInput, context: JudgeContext) {
      try {
        if (!complete && !resolvedEnv.real) return resultBase({ id: "judge-agent/async-report-replan/v1", version: "v1" }, await sha256Text("not-run: real scoring is disabled"), context.rubric_hash, input.input_hash, "not-run", 0, "real scoring requires LORELUM_JUDGE_REAL=1");
        if (!complete && (!resolvedEnv.baseUrl || !resolvedEnv.apiKey || !resolvedEnv.model)) return resultBase({ id: "judge-agent/async-report-replan/v1", version: "v1" }, await sha256Text("judge-unavailable: missing configuration"), context.rubric_hash, input.input_hash, "judge-unavailable", 0, "Judge configuration is unavailable");
        return (await scoreValidatedInput(input, { ...context, input_hash: input.input_hash }, complete ?? httpAsyncReportJudgeCompletion(env), options.calibration)).result;
      } catch (error) {
        const promptHash = /^[a-f0-9]{64}$/.test(context.prompt_hash) ? context.prompt_hash : await sha256Text("async-report replan provider rejected input");
        return resultBase({ id: "judge-agent/async-report-replan/v1", version: "v1" }, promptHash, context.rubric_hash, input.input_hash, "judge-unavailable", 0, "async-report replan input or provider was unavailable");
      }
    },
    scoreInput: scoreValidatedInput,
    planHash: evaluationPlanHash,
  };
}

export async function scoreValidatedInput(
  input: JudgeInput,
  context: Pick<JudgeContext, "judge" | "rubric_hash"> & { input_hash: string },
  complete: JudgeCompletionWithUsage,
  calibration?: CalibrationReport,
) {
  const parsed = await parseBridgeEvidence(input);
  const hashes = await fixedRubricHashes();
  const promptHash = await sha256Text(replanScorePrompt(parsed.evidence, await loadRubric(), parsed.input.material));
  if (hashes.hash !== context.rubric_hash) return { result: resultBase(context.judge, promptHash, context.rubric_hash, parsed.input.input_hash, "judge-unavailable", 0, "fixed rubric hash mismatch"), prompt_hash: promptHash, usage: {} };
  if (parsed.evidence.execution_health !== "healthy") return { result: resultBase(context.judge, promptHash, hashes.hash, parsed.input.input_hash, "indeterminate", 0, "attempt execution is not healthy"), prompt_hash: promptHash, usage: {} };
  const qualification = await resolveCalibrationStatus(calibration);
  if (qualification.status !== "qualified") return { result: resultBase(context.judge, promptHash, hashes.hash, parsed.input.input_hash, "indeterminate", 0, qualification.reason ?? "calibration is not qualified"), prompt_hash: promptHash, usage: {} };
  try {
    return await scoreReplanEvidence({ evidence: parsed.evidence, rubric: await loadRubric(), rubric_hash: hashes.hash, input_hash: parsed.input.input_hash, judge: context.judge, complete, material: parsed.input.material });
  } catch {
    return { result: resultBase(context.judge, promptHash, hashes.hash, parsed.input.input_hash, "judge-unavailable", 0, "structured Judge output was unavailable or invalid"), prompt_hash: promptHash, usage: {} };
  }
}

/** Calibration is the only path allowed to score before a qualification report exists. */
export async function scoreForCalibration(input: JudgeInput, context: Pick<JudgeContext, "judge" | "rubric_hash"> & { input_hash: string }, complete: JudgeCompletionWithUsage) {
  const parsed = await parseBridgeEvidence(input);
  const hashes = await fixedRubricHashes();
  return scoreReplanEvidence({ evidence: parsed.evidence, rubric: await loadRubric(), rubric_hash: hashes.hash, input_hash: parsed.input.input_hash, judge: context.judge, complete, material: parsed.input.material });
}

export const asyncReportReplanProvider = createAsyncReportReplanProvider();
