import { constants } from "node:fs";
import { copyFile, cp, lstat, mkdir, mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { sha256File } from "../../fs";
import { validateIndexArchive } from "./index-archive";

// Run before the agent starts, inside its fresh network-isolated container.
const [indexDigest, modelDigest] = process.argv.slice(2);
if (process.argv.length !== 4 || ![indexDigest, modelDigest].every(value => /^[a-f0-9]{64}$/.test(value ?? ""))) {
  throw new Error("Expected index archive and embedding model SHA-256 identities");
}
const home = "/tmp/lorelum/home";
const store = join(home, ".lorelum");
const cache = join(store, "cache");
if (process.env.HOME !== home || process.env.LORE_STORE_ROOT !== store || process.env.LORE_CACHE_ROOT !== cache) throw new Error("Runtime Store paths do not match the isolated environment");
const model = "/model/model.gguf";
if (await sha256File(model) !== modelDigest) throw new Error("Embedding model digest mismatch");
const source = "/inputs/index.tar";
const sourceInfo = await lstat(source);
if (!sourceInfo.isFile() || sourceInfo.isSymbolicLink()) throw new Error("Index archive must be a regular file");
async function copyContents(sourceDirectory: string, destinationDirectory: string): Promise<void> {
  for (const name of await readdir(sourceDirectory)) {
    await cp(join(sourceDirectory, name), join(destinationDirectory, name), { recursive: true, force: false, errorOnExist: true, verbatimSymlinks: true });
  }
}
const stage = await mkdtemp("/tmp/lorelum-index-restore-");
let createdStore = false;
try {
  // Copy before verification so host-side modifications cannot race extraction.
  const archive = join(stage, "index.tar");
  await copyFile(source, archive, constants.COPYFILE_EXCL);
  if (await sha256File(archive) !== indexDigest) throw new Error("Index archive digest mismatch");
  await validateIndexArchive(archive);
  const unpacked = join(stage, "unpacked");
  await mkdir(unpacked, { mode: 0o700 });
  const tar = Bun.spawn(["tar", "--extract", "--no-same-owner", "--no-same-permissions", "--file", archive, "--directory", unpacked], { stdout: "pipe", stderr: "pipe" });
  const [exit, stderr] = await Promise.all([tar.exited, new Response(tar.stderr).text()]);
  if (exit !== 0) throw new Error(`Index archive extraction failed: ${stderr.trim()}`);
  await mkdir(home, { recursive: true, mode: 0o700 });
  await mkdir(store, { mode: 0o700 });
  createdStore = true;
  await copyContents(join(unpacked, "store"), store);
  // The generated archive has a separate cache; an embedded cache is ambiguous.
  await mkdir(cache, { mode: 0o700 });
  await copyContents(join(unpacked, "cache"), cache);
  await writeFile(join(store, "config.yaml"), `embedding:\n  modelPath: ${model}\nquery:\n  retrievalMethod: single-vector\n`, { flag: "wx", mode: 0o600 });
  console.log(JSON.stringify({ index_sha256: indexDigest, model_sha256: modelDigest }));
} catch (error) {
  if (createdStore) await rm(store, { recursive: true, force: true });
  throw error;
} finally {
  await rm(stage, { recursive: true, force: true });
}
