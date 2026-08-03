export type ExecutionHealth = "evaluated" | "execution-failed" | "invalid-output" | "not-executable" | "indeterminate";
export type SemanticOutcome = "pass" | "fail" | "not-run";
export type QualityOutcome = "observed" | "not-observed" | "indeterminate" | "not-run" | "judge-unavailable";

export type JudgeCriteriaV1 = { id: string; points: number; max_points: number };

export type JudgeResultV1 = {
  schema_version: "judge-result/v1";
  judge_version: 1;
  state: QualityOutcome;
  score: number;
  criteria: JudgeCriteriaV1[];
  reason?: string;
};

export type OutcomeEntry = {
  health: ExecutionHealth;
  semantic?: SemanticOutcome;
  quality?: QualityOutcome;
};

export type OutcomeSummary = {
  planned: number;
  evaluated: number;
  health: Record<ExecutionHealth, number>;
  semantic: Record<SemanticOutcome, number>;
  quality: Record<QualityOutcome, number>;
  joint_pass: number;
};

const healthStates: ExecutionHealth[] = ["evaluated", "execution-failed", "invalid-output", "not-executable", "indeterminate"];
const semanticStates: SemanticOutcome[] = ["pass", "fail", "not-run"];
const qualityStates: QualityOutcome[] = ["observed", "not-observed", "indeterminate", "not-run", "judge-unavailable"];

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function fail(message: string): never {
  throw new Error(`Invalid judge result v1: ${message}`);
}

function validId(value: unknown): value is string {
  return typeof value === "string" && /^[a-z0-9-]+$/.test(value);
}

function exactKeys(value: Record<string, unknown>, allowed: string[], label: string): void {
  const unexpected = Object.keys(value).filter((key) => !allowed.includes(key));
  if (unexpected.length > 0) fail(`${label} has unexpected fields: ${unexpected.join(", ")}`);
}

export function assertJudgeResultV1(value: unknown): JudgeResultV1 {
  if (!isRecord(value) || value.schema_version !== "judge-result/v1" || value.judge_version !== 1 || typeof value.state !== "string" || !qualityStates.includes(value.state as QualityOutcome)) fail("missing or invalid top-level fields");
  exactKeys(value, ["schema_version", "judge_version", "state", "score", "criteria", "reason"], "result");
  if (!Number.isInteger(value.score) || value.score < 0 || value.score > 100 || !Array.isArray(value.criteria)) fail("score or criteria is invalid");
  if (value.reason !== undefined && (typeof value.reason !== "string" || !value.reason)) fail("reason is invalid");

  const criterionIds = new Set<string>();
  let points = 0;
  let maxPoints = 0;
  for (const criterion of value.criteria) {
    if (!isRecord(criterion) || !validId(criterion.id) || !Number.isInteger(criterion.points) || !Number.isInteger(criterion.max_points) || criterion.points < 0 || criterion.max_points < 1 || criterion.max_points > 100 || criterion.points > criterion.max_points) fail("quality criterion is invalid");
    exactKeys(criterion, ["id", "points", "max_points"], "quality criterion");
    if (criterionIds.has(criterion.id)) fail(`duplicate quality criterion: ${criterion.id}`);
    criterionIds.add(criterion.id);
    points += criterion.points;
    maxPoints += criterion.max_points;
  }

  if (value.state === "observed") {
    if (value.criteria.length === 0) fail("observed quality requires at least one criterion");
    if (points !== value.score) fail("score disagrees with criterion points");
    if (maxPoints !== 100) fail("observed quality criterion maximum points must total 100");
    if (value.reason !== undefined) fail("observed quality must not carry a reason");
  } else {
    if (value.score !== 0 || value.criteria.length !== 0) fail("non-observed quality must score zero without criteria");
    if ((value.state === "indeterminate" || value.state === "judge-unavailable") && value.reason === undefined) fail(`${value.state} requires an audit reason`);
  }
  return value as JudgeResultV1;
}

export function deriveJointPass(semantic: SemanticOutcome | undefined, quality: QualityOutcome | undefined): boolean {
  return semantic === "pass" && quality === "observed";
}

function zeroCounts<T extends string>(states: readonly T[]): Record<T, number> {
  return Object.fromEntries(states.map((state) => [state, 0])) as Record<T, number>;
}

export function summarizeOutcomes(entries: readonly OutcomeEntry[]): OutcomeSummary {
  const health = zeroCounts(healthStates);
  const semantic = zeroCounts(semanticStates);
  const quality = zeroCounts(qualityStates);
  let evaluated = 0;
  let jointPass = 0;
  for (const entry of entries) {
    health[entry.health] += 1;
    if (entry.health !== "evaluated") continue;
    evaluated += 1;
    if (entry.semantic) semantic[entry.semantic] += 1;
    if (entry.quality) quality[entry.quality] += 1;
    if (deriveJointPass(entry.semantic, entry.quality)) jointPass += 1;
  }
  return { planned: entries.length, evaluated, health, semantic, quality, joint_pass: jointPass };
}
