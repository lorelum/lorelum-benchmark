import { isAbsolute, join, relative, resolve } from "node:path";
import { sha256File, sha256Text } from "../../../../fs";
import type {
  DeclaredCondition,
  DeliveryTemplate,
  PracticeCardMetadata,
  PracticeMetadata,
  PracticePayload,
  PracticeReference,
  RedactedTwoStageTrace,
  ResolvedCondition,
  ResolvedPractice,
  ResolvedTwoStageProfile,
  TwoStageConditionId,
  TwoStageDecisionRule,
  TwoStageExecution,
  TwoStageConditions,
} from "./types";

const conditionIds: TwoStageConditionId[] = ["baseline", "oracle-practice", "irrelevant-practice"];
const generatedDirectories = new Set(["node_modules", "dist", "test-results", "playwright-report", ".git", ".vite", ".run-workspaces", "logs"]);

function fail(message: string): never {
  throw new Error(`Invalid two-stage-injection-calibration/v1 profile: ${message}`);
}

function record(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail(`${label} must be an object`);
  return value as Record<string, unknown>;
}

function text(value: unknown, label: string): string {
  if (typeof value !== "string" || value.trim().length === 0) fail(`${label} must be a non-empty string`);
  return value;
}

function number(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) fail(`${label} must be a finite number`);
  return value;
}

function stringArray(value: unknown, label: string): string[] {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string" || item.length === 0)) fail(`${label} must be a string array`);
  return value as string[];
}

async function readYaml<T>(path: string, label: string): Promise<T> {
  const file = Bun.file(path);
  if (!(await file.exists())) fail(`${label} is missing`);
  try {
    return Bun.YAML.parse(await file.text()) as T;
  } catch (error) {
    fail(`${label} is invalid YAML: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function relativeCandidatePath(candidatePath: string, declared: string, label: string): string {
  if (isAbsolute(declared) || declared.includes("\\")) fail(`${label} must be a relative POSIX path`);
  const resolvedPath = resolve(candidatePath, declared);
  const candidateRelative = relative(candidatePath, resolvedPath);
  if (!candidateRelative || candidateRelative.startsWith("..") || isAbsolute(candidateRelative)) fail(`${label} escapes the candidate`);
  return resolvedPath;
}

function validateReferencePath(candidatePath: string, referencePath: string): string {
  const resolved = relativeCandidatePath(candidatePath, referencePath, "practice path");
  const candidateRelative = relative(candidatePath, resolved).replaceAll("\\", "/");
  if (!candidateRelative.startsWith("private/practices/")) fail("practice must be declared under private/practices");
  return resolved;
}

function conditionById(conditions: DeclaredCondition[], id: TwoStageConditionId): DeclaredCondition {
  const condition = conditions.find((entry) => entry.id === id && entry.status === "declared");
  if (!condition) fail(`condition ${id} must be declared`);
  return condition;
}

function metadataCard(metadata: PracticeMetadata, reference: PracticeReference, practiceRoot: string): PracticeCardMetadata {
  const card = metadata.cards.find((entry) => entry.path === reference.path || reference.path.endsWith(`/${entry.path}`));
  if (!card) fail("practice reference is absent from metadata cards");
  if (metadata.delivery_template !== "project-convention/v1") fail("unsupported delivery template");
  if (!card.target_path || card.target_path.includes("..") || card.target_path.includes("\\")) fail("practice target_path is invalid");
  return card;
}

async function inspectPractice(
  candidatePath: string,
  reference: PracticeReference,
  card: PracticeCardMetadata,
  metadata: PracticeMetadata,
): Promise<ResolvedPractice> {
  const path = validateReferencePath(candidatePath, reference.path);
  const actualHash = await sha256File(path);
  if (actualHash !== reference.sha256) fail("practice reference SHA-256 mismatch");
  const body = await Bun.file(path).text();
  const renderedCharacters = [...body].length;
  if (renderedCharacters !== card.rendered_characters) fail("practice rendered character count mismatch");
  return {
    id: card.id,
    version: card.version,
    sha256: actualHash,
    delivery_template: metadata.delivery_template,
    target_path: card.target_path,
    rendered_characters: renderedCharacters,
  };
}

function parseConditions(value: unknown): TwoStageConditions {
  const document = record(value, "conditions");
  if (document.schema_version !== "two-stage-conditions/v1") fail("conditions schema_version must be two-stage-conditions/v1");
  const shared = record(document.shared_execution, "shared_execution");
  const agent = record(shared.agent, "shared_execution.agent");
  const model = record(shared.model, "shared_execution.model");
  const budgets = record(shared.budgets, "shared_execution.budgets");
  if (shared.workspace !== "clean-copy-per-attempt") fail("shared workspace must be clean-copy-per-attempt");
  if (shared.judge !== "none") fail("two-stage conditions must not declare a judge");
  if (!Number.isInteger(shared.repetitions) || (shared.repetitions as number) < 1) fail("shared repetitions must be positive");
  if (budgets.evaluator_time_counted !== false) fail("evaluator time must not be counted against model budgets");
  const conditionsValue = document.conditions;
  if (!Array.isArray(conditionsValue)) fail("conditions must be an array");
  const conditions = conditionsValue.map((entry) => record(entry, "condition") as unknown as DeclaredCondition);
  for (const id of conditionIds) conditionById(conditions, id);
  if (conditions.length !== conditionIds.length) fail("two-stage profile declares exactly three conditions");
  const decision = record(document.decision_rule, "decision_rule") as unknown as TwoStageDecisionRule;
  if (decision.metric !== "structure-pass-count") fail("decision metric must be structure-pass-count");
  if (decision.oracle_relation !== "strictly-greater-than-each-control") fail("invalid oracle relation");
  if (decision.directional_stability !== "majority-of-paired-blocks") fail("invalid directional stability rule");
  if (decision.otherwise !== "diagnostic-only") fail("non-directional conclusion must be diagnostic-only");
  return document as unknown as TwoStageConditions;
}

function parseExecution(value: unknown): TwoStageExecution {
  const document = record(value, "execution") as unknown as TwoStageExecution;
  if (document.schema_version !== "two-stage-execution/v1") fail("execution schema_version must be two-stage-execution/v1");
  if (document.session?.mode !== "same-workspace-same-pi-session") fail("session mode must be same-workspace-same-pi-session");
  if (document.session?.transcript_materialization !== "forbidden") fail("session transcript materialization must be forbidden");
  if (document.session?.resume_failure !== "execution-unhealthy") fail("session resume failure must be execution-unhealthy");
  if (document.stage_1?.max_duration_minutes !== 15) fail("stage_1 model budget must be 15 minutes");
  if (document.stage_2?.max_duration_minutes !== 15) fail("stage_2 model budget must be 15 minutes");
  if (!document.stage_1?.prompt_path?.startsWith("public/") || !document.stage_2?.prompt_path?.startsWith("public/")) fail("stage prompts must be public");
  if (document.stage_1.prompt_path === document.stage_2.prompt_path) fail("stage prompts must differ");
  if (document.snapshot?.root !== "app" || document.snapshot?.hash_algorithm !== "sha256") fail("snapshot policy is invalid");
  if (!Array.isArray(document.snapshot?.exclude) || !document.snapshot.exclude.includes("node_modules")) fail("snapshot must exclude node_modules");
  if (!Array.isArray(document.dependencies?.immutable_inputs) || !(document.dependencies.immutable_inputs as readonly string[]).includes("package.json")) fail("dependency immutability policy is invalid");
  if (document.saturation?.high_pass_rate !== 0.8 || document.saturation?.conclusion !== "saturated/no-discriminability") fail("saturation policy must be pre-registered at 0.8");
  return document;
}

async function inspectProfile(candidatePath: string): Promise<{
  profile: ResolvedTwoStageProfile;
  practicePaths: Partial<Record<TwoStageConditionId, string>>;
}> {
  const conditions = parseConditions(await readYaml<unknown>(join(candidatePath, "private/conditions.yaml"), "private/conditions.yaml"));
  const execution = parseExecution(await readYaml<unknown>(join(candidatePath, "private/execution/two-stage.yaml"), "private/execution/two-stage.yaml"));
  const practiceRoot = join(candidatePath, "private/practices");
  const metadata = record(await readYaml<unknown>(join(practiceRoot, "metadata.yaml"), "private/practices/metadata.yaml"), "practice metadata") as unknown as PracticeMetadata;
  if (metadata.delivery_template !== "project-convention/v1") fail("metadata delivery template must be project-convention/v1");
  if (metadata.comparison?.independently_reviewed !== true) fail("practice length comparison must be independently reviewed");

  const oracleCondition = conditionById(conditions.conditions, "oracle-practice");
  const irrelevantCondition = conditionById(conditions.conditions, "irrelevant-practice");
  if (oracleCondition.practice === "none" || irrelevantCondition.practice === "none") fail("oracle and irrelevant conditions must declare practice");
  const oracleCard = metadataCard(metadata, oracleCondition.practice, practiceRoot);
  const irrelevantCard = metadataCard(metadata, irrelevantCondition.practice, practiceRoot);
  if (oracleCard.id === irrelevantCard.id) fail("oracle and irrelevant cards must differ");
  const oracle = await inspectPractice(candidatePath, oracleCondition.practice, oracleCard, metadata);
  const irrelevant = await inspectPractice(candidatePath, irrelevantCondition.practice, irrelevantCard, metadata);
  const difference = Math.abs(oracle.rendered_characters - irrelevant.rendered_characters) / Math.max(oracle.rendered_characters, irrelevant.rendered_characters);
  if (difference > metadata.comparison.maximum_relative_difference) fail("practice length balance exceeds declared limit");
  if (Math.abs(difference - metadata.comparison.actual_relative_difference) > 1e-9) fail("declared practice length difference is stale");

  const resolvedConditions: Record<TwoStageConditionId, ResolvedCondition> = {
    baseline: { condition_id: "baseline", channel: "none" },
    "oracle-practice": { condition_id: "oracle-practice", channel: "condition-scoped-private-runtime", practice: oracle },
    "irrelevant-practice": { condition_id: "irrelevant-practice", channel: "condition-scoped-private-runtime", practice: irrelevant },
  };
  const profileInput = {
    conditions: conditionIds.map((id) => {
      const condition = resolvedConditions[id];
      return {
        id,
        channel: condition.channel,
        ...(condition.practice ? {
          practice_id: condition.practice.id,
          practice_version: condition.practice.version,
          practice_sha256: condition.practice.sha256,
          delivery_template: condition.practice.delivery_template,
          target_path: condition.practice.target_path,
          rendered_characters: condition.practice.rendered_characters,
        } : {}),
      };
    }),
    practice_length: {
      maximum_relative_difference: metadata.comparison.maximum_relative_difference,
      actual_relative_difference: difference,
    },
    decision_rule: conditions.decision_rule,
    execution,
  };
  return {
    profile: {
      conditions: resolvedConditions,
      practice_metadata: metadata,
      decision_rule: conditions.decision_rule,
      execution,
      profile_input_hash: await sha256Text(JSON.stringify(profileInput)),
    },
    practicePaths: {
      "oracle-practice": validateReferencePath(candidatePath, oracleCondition.practice.path),
      "irrelevant-practice": validateReferencePath(candidatePath, irrelevantCondition.practice.path),
    },
  };
}

export async function resolveTwoStageInjectionCalibration(candidatePath: string): Promise<ResolvedTwoStageProfile> {
  return (await inspectProfile(candidatePath)).profile;
}

export async function resolveTwoStagePracticePayload(
  candidatePath: string,
  profile: ResolvedTwoStageProfile,
  conditionId: TwoStageConditionId,
): Promise<PracticePayload> {
  const inspected = await inspectProfile(candidatePath);
  if (inspected.profile.profile_input_hash !== profile.profile_input_hash) fail("profile input changed after resolution");
  const condition = profile.conditions[conditionId];
  const practicePath = inspected.practicePaths[conditionId];
  if (!condition.practice || !practicePath) return condition;
  return { ...condition, practice: { ...condition.practice, text: await Bun.file(practicePath).text() } };
}

export function redactedTwoStageTrace(profile: ResolvedTwoStageProfile, payload: PracticePayload): RedactedTwoStageTrace {
  return {
    condition_id: payload.condition_id,
    channel: payload.channel,
    profile_input_hash: profile.profile_input_hash,
    ...(payload.practice ? {
      practice_id: payload.practice.id,
      practice_version: payload.practice.version,
      practice_sha256: payload.practice.sha256,
      delivery_template: payload.practice.delivery_template,
      target_path: payload.practice.target_path,
    } : {}),
  };
}

export function isGeneratedTwoStagePath(relativePath: string): boolean {
  return relativePath.split("/").some((segment) => generatedDirectories.has(segment));
}
