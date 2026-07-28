import { lstat } from "node:fs/promises";
import { isAbsolute, join, relative, resolve } from "node:path";
import { sha256Text } from "../../../../fs";
import type { DecisionRule, InjectionCalibrationProfile, InjectionConditionId, IrrelevantPracticeCalibration, PracticeCardMetadata, PracticeMetadata, PracticePayload, PracticeReference, RedactedInjectionTrace, ResolvedInjectionCalibration, ResolvedPractice } from "./types";

const declaredConditionIds = ["baseline", "oracle-practice", "irrelevant-practice"] as const;
const allConditionIds = [...declaredConditionIds, "lorelum-retrieval"] as const;
export const practiceCardLengthMetric = "practice-card/v1:utf8-rendered-characters" as const;

type UnknownRecord = Record<string, unknown>;
type VerifiedPractice = {
  card: ResolvedPractice;
  path: string;
  renderedCharacters: number;
};
type PrivateResolvedProfile = {
  profile: ResolvedInjectionCalibration;
  practices: Partial<Record<InjectionConditionId, VerifiedPractice>>;
};

function fail(message: string): never {
  throw new Error(`Invalid injection-calibration/v1 profile: ${message}`);
}

function isRecord(value: unknown): value is UnknownRecord {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function stringField(value: UnknownRecord, field: string): string {
  if (typeof value[field] !== "string" || value[field].length === 0) fail(`${field} must be a non-empty string`);
  return value[field];
}

function numberField(value: UnknownRecord, field: string): number {
  if (typeof value[field] !== "number" || !Number.isFinite(value[field])) fail(`${field} must be a finite number`);
  return value[field];
}

function pathInside(root: string, path: string, label: string): string {
  if (isAbsolute(path)) fail(`${label} must be relative`);
  const resolvedRoot = resolve(root);
  const resolvedPath = resolve(resolvedRoot, path);
  const pathRelative = relative(resolvedRoot, resolvedPath);
  if (pathRelative === "" || pathRelative === ".." || pathRelative.startsWith(`..${"/"}`) || pathRelative.startsWith(`..${"\\"}`) || isAbsolute(pathRelative)) {
    fail(`${label} escapes its permitted root`);
  }
  return resolvedPath;
}

async function readYaml(path: string, label: string): Promise<UnknownRecord> {
  const file = Bun.file(path);
  if (!(await file.exists())) fail(`${label} is missing`);
  let value: unknown;
  try {
    value = Bun.YAML.parse(await file.text());
  } catch (error) {
    fail(`${label} is invalid YAML: ${error instanceof Error ? error.message : String(error)}`);
  }
  if (!isRecord(value)) fail(`${label} must be an object`);
  return value;
}

function parsePracticeReference(value: unknown, conditionId: string): PracticeReference {
  if (!isRecord(value)) fail(`${conditionId}.practice must be an object`);
  const path = stringField(value, "path");
  if (value.injection_channel !== "condition-scoped-private-runtime") fail(`${conditionId}.practice.injection_channel is unsupported`);
  const sha256 = stringField(value, "sha256");
  if (!/^[a-f0-9]{64}$/.test(sha256)) fail(`${conditionId}.practice.sha256 must be a SHA-256 hash`);
  return { path, injection_channel: "condition-scoped-private-runtime", sha256 };
}

function parseProfile(value: UnknownRecord): InjectionCalibrationProfile {
  if (!Array.isArray(value.conditions)) fail("conditions must be an array");
  if (!isRecord(value.decision_rule)) fail("decision_rule must be an object");
  const conditions = new Map<string, UnknownRecord>();
  for (const condition of value.conditions) {
    if (!isRecord(condition)) fail("condition must be an object");
    const id = stringField(condition, "id");
    if (!allConditionIds.includes(id as InjectionConditionId)) fail(`condition id is unsupported: ${id}`);
    if (conditions.has(id)) fail(`condition is duplicated: ${id}`);
    conditions.set(id, condition);
  }
  if (conditions.size !== allConditionIds.length) fail("conditions must declare baseline, oracle-practice, irrelevant-practice, and lorelum-retrieval");

  const parsed = declaredConditionIds.map((id) => {
    const condition = conditions.get(id)!;
    if (condition.status !== "declared") fail(`${id}.status must be declared`);
    if (id === "baseline") {
      if (condition.practice !== "none") fail("baseline.practice must be none");
      return { id, status: "declared" as const, practice: "none" as const };
    }
    return { id, status: "declared" as const, practice: parsePracticeReference(condition.practice, id) };
  });
  const retrieval = conditions.get("lorelum-retrieval")!;
  if (retrieval.status !== "unavailable" || retrieval.practice !== "unavailable") fail("lorelum-retrieval must be unavailable");

  const decision = value.decision_rule;
  if (
    decision.metric !== "joint-pass-count" ||
    decision.oracle_relation !== "strictly-greater-than-each-control" ||
    !Array.isArray(decision.controls) ||
    decision.controls.length !== 2 ||
    decision.controls[0] !== "baseline" ||
    decision.controls[1] !== "irrelevant-practice" ||
    decision.otherwise !== "diagnostic-only"
  ) fail("decision_rule must declare the v1 strict joint-pass comparison");

  return {
    conditions: [...parsed, { id: "lorelum-retrieval", status: "unavailable", practice: "unavailable" }],
    decision_rule: decision as DecisionRule,
  };
}

function parseMetadata(value: UnknownRecord): PracticeMetadata {
  if (value.delivery_template !== "practice-card/v1") fail("metadata.delivery_template must be practice-card/v1");
  if (value.length_metric !== practiceCardLengthMetric) fail(`metadata.length_metric must be ${practiceCardLengthMetric}`);
  if (!Array.isArray(value.cards) || value.cards.length < 2) fail("metadata.cards must declare the selected Practice cards");
  const cards = value.cards.map((card) => {
    if (!isRecord(card)) fail("metadata card must be an object");
    const id = stringField(card, "id");
    const version = stringField(card, "version");
    const path = stringField(card, "path");
    const renderedCharacters = numberField(card, "rendered_characters");
    if (!Number.isInteger(renderedCharacters) || renderedCharacters <= 0) fail(`metadata card rendered_characters must be positive: ${id}`);
    return { id, version, path, rendered_characters: renderedCharacters };
  });
  const cardKeys = new Set<string>();
  for (const card of cards) {
    if (!cardKeys.add(`${card.id}\0${card.version}`)) fail(`metadata card is duplicated: ${card.id}/${card.version}`);
  }
  if (!isRecord(value.comparison)) fail("metadata.comparison must be an object");
  const maximum = numberField(value.comparison, "maximum_relative_difference");
  const actual = numberField(value.comparison, "actual_relative_difference");
  if (maximum < 0 || maximum > 1 || actual < 0 || actual > 1 || value.comparison.independently_reviewed !== true) fail("metadata.comparison is invalid");
  return {
    delivery_template: "practice-card/v1",
    length_metric: practiceCardLengthMetric,
    cards,
    comparison: { maximum_relative_difference: maximum, actual_relative_difference: actual, independently_reviewed: true },
  };
}

function metadataCard(metadata: PracticeMetadata, reference: PracticeReference, practiceRoot: string): PracticeCardMetadata {
  const prefix = "private/practices/";
  if (!reference.path.startsWith(prefix)) fail("Practice path must start with private/practices/");
  const declaredPath = reference.path.slice(prefix.length);
  if (declaredPath.length === 0 || declaredPath.split("/").some((segment) => segment === "" || segment === "." || segment === "..")) fail("Practice path must be normalized");
  const practicePath = pathInside(practiceRoot, declaredPath, "Practice path");
  const relativePath = relative(practiceRoot, practicePath).replaceAll("\\", "/");
  const matched = metadata.cards.filter((card) => card.path === relativePath);
  if (matched.length !== 1) fail(`metadata must contain one card for ${relativePath}`);
  return matched[0];
}

function sha256(bytes: ArrayBuffer): Promise<string> {
  return crypto.subtle.digest("SHA-256", bytes).then((digest) => [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join(""));
}

export function measurePracticeCardV1(bytes: ArrayBuffer): number {
  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    fail("Practice card must be valid UTF-8");
  }
  return [...text].length;
}

async function inspectPractice(candidatePath: string, practiceRoot: string, reference: PracticeReference, metadata: PracticeCardMetadata): Promise<VerifiedPractice> {
  const path = pathInside(candidatePath, reference.path, "Practice path");
  if (relative(practiceRoot, path).startsWith("..")) fail("Practice path must be inside private/practices");
  const stat = await lstat(path).catch(() => undefined);
  if (!stat || !stat.isFile() || stat.isSymbolicLink()) fail(`Practice card is not a regular file: ${metadata.id}/${metadata.version}`);
  const bytes = await Bun.file(path).arrayBuffer();
  const actualHash = await sha256(bytes);
  if (actualHash !== reference.sha256) fail(`Practice hash does not match: ${metadata.id}/${metadata.version}`);
  const renderedCharacters = measurePracticeCardV1(bytes);
  if (renderedCharacters !== metadata.rendered_characters) fail(`metadata rendered_characters disagrees with Practice card: ${metadata.id}/${metadata.version}`);
  return { card: { id: metadata.id, version: metadata.version, sha256: actualHash }, path, renderedCharacters };
}

function validateLengthCalibration(metadata: PracticeMetadata, oracle: VerifiedPractice, irrelevant: VerifiedPractice): IrrelevantPracticeCalibration {
  const actual = Math.abs(oracle.renderedCharacters - irrelevant.renderedCharacters) / oracle.renderedCharacters;
  if (Math.abs(actual - metadata.comparison.actual_relative_difference) > 0.000001) fail("metadata comparison actual_relative_difference disagrees with card lengths");
  if (actual > metadata.comparison.maximum_relative_difference) fail("irrelevant Practice exceeds its declared maximum relative difference");
  return {
    length_metric: metadata.length_metric,
    oracle_characters: oracle.renderedCharacters,
    irrelevant_characters: irrelevant.renderedCharacters,
    maximum_relative_difference: metadata.comparison.maximum_relative_difference,
    actual_relative_difference: metadata.comparison.actual_relative_difference,
    independently_reviewed: metadata.comparison.independently_reviewed,
  };
}

async function inspectInjectionCalibration(candidatePath: string): Promise<PrivateResolvedProfile> {
  const resolvedCandidate = resolve(candidatePath);
  const privateRoot = resolve(resolvedCandidate, "private");
  const practiceRoot = resolve(privateRoot, "practices");
  const declaration = parseProfile(await readYaml(join(privateRoot, "conditions.yaml"), "private/conditions.yaml"));
  const metadata = parseMetadata(await readYaml(join(practiceRoot, "metadata.yaml"), "private/practices/metadata.yaml"));
  const oracleReference = declaration.conditions.find((condition) => condition.id === "oracle-practice")!.practice as PracticeReference;
  const irrelevantReference = declaration.conditions.find((condition) => condition.id === "irrelevant-practice")!.practice as PracticeReference;
  const oracleMetadata = metadataCard(metadata, oracleReference, practiceRoot);
  const irrelevantMetadata = metadataCard(metadata, irrelevantReference, practiceRoot);
  if (oracleMetadata.path === irrelevantMetadata.path) fail("oracle-practice and irrelevant-practice must reference different cards");
  const [oracle, irrelevant] = await Promise.all([
    inspectPractice(resolvedCandidate, practiceRoot, oracleReference, oracleMetadata),
    inspectPractice(resolvedCandidate, practiceRoot, irrelevantReference, irrelevantMetadata),
  ]);
  const calibration = validateLengthCalibration(metadata, oracle, irrelevant);
  const profileInput = {
    conditions: [
      { id: "baseline", status: "declared", channel: "none" },
      { id: "oracle-practice", status: "declared", channel: oracleReference.injection_channel, practice_id: oracle.card.id, practice_version: oracle.card.version, practice_sha256: oracle.card.sha256 },
      { id: "irrelevant-practice", status: "declared", channel: irrelevantReference.injection_channel, practice_id: irrelevant.card.id, practice_version: irrelevant.card.version, practice_sha256: irrelevant.card.sha256 },
      { id: "lorelum-retrieval", status: "unavailable", channel: "none" },
    ],
    calibration,
    decision_rule: declaration.decision_rule,
  };
  const profileInputHash = await sha256Text(JSON.stringify(profileInput));
  return {
    profile: {
      conditions: {
        baseline: { condition_id: "baseline", channel: "none" },
        "oracle-practice": { condition_id: "oracle-practice", channel: "condition-scoped-private-runtime", practice: oracle.card },
        "irrelevant-practice": { condition_id: "irrelevant-practice", channel: "condition-scoped-private-runtime", practice: irrelevant.card },
        "lorelum-retrieval": { condition_id: "lorelum-retrieval", channel: "none" },
      },
      calibration,
      decision_rule: declaration.decision_rule,
      profile_input_hash: profileInputHash,
    },
    practices: { "oracle-practice": oracle, "irrelevant-practice": irrelevant },
  };
}

export async function resolveInjectionCalibration(candidatePath: string): Promise<ResolvedInjectionCalibration> {
  return (await inspectInjectionCalibration(candidatePath)).profile;
}

export async function resolvePracticePayload(candidatePath: string, profile: ResolvedInjectionCalibration, conditionId: InjectionConditionId): Promise<PracticePayload> {
  const inspected = await inspectInjectionCalibration(candidatePath);
  if (inspected.profile.profile_input_hash !== profile.profile_input_hash) fail("profile input changed after resolution");
  const condition = inspected.profile.conditions[conditionId];
  const practice = inspected.practices[conditionId];
  if (!practice) return condition;
  return { ...condition, practice: { ...practice.card, text: await Bun.file(practice.path).text() } };
}

export function redactedInjectionTrace(profile: ResolvedInjectionCalibration, payload: PracticePayload): RedactedInjectionTrace {
  return {
    condition_id: payload.condition_id,
    channel: payload.channel,
    profile_input_hash: profile.profile_input_hash,
    ...(payload.practice ? {
      practice_id: payload.practice.id,
      practice_version: payload.practice.version,
      practice_sha256: payload.practice.sha256,
    } : {}),
  };
}
