import { existsSync } from "node:fs";
import { realpath } from "node:fs/promises";
import { spawn, spawnSync } from "node:child_process";
import { createServer, type AddressInfo } from "node:net";
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import {
  createBashTool,
  createEditTool,
  createFindTool,
  createGrepTool,
  createLsTool,
  createLocalBashOperations,
  createReadTool,
  createWriteTool,
  type ExtensionAPI,
} from "@earendil-works/pi-coding-agent";

type PathParameters = { path?: unknown };
type AnyTool = Record<string, any>;

async function confinedPath(value: string, cwd: string): Promise<string | undefined> {
  const root = await realpath(cwd);
  const lexical = resolve(root, value);
  let physical = lexical;
  try {
    physical = await realpath(lexical);
  } catch {
    const parent = await realpath(dirname(lexical)).catch(() => undefined);
    if (!parent) return undefined;
    physical = join(parent, basename(lexical));
  }
  const fromRoot = relative(root, physical);
  if (fromRoot === "" || (fromRoot !== ".." && !fromRoot.startsWith(`..${sep}`) && !isAbsolute(fromRoot))) return physical;
  return undefined;
}

async function confinePathParameter<T extends PathParameters>(params: T, cwd: string): Promise<T> {
  if (params.path === undefined) return params;
  if (typeof params.path !== "string") return params;
  const root = await realpath(cwd);
  const value = params.path.trim() === "" ? "." : params.path;
  const safe = await confinedPath(value, cwd);
  if (!safe) throw new Error(`Path is outside the diagnostic workspace: ${String(params.path)}`);
  return { ...params, path: safe === root ? root : safe };
}

async function freePort(): Promise<number> {
  return new Promise((resolvePort, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address() as AddressInfo;
      const port = address.port;
      server.close(() => resolvePort(port));
    });
  });
}

async function waitForUrl(url: string, timeoutMs: number): Promise<boolean> {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(5_000) });
      if (response.ok) return true;
    } catch {
      // retry until the server is ready
    }
    await new Promise((r) => setTimeout(r, 1_000));
  }
  return false;
}

type BashExecOptions = {
  onData: (data: Buffer) => void;
  signal?: AbortSignal;
  timeout?: number;
  env?: NodeJS.ProcessEnv;
};

async function runBunTest(workingDirectory: string, options: BashExecOptions): Promise<{ exitCode: number | null }> {
  const port = await freePort();
  const shell = process.env.LORELUM_PI_SHELL ?? "bash";
  // Playwright cannot tear down the bun->vite process tree on Windows, so it
  // hangs after the tests finish. Run the dev server out-of-band and point
  // playwright at it via PLAYWRIGHT_BASE_URL so `bun run test` exits cleanly.
  const viteBin = join(workingDirectory, "node_modules", "vite", "bin", "vite.js");
  const server = existsSync(viteBin)
    ? spawn(process.execPath, [viteBin, "--host", "127.0.0.1", "--port", String(port)], {
        cwd: workingDirectory,
        detached: true,
        stdio: "ignore",
        env: options.env ?? process.env,
      })
    : spawn(shell, ["-c", `bun run dev -- --host 127.0.0.1 --port ${port}`], {
        cwd: workingDirectory,
        detached: true,
        stdio: "ignore",
        env: options.env ?? process.env,
      });
  try {
    const ready = await waitForUrl(`http://127.0.0.1:${port}`, 120_000);
    if (!ready) {
      options.onData(Buffer.from("[lorelum] vite dev server did not become ready within 120s\n", "utf8"));
      return { exitCode: 1 };
    }
    return await localBash.exec("bun run test", workingDirectory, {
      ...options,
      env: { ...(options.env ?? process.env), PLAYWRIGHT_BASE_URL: `http://127.0.0.1:${port}` },
    });
  } finally {
    if (server.pid) {
      try {
        process.kill(server.pid, "SIGKILL");
      } catch {
        // fall through to taskkill
      }
      try {
        spawnSync("taskkill", ["/pid", String(server.pid), "/T", "/F"], { windowsHide: true, timeout: 5_000 });
      } catch {
        // best-effort cleanup
      }
    }
  }
}

function projectDirectory(workingDirectory: string): string {
  const app = join(workingDirectory, "app");
  if (existsSync(join(app, "package.json"))) return app;
  return workingDirectory;
}

const cwd = process.cwd();
const localBash = createLocalBashOperations({ shellPath: process.env.LORELUM_PI_SHELL });
const allowedBashCommands = new Set(["bun install", "bun install --frozen-lockfile", "bun run test", "bun run build", "pwd"]);

const tools: AnyTool[] = [
  createReadTool(cwd),
  createEditTool(cwd),
  createWriteTool(cwd),
  createGrepTool(cwd),
  createFindTool(cwd),
  createLsTool(cwd),
  createBashTool(cwd, {
    operations: {
      ...localBash,
      exec: async (command: string, workingDirectory: string, options: BashExecOptions) => {
        const normalized = command.trim().replaceAll("\r\n", "\n");
        if (!allowedBashCommands.has(normalized)) {
          options.onData(Buffer.from(`[lorelum] Command not allowed. Allowed commands: ${[...allowedBashCommands].join(", ")}\n`, "utf8"));
          return { exitCode: 126 };
        }
        if (normalized === "bun run test") {
          return runBunTest(projectDirectory(workingDirectory), options);
        }
        if (normalized === "bun install" || normalized === "bun install --frozen-lockfile" || normalized === "bun run build") {
          return localBash.exec(normalized, projectDirectory(workingDirectory), options);
        }
        return localBash.exec(normalized, workingDirectory, options);
      },
    },
  }),
];

export default function workspaceToolsExtension(pi: ExtensionAPI): void {
  for (const tool of tools) {
    pi.registerTool({
      ...tool,
      execute: async (id: string, params: PathParameters, signal: AbortSignal, onUpdate: unknown, ctx: { cwd?: string }) => {
        const safeParams = await confinePathParameter(params, ctx?.cwd ?? cwd);
        return tool.execute(id, safeParams, signal, onUpdate, ctx);
      },
    } as any);
  }
}
