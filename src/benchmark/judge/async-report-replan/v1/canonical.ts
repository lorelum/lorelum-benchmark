import { sha256Text } from "../../../fs";
import { absolutePathPattern, containsSensitiveCredential, redactAbsolutePaths, redactSensitiveCredentials } from "../../privacy";

const blindCaseReservedPrefix = /^case-(?:ref(?:erence)?|equiv(?:alent)?|anti(?:[-_.]?pattern)?|cal(?:ibration)?|condition|delivery|timing|oracle|baseline|retrieval|irrelevant|practice|pack|session|treatment)[a-z0-9._-]*$/i;

export function isOpaqueBlindCaseId(value: unknown): value is string {
  return typeof value === "string"
    && /^case-[a-z0-9]{12,64}$/.test(value)
    && !blindCaseReservedPrefix.test(value);
}

export function normalizeText(value: string): string {
  return value.replaceAll("\r\n", "\n").replaceAll("\r", "\n").replace(/[ \t]+$/gm, "").trim();
}

function sortValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortValue);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => [key, sortValue(item)]));
}

export function canonicalJson(value: unknown): string {
  return JSON.stringify(sortValue(value));
}

export async function hashJson(value: unknown): Promise<string> {
  return sha256Text(canonicalJson(value));
}

export function redactedProjectionReason(reason: string): string {
  return `replan evidence rejected: ${redactSensitiveText(reason).slice(0, 240)}`;
}

export function redactSensitiveText(reason: string): string {
  return redactSensitiveCredentials(redactAbsolutePaths(reason))
    .replace(/(?:private|oracle|condition|delivery|practice|pack|session|secret|credential|token|password|api[_ -]?key|system|developer|thinking|toolresult|evaluator|scoring|reference|equivalent|anti[- ]?pattern|cal(?:ibration)?[- ]?(?:ref(?:erence)?|eq(?:uivalent)?|anti[- ]?pattern)|absolute path)/gi, "[redacted]");
}

export { absolutePathPattern, containsSensitiveCredential };
