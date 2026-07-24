import { joinPath, pathExists, workspaceRoot } from "./fs";
import { findTask } from "./task-discovery";

const [suite, taskReference] = Bun.argv.slice(2);
if (!suite || !taskReference) {
  console.error("Usage: bun run evaluate -- <suite> <task-slug>/v<version>");
  process.exit(1);
}

const task = await findTask(suite, taskReference);
const evaluatorPath = task ? joinPath(task.path, "private", "evaluator") : "";
if (!task || !(await pathExists(evaluatorPath))) {
  console.error(`Evaluator not found for: ${suite} ${taskReference}`);
  process.exit(1);
}

const snapshotCheck = Bun.spawn([process.execPath, "run", "src/benchmark/snapshot.ts", suite, taskReference], {
  cwd: workspaceRoot,
  env: Bun.env,
  stdin: "inherit",
  stdout: "inherit",
  stderr: "inherit"
});
if ((await snapshotCheck.exited) !== 0) process.exit(1);

const taskCard = Bun.YAML.parse(await Bun.file(joinPath(task.path, "public", "task.yaml")).text()) as { evaluator_contract?: unknown };
const evaluatorCommand = taskCard.evaluator_contract === "structured/v2"
  ? [process.execPath, "run", "src/benchmark/evaluator/v2/run.ts", suite, taskReference]
  : [process.execPath, "test", evaluatorPath];
const evaluator = Bun.spawn(evaluatorCommand, {
  cwd: workspaceRoot,
  env: Bun.env,
  stdin: "inherit",
  stdout: "inherit",
  stderr: "inherit"
});
process.exit(await evaluator.exited);
