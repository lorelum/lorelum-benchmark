import { createHash } from "node:crypto";
import { mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";

import {
  createHarnessV1Client,
  HARNESS_ENTRYPOINT,
  HARNESS_PROTOCOL_VERSION,
  type HarnessObservation,
  type PinnedHarnessClient,
} from "../protocol-v1";
import {
  prepareCorpusStore,
  type PrepareCorpusStoreOptions,
  type PreparedCorpusStore,
} from "../corpus/builder";
import type { CorpusInventory } from "../corpus/inventory";
import { scoreRetrievalBatch, type RetrievalBatchScore, type RetrievalPracticeLabel } from "../scorer/v1";

export interface RetrievalCaseInput {
  id: string;
  query: string;
}

export interface RetrievalRunnerConfig {
  suiteId: "retrieval-ranking";
  suiteVersion: string;
  revision: string;
  casesSha256: string;
  labelsSha256: string;
  scorerSha256: string;
}

export interface RetrievalBatchEnvironment {
  platform: string;
  arch: string;
  bunVersion: string;
}

export interface RetrievalBatchModel {
  id: string;
  version: string;
  nativeRuntime: string;
}

export interface ExecuteRetrievalBatchOptions {
  runId: string;
  startedAt: string;
  lorelumRepository: string;
  lorelumRoot: string;
  lorelumCommit: string;
  storeRoot: string;
  cacheRoot: string;
  embeddingProfileId: string;
  candidateWidth: number;
  resultLimit: number;
  model: RetrievalBatchModel;
  benchmark: RetrievalRunnerConfig;
  inventory: CorpusInventory;
  cases: RetrievalCaseInput[];
  labels: RetrievalPracticeLabel[];
  artifactPath: string;
  recordPath: string;
  prepareStore?: (options: PrepareCorpusStoreOptions) => Promise<PreparedCorpusStore>;
  createClient?: (options: {
    lorelumRoot: string;
    lorelumCommit: string;
  }) => Promise<PinnedHarnessClient>;
  environment?: RetrievalBatchEnvironment;
}

export interface RetrievalBatchFailure {
  case_id: string;
  kind: "harness-error" | "process-error" | "protocol-error";
  error_code: string;
}

export interface RetrievalBatchArtifact {
  schemaVersion: 1;
  runId: string;
  revision: string;
  status: "complete" | "failed";
  cases: Array<{
    id: string;
    status: "ok";
    candidateIds: string[];
    finalIds: string[];
  }>;
  failures: RetrievalBatchFailure[];
  score: RetrievalBatchScore | null;
}

export interface RetrievalBatchRecord {
  schema_version: "retrieval-batch-record/v1";
  track: "retrieval-ranking";
  run_id: string;
  batch_status: "complete" | "failed";
  started_at: string;
  finished_at: string;
  benchmark: RetrievalRunnerConfig;
  corpus: {
    source_repository: string;
    snapshot_commit: string;
    corpus_digest: string;
    practice_count: number;
    pack_artifacts: PreparedCorpusStore["packArtifacts"];
  };
  lorelum: {
    repository: string;
    commit: string;
    protocol_version: typeof HARNESS_PROTOCOL_VERSION;
    entrypoint: string;
  };
  embedding: {
    profile_id: string;
    model: RetrievalBatchModel;
  };
  retrieval: {
    candidate_width: number;
    result_limit: number;
  };
  environment: RetrievalBatchEnvironment;
  result_artifact: {
    path: string;
    sha256: string;
  };
  execution: {
    case_count: number;
    successful_case_count: number;
    failure_count: number;
    failures: RetrievalBatchFailure[];
  };
  outcome: {
    retrieval_scored: boolean;
    reason?: string;
  };
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function failureFromObservation(caseId: string, observation: HarnessObservation): RetrievalBatchFailure | null {
  if (observation.kind === "success") return null;
  return {
    case_id: caseId,
    kind: observation.kind,
    error_code: observation.errorCode,
  };
}

export async function executeRetrievalBatch(options: ExecuteRetrievalBatchOptions): Promise<RetrievalBatchRecord> {
  const prepared = await (options.prepareStore ?? prepareCorpusStore)({
    lorelumRoot: options.lorelumRoot,
    lorelumCommit: options.lorelumCommit,
    storeRoot: options.storeRoot,
    cacheRoot: options.cacheRoot,
    embeddingProfileId: options.embeddingProfileId,
    inventory: options.inventory,
  });
  if (prepared.corpusDigest !== options.inventory.corpusDigest) throw new Error("Prepared corpus digest differs from the frozen revision");
  const client = await (options.createClient ?? createHarnessV1Client)({
    lorelumRoot: options.lorelumRoot,
    lorelumCommit: options.lorelumCommit,
  });

  const corpusIds = new Set(options.inventory.packs.flatMap((pack) => pack.practices.map((practice) => practice.id)));
  const cases: RetrievalBatchArtifact["cases"] = [];
  const failures: RetrievalBatchFailure[] = [];
  for (const testCase of options.cases) {
    const observation = await client.run({
      query: testCase.query,
      storeRoot: prepared.storeRoot,
      embeddingProfileId: options.embeddingProfileId,
      candidateWidth: options.candidateWidth,
      resultLimit: options.resultLimit,
    }, corpusIds);
    const failure = failureFromObservation(testCase.id, observation);
    if (failure) {
      failures.push(failure);
      continue;
    }
    cases.push({
      id: testCase.id,
      status: "ok",
      candidateIds: observation.response.candidateIds,
      finalIds: observation.response.finalIds,
    });
  }

  const status = failures.length === 0 && cases.length === options.cases.length ? "complete" : "failed";
  const score = status === "complete"
    ? scoreRetrievalBatch({
      revision: options.benchmark.revision,
      candidateWidth: options.candidateWidth,
      resultLimit: options.resultLimit,
      cases,
      labels: options.labels,
    })
    : null;
  const artifact: RetrievalBatchArtifact = {
    schemaVersion: 1,
    runId: options.runId,
    revision: options.benchmark.revision,
    status,
    cases,
    failures,
    score,
  };
  const artifactText = `${JSON.stringify(artifact, null, 2)}\n`;
  const artifactPath = resolve(options.artifactPath);
  await mkdir(dirname(artifactPath), { recursive: true });
  await Bun.write(artifactPath, artifactText);

  const finishedAt = new Date().toISOString();
  const record: RetrievalBatchRecord = {
    schema_version: "retrieval-batch-record/v1",
    track: "retrieval-ranking",
    run_id: options.runId,
    batch_status: status,
    started_at: options.startedAt,
    finished_at: finishedAt,
    benchmark: options.benchmark,
    corpus: {
      source_repository: options.inventory.sourceRepository,
      snapshot_commit: options.inventory.snapshotCommit,
      corpus_digest: options.inventory.corpusDigest,
      practice_count: options.inventory.practiceCount,
      pack_artifacts: prepared.packArtifacts,
    },
    lorelum: {
      repository: options.lorelumRepository,
      commit: options.lorelumCommit,
      protocol_version: HARNESS_PROTOCOL_VERSION,
      entrypoint: HARNESS_ENTRYPOINT,
    },
    embedding: {
      profile_id: options.embeddingProfileId,
      model: options.model,
    },
    retrieval: {
      candidate_width: options.candidateWidth,
      result_limit: options.resultLimit,
    },
    environment: options.environment ?? {
      platform: process.platform,
      arch: process.arch,
      bunVersion: Bun.version,
    },
    result_artifact: {
      path: artifactPath,
      sha256: sha256(artifactText),
    },
    execution: {
      case_count: options.cases.length,
      successful_case_count: cases.length,
      failure_count: failures.length,
      failures,
    },
    outcome: status === "complete"
      ? { retrieval_scored: true }
      : {
        retrieval_scored: false,
        reason: "At least one harness invocation failed or was missing; partial results were not scored.",
      },
  };
  const recordPath = resolve(options.recordPath);
  await mkdir(dirname(recordPath), { recursive: true });
  await Bun.write(recordPath, `${JSON.stringify(record, null, 2)}\n`);
  return record;
}
