import { createHash } from "node:crypto";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test } from "bun:test";

import { validateRetrievalRankingRecordBinding } from "./validate";

function digest(value: unknown): string {
  return createHash("sha256").update(typeof value === "string" ? value : JSON.stringify(value)).digest("hex");
}

async function writeJson(path: string, value: unknown): Promise<string> {
  const text = `${JSON.stringify(value, null, 2)}\n`;
  await Bun.write(path, text);
  return digest(text);
}

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "retrieval-validate-"));
  const suitePath = join(root, "suites", "retrieval-ranking");
  const revisionPath = join(suitePath, "v1");
  await mkdir(join(revisionPath, "corpus"), { recursive: true });
  await mkdir(join(revisionPath, "cases"), { recursive: true });
  await mkdir(join(revisionPath, "private"), { recursive: true });

  const corpusPayload = {
    schemaVersion: 1,
    sourceRepository: "lorelum/lorelum-packs",
    snapshotCommit: "a".repeat(40),
    practiceCount: 1,
    packs: [{
      name: "fixture-pack",
      releaseVersion: "1.0.0",
      sourceCommit: "b".repeat(40),
      artifactDigest: "c".repeat(64),
      practices: [{ id: "core.one", sourcePath: "practices/one.md", contentDigest: "d".repeat(64) }],
    }],
  };
  const corpus = { ...corpusPayload, corpusDigest: digest(corpusPayload) };
  const corpusHash = await writeJson(join(revisionPath, "corpus", "inventory.json"), corpus);
  const casesHash = await writeJson(join(revisionPath, "cases", "queries.json"), {
    schemaVersion: 1,
    revision: "v1",
    cases: [{ id: "case-one", query: "Find the core Practice." }],
  });
  const labelsHash = await writeJson(join(revisionPath, "private", "labels.json"), {
    schemaVersion: 1,
    revision: "v1",
    cases: [{ id: "case-one", coreIds: ["core.one"], forbiddenIds: [], coverage: ["direct"], rationale: "fixture" }],
  });
  const scorerHash = await writeJson(join(revisionPath, "private", "scorer.json"), {
    schemaVersion: 1,
    revision: "v1",
    candidateWidth: 20,
    resultLimit: 5,
    metrics: ["candidate-recall", "final-top-k"],
  });
  await Bun.write(join(suitePath, "suite.yaml"), [
    "id: retrieval-ranking",
    "version: 1.0.0",
    "track: retrieval-ranking",
    "lifecycle_stage: frozen",
    "revision: v1",
    "revisions:",
    "  - revision: v1",
    "    lifecycle_stage: frozen",
    "corpus: v1/corpus/inventory.json",
    "cases: v1/cases/queries.json",
    "labels: v1/private/labels.json",
    "scorer: v1/private/scorer.json",
    "protocol: ../../docs/RETRIEVAL_RANKING_PROTOCOL.md",
    "",
  ].join("\n"));

  return {
    root,
    suitePath,
    revisionPath,
    corpus,
    corpusHash,
    casesHash,
    labelsHash,
    scorerHash,
  };
}

function recordFor(fixture: Awaited<ReturnType<typeof fixture>>) {
  return {
    benchmark: {
      suiteId: "retrieval-ranking",
      suiteVersion: "1.0.0",
      revision: "v1",
      casesSha256: fixture.casesHash,
      labelsSha256: fixture.labelsHash,
      scorerSha256: fixture.scorerHash,
    },
    corpus: {
      source_repository: "lorelum/lorelum-packs",
      snapshot_commit: "a".repeat(40),
      corpus_digest: fixture.corpus.corpusDigest,
      practice_count: 1,
      pack_artifacts: [{
        name: "fixture-pack",
        releaseVersion: "1.0.0",
        sourceCommit: "b".repeat(40),
        artifactDigest: "c".repeat(64),
        practiceIds: ["core.one"],
      }],
    },
    retrieval: { candidate_width: 20, result_limit: 5 },
  };
}

describe("retrieval ranking record binding", () => {
  test("binds a record to the exact declared revision files", async () => {
    const value = await fixture();
    try {
      expect(await validateRetrievalRankingRecordBinding(recordFor(value), value.suitePath)).toEqual([]);
    } finally {
      await rm(value.root, { recursive: true, force: true });
    }
  });

  test("rejects a record after query, label, scorer, or corpus drift", async () => {
    const value = await fixture();
    try {
      await Bun.write(join(value.revisionPath, "cases", "queries.json"), "{\"schemaVersion\":1,\"revision\":\"v1\",\"cases\":[]}\n");
      expect((await validateRetrievalRankingRecordBinding(recordFor(value), value.suitePath)).join("\n")).toContain("casesSha256");

      const second = await fixture();
      try {
        await Bun.write(join(second.revisionPath, "private", "labels.json"), "{\"schemaVersion\":1,\"revision\":\"v1\",\"cases\":[]}\n");
        expect((await validateRetrievalRankingRecordBinding(recordFor(second), second.suitePath)).join("\n")).toContain("labelsSha256");
      } finally {
        await rm(second.root, { recursive: true, force: true });
      }

      const third = await fixture();
      try {
        await Bun.write(join(third.revisionPath, "private", "scorer.json"), "{\"schemaVersion\":1,\"revision\":\"v1\",\"candidateWidth\":20,\"resultLimit\":5,\"metrics\":[]}\n");
        expect((await validateRetrievalRankingRecordBinding(recordFor(third), third.suitePath)).join("\n")).toContain("scorerSha256");
      } finally {
        await rm(third.root, { recursive: true, force: true });
      }

      const fourth = await fixture();
      try {
        const payload = { ...fourth.corpus, sourceRepository: "other/repository", corpusDigest: undefined };
        const changed = { ...payload, corpusDigest: digest({ ...fourth.corpus, sourceRepository: "other/repository", corpusDigest: undefined }) };
        await writeJson(join(fourth.revisionPath, "corpus", "inventory.json"), changed);
        expect((await validateRetrievalRankingRecordBinding(recordFor(fourth), fourth.suitePath)).join("\n")).toContain("corpus digest");
      } finally {
        await rm(fourth.root, { recursive: true, force: true });
      }
    } finally {
      await rm(value.root, { recursive: true, force: true });
    }
  });

  test("rejects a revision that is not frozen after it has a record", async () => {
    const value = await fixture();
    try {
      const suite = await Bun.file(join(value.suitePath, "suite.yaml")).text();
      await Bun.write(join(value.suitePath, "suite.yaml"), suite.replaceAll("frozen", "candidate"));
      expect((await validateRetrievalRankingRecordBinding(recordFor(value), value.suitePath)).join("\n")).toContain("not frozen or later");
    } finally {
      await rm(value.root, { recursive: true, force: true });
    }
  });
});
