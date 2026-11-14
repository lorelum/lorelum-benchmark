import { spawn } from "node:child_process";
import Ajv2020 from "ajv/dist/2020";
import { constants } from "node:fs";
import { copyFile, cp, lstat, mkdir, readFile, realpath, rm, rmdir, stat, writeFile } from "node:fs/promises";
import { randomInt, randomUUID } from "node:crypto";
import { arch, release, tmpdir } from "node:os";
import { basename, isAbsolute, join, relative, resolve, sep } from "node:path";
import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { fileURLToPath } from "node:url";
import { sha256File } from "../../../fs";
import { sha256SnapshotDirectory } from "../../v1/snapshot";
import { hashContract } from "../../v1/plan";
import { inspectCodingTask } from "../../v2/task";
import { evaluateSemantic } from "../../v2/evaluator";
import { prepareJudge, verifyJudgeEnvironment } from "./prepare-judge";
import { provisionLoreSupport } from "./lore-support";
import { observeRetrieval } from "./retrieval";
import { makeCandidateReadable } from "./candidate";
import { comparePair } from "./comparison";

const sha = (value: unknown): value is string => typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
const json = async (path: string) => JSON.parse(await readFile(path, "utf8"));
const writeJson = (path: string, value: unknown) => writeFile(path, `${JSON.stringify(value, null, 2)}\n`, { flag: "wx", mode: 0o600 });
const cleanEnv = () => Object.fromEntries(Object.entries(process.env).filter(([key]) => !/API_KEY|TOKEN|SECRET|PASSWORD|CREDENTIAL/i.test(key) && !/^GIT_/i.test(key) && key !== "NODE_OPTIONS" && key !== "NODE_PATH"));
const observationSchema = JSON.parse(await readFile(new URL("../../../../../schemas/judge-autonomous-pack-observation-v1.schema.json", import.meta.url), "utf8"));
const ajv = new Ajv2020({ allErrors: true, strict: true, strictRequired: false });
const validObservation = ajv.compile(observationSchema);
const caseSchema = JSON.parse(await readFile(new URL("../../../../../schemas/judge-autonomous-pack-case-v1.schema.json", import.meta.url), "utf8"));
const validCase = ajv.compile(caseSchema);
const planSchema = JSON.parse(await readFile(new URL("../../../../../schemas/judge-autonomous-pack-plan-v1.schema.json", import.meta.url), "utf8"));
const validPlan = ajv.compile(planSchema);
const summarySchema = JSON.parse(await readFile(new URL("../../../../../schemas/judge-autonomous-pack-summary-v1.schema.json", import.meta.url), "utf8"));
const validSummary = ajv.compile(summarySchema);
function assertObservation(value: unknown): void {
  if (!validObservation(value)) throw new Error(`Invalid Judge observation: ${JSON.stringify(validObservation.errors)}`);
}

async function run(file: string, args: string[], cwd: string, interactive = false, env = cleanEnv()): Promise<{ code: number | null; stdout: string }> {
  return await new Promise((ok, reject) => {
    const child = spawn(file, args, { cwd, env, stdio: interactive ? "inherit" : ["ignore", "pipe", "pipe"] });
    let output = "", errors = "";
    child.stdout?.on("data", chunk => { output += chunk; });
    child.stderr?.on("data", chunk => { errors += chunk; });
    child.once("error", reject);
    child.once("close", code => interactive || code === 0 ? ok({ code, stdout: output }) : reject(new Error(`${basename(file)} failed (exit ${code}): ${errors.slice(0, 2000)}`)));
  });
}

type Config = {
  judgeEnvironment: string; nodeBinary: string; nodeSha256: string; loreRelease: string;
  embeddingModel: string; packDirectory: string;
  emptyArchive: string; emptyMetadata: string; installedArchive: string; installedMetadata: string;
  outputDirectory: string; verifierImage: string; endpoint: string; provider: string; model: string;
};
type Metadata = { condition: string; pack_sha256: string; model_sha256: string; profile_id: string; encoding_id: string; index_sha256: string };

function metadata(value: unknown, condition: string): Metadata {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid index metadata");
  const item = value as Record<string, unknown>;
  if (Object.keys(item).sort().join() !== ["condition", "pack_sha256", "model_sha256", "profile_id", "encoding_id", "index_sha256"].sort().join() ||
      item.condition !== condition || [item.pack_sha256, item.model_sha256, item.profile_id, item.encoding_id, item.index_sha256].some(x => !sha(x))) throw new Error("Invalid index metadata");
  return item as Metadata;
}

async function git(root: string, ...args: string[]) {
  await run("git", ["-c", "core.hooksPath=/dev/null", "-c", "user.name=Benchmark", "-c", "user.email=benchmark@example.invalid", ...args], root,
    false, { ...cleanEnv(), GIT_CONFIG_NOSYSTEM: "1", GIT_CONFIG_GLOBAL: "/dev/null", GIT_TERMINAL_PROMPT: "0" });
}

/** Run the two user-operated sessions; no model is contacted before disclosure. */
export async function runPair(config: Config): Promise<void> {
  if (process.platform !== "linux" || !stdin.isTTY || !stdout.isTTY) throw new Error("Run this acceptance case in an interactive Linux terminal");
  for (const name of ["judgeEnvironment", "nodeBinary", "loreRelease", "embeddingModel", "packDirectory", "emptyArchive", "emptyMetadata", "installedArchive", "installedMetadata", "outputDirectory"] as const) {
    if (typeof config[name] !== "string" || !isAbsolute(config[name])) throw new Error(`${name} must be an absolute path`);
  }
  if (!sha(config.nodeSha256) || !/^sha256:[a-f0-9]{64}$/.test(config.verifierImage) || !config.provider || !config.model) throw new Error("Invalid runtime, model or verifier image identity");
  const endpoint = new URL(config.endpoint);
  if (!(["https:", "http:"].includes(endpoint.protocol)) || endpoint.username || endpoint.password || endpoint.search || endpoint.hash ||
      (endpoint.protocol === "http:" && !["127.0.0.1", "[::1]", "localhost"].includes(endpoint.hostname))) {
    throw new Error("Model endpoint must use HTTPS, or HTTP on loopback, and must not contain credentials, query or fragment");
  }
  const environmentRoot = await realpath(config.judgeEnvironment);
  const environment = await verifyJudgeEnvironment(environmentRoot);
  const root = fileURLToPath(new URL("../../../../../", import.meta.url));
  const casePath = join(root, "incubator/judge-autonomous-pack/config-migration/v1/case.json");
  const caseDefinition = await json(casePath);
  if (!validCase(caseDefinition) || caseDefinition.id !== "judge-config-migration-v1" ||
      caseDefinition.task !== "incubator/autonomous-pack/config-migration-v2" || environment.source?.commit !== caseDefinition.judge_commit) throw new Error("Unexpected Judge case or environment identity");
  const [empty, installed, nodeHash, modelHash, packHash] = await Promise.all([
    json(config.emptyMetadata).then(value => metadata(value, "empty-store")), json(config.installedMetadata).then(value => metadata(value, "pack-installed")),
    sha256File(config.nodeBinary), sha256File(config.embeddingModel), sha256SnapshotDirectory(config.packDirectory),
  ]);
  if (nodeHash !== config.nodeSha256 || [empty, installed].some(item => item.model_sha256 !== modelHash || item.pack_sha256 !== packHash) ||
      empty.profile_id !== installed.profile_id || empty.encoding_id !== installed.encoding_id ||
      await sha256File(config.emptyArchive) !== empty.index_sha256 || await sha256File(config.installedArchive) !== installed.index_sha256) throw new Error("Frozen Pack, index or runtime identity mismatch");
  const version = await run(config.nodeBinary, ["-p", "JSON.stringify({node:process.versions.node,bun:process.versions.bun||null})"], environmentRoot);
  const node = JSON.parse(version.stdout);
  if (typeof node.node !== "string" || !node.node.startsWith(`${caseDefinition.node_major}.`) || node.bun !== null) throw new Error("The task requires genuine Node.js 22");
  const runtime = { platform: process.platform, architecture: arch(), kernel: release(), nodeVersion: node.node, nodeSha256: nodeHash, bubblewrap: (await run("bwrap", ["--version"], environmentRoot)).stdout.trim() };
  const taskPath = join(root, caseDefinition.task);
  const task = await inspectCodingTask(taskPath);
  const output = join(await realpath(join(resolve(config.outputDirectory), "..")), basename(resolve(config.outputDirectory)));
  const within = (a: string, b: string) => { const part = relative(a, b); return part === "" || (!part.startsWith(`..${sep}`) && part !== ".." && !isAbsolute(part)); };
  for (const input of [environmentRoot, await realpath(config.packDirectory), await realpath(taskPath)]) {
    if (within(input, output) || within(output, input)) throw new Error("Output must not overlap Judge, Pack or task inputs");
  }
  await mkdir(output, { mode: 0o700 });
  const outputStat = await stat(output);
  if (outputStat.uid !== process.getuid?.() || (outputStat.mode & 0o077) !== 0) {
    await rmdir(output);
    throw new Error("Output must be on a filesystem supporting a private owner-only directory; use the Linux filesystem rather than a Windows mount");
  }
  const rl = createInterface({ input: stdin, output: stdout });
  let requestNote: string;
  try { requestNote = await rl.question("两组共用的用户补充请求（留空表示无）： "); } finally { rl.close(); }
  const order = randomInt(2) === 0 ? ["empty-store", "pack-installed"] : ["pack-installed", "empty-store"];
  const adapterFiles = ["cli.ts", "terminal.mjs", "prepare-judge.ts", "lore-support.ts", "candidate.ts", "retrieval.ts", "comparison.ts", "../../v2/task.ts", "../../v2/evaluator.ts", "../../v2/evaluation-session.ts", "../../v2/json.ts", "../../v1/evaluator.ts", "../../v1/plan.ts", "../../v1/snapshot.ts", "../../v1/index-archive.ts", "../../../fs.ts"];
  const adapterSha256 = hashContract(Object.fromEntries(await Promise.all(adapterFiles.map(async name => [name, await sha256File(fileURLToPath(new URL(`./${name}`, import.meta.url)))]))));
  const plan = { schema: "judge-autonomous-pack-plan/v1", adapterSha256, caseSha256: await sha256File(casePath), task: task.declaration.id, taskIdentities: task.identities, judgeEnvironmentSha256: await sha256File(join(environmentRoot, "judge-environment.json")), judgeCommit: environment.source.commit, terminalSha256: await sha256File(fileURLToPath(new URL("./terminal.mjs", import.meta.url))), loreSupportSha256: await sha256File(fileURLToPath(new URL("./lore-support.ts", import.meta.url))), runtime, loreReleaseSha256: await sha256File(config.loreRelease), model: { provider: config.provider, name: config.model, endpoint: endpoint.toString() }, embedding: { modelSha256: modelHash, profile: empty.profile_id, encoding: empty.encoding_id }, packSha256: packHash, indexes: { empty: empty.index_sha256, installed: installed.index_sha256, emptyMetadata: await sha256File(config.emptyMetadata), installedMetadata: await sha256File(config.installedMetadata) }, verifierImage: config.verifierImage, order, budget: caseDefinition.budget };
  if (plan.loreReleaseSha256 !== caseDefinition.lore_release_sha256) throw new Error("Unexpected Lore release identity");
  if (!validPlan(plan)) throw new Error(`Invalid Judge plan: ${JSON.stringify(validPlan.errors)}`);
  const runtimeIdentity = `sha256:${hashContract({ runtime: plan.runtime, judgeEnvironmentSha256: plan.judgeEnvironmentSha256, loreReleaseSha256: plan.loreReleaseSha256, terminalSha256: plan.terminalSha256, loreSupportSha256: plan.loreSupportSha256 })}`;
  await writeJson(join(output, "plan.json"), plan);
  const results: Record<string, unknown>[] = [];
  const comparisonRuns: Parameters<typeof comparePair>[0] = [];
  const terminal = join(environmentRoot, `benchmark-terminal-${randomUUID()}.mjs`);
  await copyFile(fileURLToPath(new URL("./terminal.mjs", import.meta.url)), terminal, constants.COPYFILE_EXCL);
  let interrupted = false, failure: unknown, deliveryAbort: AbortController | undefined;
  const interrupt = () => { interrupted = true; deliveryAbort?.abort(); };
  process.on("SIGINT", interrupt);
  try {
    for (const [ordinal, condition] of order.entries()) {
      const started = performance.now();
      stdout.write(`\n=== 第 ${ordinal + 1} 组：${condition} ===\n`);
      const runRoot = join(output, `run-${ordinal + 1}`), workspace = join(runRoot, "input");
      await mkdir(runRoot, { mode: 0o700 });
      await mkdir(workspace, { mode: 0o700 });
      await cp(join(task.publicRoot, "starter"), workspace, { recursive: true });
      await git(workspace, "init", "-q"); await git(workspace, "add", "."); await git(workspace, "commit", "-q", "--no-verify", "-m", "public starter");
      const installedCondition = condition === "pack-installed", meta = installedCondition ? installed : empty;
      const lore = await provisionLoreSupport({ indexArchive: installedCondition ? config.installedArchive : config.emptyArchive, indexSha256: meta.index_sha256, modelFile: config.embeddingModel, modelSha256: modelHash, releaseArchive: config.loreRelease, destination: join(workspace, "support") });
      await copyFile(config.nodeBinary, join(workspace, "support", "node"), constants.COPYFILE_EXCL);
      if (await sha256File(join(workspace, "support", "node")) !== nodeHash) throw new Error("Node runtime copy identity mismatch");
      const commands = [lore.command, { executable: "/work/support/node", args: ["--check", "src/cli.js"], cwd: "." }, { executable: "/work/support/node", args: ["--check", "src/migrate.js"], cwd: "." }];
      const paths = ["src/cli.js", "src/migrate.js", lore.requestPath];
      const sources = [{ id: "tools", kind: "reference", locator: "benchmark:tools", version: "1", status: "available", content: "Starter files are src/cli.js and src/migrate.js. To use Lore voluntarily, read support/request.txt for its current identity, write two lines: query or get, then the query text or exact Practice ID; execute command 0 and inspect its real JSON output. Commands 1 and 2 only check JavaScript syntax. No query or Practice is preselected. The user may authorize additional src/ files; the exact authorized paths are included with execution actions. Commands have no persistent writable directories." }];
      const terminalConfig = { taskFile: join(task.publicRoot, "task.md"), taskId: task.declaration.id, requestNote, workspace, sources, endpoint: config.endpoint, provider: config.provider, model: config.model, modelTimeoutMs: 180000, commands, readPaths: paths, writePaths: paths, writablePaths: [], environmentIdentity: runtimeIdentity, ...plan.budget, checkOutputBytes: 32768, resultFile: join(runRoot, "judge-result.json") };
      const terminalConfigPath = join(runRoot, "terminal-config.json");
      await writeJson(terminalConfigPath, terminalConfig);
      const env = cleanEnv();
      if (process.env.BENCHMARK_JUDGE_API_KEY) env.BENCHMARK_JUDGE_API_KEY = process.env.BENCHMARK_JUDGE_API_KEY;
      const child = await run(config.nodeBinary, [terminal, terminalConfigPath], environmentRoot, true, env);
      let judge: any;
      try { judge = await json(terminalConfig.resultFile); }
      catch { judge = { status: "failed", error: `Terminal process exited ${child.code} without a result` }; await writeJson(terminalConfig.resultFile, judge); }
      const verifiedIdentity = typeof judge.verifiedCandidateIdentity === "string" && /^sha256:[a-f0-9]{64}$/.test(judge.verifiedCandidateIdentity) && judge.verifiedCandidateIdentity === judge.result?.evidence?.candidateIdentity ? judge.verifiedCandidateIdentity : null;
      if (judge.status === "completed" && !verifiedIdentity) judge = { ...judge, status: "failed", error: "Stopped candidate identity was not verified against Judge evidence" };
      let semantic: unknown = { health: "indeterminate", semantic: "not-run", quality: "not-run", failure_reasons: ["Judge did not produce a completed candidate"] };
      let candidateSha256: string | null = null, delivery: "approved" | "declined" | "not-requested" = "not-requested";
      if (typeof judge.result?.workspaceRoot === "string") {
        const source = await realpath(judge.result.workspaceRoot);
        try {
          if (judge.status === "completed") {
            const target = join(runRoot, "candidate");
            await cp(source, target, { recursive: true, filter: path => { const part = relative(source, path); return part !== "support" && !part.startsWith(`support${sep}`); } });
            candidateSha256 = await sha256SnapshotDirectory(target);
            await makeCandidateReadable(target);
            if (await sha256SnapshotDirectory(target) !== candidateSha256) throw new Error("Candidate changed while preparing independent verification");
            const evaluationRoot = join(runRoot, "evaluation");
            const evaluated = await evaluateSemantic({ workspace: target, evaluatorRoot: task.evaluatorRoot, evaluatorSha256: task.identities.evaluator_sha256, imageId: config.verifierImage, outputDirectory: evaluationRoot });
            semantic = evaluated;
            if (!evaluated.failure_reasons.some(reason => reason.startsWith("container cleanup could not be verified:"))) {
              const privateSnapshot = join(evaluationRoot, "verifier-snapshot");
              let exists = false;
              try { const info = await lstat(privateSnapshot); if (!info.isDirectory() || info.isSymbolicLink()) throw new Error("Unexpected verifier snapshot"); exists = true; }
              catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
              if (exists) { await makeCandidateReadable(privateSnapshot); await rm(privateSnapshot, { recursive: true }); }
            }
            stdout.write(`\nBenchmark 独立验收：\n${JSON.stringify(semantic, null, 2)}\n`);
            const deliveryPrompt = createInterface({ input: stdin, output: stdout });
            deliveryAbort = new AbortController();
            deliveryPrompt.on("SIGINT", interrupt);
            try {
              const answer = await deliveryPrompt.question(`允许保留候选副本 ${target} 供人工查看（不写回原项目）？输入 yes： `, { signal: deliveryAbort.signal });
              delivery = answer.trim() === "yes" ? "approved" : "declined";
            } catch (error) {
              if (!interrupted) throw error;
              delivery = "declined";
            } finally {
              deliveryPrompt.close();
              deliveryAbort = undefined;
              if (delivery !== "approved") await rm(target, { recursive: true, force: true });
            }
          }
        } finally {
          const temp = await realpath(tmpdir()), part = relative(temp, source);
          if (part.startsWith("lorelum-workflow-") && !part.includes(sep)) await rm(source, { recursive: true, force: true });
        }
      }
      const observation = { schema: "judge-autonomous-pack-observation/v1", ordinal, condition, judgeStatus: judge.status, decisionSource: "terminal-input-unverified", judgeCandidateIdentity: verifiedIdentity, candidateSha256, delivery, semantic, retrieval: { coverage: "indeterminate", reason: "Commands can read the whole candidate copy; complete Lore access is not observable.", events: observeRetrieval(judge.actions, judge.result?.observations) }, quality: "not-run", costUsd: null, modelUsage: judge.modelUsage ?? null, elapsedMs: Math.ceil(performance.now() - started) };
      assertObservation(observation);
      await writeJson(join(runRoot, "observation.json"), observation);
      stdout.write(`\nBenchmark 独立验收与观察：\n${JSON.stringify(observation, null, 2)}\n`);
      results.push(observation);
      comparisonRuns.push({
        judgeStatus: judge.status,
        semantic: semantic as { health: string; semantic: string },
        adjustments: (judge.decisions ?? []).filter((item: any) => item.stage === "plan-revision").map((item: any) => item.instructions),
        checks: (judge.result?.evidence?.checks ?? []).map((item: any) => ({ executable: item.executable, args: item.args, cwd: item.cwd })),
        readPaths: judge.result?.records?.authorization?.readPaths ?? [],
        writePaths: judge.result?.records?.authorization?.writePaths ?? [],
      });
      if (interrupted || judge.status === "cancelled") break;
    }
  } catch (error) { failure = error; }
  finally { process.removeListener("SIGINT", interrupt); await rm(terminal, { force: true }); }
  for (let ordinal = results.length; ordinal < order.length; ordinal++) {
    const missing = { schema: "judge-autonomous-pack-observation/v1", ordinal, condition: order[ordinal], judgeStatus: "not-run", reason: interrupted ? "interrupted" : "prior run failed" };
    assertObservation(missing);
    results.push(missing);
  }
  const comparison = comparePair(comparisonRuns);
  const summary = { schema: "judge-autonomous-pack-summary/v1", results, comparison, interpretation: "Single-pair diagnostic; no causal Pack or general Judge-quality conclusion." };
  if (!validSummary(summary)) throw new Error(`Invalid Judge summary: ${JSON.stringify(validSummary.errors)}`);
  await writeJson(join(output, "summary.json"), summary);
  stdout.write(`\n配对可比性：\n${JSON.stringify(comparison, null, 2)}\n`);
  if (failure) throw failure;
}

const args = Bun.argv.slice(2);
if (import.meta.main) {
  try {
    if (args[0] === "prepare-judge" && args.length === 4) console.log(JSON.stringify(await prepareJudge({ repository: args[1]!, commit: args[2]!, destination: args[3]! }), null, 2));
    else if (args[0] === "run" && args.length === 2) await runPair(await json(resolve(args[1]!)));
    else throw new Error("Usage: bun --no-env-file src/benchmark/autonomous-pack/judge/v1/cli.ts prepare-judge <repository> <commit> <destination> | run <config.json>");
  } catch (error) { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1; }
}
