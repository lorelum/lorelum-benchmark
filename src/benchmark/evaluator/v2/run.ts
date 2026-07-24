import { pathToFileURL } from "node:url";
import { joinPath, pathExists, workspaceRoot } from "../../fs";
import { findTask } from "../../task-discovery";
import { assertEvaluatorResultV2, type EvaluatorResultV2 } from "./result";

type EvaluatorModule = {
  evaluateCandidate?: (input: { candidatePath: string }) => Promise<EvaluatorResultV2>;
};

const [suite, taskReference] = Bun.argv.slice(2);
if (!suite || !taskReference) {
  console.error("Usage: bun run src/benchmark/evaluator/v2/run.ts <suite> <task-slug>/v<version>");
  process.exit(1);
}

const candidatePath = Bun.env.CANDIDATE_PATH;
if (!candidatePath) {
  console.error("Evaluator v2 requires CANDIDATE_PATH");
  process.exit(1);
}

const task = await findTask(suite, taskReference);
const taskCardPath = task ? joinPath(task.path, "public", "task.yaml") : "";
const entryPath = task ? joinPath(task.path, "private", "evaluator", "evaluate.ts") : "";
if (!task || !(await pathExists(taskCardPath)) || !(await pathExists(entryPath))) {
  console.error(`Evaluator v2 entry not found for: ${suite} ${taskReference}`);
  process.exit(1);
}

const taskCard = Bun.YAML.parse(await Bun.file(taskCardPath).text()) as { evaluator_contract?: unknown };
if (taskCard.evaluator_contract !== "structured/v2") {
  console.error(`Task does not use the structured evaluator v2 contract: ${suite} ${taskReference}`);
  process.exit(1);
}

try {
  const module = await import(`${pathToFileURL(entryPath).href}?run=${Date.now()}`) as EvaluatorModule;
  if (typeof module.evaluateCandidate !== "function") throw new Error(`Evaluator v2 must export evaluateCandidate: ${entryPath}`);
  const result = assertEvaluatorResultV2(await module.evaluateCandidate({ candidatePath }));
  console.log(JSON.stringify(result));
  process.exit(result.semantic.passed ? 0 : 1);
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
