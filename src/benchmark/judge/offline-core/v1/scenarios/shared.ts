import { join } from "node:path";
import { sha256Text } from "../../../../fs";
import type { CandidateEvidence, EvidenceItem, EvidenceKind } from "../types";

export type SourceMap = Record<string, string>;

type TreeSpec =
  | { base: { ref: string; sha256: string } }
  | { extends: string; overlay: { path: string; sha256: string } };

type SetsManifest = {
  version: number;
  sets: Array<{
    id: string;
    version: string;
    trees: Record<string, TreeSpec>;
    fixtures: Record<string, string>;
  }>;
};

async function readText(path: string): Promise<string> {
  return (await Bun.file(path).text()).replace(/^\uFEFF/, "");
}

async function readJson<T>(path: string): Promise<T> {
  return JSON.parse(await readText(path)) as T;
}

async function readTree(root: string): Promise<SourceMap> {
  const files: SourceMap = {};
  for (const path of (await Array.fromAsync(new Bun.Glob("**/*").scan({ cwd: root, onlyFiles: true }))).sort()) {
    files[path.replaceAll("\\", "/")] = await readText(join(root, path));
  }
  return files;
}

export async function loadFixtureTrees(input: {
  manifestPath: string;
  candidateRoot: string;
  setId: string;
  setVersion: string;
}): Promise<Record<string, SourceMap>> {
  const manifest = Bun.YAML.parse(await readText(input.manifestPath)) as SetsManifest;
  const set = manifest.sets.find((candidate) => candidate.id === input.setId && candidate.version === input.setVersion);
  if (!set) throw new Error(`Missing fixture set ${input.setId}/${input.setVersion}`);
  const resolved: Record<string, SourceMap> = {};
  const resolving = new Set<string>();
  const resolveTree = async (treeId: string): Promise<SourceMap> => {
    if (resolved[treeId]) return resolved[treeId];
    if (resolving.has(treeId)) throw new Error(`Cyclic fixture tree reference: ${treeId}`);
    resolving.add(treeId);
    const spec = set.trees[treeId];
    if (!spec) throw new Error(`Missing fixture tree ${treeId}`);
    let files: SourceMap;
    if ("base" in spec) {
      files = await readTree(join(process.cwd(), spec.base.ref));
    } else {
      const parent = await resolveTree(spec.extends);
      const overlay = await readTree(join(input.candidateRoot, spec.overlay.path));
      files = { ...parent, ...overlay };
    }
    resolved[treeId] = files;
    resolving.delete(treeId);
    return files;
  };
  const fixtures: Record<string, SourceMap> = {};
  for (const [fixtureName, treeId] of Object.entries(set.fixtures)) {
    fixtures[fixtureName] = await resolveTree(treeId);
  }
  return fixtures;
}

function evidenceKind(path: string): EvidenceKind {
  return /\.(?:ts|tsx|js|jsx|mjs|cjs|json|yaml|yml)$/i.test(path) ? "code" : "text";
}

export async function projectSourceMap(input: {
  sourceId: string;
  files: SourceMap;
  includePatterns: string[];
  maxTotalChars?: number;
  maxItemChars?: number;
}): Promise<CandidateEvidence> {
  const patterns = input.includePatterns.map((pattern) => new RegExp(pattern, "i"));
  const allPaths = Object.keys(input.files).sort();
  const selected = allPaths.filter((path) => patterns.some((pattern) => pattern.test(path)));
  const priority = (path: string) => path.startsWith("src/") ? 3 : path.startsWith("tests/") ? 2 : path.startsWith("docs/") ? 1 : 0;
  const paths = (selected.length > 0 ? selected : allPaths)
    .sort((left, right) => priority(right) - priority(left) || left.localeCompare(right))
    .slice(0, 6);
  const maxTotalChars = input.maxTotalChars ?? 3_000;
  const maxItemChars = input.maxItemChars ?? 1_500;
  const items: EvidenceItem[] = [];
  let totalChars = 0;
  for (const path of paths) {
    const remaining = maxTotalChars - totalChars;
    if (remaining <= 0) break;
    const content = input.files[path].slice(0, Math.min(maxItemChars, remaining));
    const id = `${input.sourceId}:${path}`;
    items.push({
      id,
      kind: evidenceKind(path),
      label: path,
      content,
      sha256: await sha256Text(`${path}\0${content}`),
    });
    totalChars += content.length;
  }
  return {
    summary: "Candidate evidence derived from the supplied scenario projection.",
    items,
  };
}

export async function projectText(input: {
  sourceId: string;
  text: string;
  label: string;
  summary: string;
}): Promise<CandidateEvidence> {
  const content = input.text;
  return {
    summary: input.summary,
    items: [{
      id: `${input.sourceId}:text`,
      kind: "text",
      label: input.label,
      content,
      sha256: await sha256Text(content),
    }],
  };
}

export function emptyCandidate(): CandidateEvidence {
  return { summary: "No projected evidence was supplied for this candidate.", items: [] };
}

export async function candidateHash(candidate: CandidateEvidence): Promise<string> {
  return sha256Text(JSON.stringify(candidate.items.map((item) => ({ id: item.id, sha256: item.sha256 }))));
}

export async function hashJson(value: unknown): Promise<string> {
  return sha256Text(JSON.stringify(value));
}

export async function readScenarioJson<T>(path: string): Promise<T> {
  return readJson<T>(path);
}

