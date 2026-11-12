/** Shared structural guard for untrusted JSON envelopes; callers must still
 * validate every field required by their protocol. */
export function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
