import { createHash } from "node:crypto";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test } from "bun:test";

import {
  buildCorpusInventoryFromGit,
  serializeCorpusInventory,
  validateCorpusInventory,
  type CorpusInventory,
} from "./inventory";

const inventoryPath = join(import.meta.dir, "../../../../suites/retrieval-ranking/v2/corpus/inventory.json");
const historicalV1InventoryPath = join(import.meta.dir, "../../../../suites/retrieval-ranking/v1/corpus/inventory.json");

function git(repoRoot: string, args: string[]): void {
  const result = Bun.spawnSync(["git", ...args], { cwd: repoRoot, stdout: "pipe", stderr: "pipe" });
  if (result.exitCode !== 0) throw new Error(Buffer.from(result.stderr).toString("utf8"));
}

describe("retrieval corpus inventory", () => {
  test("pins the complete Practice ID inventory and hashes without copying Pack content", async () => {
    const repoRoot = await mkdtemp(join(tmpdir(), "retrieval-corpus-inventory-"));
    try {
      git(repoRoot, ["init", "--quiet", "--initial-branch=main"]);
      git(repoRoot, ["config", "user.name", "Benchmark Test"]);
      git(repoRoot, ["config", "user.email", "benchmark-test@example.invalid"]);
      for (const pack of ["alpha-pack", "beta-pack"]) {
        const practiceDir = join(repoRoot, "packs", pack, "practices");
        await mkdir(practiceDir, { recursive: true });
        await writeFile(join(practiceDir, "one.md"), [
          "---",
          `id: ${pack}.practice.one`,
          "title: Synthetic fixture title",
          "---",
          "Synthetic body that must not be serialized into the inventory.",
          "",
        ].join("\n"));
      }
      git(repoRoot, ["add", "packs"]);
      git(repoRoot, ["commit", "--quiet", "-m", "fixture"]);
      const commit = Bun.spawnSync(["git", "rev-parse", "HEAD"], { cwd: repoRoot, stdout: "pipe" });
      const commitId = Buffer.from(commit.stdout).toString("utf8").trim();
      const inventory = await buildCorpusInventoryFromGit({
        repoRoot,
        repository: "example/fixture-packs",
        snapshotCommit: commitId,
        packs: [
          { name: "beta-pack", releaseVersion: "1.0.0", sourceCommit: commitId, artifactDigest: "d".repeat(64) },
          { name: "alpha-pack", releaseVersion: "1.0.0", sourceCommit: commitId, artifactDigest: "d".repeat(64) },
        ],
      });

      expect(inventory.practiceCount).toBe(2);
      expect(inventory.packs.map((pack) => pack.name)).toEqual(["alpha-pack", "beta-pack"]);
      expect(validateCorpusInventory(inventory)).toBe(true);
      const serialized = serializeCorpusInventory(inventory);
      expect(serialized).not.toContain("Synthetic body that must not be serialized");
      expect(serialized).not.toContain("title");
      const corrupted = JSON.parse(serialized) as Record<string, unknown>;
      (corrupted.packs as Array<Record<string, unknown>>)[0]!.practices = [
        { id: "alpha-pack.practice.one", sourcePath: "practices/one.md", contentDigest: "a".repeat(64), body: "leak" },
      ];
      expect(validateCorpusInventory(corrupted)).toBe(false);
    } finally {
      await rm(repoRoot, { recursive: true, force: true });
    }
  }, 20_000);

  test("rejects practice-tree drift between a Pack source pin and the corpus snapshot", async () => {
    const repoRoot = await mkdtemp(join(tmpdir(), "retrieval-corpus-drift-"));
    try {
      git(repoRoot, ["init", "--quiet", "--initial-branch=main"]);
      git(repoRoot, ["config", "user.name", "Benchmark Test"]);
      git(repoRoot, ["config", "user.email", "benchmark-test@example.invalid"]);
      const practiceDir = join(repoRoot, "packs", "alpha-pack", "practices");
      await mkdir(practiceDir, { recursive: true });
      await writeFile(join(practiceDir, "one.md"), "---\nid: alpha-pack.practice.one\n---\nsource one\n");
      git(repoRoot, ["add", "packs"]);
      git(repoRoot, ["commit", "--quiet", "-m", "source"]);
      const sourceCommit = Buffer.from(Bun.spawnSync(["git", "rev-parse", "HEAD"], { cwd: repoRoot, stdout: "pipe" }).stdout).toString("utf8").trim();
      await writeFile(join(practiceDir, "one.md"), "---\nid: alpha-pack.practice.one\n---\nsnapshot drift\n");
      git(repoRoot, ["add", "packs"]);
      git(repoRoot, ["commit", "--quiet", "-m", "drift"]);
      const snapshotCommit = Buffer.from(Bun.spawnSync(["git", "rev-parse", "HEAD"], { cwd: repoRoot, stdout: "pipe" }).stdout).toString("utf8").trim();

      await expect(buildCorpusInventoryFromGit({
        repoRoot,
        repository: "example/fixture-packs",
        snapshotCommit,
        packs: [{ name: "alpha-pack", releaseVersion: "1.0.0", sourceCommit, artifactDigest: "d".repeat(64) }],
      })).rejects.toThrow("Pinned Pack source differs from corpus snapshot");
    } finally {
      await rm(repoRoot, { recursive: true, force: true });
    }
  }, 20_000);

  test("the checked-in full corpus manifest contains only IDs, paths, and digests", async () => {
    const inventory = JSON.parse(await readFile(inventoryPath, "utf8")) as CorpusInventory;
    expect(validateCorpusInventory(inventory)).toBe(true);
    expect(inventory.practiceCount).toBe(97);
    expect(inventory.packs.map(({ name, practices }) => [name, practices.length])).toEqual([
      ["agentic-coding", 34],
      ["issue-pr-etiquette", 12],
      ["pack-creator", 27],
      ["react-web-craft", 24],
    ]);
    for (const pack of inventory.packs) {
      expect(pack.artifactDigest).toMatch(/^[a-f0-9]{64}$/);
      for (const practice of pack.practices) {
        expect(Object.keys(practice).sort()).toEqual(["contentDigest", "id", "sourcePath"]);
      }
    }
  });

  test("keeps the historical v1 corpus immutable and recomputes its legacy digest", async () => {
    const inventory = JSON.parse(await readFile(historicalV1InventoryPath, "utf8")) as Record<string, unknown>;
    const { corpusDigest, ...payload } = inventory;
    const recomputed = createHash("sha256").update(JSON.stringify(payload)).digest("hex");
    expect(corpusDigest).toBe("89209b7d0d9b5c180648bcc7b235b438a4a3e2237b5006eb462d86d45ca03998");
    expect(recomputed).toBe(corpusDigest);
    expect(validateCorpusInventory(inventory)).toBe(false);
  });
});
