import { expect, test } from "bun:test";
import { join } from "node:path";

interface Diagnostic {
  file: string;
  path: string;
  code: string;
  message: string;
}

interface EntrySource {
  file: string;
  value: unknown;
}

interface BuildResult {
  index: unknown | null;
  diagnostics: Diagnostic[];
}

interface CandidateModule {
  buildRegistryIndex(registry: unknown, registryFile: string, entries: EntrySource[]): BuildResult;
}

const candidatePath = Bun.env.CANDIDATE_PATH ?? join(import.meta.dir, "..", "..", "public", "starter", "src", "registry-check.ts");
const candidateUrl = `${Bun.pathToFileURL(candidatePath).href}?candidate=${Date.now()}`;
const { buildRegistryIndex } = (await import(candidateUrl)) as CandidateModule;
const registryFile = "fixtures/registry.json";

function codes(result: BuildResult): Array<[string, string, string]> {
  return result.diagnostics.map((entry) => [entry.file, entry.path, entry.code]);
}

test("builds a compatible index for valid bidirectional relationships", () => {
  const registry = {
    records: [
      { id: "alpha", kind: "guide", entry: "entries/alpha.json" },
      { id: "beta", kind: "note", entry: "entries/beta.json" },
    ],
  };
  const entries = [
    { file: "entries/beta.json", value: { id: "beta", kind: "note", registryId: "beta" } },
    { file: "entries/alpha.json", value: { id: "alpha", kind: "guide", registryId: "alpha" } },
  ];

  expect(buildRegistryIndex(registry, registryFile, entries)).toEqual({
    index: {
      entries: [
        { id: "alpha", kind: "guide", file: "entries/alpha.json" },
        { id: "beta", kind: "note", file: "entries/beta.json" },
      ],
    },
    diagnostics: [],
  });
});

test("does not overwrite duplicate registry or entry identities", () => {
  const registry = {
    records: [
      { id: "alpha", kind: "guide", entry: "entries/alpha.json" },
      { id: "alpha", kind: "guide", entry: "entries/alpha-copy.json" },
    ],
  };
  const entries = [
    { file: "entries/alpha.json", value: { id: "article", kind: "guide", registryId: "alpha" } },
    { file: "entries/alpha-copy.json", value: { id: "article", kind: "guide", registryId: "alpha" } },
  ];
  const result = buildRegistryIndex(registry, registryFile, entries);

  expect(result.index).toBeNull();
  expect(codes(result)).toEqual([
    ["entries/alpha-copy.json", "/id", "duplicate-id"],
    ["entries/alpha.json", "/id", "duplicate-id"],
    [registryFile, "/records/0/id", "duplicate-id"],
    [registryFile, "/records/1/id", "duplicate-id"],
  ]);
});

test("accumulates missing, reverse, and incompatible cross-reference problems", () => {
  const registry = {
    records: [
      { id: "alpha", kind: "guide", entry: "entries/alpha.json" },
      { id: "missing", kind: "note", entry: "entries/missing.json" },
    ],
  };
  const entries = [
    { file: "entries/stale.json", value: { id: "stale", kind: "note", registryId: "legacy" } },
    { file: "entries/alpha.json", value: { id: "alpha", kind: "note", registryId: "alpha" } },
    { file: "entries/other.json", value: { id: "other", kind: "guide", registryId: "alpha" } },
  ];
  const result = buildRegistryIndex(registry, registryFile, entries);

  expect(result.index).toBeNull();
  expect(codes(result)).toEqual([
    ["entries/alpha.json", "/kind", "incompatible-kind"],
    ["entries/other.json", "/registryId", "inconsistent-back-reference"],
    ["entries/stale.json", "/registryId", "missing-registry"],
    [registryFile, "/records/1/entry", "missing-entry"],
  ]);
  expect(result.diagnostics.every((entry) => typeof entry.message === "string" && entry.message.length > 0)).toBe(true);
});

test("is deterministic across registry and entry input order without mutating either", () => {
  const firstRegistry = {
    records: [
      { id: "beta", kind: "note", entry: "entries/beta.json" },
      { id: "alpha", kind: "guide", entry: "entries/alpha.json" },
    ],
  };
  const secondRegistry = {
    records: [
      { id: "alpha", kind: "guide", entry: "entries/alpha.json" },
      { id: "beta", kind: "note", entry: "entries/beta.json" },
    ],
  };
  const firstEntries = [
    { file: "ENTRIES/BETA.JSON", value: { id: "beta", kind: "note", registryId: "beta" } },
    { file: "entries/alpha.json", value: { id: "alpha", kind: "guide", registryId: "alpha" } },
  ];
  const secondEntries = [...firstEntries].reverse();
  const before = structuredClone(firstEntries);

  expect(buildRegistryIndex(firstRegistry, registryFile, firstEntries)).toEqual(buildRegistryIndex(secondRegistry, registryFile, secondEntries));
  expect(firstEntries).toEqual(before);
});
