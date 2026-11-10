import { expect, test } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { validateIndexArchive } from "./index-archive";

type Entry = { name: string; kind: "file" | "directory" | "symlink"; target?: string; body?: string };
function archive(entries: Entry[]): Buffer {
  const blocks: Buffer[] = [];
  for (const entry of entries) {
    const header = Buffer.alloc(512);
    const write = (value: string, start: number, length: number) => header.write(value, start, length, "utf8");
    const body = Buffer.from(entry.body ?? "");
    write(entry.name, 0, 100);
    write("0000644\0", 100, 8);
    write("0000000\0", 108, 8);
    write("0000000\0", 116, 8);
    write(body.length.toString(8).padStart(11, "0") + "\0", 124, 12);
    write("00000000000\0", 136, 12);
    header.fill(32, 148, 156);
    header[156] = entry.kind === "file" ? 48 : entry.kind === "symlink" ? 50 : 53;
    if (entry.target) write(entry.target, 157, 100);
    write("ustar\0", 257, 6);
    write("00", 263, 2);
    const checksum = header.reduce((sum, byte) => sum + byte, 0);
    write(checksum.toString(8).padStart(6, "0") + "\0 ", 148, 8);
    blocks.push(header);
    if (body.length) blocks.push(Buffer.concat([body, Buffer.alloc((512 - body.length % 512) % 512)]));
  }
  return Buffer.concat([...blocks, Buffer.alloc(1024)]);
}
const roots: Entry[] = [{ name: "store/", kind: "directory" }, { name: "cache/", kind: "directory" }];
async function inspect(entries: Entry[]) {
  const root = await mkdtemp(join(tmpdir(), "index-archive-"));
  try {
    const path = join(root, "index.tar");
    await writeFile(path, archive(entries));
    await validateIndexArchive(path);
  } finally { await rm(root, { recursive: true, force: true }); }
}

test("accepts a quiesced Store archive with its internal Pack link", async () => {
  await inspect([...roots, { name: "store/packs/", kind: "directory" }, { name: "store/packs/revision/", kind: "directory" }, { name: "store/packs/revision/file", kind: "file", body: "practice" }, { name: "store/packs/current", kind: "symlink", target: "revision" }]);
});

test("refuses traversal, escaped links and writes through links", async () => {
  await expect(inspect([...roots, { name: "store/../../workspace/private", kind: "file" }])).rejects.toThrow();
  await expect(inspect([...roots, { name: "store/current", kind: "symlink", target: "../../workspace" }])).rejects.toThrow();
  await expect(inspect([...roots, { name: "store/current", kind: "symlink", target: "revision" }, { name: "store/current/file", kind: "file" }])).rejects.toThrow();
});

test("refuses duplicate paths and archives without directory roots", async () => {
  await expect(inspect([...roots, { name: "store/item", kind: "file" }, { name: "store/item", kind: "file" }])).rejects.toThrow();
  await expect(inspect([{ name: "store", kind: "file" }, { name: "cache/", kind: "directory" }])).rejects.toThrow();
});
