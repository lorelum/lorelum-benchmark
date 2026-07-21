import { basename } from "node:path";
import { findTask, type TaskLocation } from "./task-discovery";
import { joinPath, workspaceRoot } from "./fs";

const suite = "react-skill-comparison";
const suiteManifest = Bun.YAML.parse(await Bun.file(joinPath(workspaceRoot, "suites", suite, "suite.yaml")).text()) as { tasks?: Array<{ id?: string; path?: string; lifecycle_stage?: string }> };
const fixtureReferences = (suiteManifest.tasks ?? [])
  .filter((task) => (task.lifecycle_stage === "pilot" || task.lifecycle_stage === "retired") && typeof task.id === "string" && typeof task.path === "string")
  .map((task) => {
    const match = /^tasks\/([a-z0-9-]+)\/(v[1-9][0-9]*)$/.exec(task.path!);
    if (!match) throw new Error(`Invalid pilot task path: ${task.path}`);
    return { suite, reference: `${match[1]}/${match[2]}` };
  });

if (fixtureReferences.length === 0) {
  console.error("Fixture calibration requires at least one pilot or retired task.");
  process.exit(1);
}

async function runEvaluator(task: TaskLocation, candidatePath: string): Promise<{ exitCode: number; output: string }> {
  const evaluatorPath = joinPath(task.path, "private", "evaluator");
  const child = Bun.spawn([process.execPath, "test", evaluatorPath], {
    cwd: workspaceRoot,
    env: { ...Bun.env, CANDIDATE_PATH: candidatePath },
    stdout: "pipe",
    stderr: "pipe",
  });
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  return { exitCode, output: `${stdout}\n${stderr}` };
}

const failures: string[] = [];
for (const fixture of fixtureReferences) {
  const task = await findTask(fixture.suite, fixture.reference);
  if (!task) {
    failures.push(`Missing fixture task: ${fixture.suite}/${fixture.reference}`);
    continue;
  }

  const oraclePath = joinPath(task.path, "private", "oracle.yaml");
  const oracle = Bun.YAML.parse(await Bun.file(oraclePath).text()) as Record<string, unknown>;
  const referenceSolution = oracle.reference_solution;
  if (typeof referenceSolution !== "string" || referenceSolution.length === 0) {
    failures.push(`Missing reference_solution in ${oraclePath}`);
    continue;
  }

  const referencePath = joinPath(task.path, "private", referenceSolution);
  const starterPath = joinPath(task.path, "public", "starter", "src", basename(referencePath));
  const referenceResult = await runEvaluator(task, referencePath);
  if (referenceResult.exitCode !== 0) {
    failures.push(`Reference solution failed for ${fixture.reference}:\n${referenceResult.output}`);
    continue;
  }

  const starterResult = await runEvaluator(task, starterPath);
  if (starterResult.exitCode === 0 || !starterResult.output.includes("(fail)")) {
    failures.push(`Starter did not demonstrate a failing dynamic check for ${fixture.reference}:\n${starterResult.output}`);
    continue;
  }

  const mutationCandidates = oracle.mutation_candidates;
  if (mutationCandidates !== undefined && (!Array.isArray(mutationCandidates) || mutationCandidates.some((candidate) => typeof candidate !== "string" || candidate.length === 0))) {
    failures.push(`Invalid mutation_candidates in ${oraclePath}`);
    continue;
  }

  for (const mutationCandidate of mutationCandidates ?? []) {
    const mutationPath = joinPath(task.path, "private", mutationCandidate as string);
    const mutationResult = await runEvaluator(task, mutationPath);
    if (mutationResult.exitCode === 0 || !mutationResult.output.includes("(fail)")) {
      failures.push(`Mutation did not demonstrate a rejected check for ${fixture.reference}/${mutationCandidate}:\n${mutationResult.output}`);
    }
  }

  console.log(`Fixture calibrated: ${fixture.reference} (reference pass, starter negative, ${mutationCandidates?.length ?? 0} mutations rejected)`);
}

if (failures.length > 0) {
  console.error("Fixture calibration failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("All fixture reference and negative calibrations passed.");
