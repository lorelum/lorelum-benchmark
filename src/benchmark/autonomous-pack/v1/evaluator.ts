import { spawn, type ChildProcess } from "node:child_process";
import { randomUUID } from "node:crypto";
import { lstat, mkdir, realpath, readdir, writeFile } from "node:fs/promises";
import { isAbsolute, join, relative, sep } from "node:path";
import { sha256SnapshotDirectory } from "./snapshot";

export type SemanticEvaluation = {
  health: "evaluated" | "execution-failed" | "indeterminate";
  semantic: "pass" | "fail" | "not-run";
  quality: "not-run";
  quality_probes: [];
  failure_reasons: string[];
};
export type SemanticEvaluationOptions = {
  workspace: string;
  evaluatorRoot: string;
  evaluatorSha256: string;
  /** Already verified local Docker image ID, not a mutable tag. */
  imageId: string;
  /** New, host-private directory outside both input trees. */
  outputDirectory: string;
  timeoutMs?: number;
};
const safeSetupReasons: Record<string, true> = {
  "invalid evaluator inputs": true,
  "input root must be a directory, not a link": true,
  "input and output trees must be disjoint": true,
  "unexpected frozen evaluator files": true,
  "invalid evaluator file": true,
  "evaluator digest mismatch": true,
  "verified local image unavailable": true,
};

const failed = (reason: string, health: SemanticEvaluation["health"] = "execution-failed"): SemanticEvaluation => ({
  health, semantic: "not-run", quality: "not-run", quality_probes: [], failure_reasons: [reason],
});
const inside = (parent: string, child: string) => {
  const r = relative(parent, child);
  return r === "" || (r !== ".." && !r.startsWith(`..${sep}`) && !isAbsolute(r));
};

/** Only process discovery and OS-required variables survive; no provider or Docker credentials. */
export function evaluatorEnvironment(source: NodeJS.ProcessEnv, privateHome: string): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { HOME: privateHome, USERPROFILE: privateHome, DOCKER_CONFIG: privateHome };
  for (const key of ["PATH", "Path", "SystemRoot", "SYSTEMROOT", "WINDIR", "TEMP", "TMP"]) {
    if (source[key] !== undefined) env[key] = source[key];
  }
  return env;
}

type CommandResult = { code: number | null; stdout: string; stderr: string; error: boolean; timeout: boolean; overflow: boolean };
async function command(file: string, args: string[], env: NodeJS.ProcessEnv, timeoutMs: number): Promise<CommandResult> {
  const { promise, resolve } = Promise.withResolvers<CommandResult>();
    let stdout = "", stderr = "", error = false, timeout = false, overflow = false;
    let child: ChildProcess;
    try { child = spawn(file, args, { env, stdio: ["ignore", "pipe", "pipe"], detached: process.platform !== "win32", windowsHide: true }); }
    catch { resolve({ code: null, stdout, stderr, error: true, timeout, overflow }); return promise; }
    const stop = () => {
      if (process.platform !== "win32" && child.pid) {
        try { process.kill(-child.pid, "SIGKILL"); } catch { child.kill("SIGKILL"); }
      } else if (child.pid) {
        // Kill the Node test worker as well as its parent on Windows.
        const killer = spawn("taskkill", ["/pid", String(child.pid), "/t", "/f"], { env, stdio: "ignore", windowsHide: true });
        killer.on("error", () => child.kill());
      }
    };
    const timer = setTimeout(() => { timeout = true; stop(); }, timeoutMs);
    const collect = (which: "stdout" | "stderr", chunk: Buffer) => {
      if (which === "stdout") stdout += chunk.toString(); else stderr += chunk.toString();
      if (stdout.length + stderr.length > 2_000_000 && !overflow) { overflow = true; stop(); }
    };
    child.stdout?.on("data", chunk => collect("stdout", chunk));
    child.stderr?.on("data", chunk => collect("stderr", chunk));
    child.on("error", () => { error = true; });
    child.on("close", code => { clearTimeout(timer); resolve({ code, stdout, stderr, error, timeout, overflow }); });
  return promise;
}

/** Conservatively recognize only a complete TAP run with assertion-only failures. */
export function classifySemanticTap(tap: string, exitCode: number | null): SemanticEvaluation {
  const countRows = [...tap.matchAll(/^# (tests|pass|fail|cancelled|skipped|todo) (\d+)[ \t]*$/gm)];
  const counts = Object.fromEntries(countRows.map(m => [m[1], Number(m[2])]));
  const plans = [...tap.matchAll(/^1\.\.(\d+)[ \t]*$/gm)];
  const cases = [...tap.matchAll(/^(ok|not ok) (\d+) - /gm)];
  const blocks = [...tap.matchAll(/^not ok \d+ - [^\n]*\n([\s\S]*?)(?=^(?:ok|not ok) \d+ - |^1\.\.|$(?![\s\S]))/gm)];
  const total = counts.tests;
  if (countRows.length !== 6 || Object.keys(counts).length !== 6 || !Number.isSafeInteger(total) || total < 1 ||
      plans.length !== 1 || Number(plans[0]![1]) !== total || cases.length !== total ||
      cases.some((entry, index) => Number(entry[2]) !== index + 1) ||
      cases.filter(entry => entry[1] === "not ok").length !== counts.fail ||
      counts.pass + counts.fail !== total || counts.cancelled !== 0 || counts.skipped !== 0 || counts.todo !== 0 || blocks.length !== counts.fail) {
    return failed("incomplete evaluator report", "indeterminate");
  }
  if (counts.fail === 0 && exitCode === 0) return { health: "evaluated", semantic: "pass", quality: "not-run", quality_probes: [], failure_reasons: [] };
  const transport = /Evaluator container exited|Evaluator bridge request timed out|Invalid bridge response|Unexpected bridge response|EPIPE|ECONNRESET|spawn docker/i;
  if (exitCode === 1 && counts.fail > 0 && blocks.every(block => /code: ['"]ERR_ASSERTION['"]/.test(block[1]) || /name: ['"]CandidateError['"]/.test(block[1])) && !transport.test(tap)) {
    return { health: "evaluated", semantic: "fail", quality: "not-run", quality_probes: [], failure_reasons: [] };
  }
  return failed("evaluator or container failure", "indeterminate");
}

/** Runs the frozen host-side evaluator. Its generic bridge alone is mounted in Docker.
 * Caller must stop the candidate first and independently validate image identity and isolation.
 * Raw private test output is deliberately not returned or persisted. */
export async function evaluateSemantic(options: SemanticEvaluationOptions): Promise<SemanticEvaluation> {
  let output: string | undefined;
  let result: SemanticEvaluation;
  try {
    const { workspace, evaluatorRoot, evaluatorSha256, imageId, outputDirectory } = options;
    const timeoutMs = options.timeoutMs ?? 120_000;
    if (![workspace, evaluatorRoot, outputDirectory].every(isAbsolute) || !/^[a-f0-9]{64}$/.test(evaluatorSha256) || !/^sha256:[a-f0-9]{64}$/.test(imageId) || !Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 300_000) throw new Error("invalid evaluator inputs");
    for (const root of [workspace, evaluatorRoot]) {
      const stat = await lstat(root);
      if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error("input root must be a directory, not a link");
    }
    const work = await realpath(workspace), evaluator = await realpath(evaluatorRoot);
    // Resolve the existing parent to prevent a symlink alias hiding overlap.
    const parent = await realpath(join(outputDirectory, ".."));
    const out = join(parent, relative(join(outputDirectory, ".."), outputDirectory));
    if (inside(work, evaluator) || inside(evaluator, work) || inside(work, out) || inside(evaluator, out) || inside(out, work) || inside(out, evaluator)) throw new Error("input and output trees must be disjoint");
    const entries = (await readdir(evaluator)).sort();
    if (entries.join("\n") !== "bridge.mjs\nsemantic.test.mjs") throw new Error("unexpected frozen evaluator files");
    for (const name of entries) {
      const stat = await lstat(join(evaluator, name));
      if (!stat.isFile() || stat.isSymbolicLink()) throw new Error("invalid evaluator file");
    }
    if (await sha256SnapshotDirectory(evaluator) !== evaluatorSha256) throw new Error("evaluator digest mismatch");
    await mkdir(out, { mode: 0o700 });
    output = out;
    const env = evaluatorEnvironment(process.env, out);
    const inspect = await command("docker", ["image", "inspect", "--format", "{{.Id}}", imageId], env, 15_000);
    if (inspect.error || inspect.timeout || inspect.overflow || inspect.code !== 0 || inspect.stdout.trim() !== imageId) throw new Error("verified local image unavailable");
    const name = `lorelum-evaluator-${randomUUID()}`;
    const runEnv = { ...env, WORKSPACE: work, LORELUM_EVALUATOR_IMAGE: imageId, LORELUM_EVALUATOR_CONTAINER_NAME: name };
    let run: CommandResult;
    let cleanupFailed = false;
    try {
      run = await command("node", ["--test", "--test-reporter=tap", join(evaluator, "semantic.test.mjs")], runEnv, timeoutMs);
    } finally {
      // The frozen evaluator also removes it normally; this handles forced termination.
      const cleanup = await command("docker", ["rm", "-f", name], env, 10_000);
      cleanupFailed = cleanup.error || cleanup.timeout || cleanup.overflow ||
        (cleanup.code !== 0 && !/no such container/i.test(cleanup.stderr));
    }
    if (run.timeout) result = failed("evaluator deadline exceeded");
    else if (run.overflow) result = failed("evaluator output limit exceeded");
    else if (run.error) result = failed("unable to start evaluator");
    else if (await sha256SnapshotDirectory(evaluator) !== evaluatorSha256) result = failed("evaluator changed during execution", "indeterminate");
    else result = classifySemanticTap(run.stdout, run.code);
    if (cleanupFailed) {
      result = { ...failed("container cleanup could not be verified", "indeterminate"), failure_reasons: [...result.failure_reasons, "container cleanup could not be verified"] };
    }
  } catch (error) {
    result = failed(error instanceof Error && Object.hasOwn(safeSetupReasons, error.message) ? error.message : "evaluator setup failed");
  }
  if (output) {
    try { await writeFile(join(output, "result.json"), JSON.stringify(result, null, 2) + "\n", { flag: "wx", mode: 0o600 }); }
    catch { return failed("unable to record evaluator result", "indeterminate"); }
  }
  return result;
}
