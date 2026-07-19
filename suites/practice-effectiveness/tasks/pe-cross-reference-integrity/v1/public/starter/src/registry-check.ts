export type RecordKind = "guide" | "note";

export interface RegistryRecord {
  id: string;
  kind: RecordKind;
  entry: string;
}

export interface EntryRecord {
  id: string;
  kind: RecordKind;
  registryId: string;
}

export interface EntrySource {
  file: string;
  value: unknown;
}

export interface Diagnostic {
  file: string;
  path: string;
  code: "invalid-registry" | "invalid-entry" | "duplicate-id" | "missing-entry" | "missing-registry" | "inconsistent-back-reference" | "incompatible-kind";
  message: string;
}

export interface RegistryIndex {
  entries: Array<{ id: string; kind: RecordKind; file: string }>;
}

export interface BuildResult {
  index: RegistryIndex | null;
  diagnostics: Diagnostic[];
}

export function buildRegistryIndex(registry: unknown, registryFile: string, entries: EntrySource[]): BuildResult {
  const records = (registry as { records?: RegistryRecord[] }).records ?? [];

  return {
    index: {
      entries: records.map((record) => ({ id: record.id, kind: record.kind, file: record.entry })),
    },
    diagnostics: [],
  };
}
