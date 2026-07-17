import { joinPath, pathExists, relativePath, sha256File } from "./fs";
import { discoverTasks, type TaskLocation } from "./task-discovery";

type Snapshot = {
  version: 1;
  algorithm: "sha256";
  snapshot_id: string;
  files: Record<string, string>;
};

const argumentsList = Bun.argv.slice(2);
const writeMode = argumentsList.includes("--write");
const [suite, reference] = argumentsList.filter((argument) => !argument.startsWith("--"));
const failures: string[] = [];

async function snapshotFiles(task: TaskLocation): Promise<Record<string, string>> {
  const files = (await Array.fromAsync(
    new Bun.Glob("**/*").scan({ cwd: task.path, onlyFiles: true }),
  )).map((file) => file.replaceAll("\\", "/"));
  const included = files.filter((file) => file !== "private/snapshot.json").sort();
  return Object.fromEntries(await Promise.all(included.map(async (file) => [file, await sha256File(joinPath(task.path, file))])));
}

async function snapshotId(files: Record<string, string>): Promise<string> {
  const content = new TextEncoder().encode(JSON.stringify(files));
  const digest = await crypto.subtle.digest("SHA-256", content);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

const allTasks = await discoverTasks();
const selectedTasks = allTasks.filter((task) => (!suite || task.suite === suite) && (!reference || task.reference === reference));
if ((suite || reference) && selectedTasks.length === 0) failures.push(`Task not found: ${suite ?? "*"} ${reference ?? "*"}`);

for (const task of selectedTasks) {
  const snapshotPath = joinPath(task.path, "private", "snapshot.json");
  const files = await snapshotFiles(task);
  const document: Snapshot = { version: 1, algorithm: "sha256", snapshot_id: await snapshotId(files), files };

  if (writeMode) {
    await Bun.write(snapshotPath, `${JSON.stringify(document, null, 2)}\n`);
    console.log(`Wrote ${relativePath(snapshotPath)}`);
    continue;
  }

  if (!(await pathExists(snapshotPath))) {
    failures.push(`Missing snapshot: ${relativePath(snapshotPath)}`);
    continue;
  }

  let expected: Snapshot;
  try {
    expected = JSON.parse(await Bun.file(snapshotPath).text()) as Snapshot;
  } catch (error) {
    failures.push(`Invalid snapshot ${relativePath(snapshotPath)}: ${error instanceof Error ? error.message : String(error)}`);
    continue;
  }

  if (expected.version !== 1 || expected.algorithm !== "sha256" || expected.snapshot_id !== document.snapshot_id) {
    failures.push(`Unsupported snapshot format: ${relativePath(snapshotPath)}`);
    continue;
  }

  const expectedFiles = expected.files ?? {};
  const allFiles = new Set([...Object.keys(expectedFiles), ...Object.keys(files)]);
  for (const file of [...allFiles].sort()) {
    if (expectedFiles[file] !== files[file]) failures.push(`Snapshot mismatch: ${relativePath(task.path)}/${file}`);
  }
}

if (!writeMode && failures.length > 0) {
  console.error("Snapshot verification failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

if (!writeMode) console.log("Task snapshots are intact.");
