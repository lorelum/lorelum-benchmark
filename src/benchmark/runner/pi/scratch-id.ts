/**
 * Canonical scratch identifier helpers shared by the local Pi diagnostic and
 * pilot CLIs.
 *
 * Runner validators such as the timing-pilot runner accept only lowercase
 * `[a-z0-9-]` ids (`^[a-z0-9][a-z0-9-]{0,63}$`). `Date#toISOString` emits an
 * uppercase `T`/`Z`, so any timestamp-derived id MUST be case-normalized before
 * it is used, otherwise a CLI default can fail its own runner validation.
 */
export const scratchRunIdPattern = /^[a-z0-9][a-z0-9-]{0,63}$/;

/** Timestamp fragment that always satisfies `scratchRunIdPattern` (lowercase). */
export function canonicalScratchTimestamp(date: Date = new Date()): string {
  return date.toISOString().replaceAll(/[:.]/g, "-").toLowerCase();
}

/** Validator-safe scratch run id, e.g. `pilot-2026-09-26t06-08-22-123z`. */
export function scratchRunId(prefix: string, date: Date = new Date()): string {
  return `${prefix}${canonicalScratchTimestamp(date)}`;
}
