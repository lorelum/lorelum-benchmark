import { readdir } from "node:fs/promises";
import { joinPath, listDirectories, pathExists, relativePath, sha256File, workspaceRoot } from "./fs";
import { discoverTasks, type TaskLocation } from "./task-discovery";

type Snapshot = {
  version: 1;
  algorithm: "sha256";
  snapshot_id: string;
  files: Record<string, string>;
};

type CandidateLocation = {
  track: "practice-effectiveness";
  reference: string;
  path: string;
};

type SnapshotTarget =
  | { kind: "suite-task"; group: string; reference: string; path: string }
  | { kind: "incubator-candidate"; group: string; reference: string; path: string };

const argumentsList = Bun.argv.slice(2);
const writeMode = argumentsList.includes("--write");
const incubatorMode = argumentsList.includes("--incubator");
const [group, reference] = argumentsList.filter((argument) => !argument.startsWith("--"));
const failures: string[] = [];

async function discoverCandidates(): Promise<CandidateLocation[]> {
  const track: CandidateLocation["track"] = "practice-effectiveness";
  const candidatesPath = joinPath(workspaceRoot, "incubator", track);
  const candidates: CandidateLocation[] = [];
  for (const candidate of await listDirectories(candidatesPath)) {
    candidates.push({ track, reference: candidate, path: joinPath(candidatesPath, candidate) });
  }
  return candidates.sort((left, right) => left.reference.localeCompare(right.reference));
}

async function listSnapshotFiles(path: string, relative = ""): Promise<string[]> {
  const entries = await readdir(path, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const entryRelative = relative ? `${relative}/${entry.name}` : entry.name;
    if (entry.isDirectory()) files.push(...await listSnapshotFiles(joinPath(path, entry.name), entryRelative));
    else if (entry.isFile()) files.push(entryRelative);
  }
  return files;
}

async function snapshotFiles(target: SnapshotTarget): Promise<Record<string, string>> {
  const files = await listSnapshotFiles(target.path);
  const included = files.filter((file) => file !== "private/snapshot.json").sort();
  return Object.fromEntries(await Promise.all(included.map(async (file) => [file, await sha256File(joinPath(target.path, file))])));
}

async function snapshotId(files: Record<string, string>): Promise<string> {
  const content = new TextEncoder().encode(JSON.stringify(files));
  const digest = await crypto.subtle.digest("SHA-256", content);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

const allTasks: SnapshotTarget[] = (await discoverTasks()).map((task: TaskLocation) => ({
  kind: "suite-task",
  group: task.suite,
  reference: task.reference,
  path: task.path,
}));
const allCandidates: SnapshotTarget[] = (await discoverCandidates()).map((candidate) => ({
  kind: "incubator-candidate",
  group: candidate.track,
  reference: candidate.reference,
  path: candidate.path,
}));
const availableTargets = incubatorMode ? allCandidates : (group || reference ? allTasks : [...allTasks, ...allCandidates]);
const selectedTargets = availableTargets.filter((target) => (!group || target.group === group) && (!reference || target.reference === reference));
if ((group || reference) && selectedTargets.length === 0) {
  failures.push(`${incubatorMode ? "Candidate" : "Task"} not found: ${group ?? "*"} ${reference ?? "*"}`);
}

for (const target of selectedTargets) {
  const snapshotPath = joinPath(target.path, "private", "snapshot.json");
  const files = await snapshotFiles(target);
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
    if (expectedFiles[file] !== files[file]) failures.push(`Snapshot mismatch: ${relativePath(target.path)}/${file}`);
  }
}

if (!writeMode && failures.length > 0) {
  console.error("Snapshot verification failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

if (!writeMode) console.log("Snapshots are intact.");
