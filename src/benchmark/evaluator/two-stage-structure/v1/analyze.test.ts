import { mkdtemp, rm, writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { evaluateTwoStageStructure } from "./analyze";
import type { Stage1Snapshot } from "./types";

const roots: string[] = [];
async function root(files: Record<string, string>): Promise<string> {
  const path = await mkdtemp(join(await import("node:os").then((os) => os.tmpdir()), "two-stage-structure-"));
  roots.push(path);
  for (const [file, body] of Object.entries(files)) {
    await mkdir(join(path, file, ".."), { recursive: true });
    await writeFile(join(path, file), body);
  }
  return path;
}
afterEach(async () => { await Promise.all(roots.splice(0).map((path) => rm(path, { recursive: true, force: true }))); });

const stage1 = {
  "src/adapters/first.ts": `export async function callFirst(input: { message: string }): Promise<{ content: string }> {\n  const upstream = await fetch("https://first.example");\n  return { content: await upstream.text() };\n}\n`,
  "src/boundary/limits.ts": `export async function withLimits<T>(budget: number, action: () => Promise<T>): Promise<T> {\n  if (budget <= 0) throw new Error("budget");\n  for (let attempt = 0; attempt < 2; attempt++) { try { return await action(); } catch {} }\n  throw new Error("retry exhausted");\n}\n`,
  "src/boundary/usage.ts": `import { appendFile } from "node:fs/promises";\nexport async function recordUsage(entry: { tenant: string; cost: number; trace_id: string }): Promise<void> {\n  await appendFile("usage.jsonl", JSON.stringify(entry) + "\\n");\n}\n`,
  "src/http/server.ts": `import { callFirst } from "../adapters/first";\nimport { withLimits } from "../boundary/limits";\nimport { recordUsage } from "../boundary/usage";\nexport function createRequestHandler(request: { message: string }, response: { end(value: string): void }): Promise<void> {\n  return withLimits(10, async () => {\n    const result = await callFirst(request);\n    await recordUsage({ tenant: request.message, cost: 1, trace_id: "t" });\n    response.end(result.content);\n  });\n}\n`,
};

const oracleStage2 = {
  ...stage1,
  "src/adapters/second.ts": `export async function callSecond(input: { message: string }): Promise<{ content: string }> {\n  const upstream = await fetch("https://second.example");\n  return { content: await upstream.text() };\n}\n`,
  "src/adapters/registry.ts": `import { callFirst } from "./first";\nimport { callSecond } from "./second";\nexport const registry = { first: callFirst, second: callSecond };\n`,
};

async function snapshot(root: string): Promise<Stage1Snapshot> {
  const files = Object.keys(stage1).map((path) => ({ path, sha256: createHash("sha256").update(stage1[path as keyof typeof stage1]).digest("hex") }));
  return { hash_algorithm: "sha256", tree_sha256: createHash("sha256").update(files.map((file) => `${file.path}:${file.sha256}`).join("\\n")).digest("hex"), files };
}
async function evaluate(stage1Root: string, stage2Root: string, options: { stage1?: "pass" | "fail"; stage2?: "pass" | "fail"; mutateSnapshot?: boolean } = {}) {
  const manifest = await snapshot(stage1Root);
  if (options.mutateSnapshot) manifest.files[0].sha256 = "0".repeat(64);
  return evaluateTwoStageStructure({ stage_1_root: stage1Root, stage_2_root: stage2Root, semantic: { stage_1: options.stage1 ?? "pass", stage_2: options.stage2 ?? "pass" }, stage_1_snapshot: manifest });
}

test("oracle reference preserves boundaries and localizes provider addition", async () => {
  const first = await root(stage1); const second = await root(oracleStage2);
  const result = await evaluate(first, second);
  expect(Object.fromEntries(result.checks.map((entry) => [entry.id, entry.state]))).toEqual({
    "stage-1-semantic": "pass", "stage-2-semantic": "pass", "stage-1-snapshot-integrity": "pass", "handler-stability": "pass", "transport-isolation": "pass", "policy-continuity": "pass", "ledger-continuity": "pass", "provider-extension-locality": "pass", "diff-classifiability": "pass",
  });
  expect(result.structure_pass).toBe(true); expect(result.execution_health).toBe("evaluated");
  expect(Object.keys(result.metrics)).not.toContain("structure_score");
});

test("equivalent provider layout passes without relying on file names", async () => {
  const first = await root(stage1); const second = await root({ ...stage1, "src/adapters/unusual-name.ts": oracleStage2["src/adapters/second.ts"], "src/adapters/table.ts": oracleStage2["src/adapters/registry.ts"] });
  const result = await evaluate(first, second);
  expect(result.checks.find((entry) => entry.id === "transport-isolation")?.state).toBe("pass");
  expect(result.checks.find((entry) => entry.id === "provider-extension-locality")?.state).toBe("pass");
  expect(result.structure_pass).toBe(true);
});

test("baseline scatter and functional anti-pattern fail without changing semantic completion", async () => {
  const first = await root(stage1);
  const scatter = await root({ ...stage1, "src/http/server.ts": stage1["src/http/server.ts"].replace("withLimits(10", "withLimitsChanged(10"), "src/boundary/limits.ts": stage1["src/boundary/limits.ts"].replace("retry exhausted", "limits exhausted"), "src/boundary/usage.ts": stage1["src/boundary/usage.ts"].replace("usage.jsonl", "usage-v2.jsonl") });
  const anti = await root({ ...stage1, "src/http/server.ts": `export async function createRequestHandler(request: { message: string }, response: { end(value: string): void }): Promise<void> {\n  const upstream = await fetch("https://second.example");\n  response.end(await upstream.text());\n}\n`, "src/adapters/second.ts": oracleStage2["src/adapters/second.ts"] });
  const scatterResult = await evaluate(first, scatter); const antiResult = await evaluate(first, anti);
  expect(scatterResult.structure_pass).toBe(false); expect(scatterResult.checks.find((entry) => entry.id === "handler-stability")?.state).toBe("fail");
  expect(antiResult.structure_pass).toBe(false); expect(antiResult.checks.find((entry) => entry.id === "transport-isolation")?.state).toBe("fail");
  expect(antiResult.checks.find((entry) => entry.id === "stage-2-semantic")?.state).toBe("pass");
});

test("docs-only and unchanged starters cannot pass structure", async () => {
  const first = await root(stage1); const second = await root({ ...stage1, "docs/guide.md": "new provider\\n" });
  const result = await evaluate(first, second);
  expect(result.checks.filter((entry) => ["transport-isolation", "provider-extension-locality"].includes(entry.id)).every((entry) => entry.state === "fail")).toBe(true);
  expect(result.structure_pass).toBe(false);
  const starter = await root(stage1);
  const failed = await evaluate(first, starter, { stage2: "fail" });
  expect(failed.checks.find((entry) => entry.id === "stage-2-semantic")?.state).toBe("fail");
  expect(failed.structure_pass).toBe(false);
});

test("malformed source is indeterminate, not forced pass or fail", async () => {
  const first = await root(stage1); const second = await root({ ...stage1, "src/adapters/second.ts": "export function broken(" });
  const result = await evaluate(first, second);
  expect(result.checks.filter((entry) => !entry.id.startsWith("stage-") && entry.id !== "stage-1-snapshot-integrity").every((entry) => entry.state === "indeterminate")).toBe(true);
  expect(result.structure_pass).toBe(false);
});

test("snapshot mismatch is execution unhealthy and cannot be a structure pass", async () => {
  const first = await root(stage1); const second = await root(oracleStage2);
  const result = await evaluate(first, second, { mutateSnapshot: true });
  expect(result.checks.find((entry) => entry.id === "stage-1-snapshot-integrity")?.state).toBe("fail");
  expect(result.execution_health).toBe("execution-unhealthy"); expect(result.structure_pass).toBe(false);
});
