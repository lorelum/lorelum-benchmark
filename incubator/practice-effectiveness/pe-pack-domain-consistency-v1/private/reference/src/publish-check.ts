export type Domain = "authoring" | "delivery";
export interface Pack { id: string; domain: Domain; entrypoint: string; dependencies: string[]; }
export interface Entrypoint { file: string; domain: Domain; exports: string[]; }
export interface Diagnostic { pack: string; path: string; code: "duplicate-pack" | "missing-entrypoint" | "domain-mismatch" | "missing-export" | "missing-dependency" | "incompatible-dependency"; message: string; }
export interface PublishResult { index: Array<{ id: string; domain: Domain; entrypoint: string }> | null; diagnostics: Diagnostic[]; }
const domains = new Set<Domain>(["authoring", "delivery"]);
const text = (left: string, right: string) => left < right ? -1 : left > right ? 1 : 0;
const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);
const add = (diagnostics: Diagnostic[], pack: string, path: string, code: Diagnostic["code"], message: string) => diagnostics.push({ pack, path, code, message });
function isPack(value: unknown): value is Pack { return isRecord(value) && typeof value.id === "string" && domains.has(value.domain as Domain) && typeof value.entrypoint === "string" && Array.isArray(value.dependencies) && value.dependencies.every((item) => typeof item === "string"); }
function isEntrypoint(value: unknown): value is Entrypoint { return isRecord(value) && typeof value.file === "string" && domains.has(value.domain as Domain) && Array.isArray(value.exports) && value.exports.every((item) => typeof item === "string"); }
export function buildPublishIndex(packs: unknown, entrypoints: unknown): PublishResult {
  const diagnostics: Diagnostic[] = [];
  const packValues = Array.isArray(packs) ? packs.filter(isPack) : [];
  const entryValues = Array.isArray(entrypoints) ? entrypoints.filter(isEntrypoint) : [];
  const packGroups = new Map<string, Pack[]>(); for (const pack of packValues) packGroups.set(pack.id, [...(packGroups.get(pack.id) ?? []), pack]);
  for (const group of packGroups.values()) if (group.length > 1) for (const pack of group) add(diagnostics, pack.id, "/id", "duplicate-pack", "Pack id is declared more than once");
  const entryByFile = new Map(entryValues.map((entry) => [entry.file.toLowerCase(), entry]));
  for (const pack of packValues) {
    const entry = entryByFile.get(pack.entrypoint.toLowerCase());
    if (!entry) add(diagnostics, pack.id, "/entrypoint", "missing-entrypoint", "Entrypoint is missing");
    else { if (entry.domain !== pack.domain) add(diagnostics, pack.id, "/entrypoint", "domain-mismatch", "Entrypoint belongs to another domain"); if (!entry.exports.includes("main")) add(diagnostics, pack.id, "/entrypoint", "missing-export", "Entrypoint must export main"); }
    pack.dependencies.forEach((dependency, index) => { const target = packGroups.get(dependency)?.[0]; if (!target) add(diagnostics, pack.id, `/dependencies/${index}`, "missing-dependency", "Dependency is missing"); else if (target.domain !== pack.domain) add(diagnostics, pack.id, `/dependencies/${index}`, "incompatible-dependency", "Dependency belongs to another domain"); });
  }
  diagnostics.sort((left, right) => text(left.pack, right.pack) || text(left.path, right.path) || text(left.code, right.code));
  if (diagnostics.length) return { index: null, diagnostics };
  return { index: packValues.map(({ id, domain, entrypoint }) => ({ id, domain, entrypoint })).sort((left, right) => text(left.id, right.id)), diagnostics };
}
