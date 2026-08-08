import { join, resolve } from "node:path";
import { buildJudgeInput } from "../../../../../src/benchmark/judge/input";
import { loadRubric } from "./rubric";
import { scoreSource, type SourceMap } from "./score";
import { aggregateRuns, type AggregateResult } from "./aggregate";

const candidateRoot = resolve(import.meta.dirname, "..", "..");
const repositoryRoot = resolve(candidateRoot, "..", "..", "..");
const setKey = "login-page-judge/v1";
const fixtureOrder = ["reference", "equivalent", "anti-pattern", "boundary"];

async function listFilesRecursive(root: string): Promise<string[]> {
  const files: string[] = [];
  for await (const entry of new Bun.Glob("**/*").scan({ cwd: root, onlyFiles: true })) {
    files.push(entry);
  }
  return files.sort();
}

async function readSourceMap(fixturePath: string): Promise<SourceMap> {
  const files: SourceMap = {};
  for (const file of await listFilesRecursive(fixturePath)) {
    files[file.replaceAll("\\", "/")] = await Bun.file(join(fixturePath, file)).text();
  }
  return files;
}

const stagedManifestPath = process.env.LORELUM_CALIBRATION_SETS_MANIFEST;
if (!stagedManifestPath) throw new Error("Calibration fixtures must be staged by the kernel");
const staged = JSON.parse(await Bun.file(stagedManifestPath).text()) as {
  sets: Record<string, { fixtures: Record<string, { path: string; tree_hash: string }> }>;
};
const set = staged.sets[setKey];
if (!set) throw new Error(`Missing staged calibration set: ${setKey}`);

const taskMd = await Bun.file(join(candidateRoot, "public", "task.md")).text();
const { text: rubricText, doc } = await loadRubric();

type MatrixEntry = {
  id: string;
  tree_hash: string;
  scores: number[];
  median: number;
  spread: number;
  low_confidence: boolean;
  disagreement: boolean;
  state: "observed" | "indeterminate";
  score: number | null;
  criteria: Array<{ id: string; points: number; max_points: number; rationale: string }>;
  reason: string | null;
  input_hash: string;
};

const results: MatrixEntry[] = [];
for (const fixtureName of fixtureOrder) {
  const fixture = set.fixtures[fixtureName];
  if (!fixture) throw new Error(`Missing staged calibration fixture: ${fixtureName}`);
  const files = await readSourceMap(fixture.path);
  const candidateDiff = Object.entries(files)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([path, content]) => `${path}\0${content}`)
    .join("\n");
  const input = await buildJudgeInput({ task_md: taskMd, candidate_diff: candidateDiff, rubric: rubricText });

  const runs = [];
  for (let attempt = 0; attempt < doc.repetition.count; attempt++) {
    const result = await scoreSource({ files, taskMd, candidateDiff, rubricText, doc, inputHash: input.input_hash });
    runs.push({ score: result.score, confidence: result.confidence, criteria: result.criteria });
  }
  const aggregate: AggregateResult = aggregateRuns(runs, doc.thresholds);
  results.push({
    id: fixtureName,
    tree_hash: fixture.tree_hash,
    scores: aggregate.report.scores,
    median: aggregate.report.median,
    spread: aggregate.report.spread,
    low_confidence: aggregate.report.lowConfidence,
    disagreement: aggregate.report.disagreement,
    state: aggregate.state,
    score: aggregate.state === "observed" ? aggregate.score : null,
    criteria: aggregate.state === "observed" ? aggregate.criteria.map((criterion) => ({ id: criterion.id, points: criterion.points, max_points: criterion.max_points, rationale: criterion.rationale })) : [],
    reason: aggregate.reason ?? null,
    input_hash: input.input_hash,
  });
}

const byId = Object.fromEntries(results.map((entry) => [entry.id, entry])) as Record<string, MatrixEntry>;
const reference = byId.reference;
const equivalent = byId.equivalent;
const antiPattern = byId["anti-pattern"];
const boundary = byId.boundary;

const checks = {
  reference_meets_min: reference.median >= doc.thresholds.reference_min,
  equivalent_within_tolerance: Math.abs(equivalent.median - reference.median) <= doc.thresholds.equivalent_tolerance,
  anti_pattern_below_max: antiPattern.median <= doc.thresholds.anti_pattern_max,
  anti_pattern_gap: reference.median - antiPattern.median >= doc.thresholds.anti_pattern_gap,
  boundary_stable: boundary.state === "observed" && boundary.criteria.length > 0 && !boundary.disagreement,
  no_fixture_disagreement: results.every((entry) => !entry.disagreement),
  no_fixture_low_confidence: results.every((entry) => !entry.low_confidence),
};
const passed = Object.values(checks).every(Boolean);

console.log(JSON.stringify({ calibration: results, checks, thresholds: doc.thresholds, passed }, null, 2));
process.exit(passed ? 0 : 1);
