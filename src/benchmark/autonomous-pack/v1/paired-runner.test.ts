import { expect, test } from "bun:test";
import { mkdtemp, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runPairedDiagnostic, type PairedDiagnosticOptions } from "./paired-runner";

const hash = "a".repeat(64);
const plan: PairedDiagnosticOptions["plan"] = {
  schema_version: "autonomous-pack-plan/v1", id: "diagnostic", run_kind: "pilot",
  tasks: [{ id: "task", source_sha256: hash, input_sha256: hash, evaluator_sha256: hash }], repetitions: 1, order_seed: 0,
  common: { environment_sha256: hash, image_sha256: hash, agent: "pi", model: "fixture", model_parameters_sha256: hash, profile_sha256: hash, tool_policy_sha256: hash, system_prompt_sha256: hash, budget: { max_turns: 1, max_duration_ms: 1000 } },
  pack: { source: "fixture", snapshot_uri: "fixture", snapshot_sha256: hash, index_sha256: hash },
};

test("diagnostic rejects remote endpoints before touching inputs or starting a run", async () => {
  const root = await mkdtemp(join(tmpdir(), "lorelum-diagnostic-"));
  try {
    const outputDirectory = join(root, "output");
    const options: PairedDiagnosticOptions = { plan, sources: { pack: "missing", tasks: {}, common: { environment: "missing", modelParameters: "missing", profile: "missing", toolPolicy: "missing", systemPrompt: "missing" } }, outputDirectory, modelFile: "missing", indexes: { empty: { archive: "missing", metadata: "missing" }, installed: { archive: "missing", metadata: "missing" } }, syntheticEndpoint: "https://example.com:443/v1", auditWaitMs: 1000 };
    await expect(runPairedDiagnostic(options)).rejects.toThrow("local synthetic HTTPS");
    await expect(stat(outputDirectory)).rejects.toThrow();
    await expect(runPairedDiagnostic({ ...options, syntheticEndpoint: "https://host.docker.internal:8443/v1", plan: { ...plan, run_kind: "official" } })).rejects.toThrow("Formal runs");
    await expect(stat(outputDirectory)).rejects.toThrow();
    await expect(runPairedDiagnostic({ ...options, syntheticEndpoint: "https://host.docker.internal:8443/v1", sources: { ...options.sources, pack: root } })).rejects.toThrow("disjoint");
    await expect(stat(outputDirectory)).rejects.toThrow();
  } finally { await rm(root, { recursive: true, force: true }); }
});
