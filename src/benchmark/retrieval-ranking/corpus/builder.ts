import { mkdir } from "node:fs/promises";
import { isAbsolute, resolve } from "node:path";

import {
  defaultProcessRunner,
  verifyPinnedCleanCheckout,
  type ProcessResult,
  type ProcessRunner,
} from "../protocol-v1";
import {
  validateCorpusInventory,
  type CorpusInventory,
  type PackInventoryEntry,
} from "./inventory";

export const CORPUS_REGISTRY = "lorelum/lorelum-packs";
export const CLI_ENTRYPOINT = "packages/cli/src/main.ts";
export const DEFAULT_INDEX_TIMEOUT_MS = 15 * 60_000;

export interface PrepareCorpusStoreOptions {
  lorelumRoot: string;
  lorelumCommit: string;
  storeRoot: string;
  cacheRoot: string;
  embeddingProfileId: string;
  inventory: CorpusInventory;
  bunExecutable?: string;
  timeoutMs?: number;
  processRunner?: ProcessRunner;
}

export interface PreparedCorpusStore {
  storeRoot: string;
  cacheRoot: string;
  corpusDigest: string;
  embeddingProfileId: string;
  vectorCount: number;
  packArtifacts: Array<{
    name: string;
    releaseVersion: string;
    sourceCommit: string;
    artifactDigest: string;
    practiceIds: string[];
  }>;
}

interface CliEnvelope {
  command: string;
  ok: boolean;
  data?: unknown;
  error?: unknown;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function parseCliEnvelope(result: ProcessResult, command: string): CliEnvelope {
  if (result.timedOut) throw new Error(`${command} timed out`);
  if (result.exitCode !== 0) {
    const detail = result.stderr.trim() || result.stdout.trim();
    throw new Error(`${command} exited with code ${String(result.exitCode)}${detail ? `: ${detail}` : ""}`);
  }
  const stdout = result.stdout.trim();
  if (!stdout || stdout.includes("\n") || stdout.includes("\r")) {
    throw new Error(`${command} did not return one JSON line`);
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(stdout) as unknown;
  } catch {
    throw new Error(`${command} returned invalid JSON`);
  }
  if (!isRecord(parsed) || parsed.command !== command || parsed.ok !== true || !("data" in parsed)) {
    throw new Error(`${command} returned an unexpected envelope`);
  }
  return { command, ok: true, data: parsed.data };
}

function requireString(record: Record<string, unknown>, key: string, context: string): string {
  const value = record[key];
  if (typeof value !== "string" || value.length === 0) throw new Error(`${context} is missing ${key}`);
  return value;
}

function requireCount(record: Record<string, unknown>, key: string, context: string): number {
  const value = record[key];
  if (!Number.isInteger(value) || Number(value) < 0) throw new Error(`${context} is missing ${key}`);
  return Number(value);
}

function dataRecord(envelope: CliEnvelope, context: string): Record<string, unknown> {
  if (!isRecord(envelope.data)) throw new Error(`${context} returned invalid data`);
  return envelope.data;
}

function normalizeIndexData(data: Record<string, unknown>): Record<string, unknown> {
  if (data.state === "ready" && isRecord(data.index)) return { ...data.index, state: "ready" };
  return data;
}

async function runCliJson(
  processRunner: ProcessRunner,
  command: string[],
  root: string,
  timeoutMs: number,
  commandName: string,
): Promise<CliEnvelope> {
  const result = await processRunner(command, root, "", timeoutMs);
  return parseCliEnvelope(result, commandName);
}

function cliArgs(
  bunExecutable: string,
  command: string[],
  storeRoot: string,
  cacheRoot?: string,
): string[] {
  return [
    bunExecutable,
    CLI_ENTRYPOINT,
    ...command,
    "--store-root",
    storeRoot,
    ...(cacheRoot ? ["--cache-root", cacheRoot] : []),
    "--no-project",
    "--json",
  ];
}

async function installPack(
  processRunner: ProcessRunner,
  bunExecutable: string,
  root: string,
  storeRoot: string,
  cacheRoot: string,
  pack: PackInventoryEntry,
  timeoutMs: number,
): Promise<PreparedCorpusStore["packArtifacts"][number]> {
  const args = cliArgs(
    bunExecutable,
    [
      "pack",
      "install",
      `${pack.name}@${pack.releaseVersion}`,
      "--registry",
      CORPUS_REGISTRY,
    ],
    storeRoot,
    cacheRoot,
  );
  const envelope = await runCliJson(processRunner, args, root, timeoutMs, "pack.install");
  const data = dataRecord(envelope, `pack.install ${pack.name}`);
  const installedPack = data.pack;
  const source = data.source;
  if (!isRecord(installedPack) || !isRecord(source)) throw new Error(`pack.install ${pack.name} returned incomplete provenance`);
  if (installedPack.name !== pack.name || installedPack.version !== pack.releaseVersion) {
    throw new Error(`pack.install resolved the wrong release for ${pack.name}`);
  }
  const sourceCommit = requireString(source, "commit", `pack.install ${pack.name}`);
  if (source.type !== "git" || sourceCommit !== pack.sourceCommit) {
    throw new Error(`pack.install source commit differs from the pinned corpus for ${pack.name}`);
  }
  const artifactDigest = requireString(data, "artifactDigest", `pack.install ${pack.name}`);
  if (!/^[a-f0-9]{64}$/.test(artifactDigest)) throw new Error(`pack.install ${pack.name} returned an invalid artifactDigest`);
  if (artifactDigest !== pack.artifactDigest) {
    throw new Error(`pack.install artifact digest differs from the pinned corpus for ${pack.name}`);
  }

  const listArgs = cliArgs(bunExecutable, ["pack", "list", pack.name], storeRoot, cacheRoot);
  const listEnvelope = await runCliJson(processRunner, listArgs, root, timeoutMs, "pack.list");
  const listData = dataRecord(listEnvelope, `pack.list ${pack.name}`);
  if (!Array.isArray(listData.practices)) throw new Error(`pack.list ${pack.name} returned no practices`);
  const listedIds = listData.practices.map((practice) => {
    if (!isRecord(practice)) throw new Error(`pack.list ${pack.name} returned an invalid Practice`);
    return requireString(practice, "id", `pack.list ${pack.name}`);
  });
  const expectedIds = pack.practices.map((practice) => practice.id).sort();
  const actualIds = [...listedIds].sort();
  if (JSON.stringify(actualIds) !== JSON.stringify(expectedIds)) {
    throw new Error(`pack.list ${pack.name} does not match the pinned Practice inventory`);
  }

  return {
    name: pack.name,
    releaseVersion: pack.releaseVersion,
    sourceCommit,
    artifactDigest,
    practiceIds: actualIds,
  };
}

async function waitForIndexReady(
  processRunner: ProcessRunner,
  bunExecutable: string,
  root: string,
  storeRoot: string,
  cacheRoot: string,
  profileId: string,
  timeoutMs: number,
): Promise<number> {
  const deadline = Date.now() + timeoutMs;
  const buildArgs = cliArgs(bunExecutable, ["index", "build"], storeRoot, cacheRoot);
  const buildEnvelope = await runCliJson(processRunner, buildArgs, root, timeoutMs, "index.build");
  let data = normalizeIndexData(dataRecord(buildEnvelope, "index.build"));

  while (data.state !== "ready") {
    if (!["queued", "preparing", "building", "missing", "indexing", "stale"].includes(String(data.state))) {
      throw new Error(`index.build returned unexpected state ${String(data.state)}`);
    }
    const operationId = typeof data.operationId === "string" ? data.operationId : "unknown";
    if (Date.now() >= deadline) throw new Error(`semantic index did not become ready before timeout (operation ${operationId})`);
    await Bun.sleep(500);
    const statusArgs = cliArgs(bunExecutable, ["index", "status"], storeRoot, cacheRoot);
    const statusEnvelope = await runCliJson(processRunner, statusArgs, root, timeoutMs, "index.status");
    const status = normalizeIndexData(dataRecord(statusEnvelope, "index.status"));
    if (status.state === "ready") {
      data = status;
      break;
    }
    if (!["missing", "indexing", "stale"].includes(String(status.state))) {
      throw new Error(`semantic index entered unexpected state ${String(status.state)}`);
    }
    data = status;
  }

  if (data.profileId !== profileId) {
    throw new Error(`semantic index profile differs from the pinned corpus profile`);
  }
  const vectorCount = requireCount(data, "vectorCount", "semantic index");

  const statusArgs = cliArgs(bunExecutable, ["index", "status"], storeRoot, cacheRoot);
  const statusEnvelope = await runCliJson(processRunner, statusArgs, root, timeoutMs, "index.status");
  const status = dataRecord(statusEnvelope, "index.status");
  if (status.state !== "ready" || status.profileId !== profileId) {
    throw new Error("semantic index is not ready for the pinned corpus profile");
  }
  const statusVectorCount = requireCount(status, "vectorCount", "index.status");
  if (statusVectorCount !== vectorCount) throw new Error("semantic index vector count changed during preflight");
  return vectorCount;
}

export async function prepareCorpusStore(options: PrepareCorpusStoreOptions): Promise<PreparedCorpusStore> {
  if (!validateCorpusInventory(options.inventory)) throw new Error("Invalid pinned corpus inventory");
  if (!/^[a-f0-9]{64}$/.test(options.embeddingProfileId)) throw new Error("Invalid embedding Profile ID");
  if (!isAbsolute(options.storeRoot) || !isAbsolute(options.cacheRoot)) {
    throw new Error("Corpus storeRoot and cacheRoot must be absolute paths");
  }
  const timeoutMs = options.timeoutMs ?? DEFAULT_INDEX_TIMEOUT_MS;
  if (!Number.isInteger(timeoutMs) || timeoutMs <= 0) throw new TypeError("Corpus preparation timeout must be a positive integer");
  const processRunner = options.processRunner ?? defaultProcessRunner;
  const checkout = await verifyPinnedCleanCheckout(options.lorelumRoot, options.lorelumCommit, processRunner);
  const bunExecutable = options.bunExecutable ?? process.execPath;
  const storeRoot = resolve(options.storeRoot);
  const cacheRoot = resolve(options.cacheRoot);
  await mkdir(storeRoot, { recursive: true });
  await mkdir(cacheRoot, { recursive: true });

  const packArtifacts: PreparedCorpusStore["packArtifacts"] = [];
  for (const pack of options.inventory.packs) {
    packArtifacts.push(await installPack(
      processRunner,
      bunExecutable,
      checkout.root,
      storeRoot,
      cacheRoot,
      pack,
      timeoutMs,
    ));
  }
  const vectorCount = await waitForIndexReady(
    processRunner,
    bunExecutable,
    checkout.root,
    storeRoot,
    cacheRoot,
    options.embeddingProfileId,
    timeoutMs,
  );
  if (vectorCount !== options.inventory.practiceCount) {
    throw new Error(`semantic index vector count ${vectorCount} differs from corpus practice count ${options.inventory.practiceCount}`);
  }
  return {
    storeRoot,
    cacheRoot,
    corpusDigest: options.inventory.corpusDigest,
    embeddingProfileId: options.embeddingProfileId,
    vectorCount,
    packArtifacts,
  };
}
