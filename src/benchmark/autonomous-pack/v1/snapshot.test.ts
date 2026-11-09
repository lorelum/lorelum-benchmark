import { afterEach, expect, test } from "bun:test";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { snapshotPack } from "./snapshot";

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
