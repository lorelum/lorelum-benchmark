import { join, resolve } from "node:path";
import { buildJudgeInput } from "../../../judge/input";
import { loadRubric } from "./rubric";
import { analyzePractice, scoreSourceV2, type SourceMap } from "./score";
import { sourceMapToDiff } from "../../source-map";

const candidateRoot = resolve(Bun.argv[2] ?? process.env.LORELUM_CALIBRATION_CANDIDATE_PATH ?? ".");
const setKey = process.env.LORELUM_CALIBRATION_SET_KEY ?? "login-page-judge/v2";
const fixtureOrder = (process.env.LORELUM_CALIBRATION_FIXTURES ?? "reference,equivalent,anti-pattern").split(",").map((value) => value.trim()).filter(Boolean);

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
  const candidateDiff = sourceMapToDiff(files);
  const input = await buildJudgeInput({ task_md: taskMd, candidate_diff: candidateDiff, rubric: rubricText });
  const result = await scoreSourceV2({ files, taskMd, candidateDiff, rubricText, doc, inputHash: input.input_hash });
  const analysis = analyzePractice(files);
  results[fixtureName] = { ...analysis, tree_hash: fixture.tree_hash, input_hash: input.input_hash, rubric_hash: result.rubric_hash };
}

const reference = results.reference;
const equivalent = results.equivalent;
const antiPattern = results["anti-pattern"];
const pointsOf = (entry: typeof reference, id: string): number => entry.criteria.find((c) => c.id === id)?.points ?? -1;
const checks = {
  reference_meets_min: reference.state === "observed" && reference.score >= doc.thresholds.reference_min,
  equivalent_implementations_match: equivalent.state === "observed" && equivalent.score === reference.score && JSON.stringify(equivalent.criteria.map(({ id, points }) => ({ id, points }))) === JSON.stringify(reference.criteria.map(({ id, points }) => ({ id, points }))),
  anti_pattern_is_observed_and_separated: antiPattern.state === "observed" && antiPattern.score <= doc.thresholds.anti_pattern_max && reference.score - antiPattern.score >= doc.thresholds.anti_pattern_gap,
  anti_pattern_criterion_directions: antiPattern.state === "observed"
    && pointsOf(antiPattern, "component-transport-isolation") === 0
    && pointsOf(antiPattern, "domain-operation-delegation") === 0
    && pointsOf(antiPattern, "boundary-response-translation") === 0
    && pointsOf(antiPattern, "raw-response-containment") === 0,
  all_rubric_hashes_match: Object.values(results).every((entry) => entry.rubric_hash === reference.rubric_hash),
};
const passed = Object.values(checks).every(Boolean);
console.log(JSON.stringify({ schema_version: "login-page-practice-judge-calibration/v2", rubric: { id: doc.id, version: doc.version, hash: reference.rubric_hash }, results, checks, passed }, null, 2));
process.exit(passed ? 0 : 1);
