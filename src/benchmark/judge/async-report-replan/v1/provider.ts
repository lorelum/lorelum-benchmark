import type { JudgeContext, JudgeProvider } from "../../provider";
import { buildJudgeInput, type JudgeInput, type PublicRunMaterial } from "../../input";
import { sha256Text } from "../../../fs";
import { assertReplanEvidenceIntegrity } from "./evidence";
import { asyncReportJudgeEnv, httpAsyncReportJudgeCompletion } from "./llm";
import { fixedRubricHashes, scoreReplanEvidence, resultBase, replanScorePrompt } from "./score";
import { evaluationPlanHash } from "./plan";
import { loadRubric, rubricText } from "./rubric";
import type { JudgeCompletionWithUsage, ReplanEvidence } from "./types";

export type AsyncReportProviderOptions = {
  env?: Record<string, string | undefined>;
  complete?: JudgeCompletionWithUsage;
  calibrationStatus?: "qualified" | "diagnostic" | "not-run";
};

export async function parseBridgeEvidence(input: JudgeInput): Promise<ReplanEvidence> {
  if (input.rubric !== undefined && input.rubric.length === 0) throw new Error("async-report replan rubric is missing");
  const value = JSON.parse(input.candidate_diff) as unknown;
  return assertReplanEvidenceIntegrity(value);
}

export async function buildAsyncReportJudgeInput(evidence: ReplanEvidence, material: PublicRunMaterial[] = []): Promise<JudgeInput> {
  const text = await rubricText();
  const planHash = await evaluationPlanHash();
  const base = await buildJudgeInput({
    task_md: "Evaluate post-constraint replan quality only; async-report semantic correctness is outside this Judge.",
    candidate_diff: JSON.stringify(evidence),
    rubric: text,
    material,
  });
  return {
    ...base,
    input_hash: await sha256Text(`${planHash}\n${JSON.stringify(evidence)}\n${text}\n${base.material.map((item) => `${item.path}\0${item.content ?? ""}`).join("\n")}`),
  };
}

export function createAsyncReportReplanProvider(options: AsyncReportProviderOptions = {}): JudgeProvider & { scoreEvidence: typeof scoreEvidence; planHash: typeof evaluationPlanHash } {
  const env = options.env ?? Bun.env;
  const resolvedEnv = asyncReportJudgeEnv(env);
  const complete = options.complete;
  const calibrationStatus = options.calibrationStatus ?? resolvedEnv.calibrationStatus;
  return {
    id: "judge-agent/async-report-replan/v1",
    version: "v1",
    async rubricText() { return rubricText(); },
    async promptFor(input: JudgeInput) {
      const evidence = await parseBridgeEvidence(input);
      return replanScorePrompt(evidence, await loadRubric());
    },
    async score(input: JudgeInput, context: JudgeContext) {
      const evidence = await parseBridgeEvidence(input);
      if (!complete && !resolvedEnv.real) return resultBase({ id: "judge-agent/async-report-replan/v1", version: "v1" }, await sha256Text("not-run: real scoring is disabled"), context.rubric_hash, input.input_hash, "not-run", 0, "real scoring requires LORELUM_JUDGE_REAL=1");
      if (!complete && (!resolvedEnv.baseUrl || !resolvedEnv.apiKey || !resolvedEnv.model)) return resultBase({ id: "judge-agent/async-report-replan/v1", version: "v1" }, await sha256Text("judge-unavailable: missing configuration"), context.rubric_hash, input.input_hash, "judge-unavailable", 0, "Judge configuration is unavailable");
      return scoreEvidence(evidence, { ...context, input_hash: input.input_hash }, complete ?? httpAsyncReportJudgeCompletion(env), calibrationStatus);
    },
    scoreEvidence,
    planHash: evaluationPlanHash,
  };
}

export async function scoreEvidence(
  evidence: ReplanEvidence,
  context: Pick<JudgeContext, "judge" | "rubric_hash"> & { input_hash: string },
  complete: JudgeCompletionWithUsage,
  calibrationStatus: "qualified" | "diagnostic" | "not-run" = "diagnostic",
) {
  const hashes = await fixedRubricHashes();
  const promptHash = await sha256Text(replanScorePrompt(evidence, await loadRubric()));
  if (hashes.hash !== context.rubric_hash) return resultBase(context.judge, await sha256Text("not-run: rubric hash mismatch"), context.rubric_hash, context.input_hash, "judge-unavailable", 0, "fixed rubric hash mismatch");
  if (evidence.execution_health !== "healthy") return resultBase(context.judge, await sha256Text("indeterminate: execution unhealthy"), hashes.hash, context.input_hash, "indeterminate", 0, "attempt execution is not healthy");
  if (calibrationStatus !== "qualified") return resultBase(context.judge, await sha256Text(`diagnostic: calibration ${calibrationStatus}`), hashes.hash, context.input_hash, "indeterminate", 0, `calibration is ${calibrationStatus}; scoring is diagnostic only`);
  try {
    return (await scoreReplanEvidence({ evidence, rubric: await loadRubric(), rubric_hash: hashes.hash, input_hash: context.input_hash, judge: context.judge, complete })).result;
  } catch (error) {
    return resultBase(context.judge, promptHash, hashes.hash, context.input_hash, "judge-unavailable", 0, "structured Judge output was unavailable or invalid");
  }
}

export const asyncReportReplanProvider = createAsyncReportReplanProvider();
