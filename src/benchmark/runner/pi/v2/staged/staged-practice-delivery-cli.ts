import { resolve } from "node:path";
import { piCommand, preflightPiAndModel } from "../preflight";
import { workspaceRoot } from "../../../../fs";
import { parseStagedPracticeDeliveryPlan, prepareStagedPracticeDelivery, runStagedPracticeDeliveryAttempt, type StagedPracticeAttemptReport, type StagedPracticeDeliveryPlan } from "./staged-practice-delivery";
import { productionStagedPracticePiAdapter } from "./staged-practice-delivery-pi-adapter";

async function readPlanFile(path: string): Promise<StagedPracticeDeliveryPlan> {
  const value = path.endsWith(".yaml") || path.endsWith(".yml")
    ? Bun.YAML.parse(await Bun.file(path).text())
    : JSON.parse(await Bun.file(path).text());
  return parseStagedPracticeDeliveryPlan(value);
}

export async function executeStagedPracticeDeliveryFromFile(options: {
  plan_path: string;
  attempt_id: string;
  artifacts: string;
  workspace: string;
  root?: string;
  dry_run?: boolean;
}): Promise<StagedPracticeAttemptReport> {
  const plan = await readPlanFile(resolve(options.plan_path));
  const dryRun = options.dry_run === true;
  const root = options.root ?? workspaceRoot;
  await prepareStagedPracticeDelivery(plan, root);
  if (!dryRun && Bun.env.LORELUM_LOCAL_EXPERIMENT !== "1") throw new Error("real staged Practice delivery requires LORELUM_LOCAL_EXPERIMENT=1");
  const command = dryRun ? undefined : await piCommand(workspaceRoot);
  if (command) await preflightPiAndModel(command, plan.execution.model);
  const pi = dryRun
    ? undefined
    : productionStagedPracticePiAdapter({
        command,
        model: plan.execution.model,
        tools: "read,bash,edit,write,grep,find,ls",
        stage_budget_ms: plan.execution.budget.max_duration_ms,
        log_directory: resolve(options.artifacts),
      });
  return runStagedPracticeDeliveryAttempt({
    root,
    plan,
    attempt_id: options.attempt_id,
    artifacts: resolve(options.artifacts),
    workspace: resolve(options.workspace),
    dry_run: dryRun,
    pi,
  });
}

function argumentValue(args: string[], name: string): string | undefined {
  const index = args.indexOf(name);
  return index === -1 ? undefined : args[index + 1];
}

if (import.meta.main) {
  const args = Bun.argv.slice(2);
  const planPath = argumentValue(args, "--plan");
  const attemptId = argumentValue(args, "--attempt-id");
  const artifacts = argumentValue(args, "--artifacts");
  const workspace = argumentValue(args, "--workspace");
  const dryRun = args.includes("--dry-run");
  if (!planPath || !attemptId || !artifacts || !workspace) {
    console.error("Usage: bun run staged-practice-delivery-cli.ts --plan <plan.json|plan.yaml> --attempt-id <id> --artifacts <dir> --workspace <dir> [--dry-run]");
    process.exit(1);
  }
  const report = await executeStagedPracticeDeliveryFromFile({ plan_path: planPath, attempt_id: attemptId, artifacts, workspace, dry_run: dryRun });
  console.log(JSON.stringify({ schema_version: report.schema_version, attempt_id: report.attempt_id, status: report.status, comparable: report.comparable, delivery_status: report.delivery_status, public_trace: report.public_trace }, null, 2));
}
