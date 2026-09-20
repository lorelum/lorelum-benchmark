import { sha256Text } from "../../../fs";

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
  return reason
    .replace(/(?:^|[^A-Za-z0-9])[A-Za-z]:[\\/][^\s"'`]+/g, "[redacted-path]")
    .replace(/\\\\[^\s"'`]+/g, "[redacted-path]")
    .replace(/\/(?:home|Users|workspace|tmp)\/[^\s"'`]+/gi, "[redacted-path]")
    .replace(/(?:private|oracle|condition|delivery|practice|pack|session|secret|credential|token|password|api[_ -]?key|system|developer|thinking|toolresult|evaluator|scoring|absolute path)/gi, "[redacted]");
}
