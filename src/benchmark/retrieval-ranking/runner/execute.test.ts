import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test } from "bun:test";

import type { HarnessObservation, PinnedHarnessClient } from "../protocol-v1";
import type { CorpusInventory } from "../corpus/inventory";
import { executeRetrievalBatch } from "./execute";

const corpusInventory: CorpusInventory = {
  schemaVersion: 1,
  sourceRepository: "lorelum/lorelum-packs",
  snapshotCommit: "a".repeat(40),
  practiceCount: 2,
  corpusDigest: "b".repeat(64),
  packs: [{
    name: "fixture-pack",
    releaseVersion: "1.0.0",
    sourceCommit: "a".repeat(40),
    artifactDigest: "d".repeat(64),
    practices: [
      { id: "core.one", sourcePath: "practices/one.md", contentDigest: "1".repeat(64) },
      { id: "forbidden.one", sourcePath: "practices/two.md", contentDigest: "2".repeat(64) },
    ],
  }],
};

function fakePrepared() {
  return {
    storeRoot: "C:\\tmp\\store",
    cacheRoot: "C:\\tmp\\cache",
    corpusDigest: corpusInventory.corpusDigest,
    embeddingProfileId: "c".repeat(64),
    vectorCount: 2,
    packArtifacts: [{
      name: "fixture-pack",
      releaseVersion: "1.0.0",
      sourceCommit: "a".repeat(40),
      artifactDigest: "d".repeat(64),
      practiceIds: ["core.one", "forbidden.one"],
    }],
  };
}

function options(workspace: string) {
  return {
    runId: "run-1",
    startedAt: "2026-09-24T00:00:00.000Z",
    lorelumRepository: "lorelum/lorelum",
    lorelumRoot: workspace,
    lorelumCommit: "a".repeat(40),
    storeRoot: join(workspace, "store"),
    cacheRoot: join(workspace, "cache"),
    embeddingProfileId: "c".repeat(64),
    candidateWidth: 20,
    resultLimit: 5,
    model: { id: "fixture-model", version: "1", nativeRuntime: "fixture-runtime" },
    benchmark: {
      suiteId: "retrieval-ranking" as const,
      suiteVersion: "1.0.0",
      revision: "v1",
      casesSha256: "e".repeat(64),
      labelsSha256: "f".repeat(64),
      scorerSha256: "0".repeat(64),
    },
    inventory: corpusInventory,
    cases: [{ id: "case-one", query: "Find the core Practice." }],
    labels: [{
      id: "case-one",
      coreIds: ["core.one"],
      forbiddenIds: ["forbidden.one"],
      coverage: ["direct"],
      rationale: "fixture",
    }],
    artifactPath: join(workspace, "artifact.json"),
    recordPath: join(workspace, "record.json"),
    environment: { platform: "win32", arch: "x64", bunVersion: "1.4.2" },
    prepareStore: async () => fakePrepared(),
  };
}

function clientReturning(observation: HarnessObservation): PinnedHarnessClient {
  return {
    lorelumRoot: "C:\\lorelum",
    lorelumCommit: "a".repeat(40),
    async run() {
      return observation;
    },
  };
}

describe("retrieval batch runner", () => {
  test("scores a complete batch and writes a hash-addressed result artifact", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "retrieval-runner-"));
    try {
      const record = await executeRetrievalBatch({
        ...options(workspace),
        createClient: async () => clientReturning({
          kind: "success",
          exitCode: 0,
          durationMs: 10,
          response: {
            status: "ok",
            candidateIds: ["core.one", "forbidden.one"],
            finalIds: ["core.one"],
          },
        }),
      });
      expect(record.batch_status).toBe("complete");
      expect(record.outcome.retrieval_scored).toBe(true);
      expect(record.execution.failure_count).toBe(0);
      const artifactText = await readFile(record.result_artifact.path, "utf8");
      expect(createHash("sha256").update(artifactText).digest("hex")).toBe(record.result_artifact.sha256);
      const artifact = JSON.parse(artifactText) as Record<string, unknown>;
      expect(artifact).toMatchObject({ status: "complete" });
      expect((artifact.score as Record<string, unknown>).summary).toMatchObject({
        scopeErrorCaseCount: 0,
        candidateMissPracticeCount: 0,
      });
    } finally {
      await rm(workspace, { recursive: true, force: true });
    }
  });

  test("does not score or retain partial candidate lists when any case fails", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "retrieval-runner-fail-"));
    try {
      const record = await executeRetrievalBatch({
        ...options(workspace),
        createClient: async () => clientReturning({
          kind: "harness-error",
          errorCode: "index_unavailable",
          exitCode: 2,
          durationMs: 10,
        }),
      });
      expect(record.batch_status).toBe("failed");
      expect(record.outcome.retrieval_scored).toBe(false);
      const artifact = JSON.parse(await readFile(record.result_artifact.path, "utf8")) as Record<string, unknown>;
      expect(artifact.score).toBeNull();
      expect(artifact.cases).toEqual([]);
      expect(artifact.failures).toEqual([{
        case_id: "case-one",
        kind: "harness-error",
        error_code: "index_unavailable",
      }]);
    } finally {
      await rm(workspace, { recursive: true, force: true });
    }
  });

  test("never passes gold labels into the harness request", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "retrieval-runner-input-"));
    let captured: Record<string, unknown> | null = null;
    try {
      await executeRetrievalBatch({
        ...options(workspace),
        createClient: async () => ({
          lorelumRoot: "C:\\lorelum",
          lorelumCommit: "a".repeat(40),
          async run(request) {
            captured = request as unknown as Record<string, unknown>;
            return {
              kind: "success",
              exitCode: 0,
              durationMs: 10,
              response: { status: "ok", candidateIds: ["core.one"], finalIds: ["core.one"] },
            };
          },
        }),
      });
      expect(captured).toEqual({
        query: "Find the core Practice.",
        storeRoot: "C:\\tmp\\store",
        embeddingProfileId: "c".repeat(64),
        candidateWidth: 20,
        resultLimit: 5,
      });
      expect(JSON.stringify(captured)).not.toContain("core.one");
      expect(JSON.stringify(captured)).not.toContain("labels");
    } finally {
      await rm(workspace, { recursive: true, force: true });
    }
  });
});
