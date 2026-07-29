import { lstat } from "node:fs/promises";
import { isAbsolute, join, relative, resolve } from "node:path";
import { sha256Text } from "../../../../fs";
import type { DecisionRule, MockRetrievalResult, PracticeReference, RedactedSkillTriggerTrace, ResolvedSkillTrigger, SkillTriggerChannel, SkillTriggerCondition, SkillTriggerConditionId, SkillTriggerPayload, SkillTriggerProfile, TraceEvent } from "./types";

const allConditionIds = ["baseline", "lorelum-retrieval", "irrelevant-practice"] as const;
export const practiceCardLengthMetric = "practice-card/v1:utf8-rendered-characters" as const;

type UnknownRecord = Record<string, unknown>;
type VerifiedPractice = { card: { id: string; version: string; sha256: string }; path: string; renderedCharacters: number };
type PrivateResolvedProfile = { profile: ResolvedSkillTrigger; practices: Partial<Record<SkillTriggerConditionId, VerifiedPractice>> };

function fail(message: string): never {
  throw new Error(`Invalid skill-trigger-orchestration/v1 profile: ${message}`);
}

function isRecord(value: unknown): value is UnknownRecord {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function stringField(value: UnknownRecord, field: string): string {
  if (typeof value[field] !== "string" || value[field].length === 0) fail(`${field} must be a non-empty string`);
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
  const sha256 = stringField(value, "sha256");
  if (!/^[a-f0-9]{64}$/.test(sha256)) fail(`${conditionId}.practice.sha256 must be a SHA-256 hash`);
  return { path, sha256 };
}

function parseChannel(value: unknown, conditionId: string): SkillTriggerChannel {
  if (value === "none") return "none";
  if (value === "mock-retrieval-prompt-injection") return "mock-retrieval-prompt-injection";
  fail(`${conditionId}.channel is unsupported: ${String(value)}`);
}

function parseProfile(value: UnknownRecord): SkillTriggerProfile {
  if (!Array.isArray(value.conditions)) fail("conditions must be an array");
  if (!isRecord(value.decision_rule)) fail("decision_rule must be an object");
  const conditions = new Map<string, UnknownRecord>();
  for (const condition of value.conditions) {
    if (!isRecord(condition)) fail("condition must be an object");
    const id = stringField(condition, "id");
    if (id === "oracle-practice") fail("oracle-practice must not be declared (no ceiling)");
    if (!allConditionIds.includes(id as SkillTriggerConditionId)) fail(`condition id is unsupported: ${id}`);
    if (conditions.has(id)) fail(`condition is duplicated: ${id}`);
    conditions.set(id, condition);
  }
  if (conditions.size !== allConditionIds.length) fail("conditions must declare baseline, lorelum-retrieval, and irrelevant-practice");

  const parsed = allConditionIds.map((id) => {
    const condition = conditions.get(id)!;
    if (condition.status !== "declared") fail(`${id}.status must be declared`);
    const channel = parseChannel(condition.channel, id);
    if (id === "baseline") {
      if (channel !== "none") fail("baseline.channel must be none");
      if (condition.practice !== "none") fail("baseline.practice must be none");
      return { id, status: "declared" as const, channel: "none" as const, practice: "none" as const };
    }
    if (channel !== "mock-retrieval-prompt-injection") fail(`${id}.channel must be mock-retrieval-prompt-injection`);
    return { id, status: "declared" as const, channel, practice: parsePracticeReference(condition.practice, id) };
  });

  const decision = value.decision_rule;
  if (decision.metric !== "joint-pass-count" || decision.relation !== "lorelum-passes-and-irrelevant-fails" || !Array.isArray(decision.controls) || decision.controls.length !== 2 || decision.controls[0] !== "baseline" || decision.controls[1] !== "irrelevant-practice" || decision.otherwise !== "diagnostic-only") {
    fail("decision_rule must be { metric: joint-pass-count, relation: lorelum-passes-and-irrelevant-fails, controls: [baseline, irrelevant-practice], otherwise: diagnostic-only }");
  }
  return { conditions: parsed, decision_rule: decision as DecisionRule };
}

async function inspectPractice(candidatePath: string, practiceRoot: string, reference: PracticeReference, label: string): Promise<VerifiedPractice> {
  const prefix = "private/practices/";
  if (!reference.path.startsWith(prefix)) fail(`${label}.practice.path must start with ${prefix}`);
  const declaredPath = reference.path.slice(prefix.length);
  if (declaredPath.length === 0 || declaredPath.split("/").some((segment) => segment === "" || segment === "." || segment === "..")) fail(`${label}.practice.path must be normalized`);
  const path = pathInside(candidatePath, reference.path, `${label}.practice.path`);
  if (relative(practiceRoot, path).startsWith("..")) fail(`${label}.practice.path must be inside private/practices`);
  const stat = await lstat(path).catch(() => undefined);
  if (!stat || !stat.isFile() || stat.isSymbolicLink()) fail(`${label}.practice.path is not a regular file: ${reference.path}`);
  const text = await Bun.file(path).text();
  const sha256 = await sha256Text(text);
  if (sha256 !== reference.sha256) fail(`${label}.practice.sha256 does not match`);
  const idMatch = text.match(/^<!--\s*id:\s*(\S+)\s*-->\s*$/m);
  const versionMatch = text.match(/^<!--\s*version:\s*(\S+)\s*-->\s*$/m);
  if (!idMatch || !versionMatch) fail(`${label} Practice card must declare id and version in HTML comments`);
  return { card: { id: idMatch[1], version: versionMatch[1], sha256 }, path, renderedCharacters: text.length };
}

async function inspectSkillTrigger(candidatePath: string): Promise<PrivateResolvedProfile> {
  const resolvedCandidate = resolve(candidatePath);
  const privateRoot = resolve(resolvedCandidate, "private");
  const practiceRoot = resolve(privateRoot, "practices");
  const declaration = parseProfile(await readYaml(join(privateRoot, "conditions.yaml"), "private/conditions.yaml"));
  const lorelumReference = declaration.conditions.find((c) => c.id === "lorelum-retrieval")!.practice as PracticeReference;
  const irrelevantReference = declaration.conditions.find((c) => c.id === "irrelevant-practice")!.practice as PracticeReference;
  const [lorelum, irrelevant] = await Promise.all([
    inspectPractice(resolvedCandidate, practiceRoot, lorelumReference, "lorelum-retrieval"),
    inspectPractice(resolvedCandidate, practiceRoot, irrelevantReference, "irrelevant-practice"),
  ]);
  if (lorelum.card.id === irrelevant.card.id) fail("lorelum-retrieval and irrelevant-practice must reference different cards");
  const profileInput = {
    conditions: declaration.conditions.map((c) => c.id === "baseline" ? { id: c.id, status: c.status, channel: c.channel } : { id: c.id, status: c.status, channel: c.channel, practice_id: (c.practice as PracticeReference).sha256 }),
    decision_rule: declaration.decision_rule,
  };
  const profileInputHash = await sha256Text(JSON.stringify(profileInput));
  return {
    profile: {
      conditions: {
        baseline: { condition_id: "baseline", channel: "none" },
        "lorelum-retrieval": { condition_id: "lorelum-retrieval", channel: "mock-retrieval-prompt-injection", practice: lorelum.card },
        "irrelevant-practice": { condition_id: "irrelevant-practice", channel: "mock-retrieval-prompt-injection", practice: irrelevant.card },
      },
      decision_rule: declaration.decision_rule,
      profile_input_hash: profileInputHash,
    },
    practices: { "lorelum-retrieval": lorelum, "irrelevant-practice": irrelevant },
  };
}

export async function resolveSkillTrigger(candidatePath: string): Promise<ResolvedSkillTrigger> {
  return (await inspectSkillTrigger(candidatePath)).profile;
}

export async function resolveSkillTriggerPayload(candidatePath: string, profile: ResolvedSkillTrigger, conditionId: SkillTriggerConditionId, mockResult?: MockRetrievalResult): Promise<SkillTriggerPayload> {
  const inspected = await inspectSkillTrigger(candidatePath);
  if (inspected.profile.profile_input_hash !== profile.profile_input_hash) fail("profile input changed after resolution");
  const condition = inspected.profile.conditions[conditionId];
  if (conditionId === "baseline") return { condition_id: conditionId, channel: "none" };
  if (!mockResult) fail(`${conditionId} requires a mock_result`);
  return { condition_id: conditionId, channel: condition.channel, mock_result: mockResult };
}

export function redactedSkillTriggerTrace(profile: ResolvedSkillTrigger, payload: SkillTriggerPayload, events: TraceEvent[]): RedactedSkillTriggerTrace {
  return {
    condition_id: payload.condition_id,
    channel: payload.channel,
    profile_input_hash: profile.profile_input_hash,
    events,
    ...(payload.mock_result ? {
      practice_id: payload.mock_result.matched_practice.id,
      practice_version: payload.mock_result.matched_practice.version,
      practice_sha256: payload.mock_result.matched_practice.sha256,
    } : {}),
  };
}
