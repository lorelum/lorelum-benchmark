import { isAbsolute, join, relative, resolve } from "node:path";
import { sha256File, sha256Text } from "../../../fs";
import { parseLoreGetResponse, parseLoreQueryResponse, expectedPackCommit, expectedPackRef, expectedPackVersion, expectedPracticeId, expectedRepository } from "./contract";
import type { LoreGetData, LoreQueryData, PackPracticeManifest, SelectionRecord } from "./types";

export type LoreCommandResult = { exitCode: number; stdout: string; stderr: string };
export type LoreCommandRunner = (args: string[]) => Promise<LoreCommandResult>;

export class LorePreparationError extends Error {
  readonly kind: "failed" | "indeterminate";
  constructor(kind: "failed" | "indeterminate", message: string) {
    super(message);
    this.name = "LorePreparationError";
    this.kind = kind;
  }
}

function fail(kind: "failed" | "indeterminate", message: string): never {
  throw new LorePreparationError(kind, message);
}

function unwrap(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail("failed", "Lore response must be an object");
  const record = value as Record<string, unknown>;
  if (record.ok === true && record.data && typeof record.data === "object" && !Array.isArray(record.data)) return record.data as Record<string, unknown>;
  return record;
}

function parseJson(stdout: string, label: string): unknown {
  try {
    return JSON.parse(stdout) as unknown;
  } catch (error) {
    fail("failed", `${label} did not return JSON: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function stableJson(value: unknown): string {
  return JSON.stringify(value);
}

function commandName(args: string[]): string {
  return `lore ${args.join(" ")}`;
}

export async function defaultLoreCommandRunner(args: string[]): Promise<LoreCommandResult> {
  const child = Bun.spawn(["lore", ...args], { stdout: "pipe", stderr: "pipe" });
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited
  ]);
  return { exitCode, stdout, stderr };
}

async function runChecked(runner: LoreCommandRunner, args: string[], label: string): Promise<LoreCommandResult> {
  const result = await runner(args);
  if (result.exitCode !== 0) {
    const message = `${label} failed with exit ${result.exitCode}: ${(result.stderr || result.stdout).trim()}`;
    if (result.exitCode === 1 && /preparing|index-not-ready|embedding|semantic/i.test(message)) fail("indeterminate", message);
    fail("failed", message);
  }
  return result;
}

function packInstallData(stdout: string, manifest: PackPracticeManifest): void {
  const data = unwrap(parseJson(stdout, "lore pack install response"));
  const pack = data.pack;
  if (!pack || typeof pack !== "object" || Array.isArray(pack)) fail("failed", "pack install response is missing pack metadata");
  const packRecord = pack as Record<string, unknown>;
  if (packRecord.name !== "agentic-coding" || packRecord.version !== manifest.pack.version) fail("failed", "pack install response does not match agentic-coding@0.4.0");
}

function sourceFilePath(get: LoreGetData): string {
  const source = get.sources[0];
  if (!source?.packRoot) fail("failed", "lore get source is missing packRoot during preparation");
  const root = resolve(source.packRoot);
  const path = resolve(root, source.sourcePath);
  const fromRoot = relative(root, path);
  if (fromRoot === "" || fromRoot === ".." || fromRoot.startsWith(`..${"/"}`) || fromRoot.startsWith(`..${"\\"}`) || isAbsolute(fromRoot)) fail("failed", "lore get source path escapes packRoot");
  return path;
}

export type PreparedLoreSelection = {
  selection: SelectionRecord;
  query: LoreQueryData;
  get: LoreGetData;
  source_path: string;
};

export async function preparePackPractice(options: {
  manifest: PackPracticeManifest;
  storeRoot: string;
  queryText: string;
  commandRunner?: LoreCommandRunner;
  sourceHashResolver?: (get: LoreGetData) => Promise<string>;
  loreCliVersion?: string;
}): Promise<PreparedLoreSelection> {
  const runner = options.commandRunner ?? defaultLoreCommandRunner;
  const { manifest, storeRoot, queryText } = options;
  if (manifest.pack.repository !== expectedRepository || manifest.pack.ref !== expectedPackRef || manifest.pack.version !== expectedPackVersion || manifest.pack.commit !== expectedPackCommit) fail("failed", "manifest Pack identity is not the fixed agentic-coding@0.4.0 release");
  if (manifest.practice.id !== expectedPracticeId) fail("failed", "manifest Practice ID is not the selected Practice");
  const querySha = await sha256Text(queryText);
  if (querySha !== manifest.selection.query_sha256) fail("failed", "query text hash does not match treatment manifest");

  const installArgs = ["--store-root", storeRoot, "pack", "install", "agentic-coding@0.4.0", "--registry", "lorelum/lorelum-packs"];
  const queryArgs = ["--store-root", storeRoot, "query", queryText, "--mode", "semantic", "--top-k", "5"];
  const getArgs = ["--store-root", storeRoot, "get", expectedPracticeId];
  const install = await runChecked(runner, installArgs, "lore pack install");
  packInstallData(install.stdout, manifest);
  const queryResult = await runChecked(runner, queryArgs, "lore query");
  const query = parseLoreQueryResponse(parseJson(queryResult.stdout, "lore query response"));
  const selectedRank = query.results.findIndex((result) => result.practiceId === expectedPracticeId) + 1;
  if (selectedRank === 0) fail("indeterminate", `query results do not contain ${expectedPracticeId}`);
  if (selectedRank !== manifest.selection.result_rank) fail("failed", `query result rank drifted: expected ${manifest.selection.result_rank}, got ${selectedRank}`);
  const selected = query.results[selectedRank - 1];
  if (selected?.contentDigest !== manifest.practice.content_digest) fail("failed", "query contentDigest does not match treatment manifest");

  const getResult = await runChecked(runner, getArgs, "lore get");
  const get = parseLoreGetResponse(parseJson(getResult.stdout, "lore get response"));
  const source = get.sources[0];
  if (!source || source.packName !== "agentic-coding" || source.sourcePath !== manifest.practice.source_path) fail("failed", "lore get source does not match treatment manifest");
  if (get.contentDigest !== manifest.practice.content_digest) fail("failed", "lore get contentDigest does not match treatment manifest");
  if (get.practice.applies_when !== "coding has revealed an unplanned dependency, public behavior, stored state, I/O path, risk, or verification need that changes the accepted scope, and the agent is about to continue under the old plan") fail("failed", "lore get applies_when does not match applicability contract");
  if ((await sha256Text(get.practice.body)) !== manifest.practice.card_sha256) fail("failed", "lore get body hash does not match treatment manifest");
  const sourceSha = options.sourceHashResolver ? await options.sourceHashResolver(get) : await sha256File(sourceFilePath(get));
  if (sourceSha !== manifest.practice.source_sha256) fail("failed", "Pack source file hash does not match treatment manifest");

  const selection: SelectionRecord = {
    schema_version: "pack-practice-selection/v1",
    captured_from: "lore-cli",
    lore_cli_version: options.loreCliVersion ?? "recorded-by-caller",
    commands: { install: installArgs, query: queryArgs, get: getArgs },
    pack: manifest.pack,
    query: {
      text: queryText,
      mode: "semantic",
      top_k: 5,
      query_sha256: querySha,
      response_sha256: await sha256Text(stableJson(query)),
      selected_practice_id: expectedPracticeId,
      selected_rank: selectedRank,
      results: query.results
    },
    get: {
      practice_id: get.practice.id,
      content_digest: get.contentDigest,
      response_sha256: await sha256Text(stableJson(get)),
      source: { pack_name: source.packName, source_path: source.sourcePath },
      source_sha256: sourceSha,
      card_sha256: await sha256Text(get.practice.body)
    }
  };
  return { selection, query, get, source_path: source.sourcePath };
}

export async function writeSelectionRecord(path: string, selection: SelectionRecord): Promise<void> {
  await Bun.write(path, `${JSON.stringify(selection, null, 2)}\n`);
}

export function prepareCommandForDisplay(options: { storeRoot: string; queryText: string }): string[] {
  return [
    commandName(["--store-root", options.storeRoot, "pack", "install", "agentic-coding@0.4.0", "--registry", "lorelum/lorelum-packs"]),
    commandName(["--store-root", options.storeRoot, "query", options.queryText, "--mode", "semantic", "--top-k", "5"]),
    commandName(["--store-root", options.storeRoot, "get", expectedPracticeId])
  ];
}

export async function writePreparedTreatment(root: string, prepared: PreparedLoreSelection): Promise<void> {
  const manifestPath = join(root, "treatment.yaml");
  const manifest = Bun.YAML.parse(await Bun.file(manifestPath).text()) as Record<string, unknown>;
  const practice = manifest.practice as Record<string, unknown>;
  const selection = manifest.selection as Record<string, unknown>;
  if (typeof practice?.body_path !== "string" || typeof selection?.path !== "string") throw new Error("Treatment manifest must declare private body and selection paths");
  const bodyPath = resolve(root, practice.body_path);
  const selectionPath = resolve(root, selection.path);
  const fromRoot = relative(resolve(root), bodyPath);
  if (fromRoot.startsWith("..") || isAbsolute(fromRoot)) throw new Error("Prepared body path escapes treatment root");
  await Bun.write(bodyPath, prepared.get.practice.body);
  await Bun.write(selectionPath, `${JSON.stringify(prepared.selection, null, 2)}\n`);
}

function argumentValue(args: string[], name: string): string {
  const index = args.indexOf(name);
  const value = index === -1 ? undefined : args[index + 1];
  if (!value || value.startsWith("--")) throw new Error(`Missing ${name}`);
  return value;
}

async function main(): Promise<void> {
  const args = Bun.argv.slice(2);
  const treatmentRoot = resolve(argumentValue(args, "--treatment-root"));
  const storeRoot = argumentValue(args, "--store-root");
  const queryFile = resolve(argumentValue(args, "--query-file"));
  const queryText = await Bun.file(queryFile).text();
  const manifest = Bun.YAML.parse(await Bun.file(join(treatmentRoot, "treatment.yaml")).text()) as PackPracticeManifest;
  const prepared = await preparePackPractice({ manifest, storeRoot, queryText, loreCliVersion: args.includes("--lore-cli-version") ? argumentValue(args, "--lore-cli-version") : undefined });
  await writePreparedTreatment(treatmentRoot, prepared);
  process.stdout.write(JSON.stringify({ status: "prepared", treatment_id: manifest.id, practice_id: manifest.practice.id, card_sha256: manifest.practice.card_sha256 }, null, 2) + "\n");
}

if (import.meta.main) {
  await main();
}
