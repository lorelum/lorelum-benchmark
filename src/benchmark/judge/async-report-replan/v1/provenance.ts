import type { JudgeInput } from "../../input";
import type { ReplanEvidence } from "./types";

const issuedEvidence = new WeakSet<object>();
const issuedJudgeInputs = new WeakSet<object>();

export function markReplanEvidenceIssued<T extends ReplanEvidence>(evidence: T): T {
  issuedEvidence.add(evidence);
  return evidence;
}

export function isReplanEvidenceIssued(value: unknown): value is ReplanEvidence {
  return Boolean(value) && typeof value === "object" && issuedEvidence.has(value as object);
}

export function markReplanJudgeInputIssued<T extends JudgeInput>(input: T): T {
  issuedJudgeInputs.add(input);
  return input;
}

export function isReplanJudgeInputIssued(value: unknown): value is JudgeInput {
  return Boolean(value) && typeof value === "object" && issuedJudgeInputs.has(value as object);
}
