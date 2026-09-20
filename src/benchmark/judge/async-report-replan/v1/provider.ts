import type { JudgeContext, JudgeProvider } from "../../provider";
import { buildJudgeInput, type JudgeInput, type PublicRunMaterial } from "../../input";
import { sha256Text } from "../../../fs";
import { assertReplanEvidenceIntegrity } from "./evidence";
import { canonicalJson } from "./canonical";
import { asyncReportJudgeEnv, httpAsyncReportJudgeCompletion } from "./llm";
import { fixedRubricHashes, scoreReplanEvidence, resultBase, replanPromptHashes, replanScorePrompt } from "./score";
import { loadRubric, rubricText } from "./rubric";
import { calibrationScope, resolveCalibrationStatus } from "./calibration";
import { evaluationPlanHash } from "./plan";
import type { CalibrationReport, JudgeCompletionWithUsage, ReplanEvidence } from "./types";

const taskObjective = "Evaluate post-constraint replan quality only; async-report semantic correctness is outside this Judge.";
const hashPattern = /^[a-f0-9]{64}$/;
const providerId = "judge-agent/async-report-replan/v1";

async function safeProvenanceHash(value: unknown, fallback: string): Promise<string> {
  return typeof value === "string" && hashPattern.test(value) ? value : sha256Text(fallback);
}

async function fixedDiagnosticHashes(state: "not-run" | "judge-unavailable"): Promise<{ prompt_hash: string; rubric_hash: string; input_hash: string }> {
  const rubric_hash = await fixedRubricHashes().then((value) => value.hash).catch(() => sha256Text(`${providerId}:fixed-rubric-unavailable`));
  return {
    prompt_hash: await sha256Text(`${providerId}:diagnostic-prompt:${state}`),
    rubric_hash,
    input_hash: await sha256Text(`${providerId}:diagnostic-input:${state}`),
  };
}

export type AsyncReportProviderOptions = {
  env?: Record<string, string | undefined>;
  complete?: JudgeCompletionWithUsage;
  calibration?: CalibrationReport;
};

export type ParsedReplanInput = { evidence: ReplanEvidence; input: JudgeInput; prompt_hash: string; input_hash: string };

/** Rebuilds the shared Judge input so every scoring path crosses the public-only allowlist. */
export async function parseBridgeEvidence(input: JudgeInput): Promise<ParsedReplanInput> {
  if (!input.rubric) throw new Error("async-report replan rubric is missing");
  if (input.task_md !== taskObjective) throw new Error("async-report replan task objective is not the frozen v1 objective");
  const validated = await buildJudgeInput({ task_md: input.task_md, candidate_diff: input.candidate_diff, rubric: input.rubric, material: input.material });
  const value = JSON.parse(validated.candidate_diff) as unknown;
  const evidence = await assertReplanEvidenceIntegrity(value);
  const fixedRubric = await loadRubric();
  const fixedRubricText = await rubricText();
  if (input.rubric !== fixedRubricText) throw new Error("async-report replan rubric is not the frozen v1 rubric");
  const hashes = await replanPromptHashes(evidence, fixedRubric, validated.material);
  if (hashes.input_hash !== input.input_hash) throw new Error("async-report replan input hash mismatch");
  return { evidence, input: { ...validated, input_hash: hashes.input_hash }, prompt_hash: hashes.prompt_hash, input_hash: hashes.input_hash };
}

export async function buildAsyncReportJudgeInput(evidence: ReplanEvidence, material: PublicRunMaterial[] = []): Promise<JudgeInput> {
  const validatedEvidence = await assertReplanEvidenceIntegrity(evidence);
  const fixedRubricText = await rubricText();
  const fixedRubric = await loadRubric();
  const base = await buildJudgeInput({ task_md: taskObjective, candidate_diff: canonicalJson(validatedEvidence), rubric: fixedRubricText, material });
  const hashes = await replanPromptHashes(validatedEvidence, fixedRubric, base.material);
  return { ...base, input_hash: hashes.input_hash };
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
        if (!complete && !resolvedEnv.real) {
          const hashes = await fixedDiagnosticHashes("not-run");
          return resultBase({ id: providerId, version: "v1" }, hashes.prompt_hash, hashes.rubric_hash, hashes.input_hash, "not-run", 0, "real scoring requires LORELUM_JUDGE_REAL=1");
        }
        if (!complete && (!resolvedEnv.baseUrl || !resolvedEnv.apiKey || !resolvedEnv.model)) {
          const hashes = await fixedDiagnosticHashes("judge-unavailable");
          return resultBase({ id: providerId, version: "v1" }, hashes.prompt_hash, hashes.rubric_hash, hashes.input_hash, "judge-unavailable", 0, "Judge configuration is unavailable");
        }
        const scoringComplete = complete ?? httpAsyncReportJudgeCompletion(env);
        return (await scoreValidatedInput(input, { ...context, input_hash: input.input_hash }, scoringComplete, options.calibration, calibrationScope(complete ? "mock" : resolvedEnv.model ?? null))).result;
      } catch (error) {
        const hashes = await fixedDiagnosticHashes("judge-unavailable");
        return resultBase({ id: providerId, version: "v1" }, hashes.prompt_hash, hashes.rubric_hash, hashes.input_hash, "judge-unavailable", 0, "async-report replan input or provider was unavailable");
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
  expectedCalibrationScope = calibrationScope("mock"),
) {
  const parsed = await parseBridgeEvidence(input);
  const hashes = await fixedRubricHashes();
  const promptHash = parsed.prompt_hash;
  const safeContextRubricHash = await safeProvenanceHash(context.rubric_hash, "invalid async-report rubric hash");
  const safeContextInputHash = await safeProvenanceHash(context.input_hash, "invalid async-report input hash");
  if (hashes.hash !== safeContextRubricHash || safeContextInputHash !== parsed.input.input_hash) return { result: resultBase(context.judge, promptHash, hashes.hash, parsed.input.input_hash, "judge-unavailable", 0, "fixed provenance hash mismatch"), prompt_hash: promptHash, usage: {} };
  if (parsed.evidence.execution_health !== "healthy") return { result: resultBase(context.judge, promptHash, hashes.hash, parsed.input.input_hash, "indeterminate", 0, "attempt execution is not healthy"), prompt_hash: promptHash, usage: {} };
  const qualification = await resolveCalibrationStatus(calibration, expectedCalibrationScope);
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
