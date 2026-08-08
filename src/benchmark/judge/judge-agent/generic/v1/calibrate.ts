import { resolve } from "node:path";
import { sourceMapFromWorkspace, sourceMapToDiff } from "../../../source-map";
import { sha256Text } from "../../../../fs";
import { buildJudgeInput } from "../../../input";
import { judgeLlmEnv, httpJudgeCompletion } from "./llm";
import { generateRubricCached, parseRubricText } from "./rubric";
import { scoreCandidate } from "./score";

const candidateRoot = resolve(Bun.argv[2] ?? process.env.LORELUM_CALIBRATION_CANDIDATE_PATH ?? ".");
const fixtureOrder = (process.env.LORELUM_CALIBRATION_FIXTURES ?? "reference,equivalent,anti-pattern")
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
const staged = JSON.parse(await Bun.file(manifestPath).text()) as {
  sets: Record<string, { fixtures: Record<string, { path: string; tree_hash: string }> }>;
  public_starter?: { path: string; tree_hash: string };
};
const requestedSetKey = process.env.LORELUM_CALIBRATION_SET_KEY;
const setKey = requestedSetKey ?? Object.keys(staged.sets).find((key) =>
  ["reference", "equivalent", "anti-pattern"].every((name) => staged.sets[key].fixtures[name] !== undefined),
);
if (!setKey) throw new Error("LORELUM_CALIBRATION_SET_KEY must be provided (no staged set covers reference/equivalent/anti-pattern)");
const set = staged.sets[setKey];
if (!set) throw new Error(`Missing staged calibration set: ${setKey}`);
const taskMd = await Bun.file(resolve(candidateRoot, "public", "task.md")).text();
if (!judgeLlmEnv().real) throw new Error("real judge calibration requires LORELUM_JUDGE_REAL=1");
const complete = httpJudgeCompletion();
const { text: rubricText, hash: rubricHash } = await generateRubricCached(taskMd, complete);

// Defaults are calibrated for LLM judge score distributions (compressed vs
// deterministic judges): observed on profile-update v2 (ref ~57-82/eq ~54-85/anti ~43-48)
// and project-directory v2 (ref ~96-100/eq ~88-100/anti ~53-65), 2026-08-06, deepseek-v4-flash.
const referenceMin = threshold("REFERENCE_MIN", 50);
const antiPatternMax = threshold("ANTI_PATTERN_MAX", 70);
const antiPatternGap = threshold("ANTI_PATTERN_GAP", 10);
const equivTolerance = threshold("EQUIV_TOLERANCE", 10);
const repetitions = Number(process.env.LORELUM_JUDGE_REPETITIONS) || 3;

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : Math.round((sorted[mid - 1] + sorted[mid]) / 2);
}

type FixtureResult = { state: string; score: number; rubric_hash: string; input_hash: string; tree_hash: string; reason?: string; samples: number[] };
const results: Record<string, FixtureResult> = {};
async function scoreFixture(fixtureName: string, path: string, treeHash: string): Promise<void> {
  const files = await readSourceMap(path);
  const candidateDiff = sourceMapToDiff(files);
  const input = await buildJudgeInput({ task_md: taskMd, candidate_diff: candidateDiff, rubric: rubricText });
  const samples: number[] = [];
  let last: { state: string; score: number; reason?: string } | undefined;
  for (let i = 0; i < repetitions; i += 1) {
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
    if (result.state === "observed") samples.push(result.score);
    last = { state: result.state, score: result.score, ...(result.reason ? { reason: result.reason } : {}) };
  }
  const score = samples.length ? median(samples) : 0;
  const state = samples.length ? "observed" : (last?.state ?? "indeterminate");
  results[fixtureName] = {
    state,
    score,
    rubric_hash: rubricHash,
    input_hash: input.input_hash,
    tree_hash: treeHash,
    samples,
    ...(state !== "observed" && last?.reason ? { reason: last.reason } : {}),
  };
}
for (const fixtureName of fixtureOrder) {
  const fixture = set.fixtures[fixtureName];
  if (!fixture) throw new Error(`Missing staged calibration fixture: ${fixtureName}`);
  await scoreFixture(fixtureName, fixture.path, fixture.tree_hash);
}
if (staged.public_starter) {
  await scoreFixture("public-starter", staged.public_starter.path, staged.public_starter.tree_hash);
}

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
  public_starter_below_reference: publicStarter === undefined || (publicStarter.state !== "observed") || (reference !== undefined && publicStarter.score < reference.score),
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
