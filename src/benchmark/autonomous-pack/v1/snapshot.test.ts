import { afterEach, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { chmod, mkdtemp, mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { hashContract } from "./plan";
import { prepareRunWorkspace, type PreparedInputs } from "./runner-preparation";
import { sha256SnapshotDirectory, snapshotPack } from "./snapshot";

const roots: string[] = [];
afterEach(async () => { for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true }); });

test("snapshot preserves bytes, identifies changes and refuses to replace existing snapshots", async () => {
  const root = await mkdtemp(join(tmpdir(), "autonomous-pack-"));
  roots.push(root);
  const source = join(root, "source");
  await mkdir(source);
  await writeFile(join(source, "pack.yaml"), "name: example\n");
  const first = join(root, "first");
  const digest = await snapshotPack(source, first);
  expect(await readFile(join(first, "pack.yaml"), "utf8")).toBe("name: example\n");
  await writeFile(join(source, "pack.yaml"), "name: changed\n");
  expect(await snapshotPack(source, join(root, "second"))).not.toBe(digest);
  await expect(snapshotPack(source, first)).rejects.toThrow();
  expect(await readFile(join(first, "pack.yaml"), "utf8")).toBe("name: example\n");
  await expect(snapshotPack(source, join(source, "..inside", "snapshot"))).rejects.toThrow();
});

test("snapshot identity includes hidden files and empty directories", async () => {
  const root = await mkdtemp(join(tmpdir(), "autonomous-pack-hidden-"));
  roots.push(root);
  const source = join(root, "source");
  await mkdir(source);
  await writeFile(join(source, ".hidden"), "before");
  const before = await sha256SnapshotDirectory(source);
  await writeFile(join(source, ".hidden"), "after");
  const changed = await sha256SnapshotDirectory(source);
  expect(changed).not.toBe(before);
  await mkdir(join(source, ".empty"));
  expect(await sha256SnapshotDirectory(source)).not.toBe(changed);
  const destination = join(root, "frozen");
  expect(await snapshotPack(source, destination)).toBe(await sha256SnapshotDirectory(source));
  expect(await readFile(join(destination, ".hidden"), "utf8")).toBe("after");
});

test("prepared public workspace is writable without changing frozen inputs or private ancestors", async () => {
  const root = await mkdtemp(join(tmpdir(), "autonomous-pack-workspace-"));
  roots.push(root);
  const starter = join(root, "starter"), task = join(root, "task.md");
  await mkdir(starter, { mode: 0o700 });
  await mkdir(join(starter, "nested"), { mode: 0o700 });
  await writeFile(join(starter, "nested", "file"), "public", { mode: 0o600 });
  await writeFile(join(starter, "run"), "script", { mode: 0o700 });
  await writeFile(task, "prompt");
  if (process.platform !== "win32") {
    await chmod(starter, 0o700);
    await chmod(join(starter, "nested"), 0o700);
    await chmod(join(starter, "nested", "file"), 0o600);
    await chmod(join(starter, "run"), 0o700);
  }
  const starterSha256 = await sha256SnapshotDirectory(starter);
  const inputSha = hashContract({ task_sha256: createHash("sha256").update("prompt").digest("hex"), starter_sha256: starterSha256 });
  const inputs: PreparedInputs = {
    root, pack: "", tasks: new Map([["task", { task, starter, evaluator: "", starterSha256 }]]),
    common: { environment: "", modelParameters: "", profile: "", toolPolicy: "", systemPrompt: "" },
    schedule: [{ pair_id: "", task_id: "task", repetition: 0, condition: "empty-store", ordinal: 0, input_sha256: inputSha, common_sha256: "" }],
    planSha256: "",
  };
  const { workspace, prompt } = await prepareRunWorkspace(inputs, 0);
  expect(prompt).toBe("prompt");
  expect(await readFile(join(workspace, "nested", "file"), "utf8")).toBe("public");
  if (process.platform !== "win32") {
    expect((await stat(workspace)).mode & 0o777).toBe(0o777);
    expect((await stat(join(workspace, "nested"))).mode & 0o777).toBe(0o777);
    expect((await stat(join(workspace, "nested", "file"))).mode & 0o777).toBe(0o666);
    expect((await stat(join(workspace, "run"))).mode & 0o777).toBe(0o766);
    expect((await stat(join(root, "workspaces"))).mode & 0o077).toBe(0);
    expect((await stat(join(starter, "nested", "file"))).mode & 0o777).toBe(0o600);
  }
});
