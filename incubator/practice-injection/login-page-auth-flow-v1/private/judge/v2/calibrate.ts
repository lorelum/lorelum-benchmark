import { join, resolve } from "node:path";
import { buildJudgeInput } from "../../../../../../src/benchmark/judge/input";
import { loadRubric } from "./rubric";
import { analyzePractice, scoreSourceV2, type SourceMap } from "./score";

const candidateRoot = resolve(import.meta.dirname, "..", "..", "..");
const setKey = "login-page-judge/v2";
const fixtureOrder = ["reference", "equivalent-indirect", "equivalent-reducer", "equivalent-helper", "anti-pattern", "ambiguous", "unrelated-import"];

async function readSourceMap(fixturePath: string): Promise<SourceMap> {
  const files: SourceMap = {};
  for await (const entry of new Bun.Glob("**/*").scan({ cwd: fixturePath, onlyFiles: true })) {
    files[entry.replaceAll("\\", "/")] = await Bun.file(join(fixturePath, entry)).text();
  }
  return files;
}

const manifestPath = process.env.LORELUM_CALIBRATION_SETS_MANIFEST;
if (!manifestPath) throw new Error("Calibration fixtures must be staged by the kernel");
const staged = JSON.parse(await Bun.file(manifestPath).text()) as { sets: Record<string, { fixtures: Record<string, { path: string; tree_hash: string }> }> };
const set = staged.sets[setKey];
if (!set) throw new Error(`Missing staged calibration set: ${setKey}`);
const taskMd = await Bun.file(join(candidateRoot, "public", "task.md")).text();
const { text: rubricText, doc } = await loadRubric();

const results: Record<string, ReturnType<typeof analyzePractice> & { tree_hash: string; input_hash: string; rubric_hash: string }> = {};
for (const fixtureName of fixtureOrder) {
  const fixture = set.fixtures[fixtureName];
  if (!fixture) throw new Error(`Missing staged calibration fixture: ${fixtureName}`);
  const files = await readSourceMap(fixture.path);
  const candidateDiff = Object.entries(files).sort(([a], [b]) => a.localeCompare(b)).map(([path, content]) => `${path}\0${content}`).join("\n");
  const input = await buildJudgeInput({ task_md: taskMd, candidate_diff: candidateDiff, rubric: rubricText });
  const result = await scoreSourceV2({ files, taskMd, candidateDiff, rubricText, doc, inputHash: input.input_hash });
  const analysis = analyzePractice(files);
  results[fixtureName] = { ...analysis, tree_hash: fixture.tree_hash, input_hash: input.input_hash, rubric_hash: result.rubric_hash };
}

const reference = results.reference;
const equivalents = [results["equivalent-indirect"], results["equivalent-reducer"], results["equivalent-helper"]];
const antiPattern = results["anti-pattern"];
const ambiguous = results.ambiguous;
const equivalentCriteria = equivalents.every((entry) => entry.state === "observed" && entry.score === reference.score && JSON.stringify(entry.criteria.map(({ id, points }) => ({ id, points }))) === JSON.stringify(reference.criteria.map(({ id, points }) => ({ id, points }))));
const checks = {
  reference_meets_min: reference.state === "observed" && reference.score >= doc.thresholds.reference_min,
  equivalent_implementations_match: equivalentCriteria,
  anti_pattern_is_observed_and_separated: antiPattern.state === "observed" && antiPattern.score <= doc.thresholds.anti_pattern_max && reference.score - antiPattern.score >= doc.thresholds.anti_pattern_gap,
  ambiguous_graph_fails_closed: ambiguous.state === "indeterminate" && ambiguous.score === 0 && ambiguous.reason !== undefined,
  unrelated_import_does_not_change_score: results["unrelated-import"].state === "observed" && results["unrelated-import"].score === reference.score,
  all_rubric_hashes_match: Object.values(results).every((entry) => entry.rubric_hash === reference.rubric_hash),
};
const passed = Object.values(checks).every(Boolean);
console.log(JSON.stringify({ schema_version: "login-page-practice-judge-calibration/v2", rubric: { id: doc.id, version: doc.version, hash: reference.rubric_hash }, results, checks, passed }, null, 2));
process.exit(passed ? 0 : 1);
