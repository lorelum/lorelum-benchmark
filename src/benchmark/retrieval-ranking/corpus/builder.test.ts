import { createHash } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test } from "bun:test";

import { type ProcessResult, type ProcessRunner } from "../protocol-v1";
import { prepareCorpusStore } from "./builder";
import type { CorpusInventory } from "./inventory";

const commit = "a".repeat(40);
const profileId = "b".repeat(64);

const inventoryPayload = {
  schemaVersion: 1,
  sourceRepository: "lorelum/lorelum-packs",
  snapshotCommit: commit,
  practiceCount: 3,
  packs: [
    {
      name: "alpha-pack",
      releaseVersion: "1.0.0",
      sourceCommit: commit,
      artifactDigest: "d".repeat(64),
      practices: [
        { id: "alpha.one", sourcePath: "practices/one.md", contentDigest: "1".repeat(64) },
        { id: "alpha.two", sourcePath: "practices/two.md", contentDigest: "2".repeat(64) },
      ],
    },
    {
      name: "beta-pack",
      releaseVersion: "2.0.0",
      sourceCommit: commit,
      artifactDigest: "d".repeat(64),
      practices: [
        { id: "beta.one", sourcePath: "practices/one.md", contentDigest: "3".repeat(64) },
      ],
    },
  ],
} satisfies Omit<CorpusInventory, "corpusDigest">;

const inventory: CorpusInventory = {
  ...inventoryPayload,
  corpusDigest: createHash("sha256").update(JSON.stringify(inventoryPayload)).digest("hex"),
};

function result(stdout: string, exitCode = 0): ProcessResult {
  return { exitCode, stdout, stderr: "", durationMs: 1 };
}

function envelope(command: string, data: unknown): string {
  return JSON.stringify({ command, ok: true, data });
}

function checkoutRunner(handler: ProcessRunner): ProcessRunner {
  return async (command, cwd, stdin, timeoutMs) => {
    if (command[1] === "rev-parse" && command[2] === "--show-toplevel") return result(cwd);
    if (command[1] === "rev-parse" && command[2] === "HEAD") return result(commit);
    if (command[1] === "status") return result("");
    return handler(command, cwd, stdin, timeoutMs);
  };
}

describe("retrieval corpus store builder", () => {
  test("installs exact releases into a test-owned Store and verifies the ready index", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "retrieval-corpus-builder-"));
    const calls: Array<{ command: string[]; stdin: string }> = [];
    const runner = checkoutRunner(async (command, _cwd, stdin) => {
      calls.push({ command, stdin });
      if (command.includes("install")) {
        const packName = command[command.indexOf("install") + 1]!.split("@")[0]!;
        const pack = inventory.packs.find((entry) => entry.name === packName)!;
        return result(envelope("pack.install", {
          pack: { name: pack.name, version: pack.releaseVersion },
          source: { type: "git", ref: `${pack.name}-v${pack.releaseVersion}`, commit: pack.sourceCommit },
          artifactDigest: "d".repeat(64),
        }));
      }
      if (command.includes("pack") && command.includes("list")) {
        const packName = command[command.indexOf("pack") + 2]!;
        const pack = inventory.packs.find((entry) => entry.name === packName)!;
        return result(envelope("pack.list", {
          practices: pack.practices.map((practice) => ({ id: practice.id })),
        }));
      }
      if (command.includes("build")) {
        return result(envelope("index.build", { state: "ready", index: { state: "ready", profileId, vectorCount: 3 } }));
      }
      if (command.includes("status")) {
        return result(envelope("index.status", { state: "ready", profileId, vectorCount: 3 }));
      }
      return result(JSON.stringify({ command: "unexpected", ok: false, error: {} }), 2);
    });

    try {
      const prepared = await prepareCorpusStore({
        lorelumRoot: workspace,
        lorelumCommit: commit,
        storeRoot: join(workspace, "store"),
        cacheRoot: join(workspace, "cache"),
        embeddingProfileId: profileId,
        inventory,
        processRunner: runner,
      });

      expect(prepared.vectorCount).toBe(3);
      expect(prepared.packArtifacts.map((pack) => [pack.name, pack.releaseVersion])).toEqual([
        ["alpha-pack", "1.0.0"],
        ["beta-pack", "2.0.0"],
      ]);
      expect(calls.some((call) => call.command.includes("alpha-pack@1.0.0"))).toBe(true);
      expect(calls.some((call) => call.command.includes("beta-pack@2.0.0"))).toBe(true);
      const packCalls = calls.filter((call) => call.command.includes("pack"));
      expect(packCalls).not.toHaveLength(0);
      expect(packCalls.every((call) => !call.command.includes("--cache-root"))).toBe(true);
      expect(packCalls.every((call) => !call.command.includes("--no-project"))).toBe(true);
      const indexCalls = calls.filter((call) => call.command.includes("index"));
      expect(indexCalls).not.toHaveLength(0);
      expect(indexCalls.every((call) => call.command.includes("--cache-root"))).toBe(true);
      expect(indexCalls.every((call) => call.command.includes("--no-project"))).toBe(true);
      expect(calls.every((call) => call.stdin === "")).toBe(true);
    } finally {
      await rm(workspace, { recursive: true, force: true });
    }
  });

  test("waits for a queued semantic index and rejects a profile mismatch", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "retrieval-corpus-index-"));
    let builds = 0;
    let statuses = 0;
    const runner = checkoutRunner(async (command) => {
      if (command.includes("install")) {
        const packName = command[command.indexOf("install") + 1]!.split("@")[0]!;
        const pack = inventory.packs.find((entry) => entry.name === packName)!;
        return result(envelope("pack.install", {
          pack: { name: pack.name, version: pack.releaseVersion },
          source: { type: "git", ref: "v", commit: pack.sourceCommit },
          artifactDigest: "d".repeat(64),
        }));
      }
      if (command.includes("pack") && command.includes("list")) {
        const packName = command[command.indexOf("pack") + 2]!;
        const pack = inventory.packs.find((entry) => entry.name === packName)!;
        return result(envelope("pack.list", { practices: pack.practices.map((practice) => ({ id: practice.id })) }));
      }
      if (command.includes("build")) {
        builds += 1;
        return result(envelope("index.build", { state: builds === 1 ? "building" : "ready", operationId: "op-1", profileId, vectorCount: 3 }));
      }
      if (command.includes("status")) {
        statuses += 1;
        if (statuses === 1) return result(envelope("index.status", { state: "indexing", profileId, vectorCount: 1 }));
        return result(envelope("index.status", { state: "ready", profileId: "e".repeat(64), vectorCount: 3 }));
      }
      return result("{}", 2);
    });

    try {
      await expect(prepareCorpusStore({
        lorelumRoot: workspace,
        lorelumCommit: commit,
        storeRoot: join(workspace, "store"),
        cacheRoot: join(workspace, "cache"),
        embeddingProfileId: profileId,
        inventory,
        timeoutMs: 5_000,
        processRunner: runner,
      })).rejects.toThrow("profile");
    } finally {
      await rm(workspace, { recursive: true, force: true });
    }
  });

  test("rejects an install receipt whose source commit or practice catalog drifted", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "retrieval-corpus-drift-"));
    const runner = checkoutRunner(async (command) => {
      if (command.includes("install")) {
        const packName = command[command.indexOf("install") + 1]!.split("@")[0]!;
        const pack = inventory.packs.find((entry) => entry.name === packName)!;
        return result(envelope("pack.install", {
          pack: { name: pack.name, version: pack.releaseVersion },
          source: { type: "git", ref: "v", commit: "f".repeat(40) },
          artifactDigest: "d".repeat(64),
        }));
      }
      return result("{}", 2);
    });

    try {
      await expect(prepareCorpusStore({
        lorelumRoot: workspace,
        lorelumCommit: commit,
        storeRoot: join(workspace, "store"),
        cacheRoot: join(workspace, "cache"),
        embeddingProfileId: profileId,
        inventory,
        processRunner: runner,
      })).rejects.toThrow("source commit");
    } finally {
      await rm(workspace, { recursive: true, force: true });
    }
  });

  test("rejects an install receipt whose Pack artifact digest drifted", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "retrieval-corpus-artifact-drift-"));
    const runner = checkoutRunner(async (command) => {
      if (command.includes("install")) {
        const packName = command[command.indexOf("install") + 1]!.split("@")[0]!;
        const pack = inventory.packs.find((entry) => entry.name === packName)!;
        return result(envelope("pack.install", {
          pack: { name: pack.name, version: pack.releaseVersion },
          source: { type: "git", ref: "v", commit: pack.sourceCommit },
          artifactDigest: "f".repeat(64),
        }));
      }
      return result("{}", 2);
    });

    try {
      await expect(prepareCorpusStore({
        lorelumRoot: workspace,
        lorelumCommit: commit,
        storeRoot: join(workspace, "store"),
        cacheRoot: join(workspace, "cache"),
        embeddingProfileId: profileId,
        inventory,
        processRunner: runner,
      })).rejects.toThrow("artifact digest");
    } finally {
      await rm(workspace, { recursive: true, force: true });
    }
  });
});
