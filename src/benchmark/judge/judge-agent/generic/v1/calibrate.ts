import { resolve } from "node:path";
import { sourceMapFromWorkspace, sourceMapToDiff } from "../../../source-map";
import { sha256Text } from "../../../../fs";
import { buildJudgeInput } from "../../../input";
import { judgeLlmEnv, httpJudgeCompletion } from "./llm";
import { generateRubricCached, parseRubricText } from "./rubric";
import { scoreCandidate } from "./score";

const candidateRoot = resolve(Bun.argv[2] ?? process.env.LORELUM_CALIBRATION_CANDIDATE_PATH ?? ".");
const setKey = process.env.LORELUM_CALIBRATION_SET_KEY ?? "generic-judge/v1";
const fixtureOrder = (process.env.LORELUM_CALIBRATION_FIXTURES ?? "reference,equivalent,anti-pattern,public-starter")
  .split(",").map((value) => value.trim()).filter(Boolean);

function threshold(name: string, fallback: number): number {
  const raw = process.env[`LORELUM_JUDGE_${name}`];
  if (raw === undefined) return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 0) throw new Error(`LORELUM_JUDGE_${name} must be a non-negative integer`);
  return value;
}

async function readSourceMap(fixturePath: string): Promise<Record<string, string>> {
  return sourceMapFromWorkspace(fixturePath);
}

const manifestPath = process.env.LORELUM_CALIBRATION_SETS_MANIFEST;
if (!manifestPath) throw new Error("Calibration fixtures must be staged by the kernel");
const staged = JSON.parse(await Bun.file(manifestPath).text()) as { sets: Record<string, { fixtures: Record<string, { path: string; tree_hash: string }> }> };
const set = staged.sets[setKey];
if (!set) throw new Error(`Missing staged calibration set: ${setKey}`);
const taskMd = await Bun.file(resolve(candidateRoot, "public", "task.md")).text();
if (!judgeLlmEnv().real) throw new Error("real judge calibration requires LORELUM_JUDGE_REAL=1");
const complete = httpJudgeCompletion();
const { text: rubricText, hash: rubricHash } = await generateRubricCached(taskMd, complete);

const results: Record<string, { state: string; score: number; rubric_hash: string; input_hash: string; tree_hash: string; reason?: string }> = {};
for (const fixtureName of fixtureOrder) {
  const fixture = set.fixtures[fixtureName];
  if (!fixture) throw new Error(`Missing staged calibration fixture: ${fixtureName}`);
  const files = await readSourceMap(fixture.path);
  const candidateDiff = sourceMapToDiff(files);
  const input = await buildJudgeInput({ task_md: taskMd, candidate_diff: candidateDiff, rubric: rubricText });
  const result = await scoreCandidate({
    taskMd,
    candidateDiff,
    rubric: parseRubricText(rubricText),
    rubricText,
    rubricHash,
    inputHash: input.input_hash,
    judge: { id: "judge-agent/generic", version: "v1" },
    complete,
  });
  results[fixtureName] = {
    state: result.state,
    score: result.score,
    rubric_hash: result.rubric_hash,
    input_hash: result.input_hash,
    tree_hash: fixture.tree_hash,
    ...(result.reason ? { reason: result.reason } : {}),
  };
}

const referenceMin = threshold("REFERENCE_MIN", 80);
const antiPatternMax = threshold("ANTI_PATTERN_MAX", 45);
const antiPatternGap = threshold("ANTI_PATTERN_GAP", 35);
const equivTolerance = threshold("EQUIV_TOLERANCE", 10);

function scoreOf(name: string): number {
  const entry = results[name];
  if (!entry || entry.state !== "observed") return -1;
  return entry.score;
}

const reference = results.reference;
const equivalent = results.equivalent;
const antiPattern = results["anti-pattern"];
const publicStarter = results["public-starter"];
const checks = {
  reference_high: reference?.state === "observed" && reference.score >= referenceMin,
  equivalent_close: equivalent?.state === "observed" && Math.abs(equivalent.score - (reference?.score ?? -1)) <= equivTolerance,
  anti_pattern_separated: antiPattern?.state === "observed" && antiPattern.score <= antiPatternMax && ((reference?.score ?? 0) - antiPattern.score) >= antiPatternGap,
  public_starter_below_reference: publicStarter === undefined || (reference !== undefined && publicStarter.score < reference.score),
  all_rubric_hashes_match: Object.values(results).every((entry) => entry.rubric_hash === rubricHash),
};
const passed = Object.values(checks).every(Boolean);
console.log(JSON.stringify({
  schema_version: "judge-agent-generic-calibration/v1",
  rubric: { hash: rubricHash },
  thresholds: { reference_min: referenceMin, anti_pattern_max: antiPatternMax, anti_pattern_gap: antiPatternGap, equivalent_tolerance: equivTolerance },
  results,
  checks,
  passed,
}, null, 2));
process.exit(passed ? 0 : 1);
