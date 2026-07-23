import { createHash } from "node:crypto";
import { readdir, stat } from "node:fs/promises";
import { join, relative, resolve } from "node:path";

type ProcessResult = { code: number; stdout: string; stderr: string };
type Evaluation = {
  semantic: { passed: boolean; failures: string[] };
  protection: { passed: boolean; failures: string[] };
  quality: { score: number; behaviors: Record<string, { passed: boolean; rule_behavior_id: string }> };
};

const evaluatorRoot = resolve(import.meta.dir, "..");
const incubatorRoot = resolve(evaluatorRoot, "..", "..");
const defaultBaselineRoot = resolve(incubatorRoot, "public", "starter", "app");
const protectedPaths = ["package.json", "bun.lock", "next.config.ts", "tsconfig.json", "lib/repository.ts"];
const allowedRoots = ["app/team", "components/team"];
const serverPort = 3101;

async function sha256(path: string): Promise<string> {
  return createHash("sha256").update(Buffer.from(await Bun.file(path).arrayBuffer())).digest("hex");
}

async function filesAt(root: string): Promise<string[]> {
  const output: string[] = [];
  async function visit(directory: string): Promise<void> {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      if (["node_modules", ".next", "test-results", "playwright-report"].includes(entry.name)) continue;
      const full = join(directory, entry.name);
      if (entry.isDirectory()) await visit(full);
      else if (entry.isFile()) output.push(relative(root, full));
    }
  }
  await visit(root);
  return output.sort();
}

function isAllowed(path: string): boolean {
  const normalized = path.replaceAll("\\", "/");
  return allowedRoots.some((root) => normalized === root || normalized.startsWith(`${root}/`));
}

async function protectionFailures(candidateRoot: string, baselineRoot: string): Promise<string[]> {
  const anchor = await stat(join(candidateRoot, "package.json")).catch(() => undefined);
  if (!anchor?.isFile()) return ["candidate anchor must be a regular app/package.json file"];
  const failures: string[] = [];
  for (const path of protectedPaths) {
    if (await sha256(join(candidateRoot, path)) !== await sha256(join(baselineRoot, path))) failures.push(`protected file changed: ${path}`);
  }
  const baseline = new Set(await filesAt(baselineRoot));
  for (const path of await filesAt(candidateRoot)) {
    if (!baseline.has(path) && !isAllowed(path)) failures.push(`unauthorized added file: ${path}`);
    if (baseline.has(path) && !isAllowed(path) && await sha256(join(candidateRoot, path)) !== await sha256(join(baselineRoot, path))) failures.push(`unauthorized changed file: ${path}`);
  }
  return failures;
}

async function run(command: string[], cwd: string, env: Record<string, string | undefined> = Bun.env): Promise<ProcessResult> {
  const child = Bun.spawn(command, { cwd, env, stdout: "pipe", stderr: "pipe" });
  return { code: await child.exited, stdout: await new Response(child.stdout).text(), stderr: await new Response(child.stderr).text() };
}

async function waitForServer(): Promise<void> {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    try {
      if ((await fetch(`http://127.0.0.1:${serverPort}/team`)).ok) return;
    } catch { }
    await Bun.sleep(100);
  }
  throw new Error("Next production server did not become ready");
}

async function stopServer(pid: number): Promise<void> {
  if (process.platform === "win32") {
    const killer = Bun.spawn(["taskkill", "/PID", String(pid), "/T", "/F"], { stdout: "ignore", stderr: "ignore" });
    await killer.exited;
  } else {
    try { process.kill(pid, "SIGTERM"); } catch { }
  }
}

async function fetchFlight(): Promise<string> {
  const response = await fetch(`http://127.0.0.1:${serverPort}/team`, {
    headers: {
      RSC: "1",
      "Next-Router-State-Tree": "%5B%22%22%2C%7B%22children%22%3A%5B%22team%22%2C%7B%7D%5D%7D%5D",
    },
  });
  if (!response.ok || !response.headers.get("content-type")?.includes("text/x-component")) {
    throw new Error(`Flight request failed: ${response.status} ${response.headers.get("content-type") ?? "unknown content type"}`);
  }
  return response.text();
}

async function inspectFlight(appRoot: string): Promise<{ payload: string; browser: ProcessResult }> {
  const server = Bun.spawn(["node", "./node_modules/next/dist/bin/next", "start", "-p", String(serverPort)], {
    cwd: appRoot,
    env: { ...Bun.env, NEXT_TELEMETRY_DISABLED: "1" },
    stdout: "pipe",
    stderr: "pipe",
  });
  try {
    await waitForServer();
    const payload = await fetchFlight();
    const browser = await run([process.execPath, "run", "test:e2e:built"], appRoot);
    return { payload, browser };
  } finally {
    await stopServer(server.pid);
  }
}

async function evaluate(candidateRoot: string, baselineRoot: string): Promise<Evaluation> {
  const protection = await protectionFailures(candidateRoot, baselineRoot);
  if (protection.length > 0) {
    return {
      semantic: { passed: false, failures: ["candidate violated protected-source policy"] },
      protection: { passed: false, failures: protection },
      quality: { score: 0, behaviors: {} },
    };
  }
  const semanticFailures: string[] = [];
  let payload = "";
  try {
    const install = await run([process.execPath, "install", "--frozen-lockfile"], candidateRoot);
    if (install.code !== 0) throw new Error(`Frozen install failed: ${install.stderr || install.stdout}`);
    const build = await run([process.execPath, "run", "build"], candidateRoot);
    if (build.code !== 0) throw new Error(`Production build failed: ${build.stderr || build.stdout}`);
    const inspected = await inspectFlight(candidateRoot);
    payload = inspected.payload;
    if (!payload.includes('"name":"Ada"') || !payload.includes('"role":"admin"')) semanticFailures.push("Flight payload lost required visible member fields");
    if (inspected.browser.code !== 0) semanticFailures.push(`browser behavior failed: ${inspected.browser.stderr || inspected.browser.stdout}`);
  } catch (error) {
    semanticFailures.push(error instanceof Error ? error.message : String(error));
  }

  const behaviors = {
    "avoid-duplicate-member-identities": { passed: !payload.includes('"memberIds"'), rule_behavior_id: "server-dedup-props.md" },
    "keep-server-notes-out-of-flight": { passed: !payload.includes('"internalNote"'), rule_behavior_id: "server-serialization.md" },
  };
  const semanticPassed = semanticFailures.length === 0;
  const qualityScore = semanticPassed
    ? Math.round((Object.values(behaviors).filter((behavior) => behavior.passed).length / Object.keys(behaviors).length) * 100)
    : 0;
  return { semantic: { passed: semanticPassed, failures: semanticFailures }, protection: { passed: true, failures: [] }, quality: { score: qualityScore, behaviors } };
}

const candidateRoot = Bun.argv[2] ?? Bun.env.CANDIDATE_ROOT;
if (!candidateRoot) throw new Error("Usage: bun evaluate.ts <candidate-app-root> [baseline-app-root]");
const result = await evaluate(resolve(candidateRoot), resolve(Bun.argv[3] ?? Bun.env.BASELINE_ROOT ?? defaultBaselineRoot));
console.log(JSON.stringify(result));
process.exit(result.semantic.passed && result.protection.passed ? 0 : 1);
