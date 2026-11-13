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

test("equal starter digests produce writable workspaces with canonical modes without changing frozen inputs", async () => {
  const root = await mkdtemp(join(tmpdir(), "autonomous-pack-workspace-"));
  roots.push(root);
  const starters = [join(root, "starter-a"), join(root, "starter-b")];
  const task = join(root, "task.md");
  for (const [index, starter] of starters.entries()) {
    await mkdir(starter, { mode: 0o700 });
    await mkdir(join(starter, "nested"), { mode: 0o700 });
    await writeFile(join(starter, "nested", "file"), "public", { mode: 0o600 });
    await writeFile(join(starter, "run"), "script", { mode: 0o600 });
    if (process.platform !== "win32") {
      await chmod(starter, index === 0 ? 0o700 : 0o755);
      await chmod(join(starter, "nested"), index === 0 ? 0o700 : 0o755);
      await chmod(join(starter, "nested", "file"), index === 0 ? 0o600 : 0o755);
      await chmod(join(starter, "run"), index === 0 ? 0o700 : 0o600);
    }
  }
  await writeFile(task, "prompt");
  const starterSha256 = await sha256SnapshotDirectory(starters[0]);
  expect(await sha256SnapshotDirectory(starters[1])).toBe(starterSha256);
  const inputSha = hashContract({ task_sha256: createHash("sha256").update("prompt").digest("hex"), starter_sha256: starterSha256 });
  const inputs: PreparedInputs = {
    root, pack: "", tasks: new Map(starters.map((starter, index) => [
      `task-${index}`, { task, starter, evaluator: "", starterSha256 },
    ] as const)),
    common: { environment: "", modelParameters: "", profile: "", toolPolicy: "", systemPrompt: "" },
    schedule: starters.map((_, ordinal) => ({
      pair_id: "", task_id: `task-${ordinal}`, repetition: 0, condition: "empty-store" as const,
      ordinal, input_sha256: inputSha, common_sha256: "",
    })),
    planSha256: "",
  };
  for (const [index, starter] of starters.entries()) {
    const { workspace, prompt } = await prepareRunWorkspace(inputs, index);
    expect(prompt).toBe("prompt");
    expect(await readFile(join(workspace, "nested", "file"), "utf8")).toBe("public");
    if (process.platform !== "win32") {
      for (const path of [workspace, join(workspace, "nested"), join(workspace, "nested", "file"), join(workspace, "run")]) {
        expect((await stat(path)).mode & 0o777).toBe(0o777);
      }
      expect((await stat(join(root, "workspaces"))).mode & 0o077).toBe(0);
      expect((await stat(starter)).mode & 0o777).toBe(index === 0 ? 0o700 : 0o755);
      expect((await stat(join(starter, "nested"))).mode & 0o777).toBe(index === 0 ? 0o700 : 0o755);
      expect((await stat(join(starter, "nested", "file"))).mode & 0o777).toBe(index === 0 ? 0o600 : 0o755);
      expect((await stat(join(starter, "run"))).mode & 0o777).toBe(index === 0 ? 0o700 : 0o600);
    }
    await writeFile(join(workspace, "nested", "file"), "modified");
    await writeFile(join(workspace, "nested", "new-file"), "created");
    expect(await readFile(join(workspace, "nested", "file"), "utf8")).toBe("modified");
    expect(await readFile(join(workspace, "nested", "new-file"), "utf8")).toBe("created");
    expect(await readFile(join(starter, "nested", "file"), "utf8")).toBe("public");
    expect(await readFile(join(starter, "run"), "utf8")).toBe("script");
    expect(await sha256SnapshotDirectory(starter)).toBe(starterSha256);
  }
});
