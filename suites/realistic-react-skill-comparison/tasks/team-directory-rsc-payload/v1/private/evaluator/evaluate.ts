import { expect } from "bun:test";
import { createHash } from "node:crypto";
import { readdir, stat } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";
import { evaluateV2 } from "../../../../../../../src/benchmark/evaluator/v2/harness";

type ProcessResult = { code: number; stdout: string; stderr: string };

const taskRoot = resolve(import.meta.dir, "..", "..");
const baselineRoot = join(taskRoot, "public", "starter", "app");
const protectedPaths = ["package.json", "bun.lock", "next.config.ts", "tsconfig.json", "lib/repository.ts"];
const allowedRoots = ["app/team", "components/team"];
const flightPort = 3101;

async function sha256(path: string): Promise<string> { return createHash("sha256").update(Buffer.from(await Bun.file(path).arrayBuffer())).digest("hex"); }

async function filesAt(root: string): Promise<string[]> {
  const files: string[] = [];
  async function visit(directory: string): Promise<void> {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      if (["node_modules", ".next", "test-results", "playwright-report"].includes(entry.name)) continue;
      const path = join(directory, entry.name);
      if (entry.isDirectory()) await visit(path);
      else if (entry.isFile()) files.push(relative(root, path));
    }
  }
  await visit(root);
  return files.sort();
}

function isAllowed(path: string): boolean {
  const normalized = path.replaceAll("\\", "/");
  return allowedRoots.some((allowed) => normalized === allowed || normalized.startsWith(`${allowed}/`));
}

async function protectionFailures(candidateRoot: string): Promise<string[]> {
  const anchor = await stat(join(candidateRoot, "package.json")).catch(() => undefined);
  if (!anchor?.isFile()) return ["candidate anchor must be a regular app/package.json file"];
  const failures: string[] = [];
  for (const path of protectedPaths) if (await sha256(join(candidateRoot, path)) !== await sha256(join(baselineRoot, path))) failures.push(`protected file changed: ${path}`);
  const baseline = new Set(await filesAt(baselineRoot));
  for (const path of await filesAt(candidateRoot)) {
    if (!baseline.has(path) && !isAllowed(path)) failures.push(`unauthorized added file: ${path}`);
    if (baseline.has(path) && !isAllowed(path) && await sha256(join(candidateRoot, path)) !== await sha256(join(baselineRoot, path))) failures.push(`unauthorized changed file: ${path}`);
  }
  return failures;
}

async function run(command: string[], cwd: string): Promise<ProcessResult> {
  const child = Bun.spawn(command, { cwd, env: Bun.env, stdout: "pipe", stderr: "pipe" });
  return { code: await child.exited, stdout: await new Response(child.stdout).text(), stderr: await new Response(child.stderr).text() };
}

async function waitForServer(): Promise<void> {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    try { if ((await fetch(`http://127.0.0.1:${flightPort}/team`)).ok) return; } catch { }
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
  const response = await fetch(`http://127.0.0.1:${flightPort}/team`, { headers: { RSC: "1", "Next-Router-State-Tree": "%5B%22%22%2C%7B%22children%22%3A%5B%22team%22%2C%7B%7D%5D%7D%5D" } });
  if (!response.ok || !response.headers.get("content-type")?.includes("text/x-component")) throw new Error(`Flight request failed: ${response.status}`);
  return response.text();
}

async function inspectFlight(appRoot: string): Promise<string> {
  const server = Bun.spawn(["node", "./node_modules/next/dist/bin/next", "start", "-p", String(flightPort)], { cwd: appRoot, env: { ...Bun.env, NEXT_TELEMETRY_DISABLED: "1" }, stdout: "pipe", stderr: "pipe" });
  try { await waitForServer(); return await fetchFlight(); } finally { await stopServer(server.pid); }
}

export async function evaluateCandidate({ candidatePath }: { candidatePath: string }) {
  const candidateRoot = dirname(candidatePath);
  const protection = await protectionFailures(candidateRoot);
  const protectedCandidate = () => { if (protection.length > 0) throw new Error(protection.join("; ")); };
  let payload: string | undefined;
  async function buildAndInspect(): Promise<string> {
    if (payload !== undefined) return payload;
    protectedCandidate();
    const install = await run([process.execPath, "install", "--frozen-lockfile"], candidateRoot);
    if (install.code !== 0) throw new Error(install.stderr || install.stdout);
    const build = await run([process.execPath, "run", "build"], candidateRoot);
    if (build.code !== 0) throw new Error(build.stderr || build.stdout);
    payload = await inspectFlight(candidateRoot);
    return payload;
  }
  return evaluateV2([
    { id: "candidate-protection", run() { expect(protection).toEqual([]); } },
    { id: "flight-preserves-visible-members", async run() { const current = await buildAndInspect(); expect(current).toContain('"name":"Ada"'); expect(current).toContain('"role":"admin"'); } },
    { id: "directory-browser-behavior", async run() { await buildAndInspect(); const browser = await run([process.execPath, "run", "test:e2e:built"], candidateRoot); expect(browser.code, browser.stderr || browser.stdout).toBe(0); } },
  ], [
    { id: "avoid-duplicate-member-identities", maxPoints: 50, async run() { return !(await buildAndInspect()).includes('"memberIds"') ? 50 : 0; } },
    { id: "keep-server-notes-out-of-flight", maxPoints: 50, async run() { return !(await buildAndInspect()).includes('"internalNote"') ? 50 : 0; } },
  ]);
}
