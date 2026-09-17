import { appendFile, cp, lstat, mkdir, readdir, realpath, writeFile } from "node:fs/promises";
import { basename, dirname, isAbsolute, join, relative, resolve } from "node:path";
import { loadPackPracticeTreatment, deliverPreparedPractice } from "../../../../treatments/pack-practice/v1/contract";
import type {
  DeliveryStatus,
  PackProvenance,
  PreparedPackPractice,
  PreparedPracticePayload,
  TimingNode,
} from "../../../../treatments/pack-practice/v1/types";
import { timingNodes } from "../../../../treatments/pack-practice/v1/types";
import { sha256File, sha256Text, workspaceRoot } from "../../../../fs";

export const stagedPracticeDeliverySchemaVersion = "staged-practice-delivery/v1" as const;
export const stagedPracticeAuditSchemaVersion = "staged-practice-delivery-audit/v1" as const;
export const stagedPracticePublicTraceSchemaVersion = "staged-practice-delivery-public/v1" as const;
export const checkpointMarker = "CHECKPOINT: compatibility-slice-ready" as const;
export const checkpointResumeMessage = "Continue the task after the compatibility checkpoint.";
export const frozenCandidateSourceCommit = "74962ee0c98f7775b0eb626f7b49b878035d8778" as const;
export const frozenCandidateSnapshotId = "ee588de3877ab91f2c1dfe8219bb7f9834671dd2a275531485f9d0630e0165d2" as const;
export const invalidPlanCondition = "invalid-plan" as const;
export const stagedPracticeConditions = ["task_start", "constraint_followup", "first_implementation_checkpoint"] as const;
export type StagedPracticeCondition = string;
export type StagedPracticeAttemptNode = TimingNode | typeof invalidPlanCondition;

const sha256Pattern = /^[a-f0-9]{64}$/;
const commitPattern = /^[a-f0-9]{40}$/;
const planIdPattern = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
const conditionPattern = /^[a-z0-9][a-z0-9_-]*$/;
const treatmentIdPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const versionPattern = /^v[1-9][0-9]*$/;

export type StagedPracticeDeliveryPlan = Readonly<{
  schema_version: typeof stagedPracticeDeliverySchemaVersion;
  id: string;
  candidate: Readonly<{ path: string; source_commit: string; snapshot_id: string }>;
  treatment: Readonly<{ root: string; id: string; version: string }>;
  delivery: Readonly<{ condition_id: StagedPracticeCondition; delivery_node: TimingNode }>;
  prompts: Readonly<{
    task_path: "public/task.md";
    followup_path: "public/stage-2/task.md";
    task_sha256: string;
    followup_sha256: string;
    checkpoint_marker: typeof checkpointMarker;
    checkpoint_resume_message: string;
  }>;
  execution: Readonly<{
    model: string;
    model_version: string;
    system_prompt_hash: string;
    tool_policy_hash: string;
    environment: Readonly<{ id: string; version: string }>;
    budget: Readonly<{ max_turns: number; max_duration_ms: number }>;
  }>;
  plan_hash: string;
}>;

export type StagedPracticeDeliveryStatus = DeliveryStatus | "invalid-plan";
export type SessionBinding = "same-session" | "not-started" | "resume-failed";

export type StagedPracticePublicTrace = Readonly<{
  schema_version: typeof stagedPracticePublicTraceSchemaVersion;
  attempt_id: string;
  condition_id: StagedPracticeCondition;
  delivery_node: StagedPracticeAttemptNode;
  treatment_version: string;
  status: StagedPracticeDeliveryStatus;
  session_binding: SessionBinding;
}>;

export type StagedPracticeAuditEvent = Readonly<{
  schema_version: typeof stagedPracticeAuditSchemaVersion;
  plan_hash: string;
  candidate: Readonly<{ source_commit: string; snapshot_id: string }>;
  attempt_id: string;
  condition_id: StagedPracticeCondition;
  delivery_node: StagedPracticeAttemptNode;
  session_id: string | null;
  treatment: Readonly<{ id: string; version: string }>;
  provenance: PackProvenance | null;
  practice_id: string | null;
  card_sha256: string | null;
  acknowledged: boolean;
  acknowledgement: "task-start" | "constraint-followup" | "checkpoint-marker" | "not-declared" | "not-observed";
  status: StagedPracticeDeliveryStatus;
  reason?: string;
}>;

export type StagedPracticeAttemptSummary = Readonly<{
  schema_version: "staged-practice-attempt-summary/v1";
  attempt_id: string;
  condition_id: StagedPracticeCondition;
  delivery_node: StagedPracticeAttemptNode;
  status: "completed" | "failed" | "unsupported" | "indeterminate" | "invalid-plan" | "dry-run";
  comparable: boolean;
  session_binding: SessionBinding;
  termination_reason?: string;
  audit_events: number;
  delivery_status: StagedPracticeDeliveryStatus;
  plan_hash: string;
}>;

export type StagedPracticeAttemptReport = Readonly<{
  schema_version: "staged-practice-attempt/v1";
  attempt_id: string;
  condition_id: StagedPracticeCondition;
  delivery_node: StagedPracticeAttemptNode;
  status: StagedPracticeAttemptSummary["status"];
  comparable: boolean;
  session_binding: SessionBinding;
  public_trace: StagedPracticePublicTrace;
  audit_event?: StagedPracticeAuditEvent;
  audit_path: string;
  summary_path: string;
  public_trace_path: string;
  transcript_path?: string;
  termination_reason?: string;
  delivery_status: StagedPracticeDeliveryStatus;
  plan_hash: string;
}>;

export type ValidatedStagedPracticeInputs = Readonly<{
  plan: StagedPracticeDeliveryPlan;
  candidate_path: string;
  treatment_root: string;
  prepared: PreparedPackPractice;
  task_prompt: string;
  followup_prompt: string;
}>;

export type StagedPracticePiInvocation = Readonly<{
  phase: "task_start" | "constraint_followup" | "checkpoint_resume";
  workspace: string;
  session_dir: string;
  prompt_path?: string;
  session_id?: string;
  checkpoint_resume_message?: string;
  practice?: PreparedPracticePayload;
}>;

export type StagedPracticePiResult = Readonly<{
  session_id: string;
  transcript_path: string;
  stdout: string;
  stderr: string;
  checkpoint_observed?: boolean;
  checkpoint_stop_observed?: boolean;
}>;

export type StagedPracticePiAdapter = Readonly<{
  start(invocation: StagedPracticePiInvocation & { phase: "task_start" }): Promise<StagedPracticePiResult>;
  resume(invocation: StagedPracticePiInvocation & { phase: "constraint_followup" | "checkpoint_resume"; session_id: string }): Promise<StagedPracticePiResult>;
  resumeUntilCheckpoint(invocation: StagedPracticePiInvocation & { phase: "constraint_followup"; session_id: string }): Promise<StagedPracticePiResult>;
}>;

export type StagedPracticeRunOptions = Readonly<{
  root?: string;
  plan: StagedPracticeDeliveryPlan;
  attempt_id: string;
  artifacts: string;
  workspace: string;
  dry_run?: boolean;
  pi?: StagedPracticePiAdapter;
}>;

function fail(message: string): never {
  throw new Error(`Invalid staged-practice-delivery/v1: ${message}`);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function stringField(value: Record<string, unknown>, field: string, label = field): string {
  const result = value[field];
  if (typeof result !== "string" || result.length === 0) fail(`${label} must be a non-empty string`);
  return result;
}

function exactKeys(value: Record<string, unknown>, allowed: readonly string[], label: string): void {
  const unexpected = Object.keys(value).filter((key) => !allowed.includes(key));
  if (unexpected.length > 0) fail(`${label} contains unsupported field(s): ${unexpected.join(", ")}`);
}

function hashField(value: Record<string, unknown>, field: string, label = field): string {
  const result = stringField(value, field, label);
  if (!sha256Pattern.test(result)) fail(`${label} must be a lowercase SHA-256 digest`);
  return result;
}

function normalize(value: string): string {
  return value.replaceAll("\r\n", "\n");
}

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (!isRecord(value)) return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, sortKeys(value[key])]));
}

function planWithoutHash(plan: StagedPracticeDeliveryPlan): Omit<StagedPracticeDeliveryPlan, "plan_hash"> {
  const { plan_hash: _ignored, ...withoutHash } = plan;
  return withoutHash;
}

export async function hashStagedPracticeDeliveryPlan(plan: StagedPracticeDeliveryPlan): Promise<string> {
  return sha256Text(JSON.stringify(sortKeys(planWithoutHash(plan))));
}

export async function parseStagedPracticeDeliveryPlan(value: unknown): Promise<StagedPracticeDeliveryPlan> {
  if (!isRecord(value)) fail("plan must be an object");
  exactKeys(value, ["schema_version", "id", "candidate", "treatment", "delivery", "prompts", "execution", "plan_hash"], "plan");
  if (value.schema_version !== stagedPracticeDeliverySchemaVersion) fail("schema_version is not staged-practice-delivery/v1");
  const id = stringField(value, "id");
  if (!planIdPattern.test(id)) fail("id is invalid");
  if (!isRecord(value.candidate)) fail("candidate must be an object");
  if (!isRecord(value.treatment)) fail("treatment must be an object");
  if (!isRecord(value.delivery)) fail("delivery must be an object");
  if (!isRecord(value.prompts)) fail("prompts must be an object");
  if (!isRecord(value.execution)) fail("execution must be an object");
  const candidate = value.candidate;
  const treatment = value.treatment;
  const delivery = value.delivery;
  const prompts = value.prompts;
  const execution = value.execution;
  exactKeys(candidate, ["path", "source_commit", "snapshot_id"], "candidate");
  exactKeys(treatment, ["root", "id", "version"], "treatment");
  exactKeys(delivery, ["condition_id", "delivery_node"], "delivery");
  exactKeys(prompts, ["task_path", "followup_path", "task_sha256", "followup_sha256", "checkpoint_marker", "checkpoint_resume_message"], "prompts");
  exactKeys(execution, ["model", "model_version", "system_prompt_hash", "tool_policy_hash", "environment", "budget"], "execution");
  const condition_id = stringField(delivery, "condition_id") as StagedPracticeCondition;
  const delivery_node = stringField(delivery, "delivery_node") as TimingNode;
  if (!conditionPattern.test(condition_id)) fail("delivery.condition_id is invalid");
  if (!timingNodes.includes(delivery_node)) fail("delivery.delivery_node is not allowlisted");
  if (stagedPracticeConditions.includes(condition_id as typeof stagedPracticeConditions[number]) && condition_id !== delivery_node) fail("timing condition must match delivery_node");
  const candidatePath = stringField(candidate, "path", "candidate.path");
  const sourceCommit = stringField(candidate, "source_commit", "candidate.source_commit");
  const snapshotId = stringField(candidate, "snapshot_id", "candidate.snapshot_id");
  if (!commitPattern.test(sourceCommit)) fail("candidate.source_commit must be a Git commit SHA");
  if (!sha256Pattern.test(snapshotId)) fail("candidate.snapshot_id must be a SHA-256 digest");
  const treatmentRoot = stringField(treatment, "root", "treatment.root");
  const treatmentId = stringField(treatment, "id", "treatment.id");
  const treatmentVersion = stringField(treatment, "version", "treatment.version");
  if (!treatmentIdPattern.test(treatmentId)) fail("treatment.id is invalid");
  if (!versionPattern.test(treatmentVersion)) fail("treatment.version is invalid");
  if (prompts.task_path !== "public/task.md" || prompts.followup_path !== "public/stage-2/task.md") fail("prompt paths must use #196 public task paths");
  const taskSha = hashField(prompts, "task_sha256", "prompts.task_sha256");
  const followupSha = hashField(prompts, "followup_sha256", "prompts.followup_sha256");
  if (prompts.checkpoint_marker !== checkpointMarker) fail("prompts.checkpoint_marker is not the frozen #196 marker");
  const checkpointMessage = stringField(prompts, "checkpoint_resume_message", "prompts.checkpoint_resume_message");
  if (checkpointMessage !== checkpointResumeMessage) fail("prompts.checkpoint_resume_message must use the frozen checkpoint continuation");
  if (!isRecord(execution.environment)) fail("execution.environment must be an object");
  if (!isRecord(execution.budget)) fail("execution.budget must be an object");
  exactKeys(execution.environment, ["id", "version"], "execution.environment");
  exactKeys(execution.budget, ["max_turns", "max_duration_ms"], "execution.budget");
  const model = stringField(execution, "model", "execution.model");
  const modelVersion = stringField(execution, "model_version", "execution.model_version");
  const systemPromptHash = hashField(execution, "system_prompt_hash", "execution.system_prompt_hash");
  const toolPolicyHash = hashField(execution, "tool_policy_hash", "execution.tool_policy_hash");
  const environmentId = stringField(execution.environment, "id", "execution.environment.id");
  const environmentVersion = stringField(execution.environment, "version", "execution.environment.version");
  if (!versionPattern.test(environmentVersion)) fail("execution.environment.version is invalid");
  const maxTurns = execution.budget.max_turns;
  const maxDurationMs = execution.budget.max_duration_ms;
  if (typeof maxTurns !== "number" || !Number.isInteger(maxTurns) || maxTurns < 1 || typeof maxDurationMs !== "number" || !Number.isInteger(maxDurationMs) || maxDurationMs < 1) fail("execution.budget must contain positive integer limits");
  const planHash = hashField(value, "plan_hash", "plan_hash");
  const plan: StagedPracticeDeliveryPlan = {
    schema_version: stagedPracticeDeliverySchemaVersion,
    id,
    candidate: { path: candidatePath, source_commit: sourceCommit, snapshot_id: snapshotId },
    treatment: { root: treatmentRoot, id: treatmentId, version: treatmentVersion },
    delivery: { condition_id, delivery_node },
    prompts: { task_path: "public/task.md", followup_path: "public/stage-2/task.md", task_sha256: taskSha, followup_sha256: followupSha, checkpoint_marker: checkpointMarker, checkpoint_resume_message: checkpointMessage },
    execution: {
      model,
      model_version: modelVersion,
      system_prompt_hash: systemPromptHash,
      tool_policy_hash: toolPolicyHash,
      environment: { id: environmentId, version: environmentVersion },
      budget: { max_turns: maxTurns, max_duration_ms: maxDurationMs },
    },
    plan_hash: planHash,
  };
  if (await hashStagedPracticeDeliveryPlan(plan) !== planHash) fail("plan_hash does not match canonical plan content");
  return Object.freeze(plan);
}

function resolveWithin(root: string, path: string, label: string): string {
  if (isAbsolute(path) || path.split(/[\\/]/).some((part) => part === ".." || part.length === 0)) fail(`${label} must be a normalized relative path`);
  const resolvedRoot = resolve(root);
  const target = resolve(resolvedRoot, path);
  const fromRoot = relative(resolvedRoot, target);
  if (fromRoot === "" || fromRoot === ".." || fromRoot.startsWith(`..${"/"}`) || fromRoot.startsWith(`..${"\\"}`) || isAbsolute(fromRoot)) fail(`${label} escapes root`);
  return target;
}

async function readYaml(path: string, label: string): Promise<Record<string, unknown>> {
  const file = Bun.file(path);
  if (!(await file.exists())) fail(`${label} is missing`);
  const value = Bun.YAML.parse(await file.text());
  if (!isRecord(value)) fail(`${label} must be an object`);
  return value;
}

function snapshotDigestBytes(bytes: Uint8Array): Uint8Array {
  if (bytes.includes(0) || !bytes.includes(13)) return bytes;
  try {
    const text = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(bytes);
    if ([...text].some((character) => {
      const codePoint = character.codePointAt(0)!;
      return codePoint < 0x20 && codePoint !== 0x09 && codePoint !== 0x0a && codePoint !== 0x0d;
    })) return bytes;
    return new TextEncoder().encode(text.replace(/\r\n?/g, "\n"));
  } catch {
    return bytes;
  }
}

async function snapshotFileDigest(path: string): Promise<string> {
  const bytes = new Uint8Array(await Bun.file(path).arrayBuffer());
  const digest = await crypto.subtle.digest("SHA-256", snapshotDigestBytes(bytes));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function assertNoSymlinks(path: string): Promise<void> {
  const info = await lstat(path);
  if (info.isSymbolicLink()) fail(`candidate contains a symbolic link: ${path}`);
  if (!info.isDirectory()) return;
  for (const entry of await readdir(path, { withFileTypes: true })) await assertNoSymlinks(join(path, entry.name));
}

async function listCandidateFiles(root: string, current = root): Promise<string[]> {
  const files: string[] = [];
  for (const entry of await readdir(current, { withFileTypes: true })) {
    const path = join(current, entry.name);
    if (entry.isDirectory()) files.push(...await listCandidateFiles(root, path));
    else if (entry.isFile()) files.push(relative(root, path).replaceAll("\\", "/"));
  }
  return files;
}

async function validateCandidateSnapshot(candidatePath: string, expectedSnapshotId: string): Promise<void> {
  const snapshotPath = join(candidatePath, "private/snapshot.json");
  let snapshotValue: unknown;
  try {
    snapshotValue = JSON.parse(await Bun.file(snapshotPath).text()) as unknown;
  } catch (error) {
    fail(`candidate snapshot is invalid JSON: ${error instanceof Error ? error.message : String(error)}`);
  }
  if (!isRecord(snapshotValue) || snapshotValue.version !== 1 || snapshotValue.algorithm !== "sha256" || typeof snapshotValue.snapshot_id !== "string" || !isRecord(snapshotValue.files)) {
    fail("candidate snapshot must be a v1 sha256 file snapshot");
  }
  if (snapshotValue.snapshot_id !== expectedSnapshotId) fail("candidate snapshot_id does not match frozen plan");
  const expectedFiles = Object.entries(snapshotValue.files).map(([file, digest]) => {
    if (file.replaceAll("\\", "/") !== file || isAbsolute(file) || file.split("/").some((part) => part === "" || part === "..") || file === "private/snapshot.json") fail(`candidate snapshot path is not canonical: ${file}`);
    if (typeof digest !== "string" || !sha256Pattern.test(digest)) fail(`candidate snapshot digest is invalid: ${file}`);
    return [file, digest] as const;
  }).sort(([left], [right]) => left.localeCompare(right));
  const actualFiles = (await listCandidateFiles(candidatePath))
    .filter((file) => file !== "private/snapshot.json" && !file.startsWith("private/evidence-index/"))
    .sort();
  const expectedNames = expectedFiles.map(([file]) => file);
  if (actualFiles.length !== expectedNames.length || actualFiles.some((file, index) => file !== expectedNames[index])) {
    fail("candidate snapshot file set does not match the frozen snapshot");
  }
  for (const [file, expectedDigest] of expectedFiles) {
    const actualDigest = await snapshotFileDigest(join(candidatePath, file));
    if (actualDigest !== expectedDigest) fail(`candidate snapshot leaf does not match: ${file}`);
  }
  const recomputedSnapshotId = await sha256Text(JSON.stringify(Object.fromEntries(expectedFiles)));
  if (recomputedSnapshotId !== expectedSnapshotId) fail("candidate snapshot_id does not match its frozen file map");
}

async function validateCandidate(plan: StagedPracticeDeliveryPlan, root: string): Promise<{ path: string; taskPrompt: string; followupPrompt: string }> {
  const candidatePath = resolveWithin(root, plan.candidate.path, "candidate.path");
  await assertNoSymlinks(candidatePath);
  await validateCandidateSnapshot(candidatePath, plan.candidate.snapshot_id);
  const candidate = await readYaml(join(candidatePath, "private/candidate.yaml"), "candidate manifest");
  if (!isRecord(candidate.source) || candidate.source.source_commit !== plan.candidate.source_commit) fail("candidate source_commit does not match frozen plan");
  const taskPath = join(candidatePath, plan.prompts.task_path);
  const followupPath = join(candidatePath, plan.prompts.followup_path);
  if (await sha256File(taskPath) !== plan.prompts.task_sha256) fail("public task hash does not match frozen plan");
  if (await sha256File(followupPath) !== plan.prompts.followup_sha256) fail("public follow-up hash does not match frozen plan");
  return { path: candidatePath, taskPrompt: normalize(await Bun.file(taskPath).text()), followupPrompt: normalize(await Bun.file(followupPath).text()) };
}

export async function prepareStagedPracticeDelivery(planValue: unknown, root = workspaceRoot): Promise<ValidatedStagedPracticeInputs> {
  const plan = await parseStagedPracticeDeliveryPlan(planValue);
  if (plan.candidate.source_commit !== frozenCandidateSourceCommit) fail("candidate source_commit is not the frozen #196 commit");
  if (plan.candidate.snapshot_id !== frozenCandidateSnapshotId) fail("candidate snapshot_id is not the frozen #196 snapshot");
  const candidate = await validateCandidate(plan, root);
  const treatmentRoot = resolveWithin(root, plan.treatment.root, "treatment.root");
  if (plan.candidate.path !== "incubator/practice-injection/async-report-lifecycle-v1") fail("candidate path is not the #196 async-report candidate");
  if (plan.treatment.root !== "treatments/agentic-coding-replan-on-material-drift/v1") fail("treatment root is not the #199 frozen treatment");
  const prepared = await loadPackPracticeTreatment(treatmentRoot);
  if (prepared.manifest.id !== plan.treatment.id || prepared.manifest.version !== plan.treatment.version) fail("treatment identity does not match frozen plan");
  if (prepared.manifest.id !== "agentic-coding-replan-on-material-drift" || prepared.manifest.version !== "v1") fail("treatment is not the #199 frozen treatment");
  return Object.freeze({ plan, candidate_path: candidate.path, treatment_root: treatmentRoot, prepared, task_prompt: candidate.taskPrompt, followup_prompt: candidate.followupPrompt });
}

function makePublicTrace(options: { attempt_id: string; condition_id: StagedPracticeCondition; delivery_node: StagedPracticeAttemptNode; treatment_version: string; status: StagedPracticeDeliveryStatus; session_binding: SessionBinding }): StagedPracticePublicTrace {
  return Object.freeze({ schema_version: stagedPracticePublicTraceSchemaVersion, ...options });
}

function makeAuditEvent(options: {
  attempt_id: string;
  condition_id: StagedPracticeCondition;
  delivery_node: StagedPracticeAttemptNode;
  session_id: string | null;
  plan_hash: string;
  candidate: Readonly<{ source_commit: string; snapshot_id: string }>;
  prepared: PreparedPackPractice | null;
  status: StagedPracticeDeliveryStatus;
  acknowledged: boolean;
  acknowledgement: StagedPracticeAuditEvent["acknowledgement"];
  reason?: string;
}): StagedPracticeAuditEvent {
  const { prepared } = options;
  return Object.freeze({
    schema_version: stagedPracticeAuditSchemaVersion,
    plan_hash: options.plan_hash,
    candidate: options.candidate,
    attempt_id: options.attempt_id,
    condition_id: options.condition_id,
    delivery_node: options.delivery_node,
    session_id: options.session_id,
    treatment: { id: prepared?.manifest.id ?? "agentic-coding-replan-on-material-drift", version: prepared?.manifest.version ?? "v1" },
    provenance: prepared?.provenance ?? null,
    practice_id: options.status === "delivered" ? (prepared?.payload.practice_id ?? null) : null,
    card_sha256: options.status === "delivered" ? (prepared?.payload.card_sha256 ?? null) : null,
    acknowledged: options.acknowledged,
    acknowledgement: options.acknowledgement,
    status: options.status,
    ...(options.reason ? { reason: options.reason } : {}),
  });
}

async function writeArtifacts(options: {
  artifacts: string;
  event: StagedPracticeAuditEvent;
  summary: StagedPracticeAttemptSummary;
  publicTrace: StagedPracticePublicTrace;
}): Promise<{ audit_path: string; summary_path: string; public_trace_path: string }> {
  await mkdir(options.artifacts, { recursive: true });
  const auditPath = join(options.artifacts, "delivery-audit.jsonl");
  const summaryPath = join(options.artifacts, "delivery-summary.json");
  const publicTracePath = join(options.artifacts, "delivery-trace.json");
  await appendFile(auditPath, `${JSON.stringify(options.event)}\n`);
  await writeFile(summaryPath, `${JSON.stringify(options.summary, null, 2)}\n`);
  await writeFile(publicTracePath, `${JSON.stringify(options.publicTrace, null, 2)}\n`);
  return { audit_path: auditPath, summary_path: summaryPath, public_trace_path: publicTracePath };
}

function reportStatus(status: StagedPracticeDeliveryStatus, dryRun = false): StagedPracticeAttemptSummary["status"] {
  if (dryRun) return "dry-run";
  if (status === "unsupported") return "unsupported";
  if (status === "indeterminate") return "indeterminate";
  if (status === "invalid-plan") return "invalid-plan";
  return status === "delivered" || status === "not-declared" ? "completed" : "failed";
}

export async function hashStagedPracticePlanInput(value: unknown): Promise<string> {
  let serialized: string;
  try {
    serialized = JSON.stringify(value) ?? "undefined";
  } catch {
    serialized = String(value);
  }
  return sha256Text(serialized);
}

export async function writeInvalidStagedPracticeAttempt(options: {
  root?: string;
  attempt_id: string;
  artifacts: string;
  workspace: string;
  reason: string;
  plan_hash?: string;
}): Promise<StagedPracticeAttemptReport> {
  const root = options.root ?? workspaceRoot;
  await assertSeparateRoots(options.workspace, options.artifacts);
  await assertRunnerOwnedArtifacts(root, options.artifacts);
  const planHash = options.plan_hash ?? await hashStagedPracticePlanInput({ schema_version: stagedPracticeDeliverySchemaVersion, reason: options.reason });
  const event = makeAuditEvent({
    attempt_id: options.attempt_id,
    condition_id: invalidPlanCondition,
    delivery_node: invalidPlanCondition,
    session_id: null,
    plan_hash: planHash,
    candidate: { source_commit: frozenCandidateSourceCommit, snapshot_id: frozenCandidateSnapshotId },
    prepared: null,
    status: "invalid-plan",
    acknowledged: false,
    acknowledgement: "not-observed",
    reason: options.reason,
  });
  const publicTrace = makePublicTrace({
    attempt_id: options.attempt_id,
    condition_id: invalidPlanCondition,
    delivery_node: invalidPlanCondition,
    treatment_version: "v1",
    status: "invalid-plan",
    session_binding: "not-started",
  });
  const summary: StagedPracticeAttemptSummary = {
    schema_version: "staged-practice-attempt-summary/v1",
    attempt_id: options.attempt_id,
    condition_id: invalidPlanCondition,
    delivery_node: invalidPlanCondition,
    status: "invalid-plan",
    comparable: false,
    session_binding: "not-started",
    termination_reason: options.reason,
    audit_events: 1,
    delivery_status: "invalid-plan",
    plan_hash: planHash,
  };
  const paths = await writeArtifacts({ artifacts: options.artifacts, event, summary, publicTrace });
  return Object.freeze({
    schema_version: "staged-practice-attempt/v1",
    attempt_id: options.attempt_id,
    condition_id: invalidPlanCondition,
    delivery_node: invalidPlanCondition,
    status: "invalid-plan",
    comparable: false,
    session_binding: "not-started",
    public_trace: publicTrace,
    audit_event: event,
    delivery_status: "invalid-plan",
    plan_hash: planHash,
    ...paths,
    termination_reason: options.reason,
  });
}

async function setUpAttempt(root: string, candidatePath: string, workspace: string, taskPrompt: string): Promise<void> {
  await assertRunnerOwnedWorkspace(root, workspace);
  await mkdir(workspace, { recursive: true });
  const entries = await readdir(workspace, { withFileTypes: true });
  if (entries.length > 0) throw new Error("runner-owned workspace must be empty before setup");
  await mkdir(join(workspace, "app"), { recursive: true });
  await cp(join(candidatePath, "public/starter/app"), join(workspace, "app"), { recursive: true });
  await writeFile(join(workspace, "task.md"), taskPrompt);
}

async function appendFollowup(workspace: string, followupPrompt: string): Promise<void> {
  await mkdir(join(workspace, "stage-2"), { recursive: true });
  await writeFile(join(workspace, "stage-2/task.md"), followupPrompt);
}

function ensureSession(expected: string | undefined, actual: string): void {
  if (actual.length === 0) throw new Error("Pi session id is missing");
  if (expected && expected !== actual) throw new Error(`session resumed as ${actual} instead of ${expected}`);
}

async function physicalPath(path: string): Promise<string> {
  let current = resolve(path);
  const missing: string[] = [];
  while (true) {
    try {
      const info = await lstat(current);
      if (info.isSymbolicLink()) throw new Error(`path boundary must not be a symlink or junction: ${path}`);
      return resolve(await realpath(current), ...missing.reverse());
    } catch (error) {
      if (!(error instanceof Error && "code" in error && error.code === "ENOENT")) throw error;
      const parent = dirname(current);
      if (parent === current) throw error;
      missing.push(basename(current));
      current = parent;
    }
  }
}

function isContainedPath(base: string, target: string): boolean {
  const fromBase = relative(base, target).replaceAll(String.fromCharCode(92), "/");
  return fromBase === "" || (!fromBase.startsWith("../") && !isAbsolute(fromBase));
}

export async function assertSeparateRoots(workspace: string, artifacts: string): Promise<void> {
  const workspacePath = await physicalPath(workspace);
  const artifactsPath = await physicalPath(artifacts);
  if (isContainedPath(workspacePath, artifactsPath) || isContainedPath(artifactsPath, workspacePath)) {
    throw new Error("workspace and private artifacts must be separate non-nested roots");
  }
}

async function assertRunnerOwnedPath(root: string, path: string, label: string): Promise<void> {
  const scratchPath = await physicalPath(join(root, ".run-workspaces"));
  const targetPath = await physicalPath(path);
  if (!isContainedPath(scratchPath, targetPath) || targetPath === scratchPath) {
    throw new Error(`${label} must be a descendant of the runner-owned .run-workspaces root`);
  }
}

export async function assertRunnerOwnedWorkspace(root: string, workspace: string): Promise<void> {
  await assertRunnerOwnedPath(root, workspace, "workspace");
}

export async function assertRunnerOwnedArtifacts(root: string, artifacts: string): Promise<void> {
  await assertRunnerOwnedPath(root, artifacts, "private artifacts");
}

function textHasCheckpointMarker(value: unknown, marker: string): boolean {
  return typeof value === "string" && value.split(/\r?\n/).some((line) => line.trim() === marker);
}

function assistantContentHasCheckpointMarker(value: unknown, marker: string): boolean {
  if (typeof value === "string") return textHasCheckpointMarker(value, marker);
  if (!Array.isArray(value)) return false;
  return value.some((entry) => isRecord(entry) && entry.type === "text" && textHasCheckpointMarker(entry.text, marker));
}

export function assistantEventHasCheckpointMarker(value: unknown, marker: string = checkpointMarker): boolean {
  if (!isRecord(value) || (value.type !== "message_start" && value.type !== "message_update" && value.type !== "message_end")) return false;
  const message = value.message;
  if (!isRecord(message) || message.role !== "assistant") return false;
  if (assistantContentHasCheckpointMarker(message.content, marker)) return true;
  const assistantMessageEvent = value.assistantMessageEvent;
  if (!isRecord(assistantMessageEvent)) return false;
  if (assistantMessageEvent.type === "text_delta" || assistantMessageEvent.type === "text_end") {
    if (textHasCheckpointMarker(assistantMessageEvent.delta, marker) || textHasCheckpointMarker(assistantMessageEvent.content, marker)) return true;
  }
  return isRecord(assistantMessageEvent.partial) && assistantContentHasCheckpointMarker(assistantMessageEvent.partial.content, marker);
}

export function hasCheckpointMarker(output: string, marker = checkpointMarker): boolean {
  return output.split(/\r?\n/).some((line) => {
    try { return assistantEventHasCheckpointMarker(JSON.parse(line), marker); } catch { return false; }
  });
}

export function hasGracefulCheckpointStop(output: string, marker = checkpointMarker): boolean {
  let markerObserved = false;
  return output.split(/\r?\n/).some((line) => {
    try {
      const value = JSON.parse(line) as unknown;
      const gracefulStop = isRecord(value)
        && value.type === "message_end"
        && isRecord(value.message)
        && value.message.role === "assistant"
        && value.message.stopReason === "aborted";
      markerObserved ||= assistantEventHasCheckpointMarker(value, marker);
      return markerObserved && gracefulStop;
    } catch {
      return false;
    }
  });
}

export async function runStagedPracticeDeliveryAttempt(options: StagedPracticeRunOptions): Promise<StagedPracticeAttemptReport> {
  const root = options.root ?? workspaceRoot;
  let plan: StagedPracticeDeliveryPlan;
  try {
    plan = await parseStagedPracticeDeliveryPlan(options.plan);
  } catch (error) {
    return writeInvalidStagedPracticeAttempt({
      root,
      attempt_id: options.attempt_id,
      artifacts: options.artifacts,
      workspace: options.workspace,
      plan_hash: await hashStagedPracticePlanInput(options.plan),
      reason: error instanceof Error ? error.message : String(error),
    });
  }

  await assertSeparateRoots(options.workspace, options.artifacts);
  await assertRunnerOwnedWorkspace(root, options.workspace);
  await assertRunnerOwnedArtifacts(root, options.artifacts);
  const node = plan.delivery.delivery_node;
  const condition = plan.delivery.condition_id;
  const treatmentVersion = plan.treatment.version;
  let prepared: PreparedPackPractice | null = null;
  let sessionId: string | null = null;
  let status: StagedPracticeDeliveryStatus = "failed";
  let deliveryStatus: StagedPracticeDeliveryStatus = "failed";
  let sessionBinding: SessionBinding = "not-started";
  let reason: string | undefined;
  let transcriptPath: string | undefined;
  let acknowledgement: StagedPracticeAuditEvent["acknowledgement"] = "not-observed";
  let preflightComplete = false;
  try {
    const inputs = await prepareStagedPracticeDelivery(plan, root);
    prepared = inputs.prepared;
    preflightComplete = true;
    await setUpAttempt(root, inputs.candidate_path, options.workspace, inputs.task_prompt);
    if (options.dry_run) {
      deliveryStatus = "indeterminate";
      status = "indeterminate";
      reason = "dry-run: Practice delivery was not executed";
    } else {
      if (!options.pi) throw new Error("non-dry-run delivery requires a Pi adapter");
      const sessionDir = join(options.artifacts, "sessions");
      await mkdir(sessionDir, { recursive: true });
      const declared = stagedPracticeConditions.includes(condition as typeof stagedPracticeConditions[number]) && condition === node;
      const deliver = () => deliverPreparedPractice(prepared ?? undefined, { condition_id: condition, node, declared });
      const pi = options.pi;
      const startDelivery = node === "task_start" ? deliver() : deliverPreparedPractice(prepared ?? undefined, { condition_id: condition, node, declared: false });
      if (node === "task_start" && startDelivery.trace.status !== "delivered" && startDelivery.trace.status !== "not-declared") {
        deliveryStatus = startDelivery.trace.status;
        status = startDelivery.trace.status;
        reason = "task_start delivery was not confirmed";
        throw new Error(reason);
      }
      const start = await pi.start({ phase: "task_start", workspace: options.workspace, session_dir: sessionDir, prompt_path: "task.md", ...(startDelivery.payload ? { practice: startDelivery.payload } : {}) });
      ensureSession(undefined, start.session_id);
      sessionId = start.session_id;
      sessionBinding = "same-session";
      transcriptPath = start.transcript_path;
      acknowledgement = node === "task_start" && declared ? "task-start" : "not-declared";
      await appendFollowup(options.workspace, inputs.followup_prompt);
      if (node === "task_start") {
        deliveryStatus = startDelivery.trace.status;
        status = startDelivery.trace.status;
        if (status === "delivered" || status === "not-declared") {
          const resumed = await pi.resume({ phase: "constraint_followup", workspace: options.workspace, session_dir: sessionDir, prompt_path: "stage-2/task.md", session_id: start.session_id });
          ensureSession(start.session_id, resumed.session_id);
          transcriptPath = resumed.transcript_path;
        }
      } else if (node === "constraint_followup") {
        const followupDelivery = deliver();
        if (followupDelivery.trace.status !== "delivered" && followupDelivery.trace.status !== "not-declared") {
          deliveryStatus = followupDelivery.trace.status;
          status = followupDelivery.trace.status;
          reason = "constraint_followup delivery was not confirmed";
        } else {
          const resumed = await pi.resume({ phase: "constraint_followup", workspace: options.workspace, session_dir: sessionDir, prompt_path: "stage-2/task.md", session_id: start.session_id, ...(followupDelivery.payload ? { practice: followupDelivery.payload } : {}) });
          ensureSession(start.session_id, resumed.session_id);
          transcriptPath = resumed.transcript_path;
          deliveryStatus = followupDelivery.trace.status;
          status = followupDelivery.trace.status;
          acknowledgement = followupDelivery.trace.status === "delivered" ? "constraint-followup" : "not-declared";
        }
      } else {
        const checkpoint = await pi.resumeUntilCheckpoint({ phase: "constraint_followup", workspace: options.workspace, session_dir: sessionDir, prompt_path: "stage-2/task.md", session_id: start.session_id });
        ensureSession(start.session_id, checkpoint.session_id);
        transcriptPath = checkpoint.transcript_path;
        if (!checkpoint.checkpoint_observed || checkpoint.checkpoint_stop_observed !== true) {
          deliveryStatus = "indeterminate";
          status = "indeterminate";
          reason = "checkpoint marker and persisted graceful stop were not both observed";
        } else {
          const checkpointDelivery = deliver();
          if (checkpointDelivery.trace.status !== "delivered" && checkpointDelivery.trace.status !== "not-declared") {
            deliveryStatus = checkpointDelivery.trace.status;
            status = checkpointDelivery.trace.status;
            reason = "checkpoint delivery was not confirmed";
          } else {
            const resumed = await pi.resume({ phase: "checkpoint_resume", workspace: options.workspace, session_dir: sessionDir, session_id: start.session_id, checkpoint_resume_message: plan.prompts.checkpoint_resume_message, ...(checkpointDelivery.payload ? { practice: checkpointDelivery.payload } : {}) });
            ensureSession(start.session_id, resumed.session_id);
            transcriptPath = resumed.transcript_path;
            deliveryStatus = checkpointDelivery.trace.status;
            status = checkpointDelivery.trace.status;
            acknowledgement = checkpointDelivery.trace.status === "delivered" ? "checkpoint-marker" : "not-declared";
          }
        }
      }
    }
  } catch (error) {
    reason = error instanceof Error ? error.message : String(error);
    if (!preflightComplete) {
      status = "invalid-plan";
      deliveryStatus = "invalid-plan";
      sessionBinding = "not-started";
    } else {
      if (sessionId) sessionBinding = "resume-failed";
      status = reason.includes("unsupported") ? "unsupported" : status === "indeterminate" ? "indeterminate" : "failed";
    }
  }
  const acknowledged = deliveryStatus === "delivered";
  const event = makeAuditEvent({ attempt_id: options.attempt_id, condition_id: condition, delivery_node: node, session_id: sessionId, plan_hash: plan.plan_hash, candidate: plan.candidate, prepared, status: deliveryStatus, acknowledged, acknowledgement, reason });
  const publicTrace = makePublicTrace({ attempt_id: options.attempt_id, condition_id: condition, delivery_node: node, treatment_version: treatmentVersion, status: deliveryStatus, session_binding: sessionBinding });
  const summary: StagedPracticeAttemptSummary = {
    schema_version: "staged-practice-attempt-summary/v1",
    attempt_id: options.attempt_id,
    condition_id: condition,
    delivery_node: node,
    status: reportStatus(status, options.dry_run),
    comparable: (status === "delivered" || status === "not-declared") && sessionBinding === "same-session",
    session_binding: sessionBinding,
    ...(reason ? { termination_reason: reason } : {}),
    audit_events: 1,
    delivery_status: deliveryStatus,
    plan_hash: plan.plan_hash,
  };
  const paths = await writeArtifacts({ artifacts: options.artifacts, event, summary, publicTrace });
  return Object.freeze({ schema_version: "staged-practice-attempt/v1", attempt_id: options.attempt_id, condition_id: condition, delivery_node: node, status: summary.status, comparable: summary.comparable, session_binding: sessionBinding, public_trace: publicTrace, audit_event: event, delivery_status: deliveryStatus, plan_hash: plan.plan_hash, ...paths, ...(transcriptPath ? { transcript_path: transcriptPath } : {}), ...(reason ? { termination_reason: reason } : {}) });
}
