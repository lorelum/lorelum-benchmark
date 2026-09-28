import { sha256Text } from "../../../fs";
import { pairPrompt, systemPrompt } from "./prompt";
import type {
  Confidence,
  JudgeDecision,
  ModelCompletion,
  Orientation,
  PairCase,
  PairVerdict,
  RawModelVerdict,
  RelationVerdict,
  ScenarioBundle,
} from "./types";

const relationVerdicts = new Set<RelationVerdict>(["supports", "contradicts", "insufficient"]);
const pairVerdicts = new Set<PairVerdict>(["A", "B", "tie", "insufficient"]);
const confidences = new Set<Confidence>(["low", "medium", "high"]);

export class EvidenceBoundaryError extends Error {
  constructor(message: string) {
    super(`Offline judge evidence boundary violation: ${message}`);
  }
}

export class ModelOutputError extends Error {
  constructor(message: string) {
    super(`Offline judge model output error: ${message}`);
  }
}

function fail(message: string): never {
  throw new ModelOutputError(message);
}

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function assertString(value: unknown, label: string): string {
  if (typeof value !== "string" || value.trim() === "") fail(`${label} must be a non-empty string`);
  return value;
}

export function parseRawModelVerdict(value: unknown): RawModelVerdict {
  if (!isObject(value)) fail("root must be an object");
  const aRelation = value.a_relation;
  const bRelation = value.b_relation;
  const verdict = value.verdict;
  const confidence = value.confidence;
  if (!relationVerdicts.has(aRelation as RelationVerdict)) fail(`invalid a_relation: ${String(aRelation)}`);
  if (!relationVerdicts.has(bRelation as RelationVerdict)) fail(`invalid b_relation: ${String(bRelation)}`);
  if (!pairVerdicts.has(verdict as PairVerdict)) fail(`invalid verdict: ${String(verdict)}`);
  if (!confidences.has(confidence as Confidence)) fail(`invalid confidence: ${String(confidence)}`);
  if (!Array.isArray(value.citations)) fail("citations must be an array");
  const citations = [...new Set(value.citations.map((citation) => assertString(citation, "citation")))];
  const reason = value.reason === undefined ? undefined : assertString(value.reason, "reason");
  return {
    a_relation: aRelation as RelationVerdict,
    b_relation: bRelation as RelationVerdict,
    verdict: verdict as PairVerdict,
    confidence: confidence as Confidence,
    citations,
    ...(reason ? { reason } : {}),
  };
}

function normalizeVerdict(verdict: PairVerdict, orientation: Orientation): PairVerdict {
  if (verdict === "A" || verdict === "B") {
    if (orientation === "AB") return verdict;
    return verdict === "A" ? "B" : "A";
  }
  return verdict;
}

function evidenceIds(candidate: PairCase["a"]): Set<string> {
  return new Set(candidate.items.map((item) => item.id));
}

function assertRelationsAgree(raw: RawModelVerdict): void {
  if (raw.verdict === "insufficient") return;
  if (raw.verdict === "A" && raw.a_relation !== "supports") fail("A verdict requires candidate A to support the criterion");
  if (raw.verdict === "B" && raw.b_relation !== "supports") fail("B verdict requires candidate B to support the criterion");
  if (raw.verdict === "tie" && raw.a_relation !== raw.b_relation) fail("tie verdict requires the same relation on both candidates");
}

function assertEvidenceBoundary(candidate: PairCase["a"] | PairCase["b"]): void {
  for (const item of candidate.items) {
    const combined = `${item.id}\n${item.label}\n${item.content}`;
    if (/(^|[\s\\/])(?:private|oracle|calibration|conditions?|practices?)([\\/]|$)/i.test(combined)) {
      throw new EvidenceBoundaryError(`private marker or path in evidence ${item.id}`);
    }
    if (/(?:^|\n)\s*(?:expected|label|condition_id)\s*[:=]/i.test(combined)) {
      throw new EvidenceBoundaryError(`calibration label marker in evidence ${item.id}`);
    }
  }
}

export function validateScenarioBundle(bundle: ScenarioBundle): void {
  if (bundle.profile.schema_version !== "offline-judge-scenario/v1") fail("invalid scenario schema_version");
  if (bundle.rubric.criteria.length === 0) fail("rubric must contain at least one criterion");
  const criteria = new Set(bundle.rubric.criteria.map((criterion) => criterion.id));
  const cases = new Set<string>();
  for (const item of bundle.cases) {
    if (cases.has(item.id)) fail(`duplicate case id ${item.id}`);
    cases.add(item.id);
    if (!criteria.has(item.criterion.id)) fail(`case ${item.id} uses unknown criterion ${item.criterion.id}`);
    if (item.a.items.length === 0 && item.b.items.length === 0 && !item.insufficient_reason) {
      fail(`case ${item.id} has no evidence and no insufficient_reason`);
    }
    const ids = new Set<string>();
    for (const evidence of [...item.a.items, ...item.b.items]) {
      if (ids.has(evidence.id)) fail(`case ${item.id} has duplicate evidence id ${evidence.id}`);
      ids.add(evidence.id);
    }
    assertEvidenceBoundary(item.a);
    assertEvidenceBoundary(item.b);
  }
  const labeled = new Set(bundle.labels.map((label) => label.case_id));
  if (labeled.size !== bundle.labels.length) fail("duplicate calibration label");
  for (const label of bundle.labels) {
    if (!cases.has(label.case_id)) fail(`label references unknown case ${label.case_id}`);
  }
  if (labeled.size !== cases.size) fail("every case must have exactly one calibration label");
}

function insufficientDecision(input: {
  bundle: ScenarioBundle;
  case: PairCase;
  orientation: Orientation;
  reason: string;
  inputHash: string;
  evidenceIds: string[];
}): JudgeDecision {
  return {
    case_id: input.case.id,
    scenario_id: input.bundle.profile.id,
    criterion_id: input.case.criterion.id,
    orientation: input.orientation,
    state: "insufficient",
    verdict: "insufficient",
    canonical_verdict: "insufficient",
    confidence: null,
    citations: [],
    raw: null,
    reason: input.reason,
    input_hash: input.inputHash,
    prompt_hash: "",
    evidence_ids: input.evidenceIds,
  };
}

export async function judgePairCase(input: {
  bundle: ScenarioBundle;
  case: PairCase;
  orientation: Orientation;
  complete: ModelCompletion;
  systemPromptOverride?: string;
}): Promise<JudgeDecision> {
  const system = input.systemPromptOverride ?? systemPrompt();
  const presentedA = input.orientation === "AB" ? input.case.a : input.case.b;
  const presentedB = input.orientation === "AB" ? input.case.b : input.case.a;
  const labelA = input.orientation === "AB" ? "A" : "B";
  const labelB = input.orientation === "AB" ? "B" : "A";
  const prompt = pairPrompt({
    case: input.case,
    presented_a: presentedA,
    presented_b: presentedB,
    presented_label_a: labelA,
    presented_label_b: labelB,
  });
  const promptHash = await sha256Text(`${system}\n${prompt}`);
  const inputHash = await sha256Text(prompt);
  const ids = [...presentedA.items, ...presentedB.items].map((item) => item.id).sort();
  if (input.case.insufficient_reason || presentedA.items.length === 0 || presentedB.items.length === 0) {
    return {
      ...insufficientDecision({
        bundle: input.bundle,
        case: input.case,
        orientation: input.orientation,
        reason: input.case.insufficient_reason ?? "one candidate has no projected evidence",
        inputHash,
        evidenceIds: ids,
      }),
      prompt_hash: promptHash,
    };
  }

  let rawValue: unknown;
  try {
    rawValue = await input.complete(system, prompt);
  } catch (error) {
    return {
      case_id: input.case.id,
      scenario_id: input.bundle.profile.id,
      criterion_id: input.case.criterion.id,
      orientation: input.orientation,
      state: "not-run",
      verdict: "insufficient",
      canonical_verdict: "insufficient",
      confidence: null,
      citations: [],
      raw: null,
      reason: error instanceof Error ? error.message : String(error),
      input_hash: inputHash,
      prompt_hash: promptHash,
      evidence_ids: ids,
    };
  }

  try {
    const raw = parseRawModelVerdict(rawValue);
    const allowedIds = new Set(ids);
    for (const citation of raw.citations) {
      if (!allowedIds.has(citation)) throw new ModelOutputError(`model cited unknown evidence id ${citation}`);
    }
    assertRelationsAgree(raw);
    const verdict = raw.verdict;
    if (verdict !== "insufficient") {
      const citedA = raw.citations.some((citation) => evidenceIds(presentedA).has(citation));
      const citedB = raw.citations.some((citation) => evidenceIds(presentedB).has(citation));
      if (!citedA || !citedB) fail("observed verdict must cite evidence from both candidates");
    }
    return {
      case_id: input.case.id,
      scenario_id: input.bundle.profile.id,
      criterion_id: input.case.criterion.id,
      orientation: input.orientation,
      state: verdict === "insufficient" ? "insufficient" : "observed",
      verdict,
      canonical_verdict: normalizeVerdict(verdict, input.orientation),
      confidence: raw.confidence,
      citations: raw.citations,
      raw: rawValue,
      input_hash: inputHash,
      prompt_hash: promptHash,
      evidence_ids: ids,
      ...(raw.reason ? { reason: raw.reason } : {}),
    };
  } catch (error) {
    return {
      case_id: input.case.id,
      scenario_id: input.bundle.profile.id,
      criterion_id: input.case.criterion.id,
      orientation: input.orientation,
      state: "invalid",
      verdict: "insufficient",
      canonical_verdict: "insufficient",
      confidence: null,
      citations: [],
      raw: rawValue,
      reason: error instanceof Error ? error.message : String(error),
      input_hash: inputHash,
      prompt_hash: promptHash,
      evidence_ids: ids,
    };
  }
}

