import { expect, test } from "bun:test";
import { join } from "node:path";

interface Diagnostic {
  file: string;
  path: string;
  code: string;
  message: string;
}

interface BuildResult {
  manifest: unknown | null;
  diagnostics: Diagnostic[];
}

interface CandidateModule {
  buildPluginManifest(input: unknown, file: string): BuildResult;
}

const candidatePath = Bun.env.CANDIDATE_PATH ?? join(import.meta.dir, "..", "..", "public", "starter", "src", "plugin-manifest.ts");
const candidateUrl = `${Bun.pathToFileURL(candidatePath).href}?candidate=${Date.now()}`;
const { buildPluginManifest } = (await import(candidateUrl)) as CandidateModule;
const file = "fixtures/plugins/plugin.json";

function codes(result: BuildResult): Array<[string, string]> {
  return result.diagnostics.map((entry) => [entry.path, entry.code]);
}

test("preserves a valid manifest without diagnostics", () => {
  const input = {
    id: "markdown-tools",
    displayName: "Markdown tools",
    apiVersion: "v1",
    entrypoint: "./dist/index.js",
    capabilities: ["read", "transform"],
  };

  expect(buildPluginManifest(input, file)).toEqual({ manifest: input, diagnostics: [] });
});

test("rejects independent malformed fields with stable structured diagnostics", () => {
  const input = {
    id: 3,
    displayName: "x".repeat(65),
    apiVersion: "v2",
    entrypoint: "../outside.js",
    capabilities: "read",
    debug: true,
  };
  const result = buildPluginManifest(input, file);

  expect(result.manifest).toBeNull();
  expect(codes(result)).toEqual([
    ["/apiVersion", "unsupported-version"],
    ["/capabilities", "invalid-type"],
    ["/debug", "unknown-field"],
    ["/displayName", "invalid-value"],
    ["/entrypoint", "invalid-value"],
    ["/id", "invalid-type"],
  ]);
  expect(result.diagnostics.every((entry) => entry.file === file && typeof entry.message === "string" && entry.message.length > 0)).toBe(true);
});

test("accumulates all missing required fields", () => {
  const result = buildPluginManifest({}, file);

  expect(result.manifest).toBeNull();
  expect(codes(result)).toEqual([
    ["/apiVersion", "required"],
    ["/capabilities", "required"],
    ["/displayName", "required"],
    ["/entrypoint", "required"],
    ["/id", "required"],
  ]);
});

test("does not depend on property order or mutate metadata", () => {
  const first = {
    id: "Invalid ID",
    apiVersion: "v0",
    displayName: "",
    entrypoint: "index.js",
    capabilities: ["read", "read"],
  };
  const second = {
    capabilities: ["read", "read"],
    entrypoint: "index.js",
    displayName: "",
    apiVersion: "v0",
    id: "Invalid ID",
  };
  const before = structuredClone(first);

  expect(codes(buildPluginManifest(first, file))).toEqual(codes(buildPluginManifest(second, file)));
  expect(first).toEqual(before);
});
