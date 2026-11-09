import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

// Offline only: no credentials, model calls, Pack installation, or assertion
// about a separately configured API egress proxy.
const image = process.argv[2];
if (!image || !/^sha256:[0-9a-f]{64}$/.test(image) || process.argv.length !== 3) {
  throw new Error("Usage: bun run environments/autonomous-pack/v1/isolation-preflight.ts sha256:<local-image-id>");
}

async function run(args: string[], label: string): Promise<string> {
  const child = Bun.spawn(args, {
    env: { ...process.env, AWS_SECRET_ACCESS_KEY: "host-secret-sentinel", GITHUB_TOKEN: "host-token-sentinel" },
    stdout: "pipe", stderr: "pipe",
  });
  const [code, stdout, stderr] = await Promise.all([
    child.exited, new Response(child.stdout).text(), new Response(child.stderr).text(),
  ]);
  if (code !== 0) throw new Error(`${label} failed (exit ${code}): ${stderr.trim() || stdout.trim()}`);
  return stdout.trim();
}

const id = await run(["docker", "image", "inspect", "--format", "{{.Id}}", image], "image inspection");
if (id !== image) throw new Error("Image ID mismatch");
const root = await mkdtemp(join(tmpdir(), "lorelum-autonomous-isolation-"));
try {
  const workspace = join(root, "workspace");
  await mkdir(workspace);
  await mkdir(join(root, "private"));
  await writeFile(join(workspace, "public-marker"), "public-only");
  await writeFile(join(root, "private", "private-marker"), "must-not-be-mounted");
  const base = [
    "docker", "run", "--rm", "--read-only", "--cap-drop=ALL", "--security-opt=no-new-privileges",
    "--pids-limit", "256", "--memory", "2g", "--network", "none", "--workdir", "/workspace",
    "--tmpfs", "/tmp:rw,nosuid,nodev,size=2g,mode=1777",
    "--mount", `type=bind,src=${workspace},dst=/workspace`,
  ];
  const version = await run([...base, image, "--version"], "Pi entrypoint");
  if (version !== "1.5.0") throw new Error("Pi version mismatch");
  const checks = [
    'test "$(id -u)" = 65532',
    'test "$(bun --version)" = 1.4.4',
    'test "$(node --version)" = v26.13.0',
    'test "$(pi --version)" = 1.5.0',
    'lore --version | grep -F 0.1.0-alpha.7 >/dev/null',
    'test -n "$(ps -o lstart= -o stat= -p $$)"',
    'test "$HOME" = /tmp/lorelum/home',
    'test "$LORE_CLI_PATH" = /opt/lorelum/lore',
    'test "$LORE_STORE_ROOT" = "$HOME/.lorelum"',
    'test "$LORE_CACHE_ROOT" = "$HOME/.lorelum/cache"',
    'test "$(cat /workspace/public-marker)" = public-only',
    'test ! -e /private/private-marker',
    'test ! -e /workspace/private',
    'test -z "${AWS_SECRET_ACCESS_KEY:-}"',
    'test -z "${GITHUB_TOKEN:-}"',
    'test ! -e /tmp/lorelum/home/sentinel',
    'test ! -e "$LORE_STORE_ROOT/sentinel"',
    'test ! -e "$LORE_CACHE_ROOT/sentinel"',
    'mkdir -p "$HOME" "$LORE_STORE_ROOT" "$LORE_CACHE_ROOT"',
    'touch "$HOME/sentinel" "$LORE_STORE_ROOT/sentinel" "$LORE_CACHE_ROOT/sentinel"',
    '! touch /opt/lorelum/should-not-write',
    `node -e 'const s=require("node:net").connect({host:"1.1.1.1",port:443}); s.setTimeout(3000); s.on("connect",()=>process.exit(1)); s.on("error",()=>process.exit(0)); s.on("timeout",()=>process.exit(0));'`,
  ].join("\n");
  for (const label of ["first isolated container", "fresh isolated container"]) {
    await run([...base, "--entrypoint", "/bin/sh", image, "-ec", checks], label);
  }
} finally {
  await rm(root, { force: true, recursive: true });
}
console.log("Offline container isolation preflight passed; API egress isolation was not assessed.");
