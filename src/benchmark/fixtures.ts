import { basename } from "node:path";
import { findTask, type TaskLocation } from "./task-discovery";
import { joinPath, workspaceRoot } from "./fs";

const fixtureReferences: Array<{ suite: string; reference: string }> = [
  { suite: "react-skill-comparison", reference: "workspace-overview-loader/v1" },
  { suite: "react-skill-comparison", reference: "issue-workbench-model/v1" },
  { suite: "react-skill-comparison", reference: "notification-preference-store/v1" },
  { suite: "react-skill-comparison", reference: "order-route-loader/v1" },
];

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

  console.log(`Fixture calibrated: ${fixture.reference} (reference pass, starter negative)`);
}

if (failures.length > 0) {
  console.error("Fixture calibration failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("All fixture reference and negative calibrations passed.");
