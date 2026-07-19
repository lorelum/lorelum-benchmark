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

interface ParsedRegistryRecord {
  value: RegistryRecord;
  index: number;
}

interface ParsedEntry {
  source: EntrySource;
  value: EntryRecord;
}

const kinds = new Set<RecordKind>(["guide", "note"]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isRecordKind(value: unknown): value is RecordKind {
  return typeof value === "string" && kinds.has(value as RecordKind);
}

function normalizeFile(file: string): string {
  return file.replaceAll("\\", "/").toLowerCase();
}

function diagnostic(file: string, path: string, code: Diagnostic["code"], message: string): Diagnostic {
  return { file, path, code, message };
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function sortDiagnostics(diagnostics: Diagnostic[]): void {
  diagnostics.sort((left, right) => {
    const fileOrder = compareText(normalizeFile(left.file), normalizeFile(right.file));
    if (fileOrder !== 0) return fileOrder;
    const pathOrder = compareText(left.path, right.path);
    if (pathOrder !== 0) return pathOrder;
    return compareText(left.code, right.code);
  });
}

function parseRegistry(registry: unknown, file: string, diagnostics: Diagnostic[]): ParsedRegistryRecord[] {
  if (!isRecord(registry) || !Array.isArray(registry.records)) {
    diagnostics.push(diagnostic(file, "/records", "invalid-registry", "Registry records must be an array"));
    return [];
  }

  const parsed: ParsedRegistryRecord[] = [];
  registry.records.forEach((item, index) => {
    const path = `/records/${index}`;
    if (!isRecord(item) || typeof item.id !== "string" || !isRecordKind(item.kind) || typeof item.entry !== "string") {
      diagnostics.push(diagnostic(file, path, "invalid-registry", "Registry record must contain an id, supported kind, and entry file"));
      return;
    }
    parsed.push({ value: { id: item.id, kind: item.kind, entry: item.entry }, index });
  });
  return parsed;
}

function parseEntries(entries: EntrySource[], diagnostics: Diagnostic[]): ParsedEntry[] {
  const parsed: ParsedEntry[] = [];
  for (const source of entries) {
    const value = source.value;
    if (!isRecord(value) || typeof value.id !== "string" || !isRecordKind(value.kind) || typeof value.registryId !== "string") {
      diagnostics.push(diagnostic(source.file, "/", "invalid-entry", "Entry must contain an id, supported kind, and registry id"));
      continue;
    }
    parsed.push({ source, value: { id: value.id, kind: value.kind, registryId: value.registryId } });
  }
  return parsed;
}

function addDuplicateDiagnostics<T>(items: T[], identity: (item: T) => string, report: (item: T) => void): void {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const id = identity(item);
    groups.set(id, [...(groups.get(id) ?? []), item]);
  }
  for (const group of groups.values()) {
    if (group.length > 1) group.forEach(report);
  }
}

export function buildRegistryIndex(registry: unknown, registryFile: string, entries: EntrySource[]): BuildResult {
  const diagnostics: Diagnostic[] = [];
  const records = parseRegistry(registry, registryFile, diagnostics);
  const parsedEntries = parseEntries(entries, diagnostics);

  addDuplicateDiagnostics(records, (record) => record.value.id, (record) => {
    diagnostics.push(diagnostic(registryFile, `/records/${record.index}/id`, "duplicate-id", "Registry id is declared more than once"));
  });
  addDuplicateDiagnostics(parsedEntries, (entry) => entry.value.id, (entry) => {
    diagnostics.push(diagnostic(entry.source.file, "/id", "duplicate-id", "Entry id is declared more than once"));
  });

  const recordsById = new Map<string, ParsedRegistryRecord[]>();
  const entriesByFile = new Map<string, ParsedEntry[]>();
  for (const record of records) recordsById.set(record.value.id, [...(recordsById.get(record.value.id) ?? []), record]);
  for (const entry of parsedEntries) {
    const key = normalizeFile(entry.source.file);
    entriesByFile.set(key, [...(entriesByFile.get(key) ?? []), entry]);
  }

  for (const record of records) {
    if (!entriesByFile.has(normalizeFile(record.value.entry))) {
      diagnostics.push(diagnostic(registryFile, `/records/${record.index}/entry`, "missing-entry", "Registry entry file is missing"));
    }
  }

  for (const entry of parsedEntries) {
    const referencedRecords = recordsById.get(entry.value.registryId) ?? [];
    if (referencedRecords.length === 0) {
      diagnostics.push(diagnostic(entry.source.file, "/registryId", "missing-registry", "Entry references a missing registry id"));
      continue;
    }

    const matchingRecord = referencedRecords.find((record) => normalizeFile(record.value.entry) === normalizeFile(entry.source.file));
    if (!matchingRecord) {
      diagnostics.push(diagnostic(entry.source.file, "/registryId", "inconsistent-back-reference", "Registry does not point back to this entry"));
      continue;
    }

    if (matchingRecord.value.kind !== entry.value.kind) {
      diagnostics.push(diagnostic(entry.source.file, "/kind", "incompatible-kind", "Registry and entry kinds are incompatible"));
    }
  }

  sortDiagnostics(diagnostics);
  if (diagnostics.length > 0) return { index: null, diagnostics };

  return {
    index: {
      entries: records
        .map((record) => ({ id: record.value.id, kind: record.value.kind, file: record.value.entry }))
        .sort((left, right) => compareText(left.id, right.id) || compareText(left.file, right.file)),
    },
    diagnostics,
  };
}
