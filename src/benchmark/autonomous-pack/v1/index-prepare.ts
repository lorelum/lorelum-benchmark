import { lstat, mkdir, readdir, readlink, writeFile } from "node:fs/promises";
import { isAbsolute, join, relative, resolve, sep } from "node:path";
import { sha256Directory, sha256File } from "../../fs";

// Run only in the declared networkless preparation container, not in an Agent workspace.
const [condition, packDigest, modelDigest, profileId, encodingId] = process.argv.slice(2);
if ((condition !== "empty-store" && condition !== "pack-installed") || ![packDigest, modelDigest, profileId, encodingId].every(value => /^[a-f0-9]{64}$/.test(value ?? ""))) {
  throw new Error("Expected condition and four SHA-256 identities: pack, model, profile and encoding");
}
const home = "/tmp/lorelum/home";
const store = "/out/store";
const cache = "/out/cache";
const model = "/model/model.gguf";
const pack = "/pack";
async function checkTree(root: string, directory: string, allowInternalLinks: boolean): Promise<void> {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    const stat = await lstat(path);
    if (stat.isSymbolicLink()) {
      if (!allowInternalLinks) throw new Error("Pack snapshot contains a symbolic link");
      const target = await readlink(path);
      const inside = relative(root, resolve(directory, target));
      if (isAbsolute(target) || inside === ".." || inside.startsWith(`..${sep}`) || isAbsolute(inside)) throw new Error("Index snapshot contains an external symbolic link");
    } else if (stat.isDirectory()) await checkTree(root, path, allowInternalLinks);
    else if (!stat.isFile()) throw new Error("Snapshot contains a special file");
  }
}
await checkTree(pack, pack, false);
if (await sha256File(model) !== modelDigest) throw new Error("Embedding model digest mismatch");
if (await sha256Directory(pack) !== packDigest) throw new Error("Pack snapshot digest mismatch");
// Exclusive creation refuses to mix this preparation with previous artifacts.
await mkdir(store);
await mkdir(cache);
await mkdir(join(home, ".lorelum"), { recursive: true, mode: 0o700 });
await writeFile(join(home, ".lorelum", "config.yaml"), `embedding:\n  modelPath: ${model}\nquery:\n  retrievalMethod: single-vector\n`, { mode: 0o600, flag: "wx" });
type JsonRecord = Record<string, unknown>;
type LoreResult = { exit: number; response: JsonRecord };
function record(value: unknown): value is JsonRecord {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
function failureCode(result: LoreResult): string {
  return record(result.response.error) && typeof result.response.error.code === "string" ? result.response.error.code : `exit ${result.exit}`;
}


async function lore(args: string[]): Promise<LoreResult> {
  const child = Bun.spawn(["/opt/lorelum/lore", "--json", "--store-root", store, "--no-project", ...args], {
    env: { HOME: home, PATH: process.env.PATH ?? "/usr/local/bin:/usr/bin:/bin", TMPDIR: "/tmp" },
    stdout: "pipe", stderr: "pipe",
  });
  const [exit, stdout, stderr] = await Promise.all([child.exited, new Response(child.stdout).text(), new Response(child.stderr).text()]);
  let response: unknown;
  try { response = JSON.parse(stdout); } catch { throw new Error(`Lore returned invalid JSON (exit ${exit}): ${stderr.trim()}`); }
  if (!record(response) || typeof response.ok !== "boolean") throw new Error("Lore returned an invalid envelope");
  return { exit, response };
}
function requireSuccess(result: LoreResult, name: string): JsonRecord {
  if (result.exit !== 0 || result.response.ok !== true || !record(result.response.data)) {
    throw new Error(`${name} failed: ${failureCode(result)}`);
  }
  return result.response.data;
}
let stopped = false;
try {
  if (condition === "pack-installed") {
    const installation = requireSuccess(await lore(["pack", "install", "--path", pack]), "Pack installation");
    if (record(installation.indexSync) && installation.indexSync.state === "failed") throw new Error("Pack installation index sync failed");
  }
  const deadline = Date.now() + 120_000;
  let query: unknown;
  while (Date.now() < deadline) {
    const result = await lore(["--cache-root", cache, "query", "--mode", "single-vector", "--require-complete", "--", "readiness check"]);
    if (result.response.ok === true && result.exit === 0) { query = result.response.data; break; }
    if (result.response.ok !== true || !record(result.response.data) || (result.response.data.state !== "preparing" && result.response.data.state !== "indexing")) {
      throw new Error(`Semantic readiness failed: ${failureCode(result)}`);
    }
    await Bun.sleep(1000);
  }
  if (!record(query) || query.mode !== "semantic" || query.retrievalMethod !== "single-vector" || query.coverage !== "complete" || query.profileId !== profileId || !Array.isArray(query.results)) throw new Error("Semantic readiness or profile identity mismatch");
  if (condition === "empty-store" && query.results.length !== 0) throw new Error("Empty Store returned Practices");
  const index = requireSuccess(await lore(["index", "status"]), "Index status");
  if (index.profileId !== profileId || (condition === "pack-installed" ? index.state !== "ready" : index.state !== "missing" && index.state !== "ready")) throw new Error("Index status or profile identity mismatch");
  requireSuccess(await lore(["model", "load"]), "Model load");
  const modelStatus = requireSuccess(await lore(["model", "status"]), "Model status");
  if (modelStatus.state !== "ready" || modelStatus.encodingId !== encodingId) throw new Error("Embedding encoding identity mismatch");
  requireSuccess(await lore(["backend", "stop"]), "Backend stop");
  stopped = true;
  await checkTree(pack, pack, false);
  if (await sha256File(model) !== modelDigest || await sha256Directory(pack) !== packDigest) throw new Error("Preparation input changed during indexing");
  await checkTree(store, store, true);
  await checkTree(cache, cache, true);
  // Archive the quiesced directories, including relative symlinks: a file-only
  // directory digest silently omits Lore's installed-Pack `current` link.
  const archive = "/out/index.tar";
  await writeFile(archive, "", { flag: "wx", mode: 0o600 });
  const tar = Bun.spawn(["tar", "-C", "/out", "-cf", archive, "store", "cache"], { stdout: "pipe", stderr: "pipe" });
  const [tarExit, tarError] = await Promise.all([tar.exited, new Response(tar.stderr).text()]);
  if (tarExit !== 0) throw new Error(`Index archive failed: ${tarError.trim()}`);
  const indexSha256 = await sha256File(archive);
  console.log(JSON.stringify({ condition, pack_sha256: packDigest, model_sha256: modelDigest, profile_id: profileId, encoding_id: encodingId, index_sha256: indexSha256 }));
} finally {
  if (!stopped) await lore(["backend", "stop"]).catch(() => {});
}
