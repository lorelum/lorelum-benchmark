import { spawn, type ChildProcess } from "node:child_process";
import { constants } from "node:fs";
import { lstat, mkdir, open, readFile, writeFile } from "node:fs/promises";
import { isIP } from "node:net";

const ROOT = "/opt/autonomous-pack/src/benchmark/autonomous-pack/v1";
const HOME = "/tmp/lorelum/home";
const AGENT = `${HOME}/.pi/agent`;
const MAX_TIMER = 2_147_483_647;

type Config = {
  index_sha256: string;
  model_sha256: string;
  proxy_url: string;
  model_id: string;
  context_window: number;
  max_tokens: number;
  max_turns: number;
  max_duration_ms: number;
  audit_wait_ms: number;
};

function parseConfig(value: unknown): Config {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid agent configuration");
  const c = value as Record<string, unknown>;
  const keys = ["index_sha256", "model_sha256", "proxy_url", "model_id", "context_window", "max_tokens", "max_turns", "max_duration_ms", "audit_wait_ms"];
  if (Object.keys(c).length !== keys.length || keys.some(key => !Object.hasOwn(c, key))) throw new Error("Invalid agent configuration fields");
  for (const key of ["index_sha256", "model_sha256"]) if (typeof c[key] !== "string" || !/^[a-f0-9]{64}$/.test(c[key] as string)) throw new Error("Invalid digest");
  for (const key of ["context_window", "max_tokens", "max_turns", "max_duration_ms", "audit_wait_ms"]) {
    if (typeof c[key] !== "number" || !Number.isSafeInteger(c[key]) || (c[key] as number) < 1 || (c[key] as number) > MAX_TIMER) throw new Error("Invalid agent budget or model limits");
  }
  if ((c.max_tokens as number) > (c.context_window as number)) throw new Error("Invalid model limits");
  if (typeof c.model_id !== "string" || !/^[A-Za-z0-9][A-Za-z0-9._/-]{0,199}$/.test(c.model_id)) throw new Error("Invalid model identifier");
  if (typeof c.proxy_url !== "string") throw new Error("Invalid proxy URL");
  let url: URL;
  try { url = new URL(c.proxy_url); } catch { throw new Error("Invalid proxy URL"); }
  // Only a numeric private IPv4 proxy address is accepted; network isolation is
  // still the runner's responsibility. No credentials, query, or redirect URL.
  const parts = url.hostname.split(".").map(Number);
  const privateAddress = isIP(url.hostname) === 4 && (parts[0] === 10 || parts[0] === 127 || (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) || (parts[0] === 192 && parts[1] === 168));
  if (url.protocol !== "http:" || !privateAddress || !url.port || url.username || url.password || url.search || url.hash || url.pathname.replace(/\/+$/, "") !== "/v1") throw new Error("Invalid proxy URL");
  return c as Config;
}

async function publicFile(path: string): Promise<string> {
  const info = await lstat(path);
  if (!info.isFile() || info.isSymbolicLink() || info.size > 1_048_576) throw new Error("Invalid public input");
  const text = await readFile(path, "utf8");
  if (!text.trim() || text.includes("\0")) throw new Error("Invalid public input");
  return text;
}

function environment(): NodeJS.ProcessEnv {
  return {
    PATH: "/usr/local/bin:/usr/bin:/bin", HOME,
    XDG_CONFIG_HOME: `${HOME}/.config`, XDG_CACHE_HOME: `${HOME}/.cache`, XDG_DATA_HOME: `${HOME}/.local/share`,
    PI_CODING_AGENT_DIR: AGENT, LORE_CLI_PATH: "/opt/lorelum/lore",
    LORE_STORE_ROOT: `${HOME}/.lorelum`, LORE_CACHE_ROOT: `${HOME}/.lorelum/cache`,
    LORELUM_PLACEHOLDER_KEY: "not-a-secret",
  };
}

async function handshake(path: string, expected: string, timeoutMs: number, marker: string): Promise<void> {
  // A nonblocking read descriptor is opened before the marker, so a runner
  // following docker logs can open the writer immediately without an ENXIO race.
  const input = await open(path, constants.O_RDONLY | constants.O_NONBLOCK | constants.O_NOFOLLOW);
  try {
    if (!(await input.stat()).isFIFO()) throw new Error("Audit control is not a FIFO");
    process.stderr.write(marker);
    const deadline = Date.now() + timeoutMs;
    const bytes = Buffer.alloc(expected.length + 1);
    let length = 0;
    while (Date.now() < deadline) {
      let count = 0;
      try { count = (await input.read(bytes, length, bytes.length - length, null)).bytesRead; }
      catch (error) { if ((error as NodeJS.ErrnoException).code !== "EAGAIN") throw error; }
      length += count;
      const data = bytes.subarray(0, length).toString("utf8");
      if (!expected.startsWith(data)) throw new Error("Invalid audit handshake");
      if (data === expected) return;
      const { promise, resolve } = Promise.withResolvers<void>();
      setTimeout(resolve, Math.min(25, Math.max(1, deadline - Date.now())));
      await promise;
    }
    throw new Error("Audit handshake timed out");
  } finally { await input.close(); }
}

function childExit(child: ChildProcess): Promise<number | null> {
  const { promise, resolve, reject } = Promise.withResolvers<number | null>();
  child.once("error", reject);
  child.once("close", resolve);
  return promise;
}

async function run(): Promise<number> {
  const config = parseConfig(JSON.parse(await publicFile("/inputs/agent.json")));
  const task = await publicFile("/inputs/task.md");
  const system = await publicFile("/inputs/system.md");
  const env = environment();
  await mkdir(HOME, { recursive: true, mode: 0o700 });
  const restore = spawn("/usr/local/bin/bun", ["run", `${ROOT}/index-restore.ts`, config.index_sha256, config.model_sha256], { cwd: "/workspace", env, stdio: "ignore" });
  const restoreCode = await childExit(restore);
  if (restoreCode !== 0) throw new Error("Index restore failed");
  await mkdir(AGENT, { recursive: true, mode: 0o700 });
  await writeFile(`${AGENT}/models.json`, JSON.stringify({ providers: { gateway: { baseUrl: config.proxy_url, api: "openai-completions", apiKey: "$LORELUM_PLACEHOLDER_KEY", models: [{ id: config.model_id, name: config.model_id, reasoning: false, input: ["text"], contextWindow: config.context_window, maxTokens: config.max_tokens }] } } }), { flag: "wx", mode: 0o600 });
  await writeFile(`${AGENT}/settings.json`, JSON.stringify({ compaction: { enabled: false }, retry: { enabled: false, provider: { maxRetries: 0 } }, shellPath: "/bin/bash" }), { flag: "wx", mode: 0o600 });

  // Agent-core awaits turn_start before preparing the next provider request.
  // A hard exit avoids relying on an asynchronous stdout observer. The proxy
  // independently limits provider requests to the same budget.
  const guard = `${AGENT}/turn-limit.mjs`;
  await writeFile(guard, `export default function(pi) { let turns = 0; pi.on("turn_start", () => { if (++turns > ${config.max_turns}) process.exit(86); }); }\n`, { flag: "wx", mode: 0o600 });

  // The runner attaches to this process and all descendants before acknowledging.
  await handshake("/control/attached", "ATTACHED\n", config.audit_wait_ms, `AUDIT_READY ${process.pid}\n`);
  const child = spawn("/usr/local/bin/pi", ["--print", "--mode", "json", "--no-session", "--no-approve", "--offline", "--no-extensions", "--no-mcp", "--no-skills", "--no-prompt-templates", "--no-themes", "--no-context-files", "--extension", `${ROOT}/lore-extension.ts`, "--extension", guard, "--tools", "read,bash,edit,write,grep,find,ls,lore_query,lore_get", "--provider", "gateway", "--model", config.model_id, "--system-prompt", system], { cwd: "/workspace", env, detached: true, stdio: ["pipe", "inherit", "ignore"] });
  // Stdin avoids Pi's positional @file expansion and preserves task text exactly.
  child.stdin?.on("error", () => {});
  child.stdin?.end(task);
  let timedOut = false;
  const timer = setTimeout(() => { timedOut = true; if (child.pid) { try { process.kill(-child.pid, "SIGKILL"); } catch {} } }, config.max_duration_ms);
  let code: number | null = null;
  let failed = false;
  try { code = await childExit(child); } catch { failed = true; }
  clearTimeout(timer);
  // Stop remaining descendants before asking the host to finish collecting trace.
  if (child.pid) { try { process.kill(-child.pid, "SIGKILL"); } catch {} }
  const result = timedOut ? "time_limit" : code === 86 ? "turn_limit_or_failure" : failed || code === null ? "failure" : `exit_${code}`;
  process.stderr.write(`AGENT_RESULT ${result}\n`);
  await handshake("/control/finished", "FINISHED\n", config.audit_wait_ms, "AUDIT_FINISH\n");
  if (failed || timedOut || code === null || code === 86) return 1;
  return code;
}

if (import.meta.main) {
  run().then(code => { process.exitCode = code; }).catch(() => { console.error("Agent bootstrap failed"); process.exitCode = 1; });
}
