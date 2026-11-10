import { open } from "node:fs/promises";
import { posix } from "node:path";

const blockSize = 512;
const utf8 = new TextDecoder("utf-8", { fatal: true });

function field(block: Uint8Array, offset: number, length: number): string {
  const bytes = block.subarray(offset, offset + length);
  const end = bytes.indexOf(0);
  return utf8.decode(end < 0 ? bytes : bytes.subarray(0, end));
}

function octal(value: string): number {
  const text = value.trim();
  if (!/^[0-7]*$/.test(text)) throw new Error("Invalid tar numeric field");
  const number = text ? parseInt(text, 8) : 0;
  if (!Number.isSafeInteger(number)) throw new Error("Tar numeric field is too large");
  return number;
}

function safeName(name: string): string {
  if (!name || name.startsWith("/") || name.includes("\\")) throw new Error("Invalid index archive path");
  const parts = name.replace(/\/$/, "").split("/");
  if (parts.some(part => !part || part === "." || part === "..") || !["store", "cache"].includes(parts[0]!)) throw new Error("Index archive escapes its roots");
  return parts.join("/");
}

/** Validate the exact ustar subset produced by index-prepare before extraction.
 * Never follow archive links while checking paths. The caller must verify the
 * archive digest before invoking this function and extract into a fresh sandbox. */
export async function validateIndexArchive(path: string): Promise<void> {
  const file = await open(path, "r");
  try {
    const stat = await file.stat();
    if (!stat.isFile() || stat.size < blockSize * 2 || stat.size % blockSize !== 0) throw new Error("Invalid index archive size");
    const header = Buffer.alloc(blockSize);
    const names = new Set<string>();
    const links = new Set<string>();
    const roots = new Set<string>();
    let offset = 0;
    let zeroBlocks = 0;
    while (offset < stat.size) {
      if ((await file.read(header, 0, blockSize, offset)).bytesRead !== blockSize) throw new Error("Truncated index archive");
      offset += blockSize;
      if (header.every(byte => byte === 0)) {
        zeroBlocks++;
        continue;
      }
      if (zeroBlocks) throw new Error("Nonzero data after index archive terminator");
      if (field(header, 257, 6) !== "ustar") throw new Error("Unsupported index archive format");
      const expectedChecksum = octal(field(header, 148, 8));
      let actualChecksum = 0;
      for (let i = 0; i < blockSize; i++) actualChecksum += i >= 148 && i < 156 ? 32 : header[i]!;
      if (actualChecksum !== expectedChecksum) throw new Error("Invalid index archive checksum");
      const prefix = field(header, 345, 155);
      const filename = field(header, 0, 100);
      const name = safeName(prefix ? `${prefix}/${filename}` : filename);
      if (names.has(name)) throw new Error("Duplicate index archive path");
      names.add(name);
      const kind = header[156];
      const size = octal(field(header, 124, 12));
      if (kind !== 0 && kind !== 48 && kind !== 50 && kind !== 53) throw new Error("Unsupported index archive entry type");
      if ((name === "store" || name === "cache") && kind === 53) roots.add(name);
      if (kind === 50) {
        if (size !== 0) throw new Error("Symbolic link contains data");
        const target = field(header, 157, 100);
        if (!target || target.startsWith("/") || target.includes("\\") || target.split("/").some(part => part === ".." || !part)) throw new Error("Unsafe index archive link");
        const resolved = posix.normalize(posix.join(posix.dirname(name), target));
        if (resolved.split("/")[0] !== name.split("/")[0]) throw new Error("Index archive link escapes its root");
        links.add(name);
      } else if (kind === 53 && size !== 0) throw new Error("Directory contains data");
      const padded = Math.ceil(size / blockSize) * blockSize;
      if (!Number.isSafeInteger(padded) || offset + padded > stat.size) throw new Error("Truncated index archive entry");
      offset += padded;
    }
    if (zeroBlocks < 2 || !roots.has("store") || !roots.has("cache")) throw new Error("Incomplete index archive");
    for (const name of names) {
      const parts = name.split("/");
      for (let i = 1; i < parts.length; i++) {
        if (links.has(parts.slice(0, i).join("/"))) throw new Error("Index archive writes through a symbolic link");
      }
    }
  } finally {
    await file.close();
  }
}
