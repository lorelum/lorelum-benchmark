import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { resolveCalibrationSets, stageCalibrationSets } from "../../../../kernel/core/v1/calibration-fixtures";
import { buildJudgeInput } from "../../../input";
import { sourceMapFromWorkspace, sourceMapToDiff } from "../../../source-map";
import { httpJudgeCompletion, judgeLlmEnv } from "../v1/llm";
import { parsePracticeAwareRubricText } from "../v1/rubric";
import { hasPracticeStructureDimension } from "../v1/calibration-result";
import { resolveDeclaredPracticeAwareMaterials } from "./declaration";
import { scoreStructureAwareWithRetry } from "./score";
import { structureFactSchemaHash } from "./structure-facts";
import {
  aggregateCalibrationSamples,
  dimensionConfusion,
  dimensionLabelChecks,
  expectedDimensionLabels,
  practiceAwareStructureCalibrationChecks,
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
if (!judgeLlmEnv().real) throw new Error("real structure-fact calibration requires LORELUM_JUDGE_REAL=1");
if (process.env.LORELUM_STRUCTURE_FACT_CALIBRATION_AUTHORIZATION !== "judge-model-only/3-samples") {
  throw new Error("structure-fact calibration requires explicit judge-model-only/3-samples authorization");
}

const taskMd = await Bun.file(join(candidateRoot, "public", "task.md")).text();
const declared = await resolveDeclaredPracticeAwareMaterials(
  candidateRoot,
  declaredPracticePath ? resolve(declaredPracticePath) : undefined,
);
const rubricText = declared.rubric.text;
const rubric = parsePracticeAwareRubricText(rubricText);
if (!hasPracticeStructureDimension(rubric)) throw new Error("declared practice-aware rubric has no Practice-structure dimension");
const resolvedSets = await resolveCalibrationSets(candidateRoot);
if (!resolvedSets) throw new Error("Candidate has no calibration sets manifest");
const requestedSetKey = process.env.LORELUM_CALIBRATION_SET_KEY;
const setKey = requestedSetKey ?? Object.keys(resolvedSets.sets).find((key) =>
  fixtureOrder.every((name) => resolvedSets.sets[key]?.fixtures[name] !== undefined),
);
if (!setKey) throw new Error("LORELUM_CALIBRATION_SET_KEY must be provided (no staged set covers the requested fixtures)");
const set = resolvedSets.sets[setKey];
if (!set) throw new Error(`Missing staged calibration set: ${setKey}`);

const stagingPath = await mkdtemp(join(tmpdir(), "lorelum-structure-judge-"));
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
    const complete = httpJudgeCompletion();
    for (let index = 0; index < repetitions; index += 1) {
      try {
        const scored = await scoreStructureAwareWithRetry({
          taskMd,
          candidateDiff,
          rubric,
          rubricText,
          rubricHash: declared.rubric.sha256,
          inputHash: input.input_hash,
          judge: { id: "judge-agent/practice-aware", version: "v2" },
          complete,
        });
        samples.push({
          state: scored.result.state,
          score: scored.result.score,
          criteria: scored.result.criteria,
          confidence: scored.result.confidence,
          dimension_labels: scored.dimension_labels,
          facts: scored.extraction.facts,
        });
      } catch (error) {
        // A malformed or unavailable judge sample is evidence, not a reason to
        // fabricate a score or stop the remaining authorized calibration samples.
        // Keep the reason bounded to one sanitized line so upstream HTML or other
        // verbose transport bodies cannot enter calibration evidence.
        const message = error instanceof Error ? error.message : String(error);
        samples.push({
          state: "judge-unavailable",
          score: 0,
          criteria: [],
          confidence: 0,
          reason: message.split(/\r?\n/, 1)[0]!.slice(0, 300) || "judge sample failed without a reason",
        });
      }
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
  const checks = practiceAwareStructureCalibrationChecks({ results, rubricHash: declared.rubric.sha256, thresholds });
  processFailed = !Object.values(checks).every(Boolean);
  console.log(JSON.stringify({
    schema_version: "judge-agent-practice-aware-structure-calibration/v1",
    judge: { id: "judge-agent/practice-aware", version: "v2", model: judgeLlmEnv().model },
    fact_schema: { version: "practice-aware-structure-facts/v1", sha256: await structureFactSchemaHash() },
    rubric: {
      hash: declared.rubric.sha256,
      dimension_summaries: rubric.dimensions.map((dimension) => ({ id: dimension.id, max_points: dimension.max_points })),
      has_practice_dimension: true,
    },
    practice: { sha256: declared.oracle_practice.sha256 },
    expected_dimension_labels: expectedDimensionLabels,
    thresholds: { ...thresholds, repetitions },
    results,
    dimension_label_checks: dimensionLabelChecks({ results }),
    confusion_matrix: dimensionConfusion({ results }),
    checks,
    passed: !processFailed,
  }, null, 2));
} finally {
  await rm(stagingPath, { force: true, recursive: true });
}
if (processFailed) process.exitCode = 1;
