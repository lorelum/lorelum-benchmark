import { createHash } from "node:crypto";
import { resolve } from "node:path";

export const CORPUS_REPOSITORY = "lorelum/lorelum-packs";
export const CORPUS_SNAPSHOT_COMMIT = "3a48b6a026554ce7f30caf1e7d52130e5eb01db3";
export const PINNED_PACKS = [
  {
    name: "agentic-coding",
    releaseVersion: "0.5.1",
    sourceCommit: "954324cda7961ae899578649847aa32e1aa90a6f",
  },
  {
    name: "issue-pr-etiquette",
    releaseVersion: "0.1.0",
    sourceCommit: "45484847e02ea11e8438c7f3c17d7b2eee5b4dfc",
  },
  {
    name: "pack-creator",
    releaseVersion: "0.2.0",
    sourceCommit: "f144a5a5e69636a5a6cd97a8b519018d2941bac6",
  },
  {
    name: "react-web-craft",
    releaseVersion: "0.1.0",
    sourceCommit: "293e6b1327b0d9b4c01a711748db14c610908655",
  },
] as const;

export interface PracticeDigestEntry {
  id: string;
  sourcePath: string;
  contentDigest: string;
}

export interface PackInventoryEntry {
  name: string;
  releaseVersion: string;
  sourceCommit: string;
  practices: PracticeDigestEntry[];
}

export interface CorpusInventoryPayload {
  schemaVersion: 1;
  sourceRepository: string;
  snapshotCommit: string;
  practiceCount: number;
  packs: PackInventoryEntry[];
}

export interface CorpusInventory extends CorpusInventoryPayload {
  corpusDigest: string;
}

export interface PackPin {
  name: string;
  releaseVersion: string;
  sourceCommit: string;
}

function sha256(value: Uint8Array | string): string {
  return createHash("sha256").update(value).digest("hex");
}

function canonicalJson(value: unknown): string {
  return JSON.stringify(value);
}

function runGit(repoRoot: string, args: string[]): Buffer {
  const result = Bun.spawnSync(["git", ...args], {
    cwd: repoRoot,
    stdout: "pipe",
    stderr: "pipe",
  });
  if (result.exitCode !== 0) {
    const detail = Buffer.from(result.stderr).toString("utf8").trim();
    throw new Error(`git ${args.join(" ")} failed${detail ? `: ${detail}` : ""}`);
  }
  return Buffer.from(result.stdout);
}

function parsePracticeId(source: Buffer, sourcePath: string): string {
  const text = source.toString("utf8").replace(/^\uFEFF/, "");
  const frontMatter = /^---\s*\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(text)?.[1];
  const idLine = frontMatter?.split(/\r?\n/).find((line) => /^id\s*:/.test(line));
  const value = idLine?.slice(idLine.indexOf(":") + 1).trim();
  const id = value?.replace(/^(["'])(.*)\1$/, "$2");
  if (!id || !/^[a-z0-9]+(?:[.-][a-z0-9]+)+$/.test(id)) {
    throw new Error(`Practice ID is missing or invalid in ${sourcePath}`);
  }
  return id;
}

function checkedCommit(repoRoot: string, commit: string): void {
  if (!/^[a-f0-9]{40}$/.test(commit)) throw new Error(`Invalid pinned commit: ${commit}`);
  runGit(repoRoot, ["cat-file", "-e", `${commit}^{commit}`]);
}

function validateInventoryShape(value: unknown): value is CorpusInventory {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const inventory = value as Record<string, unknown>;
  const allowedRootKeys = ["schemaVersion", "sourceRepository", "snapshotCommit", "practiceCount", "packs", "corpusDigest"];
  if (Object.keys(inventory).some((key) => !allowedRootKeys.includes(key))) return false;
  if (Object.keys(inventory).length !== allowedRootKeys.length) return false;
  if (inventory.schemaVersion !== 1 || typeof inventory.sourceRepository !== "string") return false;
  if (typeof inventory.snapshotCommit !== "string" || !/^[a-f0-9]{40}$/.test(inventory.snapshotCommit)) return false;
  if (!Number.isInteger(inventory.practiceCount) || !Array.isArray(inventory.packs)) return false;
  if (typeof inventory.corpusDigest !== "string" || !/^[a-f0-9]{64}$/.test(inventory.corpusDigest)) return false;

  const allIds = new Set<string>();
  let count = 0;
  for (const rawPack of inventory.packs) {
    if (!rawPack || typeof rawPack !== "object" || Array.isArray(rawPack)) return false;
    const pack = rawPack as Record<string, unknown>;
    if (Object.keys(pack).sort().join(",") !== "name,practices,releaseVersion,sourceCommit") return false;
    if (typeof pack.name !== "string" || typeof pack.sourceCommit !== "string" || !/^[a-f0-9]{40}$/.test(pack.sourceCommit)) return false;
    if (typeof pack.releaseVersion !== "string" || !/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(pack.releaseVersion)) return false;
    if (!Array.isArray(pack.practices)) return false;
    for (const rawPractice of pack.practices) {
      if (!rawPractice || typeof rawPractice !== "object" || Array.isArray(rawPractice)) return false;
      const practice = rawPractice as Record<string, unknown>;
      if (Object.keys(practice).sort().join(",") !== "contentDigest,id,sourcePath") return false;
      if (typeof practice.id !== "string" || !/^[a-z0-9]+(?:[.-][a-z0-9]+)+$/.test(practice.id)) return false;
      if (allIds.has(practice.id)) return false;
      allIds.add(practice.id);
      if (typeof practice.sourcePath !== "string" || !practice.sourcePath.startsWith("practices/") || !practice.sourcePath.endsWith(".md")) return false;
      if (typeof practice.contentDigest !== "string" || !/^[a-f0-9]{64}$/.test(practice.contentDigest)) return false;
      count += 1;
    }
  }
  return inventory.practiceCount === count;
}

export async function buildCorpusInventoryFromGit(options: {
  repoRoot: string;
  repository: string;
  snapshotCommit: string;
  packs: readonly PackPin[];
}): Promise<CorpusInventory> {
  const repoRoot = resolve(options.repoRoot);
  checkedCommit(repoRoot, options.snapshotCommit);
  const seenPackNames = new Set<string>();
  const seenIds = new Set<string>();
  const packs: PackInventoryEntry[] = [];

  for (const pin of [...options.packs].sort((left, right) => left.name.localeCompare(right.name))) {
    if (!/^[a-z0-9-]+$/.test(pin.name) || seenPackNames.has(pin.name)) {
      throw new Error(`Invalid or duplicate Pack name: ${pin.name}`);
    }
    seenPackNames.add(pin.name);
    checkedCommit(repoRoot, pin.sourceCommit);

    const practicesPath = `packs/${pin.name}/practices`;
    const sourceTree = runGit(repoRoot, ["rev-parse", `${pin.sourceCommit}:${practicesPath}`]).toString("utf8").trim();
    const snapshotTree = runGit(repoRoot, ["rev-parse", `${options.snapshotCommit}:${practicesPath}`]).toString("utf8").trim();
    if (sourceTree !== snapshotTree) throw new Error(`Pinned Pack source differs from corpus snapshot: ${pin.name}`);

    const paths = runGit(repoRoot, ["ls-tree", "-rz", "--name-only", pin.sourceCommit, "--", practicesPath])
      .toString("utf8")
      .split("\0")
      .filter((path) => path.endsWith(".md"))
      .sort((left, right) => left.localeCompare(right));
    if (paths.length === 0) throw new Error(`No Practice sources found for ${pin.name}`);

    const practices = paths.map((path) => {
      const raw = runGit(repoRoot, ["show", `${pin.sourceCommit}:${path}`]);
      const id = parsePracticeId(raw, path);
      if (seenIds.has(id)) throw new Error(`Duplicate Practice ID in pinned corpus: ${id}`);
      seenIds.add(id);
      return {
        id,
        sourcePath: path.slice(`packs/${pin.name}/`.length),
        contentDigest: sha256(raw),
      };
    }).sort((left, right) => left.id.localeCompare(right.id));

    packs.push({
      name: pin.name,
      releaseVersion: pin.releaseVersion,
      sourceCommit: pin.sourceCommit,
      practices,
    });
  }

  const payload: CorpusInventoryPayload = {
    schemaVersion: 1,
    sourceRepository: options.repository,
    snapshotCommit: options.snapshotCommit,
    practiceCount: seenIds.size,
    packs,
  };
  const inventory = { ...payload, corpusDigest: sha256(canonicalJson(payload)) };
  if (!validateInventoryShape(inventory)) throw new Error("Generated corpus inventory failed its own schema checks");
  return inventory;
}

export function validateCorpusInventory(value: unknown): value is CorpusInventory {
  if (!validateInventoryShape(value)) return false;
  const { corpusDigest, ...payload } = value;
  return sha256(canonicalJson(payload)) === corpusDigest;
}

export function serializeCorpusInventory(inventory: CorpusInventory): string {
  if (!validateCorpusInventory(inventory)) throw new Error("Invalid corpus inventory");
  return `${JSON.stringify(inventory, null, 2)}\n`;
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  if (args.length !== 4 || args[0] !== "--repo" || args[2] !== "--output") {
    throw new Error("Usage: bun run src/benchmark/retrieval-ranking/corpus/inventory.ts --repo <lorelum-packs-checkout> --output <inventory.json>");
  }
  const inventory = await buildCorpusInventoryFromGit({
    repoRoot: args[1]!,
    repository: CORPUS_REPOSITORY,
    snapshotCommit: CORPUS_SNAPSHOT_COMMIT,
    packs: PINNED_PACKS,
  });
  const outputPath = resolve(args[3]!);
  await Bun.write(outputPath, serializeCorpusInventory(inventory));
  console.log(JSON.stringify({ outputPath, practiceCount: inventory.practiceCount, corpusDigest: inventory.corpusDigest }));
}

if (import.meta.main) await main();
