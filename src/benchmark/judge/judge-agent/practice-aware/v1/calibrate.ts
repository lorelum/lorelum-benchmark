import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { resolveCalibrationSets, stageCalibrationSets } from "../../../../kernel/core/v1/calibration-fixtures";
import { buildJudgeInput } from "../../../input";
import { sourceMapFromWorkspace, sourceMapToDiff } from "../../../source-map";
import { httpJudgeCompletion, judgeLlmEnv } from "./llm";
import { parsePracticeAwareRubricText } from "./rubric";
import { scorePracticeAwareWithContractRetry } from "./score";
import { resolveDeclaredPracticeAwareMaterials } from "./declaration";
import {
  aggregateCalibrationSamples,
  practiceAwareCalibrationChecks,
  hasPracticeStructureDimension,
  type CalibrationFixtureResult,
  type CalibrationSample,
} from "./calibration-result";

const candidateRoot = resolve(Bun.argv[2] ?? process.env.LORELUM_CALIBRATION_CANDIDATE_PATH ?? ".");
const declaredPracticePath = Bun.argv[3] ?? process.env.LORELUM_CALIBRATION_PRACTICE_PATH ?? "";
const fixtureOrder = (process.env.LORELUM_CALIBRATION_FIXTURES ?? "reference,equivalent,anti-pattern,docs-present,baseline-policy-scatter")
  .split(",").map((value) => value.trim()).filter(Boolean);

if (!Bun.argv[2] && !process.env.LORELUM_CALIBRATION_CANDIDATE_PATH) {
  throw new Error("Usage: calibrate.ts <candidate-root> [declared-practice-path]");
}

function threshold(name: string, fallback: number): number {
  const raw = process.env[`LORELUM_JUDGE_${name}`];
  if (raw === undefined) return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 0) throw new Error(`LORELUM_JUDGE_${name} must be a non-negative integer`);
  return value;
}

const repetitions = Number(process.env.LORELUM_JUDGE_REPETITIONS || 3);
if (!Number.isInteger(repetitions) || repetitions < 1) throw new Error("LORELUM_JUDGE_REPETITIONS must be a positive integer");

if (!judgeLlmEnv().real) throw new Error("real practice-aware judge calibration requires LORELUM_JUDGE_REAL=1");
const taskMd = await Bun.file(join(candidateRoot, "public", "task.md")).text();
const declared = await resolveDeclaredPracticeAwareMaterials(
  candidateRoot,
  declaredPracticePath ? resolve(declaredPracticePath) : undefined,
);
const rubricText = declared.rubric.text;
const rubric = parsePracticeAwareRubricText(rubricText);
if (!hasPracticeStructureDimension(rubric)) {
  throw new Error("declared practice-aware rubric has no Practice-structure dimension");
}

const resolvedSets = await resolveCalibrationSets(candidateRoot);
if (!resolvedSets) throw new Error("Candidate has no calibration sets manifest");
const requestedSetKey = process.env.LORELUM_CALIBRATION_SET_KEY;
const setKey = requestedSetKey ?? Object.keys(resolvedSets.sets).find((key) =>
  fixtureOrder.every((name) => resolvedSets.sets[key]?.fixtures[name] !== undefined),
);
if (!setKey) throw new Error("LORELUM_CALIBRATION_SET_KEY must be provided (no staged set covers the requested fixtures)");
const set = resolvedSets.sets[setKey];
if (!set) throw new Error(`Missing staged calibration set: ${setKey}`);

const complete = httpJudgeCompletion();
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
  const results: Record<string, CalibrationFixtureResult> = {};

  async function scoreFixture(fixtureName: string, path: string, treeHash: string): Promise<void> {
    const files = await sourceMapFromWorkspace(path);
    const candidateDiff = sourceMapToDiff(files);
    const input = await buildJudgeInput({ task_md: taskMd, candidate_diff: candidateDiff, rubric: rubricText });
    const samples: CalibrationSample[] = [];
    for (let index = 0; index < repetitions; index += 1) {
      const result = await scorePracticeAwareWithContractRetry({
        taskMd,
        candidateDiff,
        rubric,
        rubricText,
        rubricHash: declared.rubric.sha256,
        inputHash: input.input_hash,
        judge: { id: "judge-agent/practice-aware", version: "v1" },
        complete,
      });
      samples.push({
        state: result.state,
        score: result.score,
        criteria: result.criteria,
        confidence: result.confidence,
        ...(result.reason ? { reason: result.reason } : {}),
      });
    }
    results[fixtureName] = aggregateCalibrationSamples({
      samples,
      rubricHash: declared.rubric.sha256,
      inputHash: input.input_hash,
      treeHash,
    });
  }

  for (const fixtureName of fixtureOrder) {
    const fixture = set.fixtures[fixtureName];
    if (!fixture) throw new Error(`Missing staged calibration fixture: ${fixtureName}`);
    await scoreFixture(fixtureName, stagedManifest.sets[setKey]!.fixtures[fixtureName]!.path, stagedManifest.sets[setKey]!.fixtures[fixtureName]!.tree_hash);
  }
  if (staged.publicStarterPath) {
    if (!stagedManifest.public_starter) throw new Error("Staged calibration manifest has no public starter");
    await scoreFixture("public-starter", stagedManifest.public_starter.path, stagedManifest.public_starter.tree_hash);
  }

  const thresholds = {
    referenceMin: threshold("REFERENCE_MIN", 80),
    equivalentTolerance: threshold("EQUIV_TOLERANCE", 10),
    antiPatternMax: threshold("ANTI_PATTERN_MAX", 70),
    antiPatternGap: threshold("ANTI_PATTERN_GAP", 10),
    docsPresentMax: threshold("DOCS_PRESENT_MAX", 70),
    docsPresentGap: threshold("DOCS_PRESENT_GAP", 10),
  };
  const checks = practiceAwareCalibrationChecks({ results, rubricHash: declared.rubric.sha256, rubric, thresholds });
  const passed = Object.values(checks).every(Boolean);
  processFailed = !passed;

  console.log(JSON.stringify({
    schema_version: "judge-agent-practice-aware-calibration/v2",
    judge: { id: "judge-agent/practice-aware", version: "v1", model: judgeLlmEnv().model },
    rubric: {
      hash: declared.rubric.sha256,
      dimensions: rubric.dimensions,
      text: rubricText,
      has_practice_dimension: hasPracticeStructureDimension(rubric),
    },
    practice: { sha256: declared.oracle_practice.sha256 },
    thresholds: {
      ...thresholds,
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