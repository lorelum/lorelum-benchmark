import { expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { mkdtemp, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { observeRunTrace, runPairedPilot, type PairedPilotOptions } from "./paired-runner";
import { assertPlan, hashContract, modelEndpointSha256, schedulePlan } from "./plan";
import { summarizePlan, type AutonomousObservation } from "./summary";
import type { ContainerExecutionResult } from "./container-execution";

const hash = "a".repeat(64);
const plan: PairedPilotOptions["plan"] = {
  schema_version: "autonomous-pack-plan/v1", id: "diagnostic", run_kind: "pilot",
  tasks: [{ id: "task", source_sha256: hash, input_sha256: hash, evaluator_sha256: hash }], repetitions: 1, order_seed: 0,
  common: { environment_sha256: hash, image_sha256: hash, agent: "pi", model: "fixture", model_endpoint_sha256: modelEndpointSha256("https://example.com/v1"), model_parameters_sha256: hash, profile_sha256: hash, tool_policy_sha256: hash, system_prompt_sha256: hash, budget: { max_turns: 1, max_duration_ms: 1000 } },
  pack: { source: "fixture", snapshot_uri: "fixture", snapshot_sha256: hash, index_sha256: hash },
};

test("pilot rejects invalid credentials, formal runs and overlapping paths before creating output", async () => {
  const root = await mkdtemp(join(tmpdir(), "lorelum-diagnostic-"));
  try {
    const outputDirectory = join(root, "output");
    const options: PairedPilotOptions = { plan, sources: { pack: "missing", tasks: {}, common: { environment: "missing", modelParameters: "missing", profile: "missing", toolPolicy: "missing", systemPrompt: "missing" } }, outputDirectory, modelFile: "missing", indexes: { empty: { archive: "missing", metadata: "missing" }, installed: { archive: "missing", metadata: "missing" } }, upstreamBaseUrl: "http://example.com/v1", upstreamApiKey: "test-only", auditWaitMs: 1000 };
    await expect(runPairedPilot(options)).rejects.toThrow("Invalid model endpoint");
    await expect(stat(outputDirectory)).rejects.toThrow();
    await expect(runPairedPilot({ ...options, upstreamBaseUrl: "https://example.com/v1", upstreamApiKey: "" })).rejects.toThrow("credential");
    await expect(runPairedPilot({ ...options, upstreamBaseUrl: "https://example.com/v1", plan: { ...plan, run_kind: "official" } })).rejects.toThrow("Formal runs");
    await expect(stat(outputDirectory)).rejects.toThrow();
    await expect(runPairedPilot({ ...options, upstreamBaseUrl: "https://example.com/v1", sources: { ...options.sources, pack: root } })).rejects.toThrow("disjoint");
    await expect(stat(outputDirectory)).rejects.toThrow();
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("endpoint identity binds the effective endpoint to the plan and common hash", () => {
  const expected = createHash("sha256").update("https://example.com/v1/chat/completions", "utf8").digest("hex");
  expect(modelEndpointSha256("https://EXAMPLE.com:443/v1///")).toBe(expected);
  expect(plan.common.model_endpoint_sha256).toBe(expected);
  const alternate = { ...plan, common: { ...plan.common, model_endpoint_sha256: modelEndpointSha256("https://other.example/v1") } };
  expect(hashContract(alternate)).not.toBe(hashContract(plan));
  expect(schedulePlan(alternate)[0].common_sha256).not.toBe(schedulePlan(plan)[0].common_sha256);
  const { model_endpoint_sha256: _identity, ...legacyCommon } = plan.common;
  const legacy = { ...plan, common: legacyCommon };
  expect(() => assertPlan(legacy)).not.toThrow();
  expect(() => summarizePlan(legacy, [])).not.toThrow();
});

test("endpoint identity is required and mismatches fail without disclosing endpoints or credentials", async () => {
  const root = await mkdtemp(join(tmpdir(), "lorelum-endpoint-"));
  try {
    const outputDirectory = join(root, "output");
    const options: PairedPilotOptions = { plan, sources: { pack: "missing", tasks: {}, common: { environment: "missing", modelParameters: "missing", profile: "missing", toolPolicy: "missing", systemPrompt: "missing" } }, outputDirectory, modelFile: "missing", indexes: { empty: { archive: "missing", metadata: "missing" }, installed: { archive: "missing", metadata: "missing" } }, upstreamBaseUrl: "https://other.example/private-path", upstreamApiKey: "secret-api-key", auditWaitMs: 1000 };
    const { model_endpoint_sha256: _identity, ...legacyCommon } = plan.common;
    for (const [input, message] of [
      [{ ...options, plan: { ...plan, common: legacyCommon } }, "identity is required"],
      [options, "identity mismatch"],
      [{ ...options, upstreamBaseUrl: "https://user:secret-password@example.com/v1?token=secret-query" }, "Invalid model endpoint"],
    ] as const) {
      const error = await runPairedPilot(input).then(() => { throw new Error("Unexpected success"); }, error => String(error));
      expect(error).toContain(message);
      for (const secret of ["other.example", "private-path", "secret-api-key", "secret-password", "secret-query"]) expect(error).not.toContain(secret);
      await expect(stat(outputDirectory)).rejects.toThrow();
    }
    expect(JSON.stringify(plan)).not.toContain(options.upstreamBaseUrl);
    expect(JSON.stringify(plan)).not.toContain(options.upstreamApiKey);
    expect(JSON.stringify(summarizePlan(plan, []))).not.toContain(options.upstreamApiKey);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("failed runs retain actual Pi get outcomes without becoming comparable", async () => {
  const root = await mkdtemp(join(tmpdir(), "lorelum-failed-trace-"));
  try {
    const [slot, other] = schedulePlan(plan);
    const makeObservation = (scheduled: typeof slot): AutonomousObservation => ({
      schema_version: "autonomous-pack-observation/v1", plan_id: plan.id, plan_sha256: hashContract(plan),
      pair_id: scheduled.pair_id, condition: scheduled.condition, ordinal: scheduled.ordinal,
      input_sha256: scheduled.input_sha256, common_sha256: scheduled.common_sha256,
      pack_snapshot_sha256: scheduled.condition === "pack-installed" ? plan.pack.snapshot_sha256 : null,
      index_sha256: scheduled.condition === "pack-installed" ? plan.pack.index_sha256 : null,
      verification: { input: true, isolation: true, treatment: true, reasons: [] },
      health: "execution-failed", failure_reasons: ["Run did not complete"], semantic: "not-run", quality: "not-run", quality_probes: [],
      trace: { complete: false, query: "indeterminate", get_success: 0, get_failed: 0, get_indeterminate: 0 },
      duration_ms: null, cost_usd: null, input_tokens: null, output_tokens: null, total_tokens: null, artifacts: [],
    });
    const get = (id: string) => ({ type: "tool_execution_start", toolCallId: id, toolName: "lore_get", args: { private: "private-trace-value" } });
    const endGet = (id: string, result: unknown, isError = false) => ({ type: "tool_execution_end", toolCallId: id, toolName: "lore_get", result, isError });
    const success = { content: [{ type: "text", text: JSON.stringify({ protocolVersion: 2, toolVersion: "0.1.0-alpha.7", command: "get", ok: true, data: { practice: { id: "example" }, contentDigest: "sha256:abc", sources: [] } }) }], details: { exitCode: 0 } };
    const events = [
      { type: "session", version: 3 }, { type: "agent_start" },
      get("success"), endGet("success", success), get("failed"), endGet("failed", null, true),
      get("unknown"), endGet("unknown", {}), { type: "agent_end", messages: [{ role: "assistant", stopReason: "stop", content: [] }] },
      { type: "agent_settled", aborted: false },
    ];
    const path = join(root, "pi.jsonl");
    await writeFile(path, events.map(event => JSON.stringify(event)).join("\n") + "\n");
    const run: Pick<ContainerExecutionResult, "status" | "reason" | "artifacts"> = {
      status: "failed", reason: "Agent execution failed",
      artifacts: { pi: { path, sha256: hash }, usage: null, agentStderr: null, finishLog: null, topology: null },
    };
    const observation = makeObservation(slot);
    expect(await observeRunTrace(observation, run)).toBe(false);
    expect(observation.trace).toMatchObject({ complete: false, query: "indeterminate", get_success: 1, get_failed: 1, get_indeterminate: 1 });
    expect(observation.health).toBe("execution-failed");
    expect(observation.semantic).toBe("not-run");
    expect(observation.quality).toBe("not-run");
    expect(JSON.stringify(observation)).not.toContain("private-trace-value");

    const counterpart = makeObservation(other);
    counterpart.health = "evaluated";
    counterpart.failure_reasons = [];
    counterpart.semantic = "pass";
    counterpart.quality = "observed";
    const summary = summarizePlan(plan, [observation, counterpart]);
    expect(summary.conditions[slot.condition].get_success).toBe(1);
    expect(summary.conditions[slot.condition].get_failed).toBe(1);
    expect(summary.conditions[slot.condition].get_indeterminate).toBe(1);
    expect(summary.runs.find(item => item.ordinal === slot.ordinal)?.status).toBe("ineligible");
    expect(summary.pairs.eligible).toBe(0);
    expect(summary.pairs.semantic_comparable).toBe(0);

    const completed = makeObservation(slot);
    expect(await observeRunTrace(completed, { ...run, status: "completed", reason: null })).toBe(true);
    expect(completed.trace).toMatchObject({ complete: true, query: "not-queried", get_success: 1, get_failed: 1, get_indeterminate: 1 });

    await writeFile(path, events.slice(0, 8).map(event => JSON.stringify(event)).join("\n") + "\n{\n");
    const partial = makeObservation(slot);
    expect(await observeRunTrace(partial, run)).toBe(false);
    expect(partial.trace).toMatchObject({ complete: false, query: "indeterminate", get_success: 1, get_failed: 1, get_indeterminate: 1 });
    const invalidCompleted = makeObservation(slot);
    expect(await observeRunTrace(invalidCompleted, { ...run, status: "completed", reason: null })).toBe(false);
    expect(invalidCompleted.health).toBe("indeterminate");
    expect(invalidCompleted.trace.get_success).toBe(1);

    await writeFile(path, "{not-json}\n");
    const malformed = makeObservation(slot);
    expect(await observeRunTrace(malformed, run)).toBe(false);
    expect(malformed.trace).toMatchObject({ complete: false, query: "indeterminate", get_success: 0, get_failed: 0, get_indeterminate: 0 });

    for (const pi of [null, { path: join(root, "missing"), sha256: hash }]) {
      const absent = makeObservation(slot);
      expect(await observeRunTrace(absent, { ...run, artifacts: { ...run.artifacts, pi } })).toBe(false);
      expect(absent.trace).toMatchObject({ complete: false, query: "indeterminate", get_success: 0, get_failed: 0, get_indeterminate: 0 });
      expect(absent.health).toBe("execution-failed");
    }
  } finally { await rm(root, { recursive: true, force: true }); }
});
