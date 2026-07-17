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

const snapshotCheck = Bun.spawn(["bun", "run", "src/benchmark/snapshot.ts", suite, taskReference], {
  cwd: workspaceRoot,
  env: Bun.env,
  stdin: "inherit",
  stdout: "inherit",
  stderr: "inherit"
});
if ((await snapshotCheck.exited) !== 0) process.exit(1);

const evaluator = Bun.spawn(["bun", "test", evaluatorPath], {
  cwd: workspaceRoot,
  env: Bun.env,
  stdin: "inherit",
  stdout: "inherit",
  stderr: "inherit"
});
process.exit(await evaluator.exited);
