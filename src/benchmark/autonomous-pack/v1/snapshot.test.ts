import { afterEach, expect, test } from "bun:test";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
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
