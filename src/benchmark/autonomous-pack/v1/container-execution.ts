import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { constants, createReadStream } from "node:fs";
import { chmod, copyFile, lstat, mkdir, open, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { isIP } from "node:net";
import { isAbsolute, join, relative, resolve, sep } from "node:path";
import { inspectEgressTopology, type EgressInspectionResult } from "./egress-proof";
import { auditUsageStream, type ProviderUsage } from "./provider-usage";

/** All paths are host paths. workspace must be a fresh, writable PUBLIC workspace;
 * task and system must contain only public text. index and model are read-only
 * prepared artifacts. privateRoot must not overlap any mounted path. artifactRoot
 * must not exist and is created exclusively; its files are sensitive. The Docker
 * daemon and the two specified images must be trusted, local, and support these
 * bind mounts. The upstream is trusted with the key: a malicious upstream could
 * echo it in a successful response, which the existing proxy forwards unchanged.
 * Credentials are sent to the proxy only on stdin, never as argv or environment. */
// Public workspace contents are writable by any host user able to traverse its
// private ancestors. Only dedicate a fresh workspace to this run. Container
// output defaults to host-readable modes, but an agent can explicitly restrict
// permissions; the host cannot override another UID without privilege.
export type ContainerExecutionOptions = {
  agentImage: string; proxyImage: string;
  workspace: string; index: string; modelFile: string; privateRoot: string; artifactRoot: string;
  task: string; system: string;
  indexSha256: string; modelSha256: string;
  modelId: string; modelProvider: string; contextWindow: number; maxTokens: number; maxTurns: number;
  maxDurationMs: number; auditWaitMs: number;
  upstreamBaseUrl: string; upstreamApiKey: string;
};
export type ContainerExecutionResult = {
  status: "completed" | "failed";
  reason: string | null;
  agentResult: string | null;
  durationMs: number | null;
  topology: EgressInspectionResult | null;
  usage: { complete: boolean; totals: ProviderUsage | null };
  // Observation is conditional on trusted Docker, images, proxy and upstream;
  // command success and a topology snapshot do not prove universal isolation.
  isolation: "observed" | "unverified";
  cleanup: "unverified";
  resourceNames: { internal: string; upstream: string; proxy: string; agent: string };
  artifacts: { pi: Artifact | null; usage: Artifact | null; agentStderr: Artifact | null; finishLog: Artifact | null; topology: Artifact | null };
};
export type Artifact = { path: string; sha256: string };
type Attached = { child: ChildProcessWithoutNullStreams; exit: Promise<number | null> };
const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => /^(PATH|SYSTEMROOT|COMSPEC|PATHEXT|HOME|USERPROFILE|DOCKER_HOST|DOCKER_CONTEXT|DOCKER_CONFIG|DOCKER_TLS_VERIFY|DOCKER_CERT_PATH|TMP|TEMP|TMPDIR|XDG_RUNTIME_DIR)$/i.test(key)));
const rootInImage = "/opt/autonomous-pack/src/benchmark/autonomous-pack/v1";
const timerMax = 2_147_483_647;

function requireOptions(o: ContainerExecutionOptions) {
  if (![o.agentImage, o.proxyImage].every(x => /^sha256:[a-f0-9]{64}$/.test(x)) || ![o.indexSha256, o.modelSha256].every(x => /^[a-f0-9]{64}$/.test(x))) throw Error("invalid image or artifact identity");
  if (![o.contextWindow, o.maxTokens, o.maxTurns, o.maxDurationMs, o.auditWaitMs].every(x => Number.isSafeInteger(x) && x > 0 && x <= timerMax) || o.maxTokens > o.contextWindow) throw Error("invalid budget");
  if (!/^[A-Za-z0-9][A-Za-z0-9._/-]{0,199}$/.test(o.modelId) || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/.test(o.modelProvider) || typeof o.task !== "string" || typeof o.system !== "string" || !o.upstreamApiKey) throw Error("invalid public input or proxy configuration");
  let url: URL; try { url = new URL(o.upstreamBaseUrl); } catch { throw Error("invalid upstream URL"); }
  if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash) throw Error("invalid upstream URL");
  for (const path of [o.workspace, o.index, o.modelFile, o.privateRoot, o.artifactRoot]) if (!isAbsolute(path) || /[,\r\n]/.test(path)) throw Error("invalid host path");
}
function overlaps(a: string, b: string): boolean {
  const contains = (x: string, y: string) => { const r = relative(x, y); return r === "" || (r !== ".." && !r.startsWith(`..${sep}`) && !isAbsolute(r)); };
  return contains(a, b) || contains(b, a);
}
async function digest(path: string): Promise<Artifact | null> {
  try {
    const hash = createHash("sha256");
    for await (const chunk of createReadStream(path)) hash.update(chunk as Buffer);
    return { path, sha256: hash.digest("hex") };
  } catch { return null; }
}
function deadline<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  const gate = Promise.withResolvers<T>();
  const timer = setTimeout(() => gate.reject(Error(message)), ms);
  promise.then(value => { clearTimeout(timer); gate.resolve(value); }, error => { clearTimeout(timer); gate.reject(error); });
  return gate.promise;
}
async function command(args: string[], ms = 30_000): Promise<string> {
  const child = spawn("docker", args, { env, stdio: ["ignore", "pipe", "pipe"], windowsHide: true });
  let out = "";
  child.stdout.on("data", chunk => { if (out.length < 65536) out += chunk.toString(); });
  child.stderr.resume();
  const gate = Promise.withResolvers<number | null>();
  child.once("error", gate.reject); child.once("close", gate.resolve);
  const exit = gate.promise;
  let code: number | null;
  try { code = await deadline(exit, ms, "docker command timeout"); } catch (e) { child.kill(); throw e; }
  if (code !== 0) throw Error(`docker ${args[0]} failed`);
  return out.trim();
}

/** Consume one Docker stream completely into a private file. Markers are only
 * synchronization signals and do not attest retrieval coverage. */
async function collect(stream: NodeJS.ReadableStream, path: string, marker?: RegExp) {
  const file = await open(path, "wx", 0o600);
  let text = "";
  const gate = Promise.withResolvers<string>();
  let found: ((s: string) => void) | undefined = gate.resolve;
  let failed: ((e: Error) => void) | undefined = gate.reject;
  const ready = gate.promise;
  // A marker might not be requested or might arrive after an earlier failure.
  void ready.catch(() => {});
  const done = (async () => {
    try {
      for await (const chunk of stream) {
        const bytes = Buffer.from(chunk as Uint8Array);
        await file.writeFile(bytes);
        if (marker && found) {
          text = (text + bytes.toString("utf8")).slice(-65536);
          const match = marker.exec(text);
          if (match) { found(match[1] ?? match[0]); found = undefined; failed = undefined; }
        }
      }
      if (failed) failed(Error("stream ended before marker"));
    } catch (error) { if (failed) failed(Error("stream failed")); throw error; }
    finally { await file.close(); }
  })();
  void done.catch(() => {});
  return { ready, done };
}
function attached(args: string[]): Attached {
  const child = spawn("docker", args, { env, stdio: ["pipe", "pipe", "pipe"], windowsHide: true });
  const gate = Promise.withResolvers<number | null>();
  child.once("error", gate.reject); child.once("close", gate.resolve);
  const exit = gate.promise;
  void exit.catch(() => {});
  return { child, exit };
}

/** Execute exactly one explicitly requested run. This does not authorize a model
 * request or establish complete retrieval observation. It never logs Docker
 * diagnostics, credentials, Pi output, agent stderr, or proxy output. */
export async function executeContainerRun(o: ContainerExecutionOptions): Promise<ContainerExecutionResult> {
  const suffix = randomUUID();
  const names = { internal: `ap-in-${suffix}`, upstream: `ap-out-${suffix}`, proxy: `ap-proxy-${suffix}`, agent: `ap-agent-${suffix}` };
  const result: ContainerExecutionResult = { status: "failed", reason: "execution failed", agentResult: null, durationMs: null, topology: null, usage: { complete: false, totals: null }, isolation: "unverified", cleanup: "unverified", resourceNames: names, artifacts: { pi: null, usage: null, agentStderr: null, finishLog: null, topology: null } };
  const containers: string[] = [], networks: string[] = [];
  const processes: Attached[] = [];
  const streams: Promise<void>[] = [];
  let artifactRoot: string | undefined;
  let artifactOwned = false;
  let proxyRunning = false;
  let proxy: Attached | undefined;
  let usageDone: Promise<void> | undefined;
  let error = "execution failed";
  let cleanupFailed = false;
  try {
    requireOptions(o);
    const [workspace, index, model, privateRoot] = await Promise.all([realpath(o.workspace), realpath(o.index), realpath(o.modelFile), realpath(o.privateRoot)]);
    const artifactParent = await realpath(resolve(o.artifactRoot, ".."));
    artifactRoot = join(artifactParent, o.artifactRoot.split(/[\\/]/).pop()!);
    for (const p of [workspace, index, model]) if (overlaps(p, privateRoot) || overlaps(p, artifactRoot)) throw Error("mounted path overlaps private material");
    if (overlaps(privateRoot, artifactRoot)) throw Error("private paths overlap");
    if (!(await lstat(workspace)).isDirectory() || !(await lstat(index)).isFile() || !(await lstat(model)).isFile()) throw Error("invalid mount source");
    for (const p of [workspace, index, model, artifactRoot]) if (/[,\r\n]/.test(p)) throw Error("unsupported Docker mount path");
    await mkdir(artifactRoot, { mode: 0o700 });
    artifactOwned = true;
    const publicDir = join(artifactRoot, "public-inputs");
    const mountDir = join(artifactRoot, "mount-inputs");
    await mkdir(publicDir, { mode: 0o755 });
    await mkdir(mountDir, { mode: 0o700 });
    // Bind-mount independent copies, never chmod source inputs. Reflinks avoid
    // duplicating large models where the filesystem supports them.
    const stagedIndex = join(mountDir, "index.tar");
    const stagedModel = join(mountDir, "model.gguf");
    await copyFile(index, stagedIndex, constants.COPYFILE_EXCL | constants.COPYFILE_FICLONE);
    await copyFile(model, stagedModel, constants.COPYFILE_EXCL | constants.COPYFILE_FICLONE);
    await writeFile(join(publicDir, "task.md"), o.task, { mode: 0o644, flag: "wx" });
    await writeFile(join(publicDir, "system.md"), o.system, { mode: 0o644, flag: "wx" });
    // Supply the nested bind mountpoint before mounting /inputs read-only.
    await writeFile(join(publicDir, "index.tar"), "", { mode: 0o644, flag: "wx" });
    if (process.platform !== "win32") {
      await chmod(publicDir, 0o755);
      for (const path of [stagedIndex, stagedModel, join(publicDir, "task.md"), join(publicDir, "system.md"), join(publicDir, "index.tar")]) await chmod(path, 0o644);
    }
    for (const image of [o.agentImage, o.proxyImage]) if (await command(["image", "inspect", "--format", "{{.Id}}", image]) !== image) throw Error("image identity mismatch");
    networks.push(names.internal); await command(["network", "create", "--label", `lorelum.execution=${suffix}`, "--internal", names.internal]);
    networks.push(names.upstream); await command(["network", "create", "--label", `lorelum.execution=${suffix}`, names.upstream]);
    const hardened = ["--read-only", "--cap-drop", "ALL", "--security-opt", "no-new-privileges", "--user", "65532:65532", "--pull", "never"];
    containers.push(names.proxy);
    await command(["create", "--name", names.proxy, "--label", `lorelum.execution=${suffix}`, ...hardened, "-i", "--network", names.internal, o.proxyImage]);
    await command(["network", "connect", names.upstream, names.proxy]);
    proxy = attached(["start", "-a", "-i", names.proxy]); processes.push(proxy);
    proxyRunning = true;
    const usage = await collect(proxy.child.stdout, join(artifactRoot, "proxy-usage.jsonl"), /^model-proxy-ready:8080\r?$/m);
    usageDone = usage.done;
    streams.push(usage.done);
    proxy.child.stderr.resume();
    proxy.child.stdin.on("error", () => {});
    proxy.child.stdin.end(JSON.stringify({ baseUrl: o.upstreamBaseUrl, apiKey: o.upstreamApiKey, model: o.modelId, port: 8080, hostname: "0.0.0.0", maxRequests: o.maxTurns }));
    await deadline(usage.ready, o.auditWaitMs, "proxy readiness timeout");
    const inspect = JSON.parse(await command(["inspect", names.proxy]));
    const ip = inspect[0]?.NetworkSettings?.Networks?.[names.internal]?.IPAddress;
    if (typeof ip !== "string" || isIP(ip) !== 4 || !/^(10\.|127\.|192\.168\.|172\.(1[6-9]|2[0-9]|3[01])\.)/.test(ip)) throw Error("invalid proxy network address");
    await writeFile(join(publicDir, "agent.json"), JSON.stringify({ index_sha256: o.indexSha256, model_sha256: o.modelSha256, proxy_url: `http://${ip}:8080/v1`, model_id: o.modelId, catalog_provider: o.modelProvider, context_window: o.contextWindow, max_tokens: o.maxTokens, max_turns: o.maxTurns, max_duration_ms: o.maxDurationMs, audit_wait_ms: o.auditWaitMs }), { mode: 0o644, flag: "wx" });
    if (process.platform !== "win32") await chmod(join(publicDir, "agent.json"), 0o644);
    containers.push(names.agent);
    // FIFO creation happens inside tmpfs, so no host FIFO semantics are needed on Windows.
    await command(["create", "--name", names.agent, "--label", `lorelum.execution=${suffix}`, ...hardened, "--network", names.internal, "--pids-limit", "256", "--memory", "3g", "--workdir", "/workspace", "--tmpfs", "/tmp:rw,nosuid,nodev,size=2g,mode=1777", "--tmpfs", "/control:rw,nosuid,nodev,mode=1777", "--mount", `type=bind,src=${workspace},dst=/workspace`, "--mount", `type=bind,src=${publicDir},dst=/inputs,readonly`, "--mount", `type=bind,src=${stagedIndex},dst=/inputs/index.tar,readonly`, "--mount", `type=bind,src=${stagedModel},dst=/model/model.gguf,readonly`, "--entrypoint", "/bin/sh", o.agentImage, "-c", `umask 000 && mkfifo /control/attached /control/finished && exec /usr/local/bin/bun run ${rootInImage}/agent-bootstrap.ts`]);
    await command(["start", names.agent]);
    const logs = attached(["logs", "--follow", names.agent]); processes.push(logs); logs.child.stdin.end();
    const pi = await collect(logs.child.stdout, join(artifactRoot, "pi.jsonl"));
    streams.push(pi.done);
    // Retain stderr privately as it includes the exact handshake and result markers.
    const agentLog = await collect(logs.child.stderr, join(artifactRoot, "agent-stderr.log"), /^AUDIT_READY ([1-9][0-9]*)\r?$/m);
    streams.push(agentLog.done);
    const pid = await deadline(agentLog.ready, o.auditWaitMs, "audit readiness timeout");
    if (pid !== "1") throw Error("unexpected bootstrap PID");
    const agentInspect: unknown = JSON.parse(await command(["inspect", names.agent]));
    const proxyInspect: unknown = JSON.parse(await command(["inspect", names.proxy]));
    const internalInspect: unknown = JSON.parse(await command(["network", "inspect", names.internal]));
    const upstreamInspect: unknown = JSON.parse(await command(["network", "inspect", names.upstream]));
    const identity = (value: unknown): string => {
      if (!Array.isArray(value) || value.length !== 1 || !value[0] || typeof value[0] !== "object" || typeof value[0].Id !== "string") throw Error("isolation topology identity unavailable");
      return value[0].Id;
    };
    result.topology = inspectEgressTopology({
      agent: agentInspect, proxy: proxyInspect, internalNetwork: internalInspect, upstreamNetwork: upstreamInspect,
      agentImage: o.agentImage, proxyImage: o.proxyImage, agentId: identity(agentInspect), proxyId: identity(proxyInspect),
      internalId: identity(internalInspect), upstreamId: identity(upstreamInspect),
      agentMounts: [
        { source: workspace, destination: "/workspace", rw: true },
        { source: publicDir, destination: "/inputs", rw: false },
        { source: stagedIndex, destination: "/inputs/index.tar", rw: false },
        { source: stagedModel, destination: "/model/model.gguf", rw: false },
      ],
      proxyMounts: [],
    });
    await writeFile(join(artifactRoot, "topology.json"), JSON.stringify(result.topology, null, 2) + "\n", { flag: "wx", mode: 0o600 });
    if (result.topology.status !== "observed") throw Error("isolation topology mismatch");
    const started = performance.now();
    await command(["exec", names.agent, "sh", "-c", "printf 'ATTACHED\\n' > /control/attached"], o.auditWaitMs);
    // Docker logs may chunk markers arbitrarily. A second follower reads the full
    // retained log, rather than racing a second consumer of the first stream.
    const finishLogs = attached(["logs", "--follow", names.agent]); processes.push(finishLogs); finishLogs.child.stdin.end(); finishLogs.child.stdout.resume();
    const finish = await collect(finishLogs.child.stderr, join(artifactRoot, "agent-finish.log"), /^AUDIT_FINISH\r?$/m);
    streams.push(finish.done);
    await deadline(finish.ready, Math.min(timerMax, o.maxDurationMs + o.auditWaitMs), "agent finish timeout");
    result.durationMs = Math.round(performance.now() - started);
    await command(["exec", names.agent, "sh", "-c", "printf 'FINISHED\\n' > /control/finished"], o.auditWaitMs);
    const agentExit = await command(["wait", names.agent], o.auditWaitMs);
    const logCode = await deadline(logs.exit, o.auditWaitMs, "agent log stream timeout");
    await deadline(Promise.all([pi.done, agentLog.done]), o.auditWaitMs, "agent log drain timeout");
    await deadline(finishLogs.exit, o.auditWaitMs, "finish log stream timeout");
    await deadline(finish.done, o.auditWaitMs, "finish log drain timeout");
    const stderr = await readFile(join(artifactRoot, "agent-stderr.log"), "utf8");
    const markers = [...stderr.matchAll(/^AGENT_RESULT ([a-z0-9_]+)\r?$/gm)];
    result.agentResult = markers.length === 1 ? markers[0]![1]! : null;
    if (agentExit !== "0" || logCode !== 0 || result.agentResult !== "exit_0") throw Error("agent did not complete successfully");
    // Proxy shutdown and usage auditing also run on every failure path below.
    result.status = "completed"; error = "";
  } catch (e) {
    // Never expose command stderr, credentials, model response or input text.
    error = e instanceof Error && /^(?:invalid image or artifact identity|invalid budget|invalid public input or proxy configuration|invalid upstream URL|invalid host path|invalid mount source|invalid proxy network address|unsupported Docker mount path|mounted path overlaps private material|private paths overlap|image identity mismatch|docker (?:image|network|create|start|inspect|exec|wait|kill|rm|ps) failed|docker command timeout|proxy readiness timeout|audit readiness timeout|unexpected bootstrap PID|agent finish timeout|agent log stream timeout|agent log drain timeout|agent did not complete successfully|finish log stream timeout|finish log drain timeout|proxy stop timeout|proxy stream timeout|isolation topology identity unavailable|isolation topology mismatch)$/.test(e.message) ? e.message : "execution failed";
  } finally {
    // Stop a possibly still-running agent first, including when start or a
    // handshake timed out. A failed stop must not mask the original error.
    if (error && containers.includes(names.agent)) {
      try { await command(["kill", names.agent], Math.min(o.auditWaitMs, 10_000)); } catch { /* It may not have started or may already have exited. */ }
    }
    if (proxyRunning && proxy) {
      let stopped = false;
      let proxyCode: number | null = null;
      let drained = false;
      let proxyError = "";
      try {
        await command(["kill", "--signal", "TERM", names.proxy], Math.min(o.auditWaitMs, 10_000));
        stopped = true;
      } catch { proxyError = "proxy stop failed"; }
      try { proxyCode = await deadline(proxy.exit, o.auditWaitMs, "proxy stop timeout"); }
      catch { proxyError ||= "proxy stop timeout"; }
      if (usageDone) {
        try { await deadline(usageDone, o.auditWaitMs, "proxy stream timeout"); drained = true; }
        catch { proxyError ||= "proxy stream timeout"; }
      }
      // Only a deliberate stop, clean exit and completely drained private
      // stream permit the strict audit to report totals.
      if (drained && artifactRoot) {
        try {
          result.usage = auditUsageStream(await readFile(join(artifactRoot, "proxy-usage.jsonl"), "utf8"), stopped && proxyCode === 0);
        } catch { proxyError ||= "proxy stream read failed"; }
      }
      if (proxyError && result.status === "completed") { result.status = "failed"; error = proxyError; }
    }
    for (const p of processes) if (p.child.exitCode === null) p.child.kill();
    for (const name of containers.reverse()) {
      try {
        if (await command(["inspect", "--format", '{{index .Config.Labels "lorelum.execution"}}', name]) !== suffix) throw Error("resource ownership mismatch");
        await command(["rm", "-f", name]);
      } catch { cleanupFailed = true; }
    }
    for (const name of networks.reverse()) {
      try {
        if (await command(["network", "inspect", "--format", '{{index .Labels "lorelum.execution"}}', name]) !== suffix) throw Error("resource ownership mismatch");
        await command(["network", "rm", name]);
      } catch { cleanupFailed = true; }
    }
    // A timed-out Docker create can still finish in the daemon after the client
    // exits. Discover owned resources by this run's unique label as well as by
    // the names already returned; an empty snapshot is not a future guarantee.
    for (const kind of ["container", "network"] as const) {
      try {
        const list = kind === "container" ? ["ps", "-aq", "--no-trunc", "--filter", `label=lorelum.execution=${suffix}`] : ["network", "ls", "-q", "--no-trunc", "--filter", `label=lorelum.execution=${suffix}`];
        const found = await command(list, 10_000);
        for (const id of found ? found.split(/\s+/) : []) {
          if (!/^[a-f0-9]{64}$/.test(id)) throw Error("invalid owned resource identity");
          const inspect = kind === "container" ? ["inspect", "--format", '{{index .Config.Labels "lorelum.execution"}}', id] : ["network", "inspect", "--format", '{{index .Labels "lorelum.execution"}}', id];
          if (await command(inspect, 10_000) !== suffix) throw Error("resource ownership mismatch");
          await command(kind === "container" ? ["rm", "-f", id] : ["network", "rm", id], 10_000);
        }
        if (await command(list, 10_000)) throw Error("owned resources remain");
      } catch { cleanupFailed = true; }
    }
    if (artifactRoot && artifactOwned) {
      try { await rm(join(artifactRoot, "mount-inputs"), { recursive: true, force: true }); } catch { cleanupFailed = true; }
    }
    let streamsSettled = true;
    try { await deadline(Promise.allSettled(streams), 30_000, "stream cleanup timeout"); } catch { cleanupFailed = true; streamsSettled = false; }
    if (artifactRoot && artifactOwned && streamsSettled) {
      [result.artifacts.pi, result.artifacts.usage, result.artifacts.agentStderr, result.artifacts.finishLog, result.artifacts.topology] = await Promise.all([digest(join(artifactRoot, "pi.jsonl")), digest(join(artifactRoot, "proxy-usage.jsonl")), digest(join(artifactRoot, "agent-stderr.log")), digest(join(artifactRoot, "agent-finish.log")), digest(join(artifactRoot, "topology.json"))]);
    }
    if (result.status === "completed" && Object.values(result.artifacts).some(artifact => artifact === null)) {
      result.status = "failed"; error = "artifact hashing failed";
    }
    if (cleanupFailed) { result.status = "failed"; error = error ? `${error}; cleanup failed` : "cleanup failed"; }
    if (result.status === "completed" && result.topology?.status === "observed" && !cleanupFailed) result.isolation = "observed";
    result.reason = error || null;
  }
  return result;
}
