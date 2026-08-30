import { afterEach, expect, test } from "bun:test";
import { evaluateTwoStageStructure } from "./analyze";
import { assertStructureResult, compareExpectedLabels } from "./result";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";

const roots: string[] = [];
async function source(files: Record<string, string>): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "structure-result-")); roots.push(root);
  for (const [path, body] of Object.entries(files)) { await mkdir(join(root, path, ".."), { recursive: true }); await writeFile(join(root, path), body); }
  return root;
}
afterEach(() => Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))));
const body = "export function handler(request: unknown, response: unknown) { request; response; }\n";
const adapter = "export async function adapter() { await fetch(\"https://a.example\"); }\nexport async function adapterB() { await fetch(\"https://b.example\"); }\n";

test("result parser accepts raw labels and rejects weighted score or missing checks", async () => {
  const first = await source({ "src/http.ts": body, "src/adapters.ts": adapter }); const second = await source({ "src/http.ts": body, "src/adapters.ts": adapter, "src/b.ts": adapter });
  const result = await evaluateTwoStageStructure({ stage_1_root: first, stage_2_root: second, semantic: { stage_1: "pass", stage_2: "pass" }, stage_1_snapshot: { hash_algorithm: "sha256", tree_sha256: createHash("sha256").update(body).digest("hex"), files: [{ path: "src/http.ts", sha256: createHash("sha256").update(body).digest("hex") }] } });
  expect(assertStructureResult(result)).toBe(result);
  expect(Object.keys(result.metrics)).toHaveLength(10);
  expect(compareExpectedLabels(result, { "diff-classifiability": "pass" }).passed).toBe(result.execution_health === "evaluated" ? true : false);
  expect(() => assertStructureResult({ ...result, extra_score: 0.8 })).toThrow("raw");
  expect(() => assertStructureResult({ ...result, checks: result.checks.slice(1) })).toThrow("nine checks");
  expect(() => assertStructureResult({ ...result, checks: [{ ...result.checks[0], state: "scored" }, ...result.checks.slice(1)] })).toThrow("invalid state");
});
