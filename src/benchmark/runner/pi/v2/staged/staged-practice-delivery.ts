import { appendFile, cp, mkdir, rm, writeFile } from "node:fs/promises";
import { isAbsolute, join, relative, resolve } from "node:path";
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
export const stagedPracticeConditions = ["task_start", "constraint_followup", "first_implementation_checkpoint"] as const;
export type StagedPracticeCondition = string;

const sha256Pattern = /^[a-f0-9]{64}$/;
const commitPattern = /^[a-f0-9]{40}$/;
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
  delivery_node: TimingNode;
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
  delivery_node: TimingNode;
  session_id: string | null;
  treatment: Readonly<{ id: string; version: string }>;
  provenance: PackProvenance | null;
  practice_id: string | null;
  card_sha256: string | null;
  acknowledged: boolean;
  status: StagedPracticeDeliveryStatus;
  reason?: string;
}>;

export type StagedPracticeAttemptSummary = Readonly<{
  schema_version: "staged-practice-attempt-summary/v1";
  attempt_id: string;
  condition_id: StagedPracticeCondition;
  delivery_node: TimingNode;
  status: "completed" | "failed" | "unsupported" | "indeterminate" | "dry-run";
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
  delivery_node: TimingNode;
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
  if (value.schema_version !== stagedPracticeDeliverySchemaVersion) fail("schema_version is not staged-practice-delivery/v1");
  const id = stringField(value, "id");
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
  const condition_id = stringField(delivery, "condition_id") as StagedPracticeCondition;
  const delivery_node = stringField(delivery, "delivery_node") as TimingNode;
  if (!condition_id.match(/^[a-z0-9][a-z0-9_-]*$/)) fail("delivery.condition_id is invalid");
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
  if (!isRecord(execution.environment)) fail("execution.environment must be an object");
  if (!isRecord(execution.budget)) fail("execution.budget must be an object");
  const model = stringField(execution, "model", "execution.model");
  const modelVersion = stringField(execution, "model_version", "execution.model_version");
  const systemPromptHash = hashField(execution, "system_prompt_hash", "execution.system_prompt_hash");
  const toolPolicyHash = hashField(execution, "tool_policy_hash", "execution.tool_policy_hash");
  const environmentId = stringField(execution.environment, "id", "execution.environment.id");
  const environmentVersion = stringField(execution.environment, "version", "execution.environment.version");
  if (!versionPattern.test(environmentVersion)) fail("execution.environment.version is invalid");
  const maxTurns = Number(execution.budget.max_turns);
  const maxDurationMs = Number(execution.budget.max_duration_ms);
  if (!Number.isInteger(maxTurns) || maxTurns < 1 || !Number.isInteger(maxDurationMs) || maxDurationMs < 1) fail("execution.budget must contain positive integer limits");
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
}function resolveWithin(root: string, path: string, label: string): string {
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

async function validateCandidate(plan: StagedPracticeDeliveryPlan, root: string): Promise<{ path: string; taskPrompt: string; followupPrompt: string }> {
  const candidatePath = resolveWithin(root, plan.candidate.path, "candidate.path");
  const candidate = await readYaml(join(candidatePath, "private/candidate.yaml"), "candidate manifest");
  if (!isRecord(candidate.source) || candidate.source.source_commit !== plan.candidate.source_commit) fail("candidate source_commit does not match frozen plan");
  const snapshotValue = JSON.parse(await Bun.file(join(candidatePath, "private/snapshot.json")).text()) as unknown;
  if (!isRecord(snapshotValue) || snapshotValue.snapshot_id !== plan.candidate.snapshot_id) fail("candidate snapshot_id does not match frozen plan");
  const taskPath = join(candidatePath, plan.prompts.task_path);
  const followupPath = join(candidatePath, plan.prompts.followup_path);
  if (await sha256File(taskPath) !== plan.prompts.task_sha256) fail("public task hash does not match frozen plan");
  if (await sha256File(followupPath) !== plan.prompts.followup_sha256) fail("public follow-up hash does not match frozen plan");
  return { path: candidatePath, taskPrompt: normalize(await Bun.file(taskPath).text()), followupPrompt: normalize(await Bun.file(followupPath).text()) };
}

export async function prepareStagedPracticeDelivery(planValue: unknown, root = workspaceRoot): Promise<ValidatedStagedPracticeInputs> {
  const plan = await parseStagedPracticeDeliveryPlan(planValue);
  const candidate = await validateCandidate(plan, root);
  const treatmentRoot = resolveWithin(root, plan.treatment.root, "treatment.root");
  if (plan.candidate.path !== "incubator/practice-injection/async-report-lifecycle-v1") fail("candidate path is not the #196 async-report candidate");
  if (plan.treatment.root !== "treatments/agentic-coding-replan-on-material-drift/v1") fail("treatment root is not the #199 frozen treatment");
  const prepared = await loadPackPracticeTreatment(treatmentRoot);
  if (prepared.manifest.id !== plan.treatment.id || prepared.manifest.version !== plan.treatment.version) fail("treatment identity does not match frozen plan");
  if (prepared.manifest.id !== "agentic-coding-replan-on-material-drift" || prepared.manifest.version !== "v1") fail("treatment is not the #199 frozen treatment");
  return Object.freeze({ plan, candidate_path: candidate.path, treatment_root: treatmentRoot, prepared, task_prompt: candidate.taskPrompt, followup_prompt: candidate.followupPrompt });
}

function makePublicTrace(options: { attempt_id: string; condition_id: StagedPracticeCondition; delivery_node: TimingNode; treatment_version: string; status: StagedPracticeDeliveryStatus; session_binding: SessionBinding }): StagedPracticePublicTrace {
  return Object.freeze({ schema_version: stagedPracticePublicTraceSchemaVersion, ...options });
}

function makeAuditEvent(options: {
  attempt_id: string;
  condition_id: StagedPracticeCondition;
  delivery_node: TimingNode;
  session_id: string | null;
  plan_hash: string;
  candidate: Readonly<{ source_commit: string; snapshot_id: string }>;
  prepared: PreparedPackPractice | null;
  status: StagedPracticeDeliveryStatus;
  acknowledged: boolean;
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
    status: options.status,
    ...(options.reason ? { reason: options.reason } : {}),
  });
}

async function writeArtifacts(options: {
  artifacts: string;
  event: StagedPracticeAuditEvent;
  summary: StagedPracticeAttemptSummary;
  publicTrace: StagedPracticePublicTrace;
}): Promise<{ auditPath: string; summaryPath: string; publicTracePath: string }> {
  await mkdir(options.artifacts, { recursive: true });
  const auditPath = join(options.artifacts, "delivery-audit.jsonl");
  const summaryPath = join(options.artifacts, "delivery-summary.json");
  const publicTracePath = join(options.artifacts, "delivery-trace.json");
  await appendFile(auditPath, `${JSON.stringify(options.event)}\n`);
  await writeFile(summaryPath, `${JSON.stringify(options.summary, null, 2)}\n`);
  await writeFile(publicTracePath, `${JSON.stringify(options.publicTrace, null, 2)}\n`);
  return { auditPath, summaryPath, publicTracePath };
}

function reportStatus(status: StagedPracticeDeliveryStatus, dryRun = false): StagedPracticeAttemptSummary["status"] {
  if (dryRun) return "dry-run";
  if (status === "unsupported") return "unsupported";
  if (status === "indeterminate") return "indeterminate";
  return status === "delivered" || status === "not-declared" ? "completed" : "failed";
}

async function setUpAttempt(candidatePath: string, workspace: string, taskPrompt: string): Promise<void> {
  await rm(workspace, { recursive: true, force: true });
  await mkdir(join(workspace, "app"), { recursive: true });
  await cp(join(candidatePath, "public/starter/app"), join(workspace, "app"), { recursive: true });
  await writeFile(join(workspace, "task.md"), taskPrompt);
}

async function appendFollowup(workspace: string, followupPrompt: string): Promise<void> {
  await mkdir(join(workspace, "stage-2"), { recursive: true });
  await writeFile(join(workspace, "stage-2/task.md"), followupPrompt);
}

function ensureSession(expected: string | undefined, actual: string): void {
  if (expected && expected !== actual) throw new Error(`session resumed as ${actual} instead of ${expected}`);
}

function containsCheckpointMarker(value: unknown, marker: string): boolean {
  if (typeof value === "string") return value.split(/\r?\n/).some((line) => line.trim() === marker);
  if (Array.isArray(value)) return value.some((entry) => containsCheckpointMarker(entry, marker));
  if (isRecord(value)) return Object.values(value).some((entry) => containsCheckpointMarker(entry, marker));
  return false;
}

export function hasCheckpointMarker(output: string, marker = checkpointMarker): boolean {
  return output.split(/\r?\n/).some((line) => {
    if (line.trim() === marker) return true;
    try { return containsCheckpointMarker(JSON.parse(line), marker); } catch { return false; }
  });
}

export async function runStagedPracticeDeliveryAttempt(options: StagedPracticeRunOptions): Promise<StagedPracticeAttemptReport> {
  const root = options.root ?? workspaceRoot;
  const node = options.plan.delivery.delivery_node;
  const condition = options.plan.delivery.condition_id;
  const treatmentVersion = options.plan.treatment.version;
  let prepared: PreparedPackPractice | null = null;
  let sessionId: string | null = null;
  let status: StagedPracticeDeliveryStatus = "failed";
  let deliveryStatus: StagedPracticeDeliveryStatus = "failed";
  let sessionBinding: SessionBinding = "not-started";
  let reason: string | undefined;
  let transcriptPath: string | undefined;
  try {
    const inputs = await prepareStagedPracticeDelivery(options.plan, root);
    prepared = inputs.prepared;
    await setUpAttempt(inputs.candidate_path, options.workspace, inputs.task_prompt);
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
      sessionId = start.session_id;
      sessionBinding = "same-session";
      transcriptPath = start.transcript_path;
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
        }
      } else {
        const checkpoint = await pi.resumeUntilCheckpoint({ phase: "constraint_followup", workspace: options.workspace, session_dir: sessionDir, prompt_path: "stage-2/task.md", session_id: start.session_id });
        ensureSession(start.session_id, checkpoint.session_id);
        transcriptPath = checkpoint.transcript_path;
        if (!checkpoint.checkpoint_observed) {
          deliveryStatus = "indeterminate";
          status = "indeterminate";
          reason = "checkpoint marker was not observed";
        } else {
          const checkpointDelivery = deliver();
          if (checkpointDelivery.trace.status !== "delivered" && checkpointDelivery.trace.status !== "not-declared") {
            deliveryStatus = checkpointDelivery.trace.status;
            status = checkpointDelivery.trace.status;
            reason = "checkpoint delivery was not confirmed";
          } else {
            const resumed = await pi.resume({ phase: "checkpoint_resume", workspace: options.workspace, session_dir: sessionDir, session_id: start.session_id, checkpoint_resume_message: inputs.plan.prompts.checkpoint_resume_message, ...(checkpointDelivery.payload ? { practice: checkpointDelivery.payload } : {}) });
            ensureSession(start.session_id, resumed.session_id);
            transcriptPath = resumed.transcript_path;
            deliveryStatus = checkpointDelivery.trace.status;
            status = checkpointDelivery.trace.status;
          }
        }
      }
    }
  } catch (error) {
    reason = error instanceof Error ? error.message : String(error);
    if (sessionId) sessionBinding = "resume-failed";
    status = reason.includes("unsupported") ? "unsupported" : status === "indeterminate" ? "indeterminate" : "failed";
  }
  const acknowledged = deliveryStatus === "delivered";
  const event = makeAuditEvent({ attempt_id: options.attempt_id, condition_id: condition, delivery_node: node, session_id: sessionId, plan_hash: options.plan.plan_hash, candidate: options.plan.candidate, prepared, status: deliveryStatus, acknowledged, reason });
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
    plan_hash: options.plan.plan_hash,
  };
  const paths = await writeArtifacts({ artifacts: options.artifacts, event, summary, publicTrace });
  return Object.freeze({ schema_version: "staged-practice-attempt/v1", attempt_id: options.attempt_id, condition_id: condition, delivery_node: node, status: summary.status, comparable: summary.comparable, session_binding: sessionBinding, public_trace: publicTrace, audit_event: event, delivery_status: deliveryStatus, plan_hash: options.plan.plan_hash, ...paths, ...(transcriptPath ? { transcript_path: transcriptPath } : {}), ...(reason ? { termination_reason: reason } : {}) });
}
