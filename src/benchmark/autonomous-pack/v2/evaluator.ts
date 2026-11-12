import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { randomUUID } from "node:crypto";
import { chmod, cp, lstat, mkdir, readFile, readdir, realpath, writeFile } from "node:fs/promises";
import { isAbsolute, join, relative, sep, posix } from "node:path";
import { sha256SnapshotDirectory } from "../v1/snapshot";
import { evaluatorEnvironment } from "../v1/evaluator";
import type { SemanticEvaluation, SemanticEvaluationOptions } from "../v1/evaluator";
import { isRecord as object } from "./json";
import { runEvaluationSession } from "./evaluation-session";

export type { SemanticEvaluation, SemanticEvaluationOptions } from "../v1/evaluator";

type Contract = { schema_version: "coding-verifier/v1"; driver: [string, string]; candidate: [string, string]; timeout_ms: number };
const MAX_LINE = 1_000_000;
const MAX_TOTAL = 8_000_000;
const failure = (reason: string, health: SemanticEvaluation["health"] = "execution-failed"): SemanticEvaluation => ({ health, semantic: "not-run", quality: "not-run", quality_probes: [], failure_reasons: [reason] });
const inside = (parent: string, child: string) => { const r = relative(parent, child); return r === "" || (r !== ".." && !r.startsWith(`..${sep}`) && !isAbsolute(r)); };
const keys = (v: Record<string, unknown>, names: string[]) => Object.keys(v).sort().join("\0") === [...names].sort().join("\0");

/** Contract paths are container paths, never host commands or shell fragments. */
export function parseVerifierContract(value: unknown): Contract {
  if (!object(value) || !keys(value, ["schema_version", "driver", "candidate", "timeout_ms"]) || value.schema_version !== "coding-verifier/v1" || typeof value.timeout_ms !== "number" || !Number.isSafeInteger(value.timeout_ms) || value.timeout_ms < 1 || value.timeout_ms > 300_000) throw new Error("invalid verifier contract");
  const validCommand = (v: unknown, root: string) => Array.isArray(v) && v.length === 2 && v.every(x => typeof x === "string" && !x.includes("\0") && posix.isAbsolute(x) && posix.normalize(x) === x) && v[1].startsWith(root + "/");
  if (!validCommand(value.driver, "/verifier") || !validCommand(value.candidate, "/workspace")) throw new Error("invalid verifier contract");
  return value as unknown as Contract;
}

/** Reject aliases that could expose private bytes through the candidate tree. */
async function rejectHardLinks(root: string): Promise<void> {
  for (const entry of await readdir(root, { withFileTypes: true })) {
    const path = join(root, entry.name);
    const info = await lstat(path);
    if (info.isDirectory()) await rejectHardLinks(path);
    else if (!info.isFile() || info.nlink !== 1) throw new Error("invalid input files");
  }
}

async function makeContainerReadable(root: string): Promise<void> {
  for (const entry of await readdir(root, { withFileTypes: true })) {
    const path = join(root, entry.name);
    if (entry.isDirectory()) await makeContainerReadable(path);
    else if (entry.isFile()) await chmod(path, 0o444);
    else throw new Error("invalid input files");
  }
  await chmod(root, 0o555);
}

async function docker(args: string[], env: NodeJS.ProcessEnv, timeoutMs = 15_000): Promise<{ code: number | null; stdout: string; stderr: string; failed: boolean }> {
  const { promise, resolve } = Promise.withResolvers<{ code: number | null; stdout: string; stderr: string; failed: boolean }>();
    let stdout = "", stderr = "", failed = false, done = false;
    const child = spawn("docker", args, { env, stdio: ["ignore", "pipe", "pipe"], windowsHide: true });
    const timer = setTimeout(() => { failed = true; child.kill(); }, timeoutMs);
    const collect = (chunk: Buffer, which: "stdout" | "stderr") => {
      if (stdout.length + stderr.length + chunk.length > 100_000) { failed = true; child.kill(); return; }
      if (which === "stdout") stdout += chunk.toString(); else stderr += chunk.toString();
    };
    child.stdout.on("data", c => collect(c, "stdout")); child.stderr.on("data", c => collect(c, "stderr"));
    child.on("error", () => { failed = true; });
    child.on("close", code => { if (done) return; done = true; clearTimeout(timer); resolve({ code, stdout, stderr, failed }); });
  return promise;
}

/** Only this protocol and the final semantic verdict cross the trust boundary. */
async function broker(driver: ChildProcessWithoutNullStreams, candidate: ChildProcessWithoutNullStreams, timeoutMs: number): Promise<SemanticEvaluation> {
  const { promise, resolve } = Promise.withResolvers<SemanticEvaluation>();
    let finished = false, driverComplete = false, pending: string | undefined, verdict: "pass" | "fail" | undefined, total = 0;
    const ids = new Set<string>();
    const queue: { id: string; input: unknown }[] = [];
    const finish = (result: SemanticEvaluation) => { if (finished) return; finished = true; clearTimeout(timer); resolve(result); };
    const bad = () => finish(failure("verifier communication or execution failed", "indeterminate"));
    const timer = setTimeout(() => finish(failure("verifier deadline exceeded", "indeterminate")), timeoutMs);
    for (const child of [driver, candidate]) {
      child.on("error", bad); child.stdin.on("error", bad);
      child.stderr.on("data", (chunk: Buffer) => { total += chunk.length; if (total > MAX_TOTAL) bad(); });
    }
    const send = (stream: typeof driver.stdin, value: unknown) => {
      const line = JSON.stringify(value) + "\n";
      if (Buffer.byteLength(line) > MAX_LINE) { bad(); return; }
      stream.write(line, error => { if (error) bad(); });
    };
    const dispatch = () => {
      if (pending !== undefined || queue.length === 0) return;
      const next = queue.shift()!;
      pending = next.id;
      send(candidate.stdin, next.input);
    };
    const receive = (stream: typeof driver.stdout, handle: (v: unknown) => void) => {
      let buffer = Buffer.alloc(0);
      stream.on("data", (chunk: Buffer) => {
        if (finished) return;
        total += chunk.length;
        if (total > MAX_TOTAL) { bad(); return; }
        buffer = Buffer.concat([buffer, chunk]);
        for (;;) {
          const end = buffer.indexOf(10);
          if (end < 0) { if (buffer.length > MAX_LINE) bad(); break; }
          if (end > MAX_LINE) { bad(); return; }
          const line = buffer.subarray(0, end); buffer = buffer.subarray(end + 1);
          try { handle(JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(line))); } catch { bad(); }
          if (finished) return;
        }
      });
      stream.on("end", () => { if (buffer.length) bad(); });
      stream.on("error", bad);
    };
    receive(driver.stdout, v => {
      if (!object(v) || verdict !== undefined) return bad();
      if (v.type === "call" && keys(v, ["type", "id", "input"]) && typeof v.id === "string" && v.id.length > 0 && v.id.length <= 256 && !ids.has(v.id)) {
        ids.add(v.id); queue.push({ id: v.id, input: v.input }); dispatch(); return;
      }
      if (v.type === "result" && keys(v, ["type", "semantic"]) && (v.semantic === "pass" || v.semantic === "fail") && ids.size > 0 && pending === undefined && queue.length === 0) { verdict = v.semantic; return; }
      bad();
    });
    receive(candidate.stdout, v => {
      if (pending === undefined || verdict !== undefined) return bad();
      const id = pending; pending = undefined; send(driver.stdin, { type: "reply", id, output: v }); dispatch();
    });
    candidate.on("close", code => {
      if (finished) return;
      if (!driverComplete || code !== 0 || verdict === undefined) return bad();
      finish({ health: "evaluated", semantic: verdict, quality: "not-run", quality_probes: [], failure_reasons: [] });
    });
    driver.on("close", code => {
      if (finished) return;
      if (code !== 0 || verdict === undefined || pending !== undefined || queue.length !== 0) return bad();
      driverComplete = true;
      candidate.stdin.end();
    });
  return promise;
}

/**
 * Trusted: local Docker daemon/kernel, selected image, host, and frozen driver. The
 * candidate and driver have disjoint read-only mounts and no network or socket.
 * The driver can observe candidate replies, and only its verdict is returned;
 * private stdout/stderr and test details are never returned or recorded. Callers
 * must stop all writers to both trees and protect them for the entire evaluation.
 * The image must not contain private evaluator files or Docker socket mounts.
 */
export async function evaluateSemantic(options: SemanticEvaluationOptions): Promise<SemanticEvaluation> {
  let output: string | undefined;
  let result: SemanticEvaluation;
  try {
    const { workspace, evaluatorRoot, evaluatorSha256, imageId, outputDirectory } = options;
    const timeoutMs = options.timeoutMs ?? 300_000;
    if (![workspace, evaluatorRoot, outputDirectory].every(isAbsolute) || !/^[a-f0-9]{64}$/.test(evaluatorSha256) || !/^sha256:[a-f0-9]{64}$/.test(imageId) || !Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 300_000) throw new Error("invalid evaluator inputs");
    for (const root of [workspace, evaluatorRoot]) { const stat = await lstat(root); if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error("invalid input root"); }
    const work = await realpath(workspace), evaluator = await realpath(evaluatorRoot);
    const parent = await realpath(join(outputDirectory, ".."));
    const out = join(parent, relative(join(outputDirectory, ".."), outputDirectory));
    if ([work, evaluator, out].some(x => x.includes(",")) || inside(work, evaluator) || inside(evaluator, work) || inside(work, out) || inside(evaluator, out) || inside(out, work) || inside(out, evaluator)) throw new Error("invalid input isolation");
    await rejectHardLinks(work);
    await rejectHardLinks(evaluator);
    const workHash = await sha256SnapshotDirectory(work);
    if (await sha256SnapshotDirectory(evaluator) !== evaluatorSha256) throw new Error("evaluator digest mismatch");
    await mkdir(out, { mode: 0o700 }); output = out;
    const privateCopy = join(out, "verifier-snapshot");
    await cp(evaluator, privateCopy, { recursive: true, errorOnExist: true, force: false });
    await makeContainerReadable(privateCopy);
    if (await sha256SnapshotDirectory(privateCopy) !== evaluatorSha256 || await sha256SnapshotDirectory(evaluator) !== evaluatorSha256) throw new Error("evaluator digest mismatch");
    const contractPath = join(privateCopy, "contract.json");
    if ((await lstat(contractPath)).size > 64_000) throw new Error("invalid verifier contract");
    const contract = parseVerifierContract(JSON.parse(await readFile(contractPath, "utf8")));
    const env = evaluatorEnvironment(process.env, out);
    const inspect = await docker(["image", "inspect", "--format", "{{.Id}}", imageId], env);
    if (inspect.failed || inspect.code !== 0 || inspect.stdout.trim() !== imageId) throw new Error("verified local image unavailable");
    const names: [string, string] = [`lorelum-verifier-${randomUUID()}`, `lorelum-candidate-${randomUUID()}`];
    const createArgs = (name: string, source: string, target: string, cmd: [string, string]) => [
      "create", "--interactive", "--name", name, "--label", `lorelum.evaluation=${name}`, "--network", "none", "--read-only", "--cap-drop", "ALL", "--security-opt", "no-new-privileges", "--pids-limit", "128", "--memory", "512m", "--cpus", "1", "--user", "65534:65534", "--tmpfs", "/tmp:rw,nosuid,nodev,noexec,size=64m", "--mount", `type=bind,src=${source},dst=${target},readonly`, "--entrypoint", cmd[0], imageId, cmd[1],
    ];
    const session = await runEvaluationSession({
      names,
      createArgs: [createArgs(names[0], privateCopy, "/verifier", contract.driver), createArgs(names[1], work, "/workspace", contract.candidate)],
      env, docker, timeoutMs: Math.min(timeoutMs, contract.timeout_ms), communicate: broker,
    });
    result = !session.cleanupVerified ? failure(`container cleanup could not be verified: ${names.join(", ")}`, "indeterminate")
      : session.failed || !session.result ? failure("verifier communication or execution failed", "indeterminate")
      : session.result;
    if (session.cleanupVerified) {
      try {
        if (await sha256SnapshotDirectory(evaluator) !== evaluatorSha256 || await sha256SnapshotDirectory(privateCopy) !== evaluatorSha256 || await sha256SnapshotDirectory(work) !== workHash) result = failure("input changed during evaluation", "indeterminate");
      } catch { result = failure("unable to verify input snapshots", "indeterminate"); }
    }
  } catch (error) {
    const safe = ["invalid evaluator inputs", "invalid input root", "invalid input isolation", "invalid input files", "evaluator digest mismatch", "invalid verifier contract", "verified local image unavailable"];
    result = failure(error instanceof Error && safe.includes(error.message) ? error.message : "evaluator setup failed");
  }
  if (output) {
    try { await writeFile(join(output, "result.json"), JSON.stringify(result, null, 2) + "\n", { flag: "wx", mode: 0o600 }); }
    catch { return failure("unable to record evaluator result", "indeterminate"); }
  }
  return result;
}
