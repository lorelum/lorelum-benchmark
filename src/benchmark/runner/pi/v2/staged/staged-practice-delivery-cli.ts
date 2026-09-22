import { resolve } from "node:path";
import { piCommand, preflightPiAndModel } from "../preflight";
import { configureLocalPiModelCatalog, localPiApiKey, localPiModelArgument, localPiShellPath } from "../local-pi-model-catalog";
import { workspaceRoot } from "../../../../fs";
import { hashStagedPracticePlanInput, parseStagedPracticeDeliveryPlan, prepareStagedPracticeDelivery, runStagedPracticeDeliveryAttempt, writeInvalidStagedPracticeAttempt, type StagedPracticeAttemptReport, type StagedPracticeDeliveryPlan } from "./staged-practice-delivery";
import { productionStagedPracticePiAdapter } from "./staged-practice-delivery-pi-adapter";

async function readPlanFile(path: string): Promise<unknown> {
  const value = path.endsWith(".yaml") || path.endsWith(".yml")
    ? Bun.YAML.parse(await Bun.file(path).text())
    : JSON.parse(await Bun.file(path).text());
  return value;
}

export async function executeStagedPracticeDeliveryFromFile(options: {
  plan_path: string;
  attempt_id: string;
  artifacts: string;
  workspace: string;
  root?: string;
  dry_run?: boolean;
}): Promise<StagedPracticeAttemptReport> {
  const dryRun = options.dry_run === true;
  const root = options.root ?? workspaceRoot;
  const artifacts = resolve(options.artifacts);
  const workspace = resolve(options.workspace);
  let planValue: unknown;
  try {
    planValue = await readPlanFile(resolve(options.plan_path));
  } catch (error) {
    return writeInvalidStagedPracticeAttempt({
      root,
      attempt_id: options.attempt_id,
      artifacts,
      workspace,
      reason: error instanceof Error ? error.message : String(error),
    });
  }
  let plan: StagedPracticeDeliveryPlan;
  try {
    plan = await parseStagedPracticeDeliveryPlan(planValue);
  } catch (error) {
    return writeInvalidStagedPracticeAttempt({
      root,
      attempt_id: options.attempt_id,
      artifacts,
      workspace,
      plan_hash: await hashStagedPracticePlanInput(planValue),
      reason: error instanceof Error ? error.message : String(error),
    });
  }
  try {
    await prepareStagedPracticeDelivery(plan, root);
  } catch (error) {
    return writeInvalidStagedPracticeAttempt({
      root,
      attempt_id: options.attempt_id,
      artifacts,
      workspace,
      plan_hash: plan.plan_hash,
      reason: error instanceof Error ? error.message : String(error),
    });
  }
  if (!dryRun && Bun.env.LORELUM_LOCAL_EXPERIMENT !== "1") throw new Error("real staged Practice delivery requires LORELUM_LOCAL_EXPERIMENT=1");
  const piModel = localPiModelArgument(plan.execution.model);
  const localPiShell = dryRun ? undefined : await localPiShellPath();
  const localPiCatalog = dryRun ? undefined : await configureLocalPiModelCatalog(Bun.env, plan.execution.model, localPiShell);
  if (localPiCatalog) {
    Bun.env.PI_CODING_AGENT_DIR = localPiCatalog.directory;
    Bun.env.PI_OFFLINE = "1";
  }
  const localPiKey = dryRun ? undefined : localPiApiKey();
  if (localPiKey) Bun.env.DEEPSEEK_API_KEY = localPiKey;
  try {
    const command = dryRun ? undefined : await piCommand(root);
    if (command) await preflightPiAndModel(command, piModel);
    const pi = dryRun
      ? undefined
      : productionStagedPracticePiAdapter({
          command,
          model: piModel,
          tools: "read,bash,edit,write,grep,find,ls",
          stage_budget_ms: plan.execution.budget.max_duration_ms,
          log_directory: artifacts,
          base_system_prompt_path: resolve(root, plan.prompts.system_prompt_path),
        });
    return await runStagedPracticeDeliveryAttempt({
      root,
      plan,
      attempt_id: options.attempt_id,
      artifacts,
      workspace,
      dry_run: dryRun,
      pi,
    });
  } finally {
    localPiCatalog?.cleanup();
  }
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
