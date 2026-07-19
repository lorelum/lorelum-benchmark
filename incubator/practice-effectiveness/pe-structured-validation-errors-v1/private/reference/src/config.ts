export interface Config { name: string; revision: "v1"; output: "summary" | "full"; modes: Array<"safe" | "fast">; }
export interface Diagnostic { path: string; code: "invalid-json" | "invalid-root" | "required" | "invalid-type" | "invalid-value" | "unknown-field"; message: string; }
export interface ValidationResult { config: Config | null; diagnostics: Diagnostic[]; }

const fields = ["name", "revision", "output", "modes"] as const;
const modes = new Set(["safe", "fast"]);
function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === "object" && value !== null && !Array.isArray(value); }
function diagnostic(path: string, code: Diagnostic["code"], message: string): Diagnostic { return { path, code, message }; }
function compare(left: string, right: string): number { return left < right ? -1 : left > right ? 1 : 0; }

export function validateConfig(input: unknown): ValidationResult {
  if (!isRecord(input)) return { config: null, diagnostics: [diagnostic("/", "invalid-root", "Configuration must be an object")] };
  const diagnostics: Diagnostic[] = [];
  for (const key of Object.keys(input)) if (!fields.includes(key as (typeof fields)[number])) diagnostics.push(diagnostic(`/${key}`, "unknown-field", "Unexpected field"));
  for (const field of fields) if (!(field in input)) diagnostics.push(diagnostic(`/${field}`, "required", "Required field is missing"));
  const { name, revision, output, modes: declaredModes } = input;
  if ("name" in input) { if (typeof name !== "string") diagnostics.push(diagnostic("/name", "invalid-type", "Expected a string")); else if (name.trim().length === 0) diagnostics.push(diagnostic("/name", "invalid-value", "Name must not be empty")); }
  if ("revision" in input) { if (typeof revision !== "string") diagnostics.push(diagnostic("/revision", "invalid-type", "Expected a string")); else if (revision !== "v1") diagnostics.push(diagnostic("/revision", "invalid-value", "Unsupported revision")); }
  if ("output" in input) { if (typeof output !== "string") diagnostics.push(diagnostic("/output", "invalid-type", "Expected a string")); else if (output !== "summary" && output !== "full") diagnostics.push(diagnostic("/output", "invalid-value", "Unsupported output")); }
  if ("modes" in input) { if (!Array.isArray(declaredModes)) diagnostics.push(diagnostic("/modes", "invalid-type", "Expected an array")); else if (declaredModes.length === 0 || !declaredModes.every((mode) => typeof mode === "string" && modes.has(mode)) || new Set(declaredModes).size !== declaredModes.length) diagnostics.push(diagnostic("/modes", "invalid-value", "Modes must be unique supported values")); }
  diagnostics.sort((left, right) => compare(left.path, right.path) || compare(left.code, right.code));
  if (diagnostics.length > 0) return { config: null, diagnostics };
  return { config: { name: name as string, revision: revision as "v1", output: output as "summary" | "full", modes: declaredModes as Array<"safe" | "fast"> }, diagnostics };
}
