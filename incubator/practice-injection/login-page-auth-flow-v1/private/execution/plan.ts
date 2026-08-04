import { resolve } from "node:path";
import { rubricHash, loadRubric } from "../judge/rubric";

const candidateRoot = resolve(import.meta.dir, "../..");

export const TASK_PROMPT = "Complete the coding task. Work only inside app/.";

export type FrozenPlan = {
  schema_version: string;
  candidate: string;
  source_commit: string;
  snapshot_manifest: string;
  profile: string;
  model: string;
  pi_version: string;
  budget: { max_duration_minutes: number };
  repetitions: number;
  prompt_template: string;
  judge: { channel: "local-mock"; repetition: { count: number; aggregate: "median" } };
};

function fail(message: string): never {
  throw new Error(`Frozen pilot plan invalid: ${message}`);
}

export async function loadPlan(): Promise<FrozenPlan> {
  const parsed = Bun.YAML.parse(await Bun.file(resolve(candidateRoot, "private/execution/plan.yaml")).text()) as Record<string, unknown>;
  if (!parsed || parsed.schema_version !== "login-page-diagnostic-pilot-plan/v1") fail("schema_version is missing or unsupported");
  if (typeof parsed.candidate !== "string" || !parsed.candidate) fail("candidate is required");
  if (typeof parsed.source_commit !== "string" || !/^[a-f0-9]{40}$/.test(parsed.source_commit)) fail("source_commit is required");
  if (typeof parsed.snapshot_manifest !== "string" || !parsed.snapshot_manifest) fail("snapshot_manifest is required");
  if (typeof parsed.profile !== "string" || !parsed.profile) fail("profile is required");
  if (typeof parsed.model !== "string" || !parsed.model) fail("model is required");
  if (typeof parsed.pi_version !== "string" || !parsed.pi_version) fail("pi_version is required");
  const budget = parsed.budget as { max_duration_minutes?: unknown } | undefined;
  if (!budget || !Number.isInteger(budget.max_duration_minutes) || (budget.max_duration_minutes as number) < 1) fail("budget.max_duration_minutes is required");
  if (!Number.isInteger(parsed.repetitions) || (parsed.repetitions as number) < 1) fail("repetitions is required");
  if (typeof parsed.prompt_template !== "string" || !parsed.prompt_template) fail("prompt_template is required");
  const judge = parsed.judge as { channel?: unknown; repetition?: { count?: unknown; aggregate?: unknown } } | undefined;
  if (!judge || judge.channel !== "local-mock") fail("judge.channel must be local-mock");
  if (!judge.repetition || judge.repetition.count !== 3 || judge.repetition.aggregate !== "median") fail("judge.repetition must be n=3 median");
  return parsed as unknown as FrozenPlan;
}

async function currentFacts(): Promise<{
  source_commit: string;
  snapshot_id: string;
  profile_input_hash: string;
  profile: string;
  model: string;
  pi_version: string;
  budget: number;
  repetitions: number;
  rubric_hash: string;
}> {
  const conditions = Bun.YAML.parse(await Bun.file(resolve(candidateRoot, "private/conditions.yaml")).text()) as {
    source_commit?: string;
    shared_execution?: { pi_version?: string; model?: { id?: string }; budget?: { max_duration_minutes?: number }; repetitions?: number };
  };
  if (!conditions?.shared_execution) fail("private/conditions.yaml is invalid");
  const candidate = Bun.YAML.parse(await Bun.file(resolve(candidateRoot, "private/candidate.yaml")).text()) as {
    kernel?: { profile?: string };
  };
  const snapshot = JSON.parse(await Bun.file(resolve(candidateRoot, "private/snapshot.json")).text()) as {
    snapshot_id?: string;
    resolved?: { profile_input_hash?: string };
  };
  const { text: rubricText } = await loadRubric();
  return {
    source_commit: conditions.source_commit ?? "",
    snapshot_id: snapshot.snapshot_id ?? "",
    profile_input_hash: snapshot.resolved?.profile_input_hash ?? "",
    profile: candidate.kernel?.profile ?? "",
    model: conditions.shared_execution.model?.id ?? "",
    pi_version: conditions.shared_execution.pi_version ?? "",
    budget: conditions.shared_execution.budget?.max_duration_minutes ?? -1,
    repetitions: conditions.shared_execution.repetitions ?? -1,
    rubric_hash: await rubricHash(rubricText),
  };
}

export async function verifyPlanFrozen(): Promise<void> {
  const plan = await loadPlan();
  const facts = await currentFacts();
  const pairs: Array<[string, string | number, string | number]> = [
    ["source_commit", plan.source_commit, facts.source_commit],
    ["profile", plan.profile, facts.profile],
    ["model", plan.model, facts.model],
    ["pi_version", plan.pi_version, facts.pi_version],
    ["budget.max_duration_minutes", plan.budget.max_duration_minutes, facts.budget],
    ["repetitions", plan.repetitions, facts.repetitions],
    ["prompt_template", plan.prompt_template, TASK_PROMPT],
  ];
  for (const [label, expected, actual] of pairs) {
    if (expected !== actual) fail(`${label} drifted (plan=${expected}, current=${actual}); re-freeze the plan before running the pilot`);
  }
}

export async function frozenPlan(): Promise<{ plan: FrozenPlan; rubric_hash: string; snapshot_id: string; profile_input_hash: string }> {
  await verifyPlanFrozen();
  const plan = await loadPlan();
  const { text } = await loadRubric();
  const facts = await currentFacts();
  return { plan, rubric_hash: await rubricHash(text), snapshot_id: facts.snapshot_id, profile_input_hash: facts.profile_input_hash };
}
