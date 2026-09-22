import type { JudgeContext, JudgeProvider } from "../../provider";
import { buildJudgeInput, type JudgeInput, type PublicRunMaterial } from "../../input";
import { sha256Text } from "../../../fs";
import { assertReplanEvidenceIntegrity, issuedReplanEvidenceHash, isReplanEvidenceIssued } from "./evidence";
import { canonicalJson } from "./canonical";
import { asyncReportJudgeEnv, httpAsyncReportJudgeCompletion } from "./llm";
import { fixedRubricHashes, scoreReplanEvidence, resultBase, replanPromptHashes, replanScorePrompt } from "./score";
import { loadRubric, rubricText } from "./rubric";
import { calibrationAttestationKey, calibrationCapabilityAllows, calibrationScope, isCalibrationScoreCapability, resolveCalibrationStatus } from "./calibration";
import { evaluationPlanHash } from "./plan";
import type { CalibrationReport, JudgeCompletionWithUsage, ReplanEvidence } from "./types";

const issuedJudgeInputs = new WeakMap<object, string>();

function markReplanJudgeInputIssued<T extends JudgeInput>(input: T): T {
  issuedJudgeInputs.set(input, input.input_hash);
  return input;
}

function isReplanJudgeInputIssued(value: unknown): value is JudgeInput {
  return Boolean(value) && typeof value === "object" && issuedJudgeInputs.has(value as object);
}

function issuedReplanJudgeInputHash(value: unknown): string | undefined {
  return Boolean(value) && typeof value === "object" ? issuedJudgeInputs.get(value as object) : undefined;
}

const taskObjective = "Evaluate post-constraint replan quality only; async-report semantic correctness is outside this Judge.";
const hashPattern = /^[a-f0-9]{64}$/;
const providerId = "judge-agent/async-report-replan/v1";
const fixedJudge = { id: providerId, version: "v1" } as const;

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
  mode?: "mock" | "real";
  calibration?: CalibrationReport;
};

export type ParsedReplanInput = { evidence: ReplanEvidence; input: JudgeInput; prompt_hash: string; input_hash: string };

/** Rebuilds the shared Judge input so every scoring path crosses the public-only allowlist. */
export async function parseBridgeEvidence(input: JudgeInput): Promise<ParsedReplanInput> {
  if (!isReplanJudgeInputIssued(input)) throw new Error("async-report replan input was not issued by the projector adapter");
  if (issuedReplanJudgeInputHash(input) !== input.input_hash) throw new Error("async-report replan input was modified after issuance");
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
  if (!isReplanEvidenceIssued(evidence)) throw new Error("async-report replan evidence was not issued by the projector");
  const validatedEvidence = await assertReplanEvidenceIntegrity(evidence);
  if (issuedReplanEvidenceHash(evidence) !== validatedEvidence.evidence_hash) throw new Error("async-report replan evidence was modified after issuance");
  const fixedRubricText = await rubricText();
  const fixedRubric = await loadRubric();
  const base = await buildJudgeInput({ task_md: taskObjective, candidate_diff: canonicalJson(validatedEvidence), rubric: fixedRubricText, material });
  const hashes = await replanPromptHashes(validatedEvidence, fixedRubric, base.material);
  return markReplanJudgeInputIssued({ ...base, input_hash: hashes.input_hash });
}

export function createAsyncReportReplanProvider(options: AsyncReportProviderOptions = {}): JudgeProvider & { scoreInput: typeof scoreValidatedInput; planHash: () => Promise<string> } {
  const env = options.env ?? Bun.env;
  const resolvedEnv = asyncReportJudgeEnv(env);
  const complete = options.complete;
  const mode = options.mode ?? (complete ? undefined : "real");
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
        if (mode !== "mock" && mode !== "real") {
          const hashes = await fixedDiagnosticHashes("not-run");
          return resultBase({ id: providerId, version: "v1" }, hashes.prompt_hash, hashes.rubric_hash, hashes.input_hash, "not-run", 0, "mock scoring requires explicit mode=mock");
        }
        if (complete && mode !== "mock") {
          const hashes = await fixedDiagnosticHashes("not-run");
          return resultBase({ id: providerId, version: "v1" }, hashes.prompt_hash, hashes.rubric_hash, hashes.input_hash, "not-run", 0, "injected Judge completion requires explicit mode=mock");
        }
        if (mode === "mock" && !complete) {
          const hashes = await fixedDiagnosticHashes("not-run");
          return resultBase({ id: providerId, version: "v1" }, hashes.prompt_hash, hashes.rubric_hash, hashes.input_hash, "not-run", 0, "mock scoring requires an injected completion");
        }
        if (mode === "real" && !resolvedEnv.real) {
          const hashes = await fixedDiagnosticHashes("not-run");
          return resultBase({ id: providerId, version: "v1" }, hashes.prompt_hash, hashes.rubric_hash, hashes.input_hash, "not-run", 0, "real scoring requires LORELUM_JUDGE_REAL=1");
        }
        if (mode === "real" && (!resolvedEnv.baseUrl || !resolvedEnv.apiKey || !resolvedEnv.model)) {
          const hashes = await fixedDiagnosticHashes("judge-unavailable");
          return resultBase({ id: providerId, version: "v1" }, hashes.prompt_hash, hashes.rubric_hash, hashes.input_hash, "judge-unavailable", 0, "Judge configuration is unavailable");
        }
        const scoringComplete = complete ?? httpAsyncReportJudgeCompletion(env);
        const scoringScope = calibrationScope(mode === "mock" ? "mock" : resolvedEnv.model ?? null);
        return (await scoreValidatedInput(input, { ...context, input_hash: input.input_hash }, scoringComplete, options.calibration, scoringScope, calibrationAttestationKey(mode, env), mode, env)).result;
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
  expectedCalibrationKey: string | undefined,
  mode: "mock" | "real",
  env: Record<string, string | undefined> = Bun.env,
) {
  const parsed = await parseBridgeEvidence(input);
  const hashes = await fixedRubricHashes();
  const promptHash = parsed.prompt_hash;
  if (context.judge.id !== providerId || context.judge.version !== "v1") return { result: resultBase(fixedJudge, promptHash, hashes.hash, parsed.input.input_hash, "judge-unavailable", 0, "fixed Judge identity mismatch"), prompt_hash: promptHash, usage: {} };
  const safeContextRubricHash = await safeProvenanceHash(context.rubric_hash, "invalid async-report rubric hash");
  const safeContextInputHash = await safeProvenanceHash(context.input_hash, "invalid async-report input hash");
  if (hashes.hash !== safeContextRubricHash || safeContextInputHash !== parsed.input.input_hash) return { result: resultBase(fixedJudge, promptHash, hashes.hash, parsed.input.input_hash, "judge-unavailable", 0, "fixed provenance hash mismatch"), prompt_hash: promptHash, usage: {} };
  if (mode === "real" && env.LORELUM_JUDGE_REAL !== "1") return { result: resultBase(fixedJudge, promptHash, hashes.hash, parsed.input.input_hash, "not-run", 0, "real scoring requires LORELUM_JUDGE_REAL=1"), prompt_hash: promptHash, usage: {} };
  if (mode === "real" && (!env.LORELUM_JUDGE_BASE_URL || !env.LORELUM_JUDGE_API_KEY || !env.LORELUM_JUDGE_MODEL)) return { result: resultBase(fixedJudge, promptHash, hashes.hash, parsed.input.input_hash, "judge-unavailable", 0, "Judge configuration is unavailable"), prompt_hash: promptHash, usage: {} };
  if (parsed.evidence.execution_health !== "healthy") return { result: resultBase(fixedJudge, promptHash, hashes.hash, parsed.input.input_hash, "indeterminate", 0, "attempt execution is not healthy"), prompt_hash: promptHash, usage: {} };
  const qualification = await resolveCalibrationStatus(calibration, expectedCalibrationScope, expectedCalibrationKey);
  if (qualification.status !== "qualified") return { result: resultBase(fixedJudge, promptHash, hashes.hash, parsed.input.input_hash, "indeterminate", 0, qualification.reason ?? "calibration is not qualified"), prompt_hash: promptHash, usage: {} };
  try {
    return await scoreReplanEvidence({ evidence: parsed.evidence, rubric: await loadRubric(), rubric_hash: hashes.hash, input_hash: parsed.input.input_hash, judge: fixedJudge, complete, material: parsed.input.material });
  } catch {
    return { result: resultBase(fixedJudge, promptHash, hashes.hash, parsed.input.input_hash, "judge-unavailable", 0, "structured Judge output was unavailable or invalid"), prompt_hash: promptHash, usage: {} };
  }
}

/** Calibration is the only path allowed to score before a qualification report exists. */
export async function scoreForCalibration(input: JudgeInput, context: Pick<JudgeContext, "judge" | "rubric_hash"> & { input_hash: string }, complete: JudgeCompletionWithUsage, capability: unknown) {
  if (!isCalibrationScoreCapability(capability)) throw new Error("calibration scoring requires a runner-issued capability");
  const parsed = await parseBridgeEvidence(input);
  if (!calibrationCapabilityAllows(capability, parsed.evidence.evidence_hash)) throw new Error("calibration scoring evidence is not one of the frozen fixtures");
  const hashes = await fixedRubricHashes();
  if (context.judge.id !== providerId || context.judge.version !== "v1") return { result: resultBase(fixedJudge, parsed.prompt_hash, hashes.hash, parsed.input.input_hash, "judge-unavailable", 0, "fixed Judge identity mismatch"), prompt_hash: parsed.prompt_hash, usage: {} };
  return scoreReplanEvidence({ evidence: parsed.evidence, rubric: await loadRubric(), rubric_hash: hashes.hash, input_hash: parsed.input.input_hash, judge: fixedJudge, complete, material: parsed.input.material });
}

export const asyncReportReplanProvider = createAsyncReportReplanProvider();
