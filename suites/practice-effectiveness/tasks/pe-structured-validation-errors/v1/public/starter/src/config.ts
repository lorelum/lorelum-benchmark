export interface Config { name: string; revision: "v1"; output: "summary" | "full"; modes: Array<"safe" | "fast">; }
export interface Diagnostic { path: string; code: "invalid-json" | "invalid-root" | "required" | "invalid-type" | "invalid-value" | "unknown-field"; message: string; }
export interface ValidationResult { config: Config | null; diagnostics: Diagnostic[]; }
export function validateConfig(input: unknown): ValidationResult { return { config: input as Config, diagnostics: [] }; }
