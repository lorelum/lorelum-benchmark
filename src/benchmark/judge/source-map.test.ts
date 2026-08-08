import { expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { sourceMapFromDiff, sourceMapFromWorkspace, sourceMapToDiff } from "./source-map";

async function withWorkspace(mutator: (root: string) => Promise<void>): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "lorelum-judge-sourcemap-"));
  await mutator(root);
  return root;
}

test("sourceMapFromWorkspace is deterministic and excludes generated directories", async () => {
  const root = await withWorkspace(async (app) => {
    await mkdir(join(app, "src", "api"), { recursive: true });
    await mkdir(join(app, "node_modules", "x"), { recursive: true });
    await mkdir(join(app, "dist"), { recursive: true });
    await writeFile(join(app, "tsconfig.json"), "{}");
    await writeFile(join(app, "src", "LoginPage.tsx"), "export function LoginPage() { return null; }\n");
    await writeFile(join(app, "src", "api", "http.ts"), "export const api = 1;\n");
    await writeFile(join(app, "node_modules", "x", "dep.ts"), "hidden");
    await writeFile(join(app, "dist", "bundle.js"), "hidden");
  });
  try {
    const first = await sourceMapFromWorkspace(root);
    const second = await sourceMapFromWorkspace(root);
    expect(JSON.stringify(first)).toBe(JSON.stringify(second));
    expect(Object.keys(first).sort()).toEqual(["src/LoginPage.tsx", "src/api/http.ts", "tsconfig.json"]);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("sourceMapToDiff and sourceMapFromDiff round-trip losslessly including newlines", async () => {
  const files = {
    "src/a.ts": "line1\nline2\n",
    "src/b.tsx": "export const b = 1;\n// note: \u0000 inside?\n",
    "README.md": "# hello\n\nbody with \n newlines\n",
  };
  const diff = sourceMapToDiff(files);
  const round = sourceMapFromDiff(diff);
  expect(round).toEqual(files);
  expect(sourceMapToDiff(round)).toBe(diff);
});

test("sourceMapFromDiff tolerates empty and malformed lines", () => {
  expect(sourceMapFromDiff("")).toEqual({});
  expect(sourceMapFromDiff("a.ts\u00005\u0000hello\n")).toEqual({ "a.ts": "hello" });
});
