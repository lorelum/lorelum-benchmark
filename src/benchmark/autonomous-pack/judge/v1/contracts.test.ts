import { expect, test } from "bun:test";
import Ajv2020 from "ajv/dist/2020";
import { readFile } from "node:fs/promises";

const ajv = new Ajv2020({ strict: true, strictRequired: false, allErrors: true });
const observation = ajv.compile(JSON.parse(await readFile(new URL("../../../../../schemas/judge-autonomous-pack-observation-v1.schema.json", import.meta.url), "utf8")));
const caseSchema = ajv.compile(JSON.parse(await readFile(new URL("../../../../../schemas/judge-autonomous-pack-case-v1.schema.json", import.meta.url), "utf8")));
const planSchema = ajv.compile(JSON.parse(await readFile(new URL("../../../../../schemas/judge-autonomous-pack-plan-v1.schema.json", import.meta.url), "utf8")));
const summarySchema = ajv.compile(JSON.parse(await readFile(new URL("../../../../../schemas/judge-autonomous-pack-summary-v1.schema.json", import.meta.url), "utf8")));
const missing = { schema: "judge-autonomous-pack-observation/v1", ordinal: 1, condition: "empty-store", judgeStatus: "not-run", reason: "interrupted" };
const result = { schema: "judge-autonomous-pack-observation/v1", ordinal: 0, condition: "pack-installed", judgeStatus: "completed", decisionSource: "terminal-input-unverified", judgeCandidateIdentity: `sha256:${"b".repeat(64)}`, candidateSha256: "a".repeat(64), delivery: "approved", semantic: { health: "indeterminate", semantic: "not-run", quality: "not-run", failure_reasons: ["verifier unavailable"] }, retrieval: { coverage: "indeterminate", reason: "incomplete coverage", events: [] }, quality: "not-run", costUsd: null, modelUsage: null, elapsedMs: 100 };

test("accepts the versioned fixed case and preserves missing runs", async () => {
  const fixed = JSON.parse(await readFile(new URL("../../../../../incubator/judge-autonomous-pack/config-migration/v1/case.json", import.meta.url), "utf8"));
  expect(caseSchema(fixed)).toBe(true);
  expect(observation(missing)).toBe(true);
  expect(observation({ ...missing, reason: undefined })).toBe(false);
});

test("does not call an unavailable verifier a functional pass", () => {
  expect(observation(result)).toBe(true);
  expect(observation({ ...result, semantic: { ...result.semantic, semantic: "pass" } })).toBe(false);
  expect(observation({ ...result, retrieval: { ...result.retrieval, coverage: "complete" } })).toBe(false);
  expect(observation({ ...result, judgeCandidateIdentity: null })).toBe(false);
  expect(observation({ ...result, judgeStatus: "failed" })).toBe(false);
});

test("summary retains both planned slots and their eligibility decision", () => {
  const summary = { schema: "judge-autonomous-pack-summary/v1", results: [result, missing], comparison: { status: "excluded", reasons: ["second run interrupted"] }, interpretation: "diagnostic only" };
  expect(summarySchema(summary)).toBe(true);
  expect(summarySchema({ ...summary, results: [result] })).toBe(false);
});

test("plan binds both treatment identities and distinct scheduled conditions", () => {
  const h = "a".repeat(64);
  const plan = {
    schema: "judge-autonomous-pack-plan/v1", adapterSha256: h, caseSha256: h, task: "config-migration-v2",
    taskIdentities: { declaration_sha256: h, task_sha256: h, starter_sha256: h, input_sha256: h, evaluator_sha256: h, calibration_sha256: h },
    judgeEnvironmentSha256: h, judgeCommit: "b".repeat(40), terminalSha256: h, loreSupportSha256: h,
    runtime: { platform: "linux", architecture: "x64", kernel: "kernel", nodeVersion: "22.21.0", nodeSha256: h, bubblewrap: "bubblewrap" },
    loreReleaseSha256: h, model: { provider: "local", name: "fixture", endpoint: "http://127.0.0.1" },
    embedding: { modelSha256: h, profile: h, encoding: h }, packSha256: h,
    indexes: { empty: h, installed: h, emptyMetadata: h, installedMetadata: h },
    verifierImage: `sha256:${h}`, order: ["empty-store", "pack-installed"],
    budget: { totalTimeMs: 1, commandTimeMs: 1, modelCalls: 1, actions: 1, commandLimit: 1, outputBytes: 1 },
  };
  expect(planSchema(plan)).toBe(true);
  expect(planSchema({ ...plan, order: ["empty-store", "empty-store"] })).toBe(false);
  expect(planSchema({ ...plan, indexes: { ...plan.indexes, installed: null } })).toBe(false);
});
