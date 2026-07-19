export type Domain = "authoring" | "delivery";
export interface Pack { id: string; domain: Domain; entrypoint: string; dependencies: string[]; }
export interface Entrypoint { file: string; domain: Domain; exports: string[]; }
export interface Diagnostic { pack: string; path: string; code: "duplicate-pack" | "missing-entrypoint" | "domain-mismatch" | "missing-export" | "missing-dependency" | "incompatible-dependency"; message: string; }
export interface PublishResult { index: Array<{ id: string; domain: Domain; entrypoint: string }> | null; diagnostics: Diagnostic[]; }
export function buildPublishIndex(packs: unknown, entrypoints: unknown): PublishResult { return { index: (packs as Pack[]).map(({ id, domain, entrypoint }) => ({ id, domain, entrypoint })), diagnostics: [] }; }
