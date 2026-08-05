import { readdir } from "node:fs/promises";
import { join, sep } from "node:path";
import type { SourceMap } from "./practice-layered-api/v2/score";

/** Generated-output directory names excluded from the judge SourceMap. */
export const JUDGE_GENERATED_DIRS = new Set([
  "node_modules", "dist", "test-results", "playwright-report", ".git", ".vite",
  ".practice-runtime", ".run-workspaces", "logs",
]);

/**
 * Constructs a deterministic judge SourceMap from a candidate workspace/app
 * root: every file except generated directories, keyed by normalized relative
 * path and sorted lexicographically, so the same workspace always yields the
 * same SourceMap regardless of file traversal order. Non-source files (for
 * example an injected convention doc) are kept in the map; the scorer filters
 * by source extension, so they do not affect scores.
 */
export async function sourceMapFromWorkspace(appRoot: string): Promise<SourceMap> {
  const files: SourceMap = {};
  const collect = async (dir: string, prefix: string): Promise<void> => {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        if (JUDGE_GENERATED_DIRS.has(entry.name)) continue;
        await collect(join(dir, entry.name), `${prefix}${entry.name}/`);
      } else if (entry.isFile()) {
        files[`${prefix}${entry.name}`] = await Bun.file(join(dir, entry.name)).text();
      }
    }
  };
  await collect(appRoot, "");
  const sorted: SourceMap = {};
  for (const key of Object.keys(files).sort()) sorted[key] = files[key];
  return sorted;
}

/**
 * Canonical serialization: sorted `path\0<contentLength>\0<content>` lines
 * joined by newline. The length prefix makes the format unambiguous for content
 * that contains newlines, so it round-trips losslessly.
 */
export function sourceMapToDiff(files: SourceMap): string {
  const entries = Object.entries(files).sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0));
  return entries.map(([path, content]) => `${path}\u0000${content.length}\u0000${content}`).join("\n");
}

/** Parses the canonical serialization back into a SourceMap. */
export function sourceMapFromDiff(diff: string): SourceMap {
  const files: SourceMap = {};
  let cursor = 0;
  while (cursor < diff.length) {
    const first = diff.indexOf("\u0000", cursor);
    if (first < 0) break;
    const second = diff.indexOf("\u0000", first + 1);
    if (second < 0) break;
    const path = diff.slice(cursor, first);
    const length = Number(diff.slice(first + 1, second));
    const content = diff.slice(second + 1, second + 1 + length);
    if (path.length > 0 && Number.isInteger(length) && length >= 0 && content.length === length) {
      files[path] = content;
    }
    cursor = second + 1 + length + 1; // skip trailing newline
  }
  return files;
}

/** Path separator used in SourceMap keys. */
export const sourceMapKeySeparator = "/";
