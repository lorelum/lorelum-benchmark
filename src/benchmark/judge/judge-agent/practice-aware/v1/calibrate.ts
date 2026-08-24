import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { sha256Text } from "../../../../fs";
import { resolveCalibrationSets, stageCalibrationSets } from "../../../../kernel/core/v1/calibration-fixtures";
import { buildJudgeInput } from "../../../input";
import { sourceMapFromWorkspace, sourceMapToDiff } from "../../../source-map";
import { httpJudgeCompletion, judgeLlmEnv } from "./llm";
import {
  assertPublicPracticeText,
  generatePracticeAwareRubricCached,
  parseRubricText,
} from "./rubric";
import { scoreCandidateWithContractRetry } from "./score";

const candidateRoot = resolve(Bun.argv[2] ?? process.env.LORELUM_CALIBRATION_CANDIDATE_PATH ?? ".");
const declaredPracticePath = Bun.argv[3] ?? process.env.LORELUM_CALIBRATION_PRACTICE_PATH ?? "";
const practicePath = declaredPracticePath ? resolve(declaredPracticePath) : "";
const fixtureOrder = (process.env.LORELUM_CALIBRATION_FIXTURES ?? "reference,equivalent,anti-pattern,docs-present")
  .split(",").map((value) => value.trim()).filter(Boolean);

if (!Bun.argv[2] && !process.env.LORELUM_CALIBRATION_CANDIDATE_PATH) {
  throw new Error("Usage: calibrate.ts <candidate-root> <practice-text-path>");
}
if (!practicePath) throw new Error("A Practice text path is required for practice-aware calibration");

function threshold(name: string, fallback: number): number {
  const raw = process.env[`LORELUM_JUDGE_${name}`];
  if (raw === undefined) return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 0) throw new Error(`LORELUM_JUDGE_${name} must be a non-negative integer`);
  return value;
}

const repetitions = Number(process.env.LORELUM_JUDGE_REPETITIONS || 3);
if (!Number.isInteger(repetitions) || repetitions < 1) throw new Error("LORELUM_JUDGE_REPETITIONS must be a positive integer");

function median(values: number[]): number {
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle]! : Math.round((sorted[middle - 1]! + sorted[middle]!) / 2);
}

type FixtureResult = {
  state: string;
  score: number;
  rubric_hash: string;
  input_hash: string;
  tree_hash: string;
  reason?: string;
  samples: number[];
};

if (!judgeLlmEnv().real) throw new Error("real practice-aware judge calibration requires LORELUM_JUDGE_REAL=1");
const taskMd = await Bun.file(join(candidateRoot, "public", "task.md")).text();
const practiceText = await Bun.file(practicePath).text();
assertPublicPracticeText(practiceText);

const resolvedSets = await resolveCalibrationSets(candidateRoot);
if (!resolvedSets) throw new Error("Candidate has no calibration sets manifest");
const requestedSetKey = process.env.LORELUM_CALIBRATION_SET_KEY;
const setKey = requestedSetKey ?? Object.keys(resolvedSets.sets).find((key) =>
  fixtureOrder.every((name) => resolvedSets.sets[key]?.fixtures[name] !== undefined)
);
if (!setKey) throw new Error("LORELUM_CALIBRATION_SET_KEY must be provided (no staged set covers the requested fixtures)");
const set = resolvedSets.sets[setKey];
if (!set) throw new Error(`Missing staged calibration set: ${setKey}`);

const complete = httpJudgeCompletion();
const { text: rubricText, hash: rubricHash } = await generatePracticeAwareRubricCached(taskMd, practiceText, complete);
const practiceHash = await sha256Text(practiceText);
const stagingPath = await mkdtemp(join(tmpdir(), "lorelum-practice-judge-"));
let processFailed = false;

try {
  const staged = await stageCalibrationSets(resolvedSets, stagingPath, {
    publicStarterPath: join(candidateRoot, "public", "starter"),
  });
  const stagedManifest = JSON.parse(await Bun.file(staged.manifestPath).text()) as {
    public_starter?: { path: string; tree_hash: string };
    sets: Record<string, { fixtures: Record<string, { path: string; tree_hash: string }> }>;
  };
  const results: Record<string, FixtureResult> = {};

  async function scoreFixture(fixtureName: string, path: string, treeHash: string): Promise<void> {
    const files = await sourceMapFromWorkspace(path);
    const candidateDiff = sourceMapToDiff(files);
    const input = await buildJudgeInput({ task_md: taskMd, candidate_diff: candidateDiff, rubric: rubricText });
    const samples: number[] = [];
    let last: { state: string; score: number; reason?: string } | undefined;
    for (let index = 0; index < repetitions; index += 1) {
      const result = await scoreCandidateWithContractRetry({
        taskMd,
        candidateDiff,
        rubric: parseRubricText(rubricText),
        rubricText,
        rubricHash,
        inputHash: input.input_hash,
        judge: { id: "judge-agent/practice-aware", version: "v1" },
        complete,
      });
      if (result.state === "observed") samples.push(result.score);
      last = { state: result.state, score: result.score, ...(result.reason ? { reason: result.reason } : {}) };
    }
    const score = samples.length ? median(samples) : 0;
    const state = samples.length ? "observed" : last?.state ?? "indeterminate";
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
    await scoreFixture(fixtureName, stagedManifest.sets[setKey]!.fixtures[fixtureName]!.path, stagedManifest.sets[setKey]!.fixtures[fixtureName]!.tree_hash);
  }
  if (staged.publicStarterPath) {
    const publicStarter = stagedManifest;
    if (!publicStarter.public_starter) throw new Error("Staged calibration manifest has no public starter");
    await scoreFixture("public-starter", publicStarter.public_starter.path, publicStarter.public_starter.tree_hash);
  }

  const referenceMin = threshold("REFERENCE_MIN", 80);
  const equivalentTolerance = threshold("EQUIV_TOLERANCE", 10);
  const antiPatternMax = threshold("ANTI_PATTERN_MAX", 70);
  const antiPatternGap = threshold("ANTI_PATTERN_GAP", 10);
  const docsPresentMax = threshold("DOCS_PRESENT_MAX", 70);
  const docsPresentGap = threshold("DOCS_PRESENT_GAP", 10);

  const reference = results.reference;
  const equivalent = results.equivalent;
  const antiPattern = results["anti-pattern"];
  const docsPresent = results["docs-present"];
  const publicStarter = results["public-starter"];
  const checks = {
    reference_high: reference?.state === "observed" && reference.score >= referenceMin,
    equivalent_high: equivalent?.state === "observed" && equivalent.score >= referenceMin,
    equivalent_close: equivalent?.state === "observed" && Math.abs(equivalent.score - (reference?.score ?? -1)) <= equivalentTolerance,
    anti_pattern_separated: antiPattern?.state === "observed" && antiPattern.score <= antiPatternMax && ((reference?.score ?? 0) - antiPattern.score) >= antiPatternGap,
    docs_present_separated: docsPresent?.state === "observed" && docsPresent.score <= docsPresentMax && ((reference?.score ?? 0) - docsPresent.score) >= docsPresentGap,
    public_starter_below_reference: publicStarter === undefined || (publicStarter.state !== "observed") || (reference !== undefined && publicStarter.score < reference.score),
    all_rubric_hashes_match: Object.values(results).every((entry) => entry.rubric_hash === rubricHash),
  };
  const passed = Object.values(checks).every(Boolean);
  processFailed = !passed;

  console.log(JSON.stringify({
    schema_version: "judge-agent-practice-aware-calibration/v1",
    judge: { id: "judge-agent/practice-aware", version: "v1", model: judgeLlmEnv().model },
    rubric: { hash: rubricHash },
    practice: { sha256: practiceHash },
    thresholds: {
      reference_min: referenceMin,
      equivalent_tolerance: equivalentTolerance,
      anti_pattern_max: antiPatternMax,
      anti_pattern_gap: antiPatternGap,
      docs_present_max: docsPresentMax,
      docs_present_gap: docsPresentGap,
      repetitions,
    },
    results,
    checks,
    passed,
  }, null, 2));
} finally {
  await rm(stagingPath, { force: true, recursive: true });
}

if (processFailed) process.exitCode = 1;