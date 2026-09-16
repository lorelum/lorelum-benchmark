import { createHash } from "node:crypto";
import { isAbsolute, relative, resolve } from "node:path";
import { sha256File, sha256Text } from "../../../fs";
import type {
  ApplicabilityRecord,
  AuditSidecar,
  DeliveryResult,
  DeliveryStatus,
  LoreGetData,
  LoreQueryData,
  PackPracticeManifest,
  PackProvenance,
  PreparedPackPractice,
  PreparedPracticePayload,
  PublicDeliveryTrace,
  SelectionRecord,
  TimingNode,
} from "./types";
import { timingNodes } from "./types";

const expectedRepository = "https://github.com/lorelum/lorelum-packs.git";
const expectedPackRef = "agentic-coding-v0.4.0";
const expectedPackVersion = "0.4.0";
const expectedPackCommit = "df89b8d432a01c53361a0e23df6896a772942b09";
const expectedPracticeId = "agentic-coding.implementation.replan-on-material-drift";
const expectedSourcePath = "packs/agentic-coding/practices/implementation/replan-on-material-drift.md";
const expectedAppliesWhen = "coding has revealed an unplanned dependency, public behavior, stored state, I/O path, risk, or verification need that changes the accepted scope, and the agent is about to continue under the old plan";
const requiredFactIds = ["initial-plan-formed", "old-new-concurrency", "rollback-path", "verification-boundary"] as const;

type UnknownRecord = Record<string, unknown>;

function fail(message: string): never {
  throw new Error(`Invalid pack-practice-treatment/v1: ${message}`);
}

function isRecord(value: unknown): value is UnknownRecord {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function stringField(value: UnknownRecord, field: string, label = field): string {
  const result = value[field];
  if (typeof result !== "string" || result.length === 0) fail(`${label} must be a non-empty string`);
  return result;
}

function objectField(value: UnknownRecord, field: string): UnknownRecord {
  const result = value[field];
  if (!isRecord(result)) fail(`${field} must be an object`);
  return result;
}

function safePrivatePath(root: string, path: string, label: string): string {
  if (!path.startsWith("private/") || isAbsolute(path) || path.split(/[\\/]/).some((part) => part === ".." || part.length === 0)) {
    fail(`${label} must be a normalized private relative path`);
  }
  const rootPath = resolve(root);
  const target = resolve(rootPath, path);
  const fromRoot = relative(rootPath, target);
  if (fromRoot === "" || fromRoot === ".." || fromRoot.startsWith(`..${"/"}`) || fromRoot.startsWith(`..${"\\"}`) || isAbsolute(fromRoot)) {
    fail(`${label} escapes treatment root`);
  }
  return target;
}

async function readYaml(path: string, label: string): Promise<UnknownRecord> {
  const file = Bun.file(path);
  if (!(await file.exists())) fail(`${label} is missing: ${path}`);
  let value: unknown;
  try {
    value = Bun.YAML.parse(await file.text());
  } catch (error) {
    fail(`${label} is invalid YAML: ${error instanceof Error ? error.message : String(error)}`);
  }
  if (!isRecord(value)) fail(`${label} must be an object`);
  return value;
}

async function readJson(path: string, label: string): Promise<UnknownRecord> {
  const file = Bun.file(path);
  if (!(await file.exists())) fail(`${label} is missing: ${path}`);
  let value: unknown;
  try {
    value = JSON.parse(await file.text()) as unknown;
  } catch (error) {
    fail(`${label} is invalid JSON: ${error instanceof Error ? error.message : String(error)}`);
  }
  if (!isRecord(value)) fail(`${label} must be an object`);
  return value;
}

function normalize(value: string): string {
  return value.replace(/\r\n?/g, "\n");
}

function sha256TextSync(value: string): string {
  return createHash("sha256").update(new TextEncoder().encode(value)).digest("hex");
}

function asManifest(value: UnknownRecord): PackPracticeManifest {
  if (value.schema_version !== "pack-practice-treatment/v1") fail("schema_version must be pack-practice-treatment/v1");
  if (value.kind !== "retrieval") fail("kind must be retrieval");
  const injection = objectField(value, "injection");
  if (injection.delivery !== "practice-card" || injection.channel !== "condition-scoped-private-runtime") fail("injection must declare practice-card/private-runtime");
  const pack = objectField(value, "pack");
  if (pack.repository !== expectedRepository || pack.ref !== expectedPackRef || pack.version !== expectedPackVersion || pack.commit !== expectedPackCommit) fail("pack identity does not match agentic-coding-v0.4.0");
  const practice = objectField(value, "practice");
  if (practice.id !== expectedPracticeId || practice.source_path !== expectedSourcePath) fail("practice identity does not match the selected Practice");
  const selection = objectField(value, "selection");
  if (selection.mode !== "semantic") fail("selection.mode must be semantic");
  const applicability = objectField(value, "applicability");
  if (applicability.scenario !== "async-report-lifecycle/scope_changed/v1" || applicability.status !== "reviewed") fail("applicability must be reviewed for scope_changed");
  const privacy = objectField(value, "privacy");
  if (privacy.materialization !== "forbidden" || privacy.secrets !== "excluded") fail("privacy boundary is invalid");
  return value as unknown as PackPracticeManifest;
}

function asSelection(value: UnknownRecord): SelectionRecord {
  if (value.schema_version !== "pack-practice-selection/v1") fail("selection schema_version is invalid");
  const pack = objectField(value, "pack");
  const query = objectField(value, "query");
  const get = objectField(value, "get");
  if (value.captured_from !== "prepare-fixture" && value.captured_from !== "lore-cli") fail("selection captured_from is invalid");
  if (typeof value.lore_cli_version !== "string" || value.lore_cli_version.length === 0) fail("selection lore_cli_version is required");
  if (!Array.isArray(value.commands) && !isRecord(value.commands)) fail("selection commands are required");
  if (pack.repository !== expectedRepository || pack.ref !== expectedPackRef || pack.version !== expectedPackVersion || pack.commit !== expectedPackCommit) fail("selection Pack identity does not match");
  if (query.mode !== "semantic" || query.top_k !== 5 || typeof query.text !== "string") fail("selection query must be semantic with top_k 5");
  return value as unknown as SelectionRecord;
}

function asApplicability(value: UnknownRecord): ApplicabilityRecord {
  if (value.schema_version !== "pack-practice-applicability/v1") fail("applicability schema_version is invalid");
  if (value.scenario !== "async-report-lifecycle/scope_changed/v1" || value.status !== "reviewed") fail("applicability scenario/status is invalid");
  if (value.applies_when !== expectedAppliesWhen) fail("applicability applies_when does not match the selected Practice");
  if (!Array.isArray(value.facts)) fail("applicability facts are required");
  const facts = value.facts.filter(isRecord);
  for (const id of requiredFactIds) {
    const fact = facts.find((candidate) => candidate.id === id);
    if (!fact || fact.observed !== true) fail(`applicability fact is missing or unobserved: ${id}`);
  }
  const dimensions = objectField(value, "changed_dimensions");
  if (dimensions.scope !== true || dimensions.risk !== true || dimensions.verification !== true) fail("applicability changed_dimensions must cover scope, risk, and verification");
  return value as unknown as ApplicabilityRecord;
}

function unwrapCliData(value: unknown): UnknownRecord {
  if (!isRecord(value)) fail("Lore CLI response must be an object");
  if (value.ok === true && isRecord(value.data)) return value.data;
  return value;
}

export function parseLoreQueryResponse(value: unknown): LoreQueryData {
  const data = unwrapCliData(value);
  if (data.state === "preparing") fail("Lore semantic query is still preparing");
  if (data.mode !== "semantic" || !Array.isArray(data.results)) fail("Lore query response must be semantic with results");
  const results = data.results.filter(isRecord).map((result) => ({
    practiceId: stringField(result, "practiceId", "query result practiceId"),
    title: stringField(result, "title", "query result title"),
    stage: stringField(result, "stage", "query result stage"),
    techStack: Array.isArray(result.techStack) ? result.techStack.filter((entry): entry is string => typeof entry === "string") : [],
    appliesWhen: stringField(result, "appliesWhen", "query result appliesWhen"),
    severity: stringField(result, "severity", "query result severity"),
    contentDigest: stringField(result, "contentDigest", "query result contentDigest")
  }));
  return { mode: "semantic", results, ...(typeof data.profileId === "string" ? { profileId: data.profileId } : {}), ...(typeof data.coverage === "string" ? { coverage: data.coverage } : {}) };
}

export function parseLoreGetResponse(value: unknown): LoreGetData {
  const data = unwrapCliData(value);
  const practice = objectField(data, "practice");
  const sources = Array.isArray(data.sources) ? data.sources.filter(isRecord).map((source) => ({
    packName: stringField(source, "packName", "get source packName"),
    sourcePath: stringField(source, "sourcePath", "get source sourcePath"),
    ...(typeof source.packRoot === "string" ? { packRoot: source.packRoot } : {})
  })) : [];
  if (sources.length !== 1) fail("Lore get must return exactly one source for this treatment");
  if (practice.id !== expectedPracticeId) fail("Lore get Practice ID does not match the selected Practice");
  if (typeof practice.body !== "string") fail("Lore get Practice body is required");
  if (typeof data.contentDigest !== "string") fail("Lore get contentDigest is required");
  return {
    practice: {
      id: expectedPracticeId,
      title: stringField(practice, "title", "get practice title"),
      stage: stringField(practice, "stage", "get practice stage"),
      tech_stack: Array.isArray(practice.tech_stack) ? practice.tech_stack.filter((entry): entry is string => typeof entry === "string") : [],
      applies_when: stringField(practice, "applies_when", "get practice applies_when"),
      severity: stringField(practice, "severity", "get practice severity"),
      body: normalize(practice.body)
    },
    contentDigest: data.contentDigest,
    sources
  };
}

function verifySelection(manifest: PackPracticeManifest, selection: SelectionRecord, body: string): void {
  const query = selection.query;
  const get = selection.get;
  if (query.mode !== manifest.selection.mode || query.query_sha256 !== manifest.selection.query_sha256) fail("selection query identity does not match manifest");
  if (sha256TextSync(normalize(query.text)) !== manifest.selection.query_sha256) fail("selection query hash does not match query text");
  if (query.selected_practice_id !== manifest.practice.id || query.selected_rank !== manifest.selection.result_rank) fail("selection does not select the manifest Practice/rank");
  const selected = query.results.find((result) => result.practiceId === manifest.practice.id);
  if (!selected) fail("selection query results do not contain the manifest Practice");
  if (selected.contentDigest !== manifest.practice.content_digest) fail("selection query contentDigest does not match manifest");
  if (get.practice_id !== manifest.practice.id || get.content_digest !== manifest.practice.content_digest) fail("selection get identity does not match manifest");
  if (get.source.pack_name !== "agentic-coding" || get.source.source_path !== manifest.practice.source_path) fail("selection source does not match manifest");
  if (get.source_sha256 !== manifest.practice.source_sha256 || get.card_sha256 !== manifest.practice.card_sha256) fail("selection hash identity does not match manifest");
  if (sha256TextSync(body) !== manifest.practice.card_sha256) fail("private card hash does not match manifest");
}

function verifyApplicability(manifest: PackPracticeManifest, applicability: ApplicabilityRecord): void {
  if (manifest.applicability.scenario !== applicability.scenario || manifest.applicability.status !== applicability.status) fail("applicability identity does not match manifest");
}

export async function loadPackPracticeTreatment(treatmentRoot: string): Promise<PreparedPackPractice> {
  const manifestValue = await readYaml(resolve(treatmentRoot, "treatment.yaml"), "treatment manifest");
  const manifest = asManifest(manifestValue);
  const bodyPath = safePrivatePath(treatmentRoot, manifest.practice.body_path, "practice.body_path");
  const selectionPath = safePrivatePath(treatmentRoot, manifest.selection.path, "selection.path");
  const applicabilityPath = safePrivatePath(treatmentRoot, manifest.applicability.basis_path, "applicability.basis_path");
  const body = normalize(await Bun.file(bodyPath).text());
  const selection = asSelection(await readJson(selectionPath, "selection record"));
  const applicability = asApplicability(await readYaml(applicabilityPath, "applicability basis"));
  if ((await sha256File(applicabilityPath)) !== manifest.applicability.basis_sha256) fail("applicability basis hash does not match manifest");
  verifySelection(manifest, selection, body);
  verifyApplicability(manifest, applicability);
  const provenance: PackProvenance = Object.freeze({
    repository: manifest.pack.repository,
    ref: manifest.pack.ref,
    version: manifest.pack.version,
    commit: manifest.pack.commit,
    practice_id: manifest.practice.id,
    source_path: manifest.practice.source_path,
    content_digest: manifest.practice.content_digest,
    source_sha256: manifest.practice.source_sha256,
    card_sha256: manifest.practice.card_sha256
  });
  const payload: PreparedPracticePayload = Object.freeze({
    treatment_id: manifest.id,
    treatment_version: manifest.version,
    practice_id: manifest.practice.id,
    content_digest: manifest.practice.content_digest,
    card_sha256: manifest.practice.card_sha256,
    text: body
  });
  return Object.freeze({ manifest, payload, provenance, selection, applicability });
}

function assertPayload(payload: PreparedPracticePayload): void {
  if (sha256TextSync(payload.text) !== payload.card_sha256) fail("prepared payload card hash does not match text");
  if (payload.practice_id !== expectedPracticeId) fail("prepared payload Practice ID is not allowlisted");
}

export function deliverPreparedPractice(prepared: PreparedPackPractice | undefined, request: { condition_id: string; node: TimingNode; declared: boolean; supported?: boolean }): DeliveryResult {
  if (!timingNodes.includes(request.node)) throw new Error(`Invalid timing node: ${request.node}`);
  if (request.supported === false) {
    const trace: PublicDeliveryTrace = Object.freeze({ schema_version: "pack-practice-delivery-trace/v1", condition_id: request.condition_id, node: request.node, treatment_id: prepared?.manifest.id ?? "none", treatment_version: prepared?.manifest.version ?? "none", status: "unsupported" });
    return Object.freeze({ trace });
  }
  if (!request.declared) {
    const trace: PublicDeliveryTrace = Object.freeze({ schema_version: "pack-practice-delivery-trace/v1", condition_id: request.condition_id, node: request.node, treatment_id: prepared?.manifest.id ?? "none", treatment_version: prepared?.manifest.version ?? "none", status: "not-declared" });
    return Object.freeze({ trace });
  }
  if (!prepared) {
    const trace: PublicDeliveryTrace = Object.freeze({ schema_version: "pack-practice-delivery-trace/v1", condition_id: request.condition_id, node: request.node, treatment_id: "missing", treatment_version: "missing", status: "failed" });
    return Object.freeze({ trace });
  }
  try {
    assertPayload(prepared.payload);
  } catch {
    const trace: PublicDeliveryTrace = Object.freeze({ schema_version: "pack-practice-delivery-trace/v1", condition_id: request.condition_id, node: request.node, treatment_id: prepared.manifest.id, treatment_version: prepared.manifest.version, status: "failed" });
    return Object.freeze({ trace });
  }
  const trace: PublicDeliveryTrace = Object.freeze({ schema_version: "pack-practice-delivery-trace/v1", condition_id: request.condition_id, node: request.node, treatment_id: prepared.manifest.id, treatment_version: prepared.manifest.version, practice_id: prepared.payload.practice_id, card_sha256: prepared.payload.card_sha256, status: "delivered" });
  return Object.freeze({ payload: prepared.payload, trace });
}

export function createAuditSidecar(prepared: PreparedPackPractice, deliveries: ReadonlyArray<PublicDeliveryTrace>): AuditSidecar {
  const delivered = deliveries.filter((delivery) => delivery.status === "delivered");
  const identityConsistent = delivered.every((delivery) => delivery.practice_id === prepared.payload.practice_id && delivery.card_sha256 === prepared.payload.card_sha256);
  return Object.freeze({
    schema_version: "pack-practice-audit/v1",
    treatment: { id: prepared.manifest.id, version: prepared.manifest.version },
    provenance: prepared.provenance,
    selection: { captured_from: prepared.selection.captured_from, query_sha256: prepared.selection.query_sha256, query_response_sha256: prepared.selection.query.response_sha256, get_response_sha256: prepared.selection.get.response_sha256, selected_rank: prepared.selection.query.selected_rank },
    applicability: { scenario: prepared.applicability.scenario, basis_sha256: prepared.manifest.applicability.basis_sha256, status: prepared.applicability.status },
    deliveries: deliveries.map((delivery) => ({ condition_id: delivery.condition_id, node: delivery.node, status: delivery.status, ...(delivery.practice_id ? { practice_id: delivery.practice_id } : {}), ...(delivery.card_sha256 ? { card_sha256: delivery.card_sha256 } : {}) })),
    identity_consistent: identityConsistent
  });
}

export function publicTraceHasPrivateMaterial(trace: PublicDeliveryTrace): boolean {
  const serialized = JSON.stringify(trace);
  return serialized.includes(expectedRepository) || serialized.includes("packRoot") || serialized.includes("store") || serialized.includes("source_path") || serialized.includes("query");
}

export { expectedAppliesWhen, expectedPackCommit, expectedPackRef, expectedPackVersion, expectedPracticeId, expectedRepository, expectedSourcePath, requiredFactIds };
