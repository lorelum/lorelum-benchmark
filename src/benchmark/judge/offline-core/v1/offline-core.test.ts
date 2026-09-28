import { join } from "node:path";
import { expect, test } from "bun:test";
import { judgePairCase, parseRawModelVerdict, validateScenarioBundle, EvidenceBoundaryError } from "./core";
import { buildFrozenManifest, compareFrozenCore } from "./freeze";
import { coreFileHashes } from "./runner";
import { assertLoopbackBaseUrl, assertModelArtifact, validateRuntimeConfig, type LocalRuntimeConfig } from "./runtime";
import { runScenario } from "./runner";
import type { EvidenceItem, PairCase, ScenarioBundle } from "./types";

const root = join(import.meta.dir, "..");

const thresholds = {
  schema_validity: 1,
  citation_validity: 1,
  development_decisive_accuracy: 0.8,
  holdout_decisive_accuracy: 0.75,
  equivalence_stability: 0.75,
  order_consistency: 0.75,
  unexpected_abstain: 0.1,
  high_confidence_errors: 1,
};

const model = {
  id: "Qwen/Qwen3-1.7B-GGUF",
  revision: "90862c4b9d2787eaed51d12237eafdfe7c5f6077",
  quantization: "Q8_0",
  file_sha256: "061b54daade076b5d3362dac252678d17da8c68f07560be70818cace6590cb1a",
  file_size_bytes: 1_834_426_016,
};

const runtime = {
  id: "llama.cpp",
  version: "b11207",
  artifact_sha256: "738f8c251ac22b70c3ae6f83a10cf222725df0395246a2cf58f32bdb85fbe668",
  binary_sha256: "3efd633317d9eec15518c21c73641fa637a000c3aea88c6fe4158befe16635b1",
  base_url: "http://127.0.0.1:8080",
  context_size: 8192,
  temperature: 0,
  top_k: 1,
  seed: 20260927,
  max_tokens: 512,
};

function runtimeConfig(path = "<missing>"): LocalRuntimeConfig {
  return {
    schema_version: "offline-judge-runtime/v1",
    base_url: runtime.base_url,
    model: { ...model, path },
    runtime: { id: runtime.id, version: runtime.version, artifact_sha256: runtime.artifact_sha256, binary_sha256: runtime.binary_sha256 },
    context_size: runtime.context_size,
    temperature: runtime.temperature,
    top_k: runtime.top_k,
    seed: runtime.seed,
    max_tokens: runtime.max_tokens,
  };
}

async function evidence(id: string, content: string): Promise<EvidenceItem> {
  return {
    id,
    kind: "text",
    label: id,
    content,
    sha256: await crypto.subtle.digest("SHA-256", new TextEncoder().encode(content)).then((value) =>
      [...new Uint8Array(value)].map((byte) => byte.toString(16).padStart(2, "0")).join(""),
    ),
  };
}

async function bundle(): Promise<ScenarioBundle> {
  const a = await evidence("A:one", "A evidence");
  const b = await evidence("B:one", "B evidence");
  const criterion = { id: "criterion", description: "Judge the criterion." };
  const pairCase: PairCase = {
    id: "case",
    criterion,
    kind: "decisive",
    a: { summary: "A", items: [a] },
    b: { summary: "B", items: [b] },
    provenance: { source_ids: ["test"], evidence_hash: "0".repeat(64) },
  };
  return {
    profile: {
      schema_version: "offline-judge-scenario/v1",
      id: "test",
      version: "v1",
      adapter_version: "test/v1",
      description: "test",
    },
    rubric: { id: "test-rubric", version: "v1", criteria: [criterion] },
    cases: [pairCase],
    labels: [{ case_id: "case", expected: "A" }],
  };
}

test("parses only bounded model verdicts", () => {
  expect(parseRawModelVerdict({
    a_relation: "supports",
    b_relation: "contradicts",
    verdict: "A",
    confidence: "medium",
    citations: ["A:one", "B:one"],
  })).toMatchObject({ verdict: "A", confidence: "medium" });
  expect(() => parseRawModelVerdict({
    a_relation: "supports",
    b_relation: "contradicts",
    verdict: "maybe",
    confidence: "medium",
    citations: [],
  })).toThrow("invalid verdict");
});

test("rejects private markers before model input", async () => {
  const scenario = await bundle();
  scenario.cases[0].a.items[0].content = "See private/oracle.yaml";
  expect(() => validateScenarioBundle(scenario)).toThrow(EvidenceBoundaryError);
});

test("conflicting relation and pairwise verdict becomes invalid", async () => {
  const scenario = await bundle();
  const decision = await judgePairCase({
    bundle: scenario,
    case: scenario.cases[0],
    orientation: "AB",
    complete: async () => ({
      a_relation: "contradicts",
      b_relation: "supports",
      verdict: "A",
      confidence: "high",
      citations: ["A:one", "B:one"],
    }),
  });
  expect(decision.state).toBe("invalid");
  expect(decision.verdict).toBe("insufficient");
});

test("model unavailability fails closed as not-run", async () => {
  const scenario = await bundle();
  const decision = await judgePairCase({
    bundle: scenario,
    case: scenario.cases[0],
    orientation: "AB",
    complete: async () => {
      throw new Error("runtime unavailable");
    },
  });
  expect(decision.state).toBe("not-run");
  expect(decision.reason).toContain("runtime unavailable");
});

test("loopback runtime validation rejects remote endpoints", () => {
  expect(assertLoopbackBaseUrl("http://127.0.0.1:8080")).toBe("http://127.0.0.1:8080");
  expect(() => assertLoopbackBaseUrl("https://example.com")).toThrow("must use http");
  expect(() => assertLoopbackBaseUrl("http://example.com")).toThrow("must be loopback");
});

test("runtime preflight fails closed when the artifact is missing", async () => {
  const config = runtimeConfig(join(root, "private", "missing.gguf"));
  validateRuntimeConfig(config);
  await expect(assertModelArtifact(config)).rejects.toThrow("model artifact not found");
});

test("frozen core comparison detects semantic file changes", async () => {
  const before = await buildFrozenManifest(new Date("2026-09-27T00:00:00.000Z"));
  const after = {
    ...before,
    core_files: { ...before.core_files, "core.ts": "0".repeat(64) },
  };
  const comparison = compareFrozenCore(before, after);
  expect(comparison.passed).toBe(false);
  expect(comparison.changed_core_files).toEqual(["core.ts"]);
  expect((await coreFileHashes())["prompt.ts"]).toMatch(/^[a-f0-9]{64}$/);
});

test("holdout scenario passes with a deterministic mock model", async () => {
  let calls = 0;
  const result = await runScenario({
    scenarioDir: join(import.meta.dir, "scenarios", "compaction-summary-v1"),
    claim: "holdout",
    model,
    runtime,
    thresholds,
    complete: async (_system, user) => {
      calls += 1;
      const prompt = JSON.parse(user) as {
        criterion: { id: string };
        candidate_a: { evidence: Array<{ id: string; label: string }> };
        candidate_b: { evidence: Array<{ id: string; label: string }> };
      };
      const a = prompt.candidate_a.evidence[0].id;
      const b = prompt.candidate_b.evidence[0].id;
      if (prompt.criterion.id === "summary-equivalence") {
        return {
          a_relation: "supports",
          b_relation: "supports",
          verdict: "tie",
          confidence: "medium",
          citations: [a, b],
        };
      }
      const verdict = prompt.candidate_a.evidence[0].label === "summary-a" ? "A" : "B";
      const aRelation = verdict === "A" ? "supports" : "contradicts";
      const bRelation = verdict === "A" ? "contradicts" : "supports";
      return {
        a_relation: aRelation,
        b_relation: bRelation,
        verdict,
        confidence: "medium",
        citations: [a, b],
      };
    },
  });
  expect(calls).toBe(12);
  expect(result.passed).toBe(true);
  expect(result.metrics.decisive_accuracy).toBe(1);
  expect(result.metrics.equivalence_stability).toBe(1);
  expect(result.metrics.insufficient_controls_abstained).toBe(4);
});

test("scenario adapters expose twelve labeled pairs", async () => {
  for (const scenario of ["gateway-v3", "source-authority-v2", "compaction-summary-v1"]) {
    const scenarioDir = join(import.meta.dir, "scenarios", scenario);
    const module = await import(`${scenarioDir}/adapter.ts`);
    const loaded = await module.loadScenario(scenarioDir);
    const expectedPairs = scenario === "compaction-summary-v1" ? 8 : 12;
    expect(loaded.cases).toHaveLength(expectedPairs);
    expect(loaded.labels).toHaveLength(expectedPairs);
  }
});

test("source-authority adapter reads the frozen PX-47 rubric without rewriting it", async () => {
  const scenarioDir = join(import.meta.dir, "scenarios", "source-authority-v2");
  const module = await import(`${scenarioDir}/adapter.ts`);
  const loaded = await module.loadScenario(scenarioDir);
  const frozen = Bun.YAML.parse(
    await Bun.file(join(root, "..", "skill-trigger-source-authority", "v2", "rubric.yaml")).text(),
  ) as { id: string; version: string; dimensions: Array<{ id: string; description: string }> };
  expect(loaded.rubric.id).toBe(frozen.id);
  expect(loaded.rubric.version).toBe(frozen.version);
  expect(loaded.rubric.criteria).toEqual(
    frozen.dimensions.map(({ id, description }) => ({ id, description })),
  );
});

test("core decisions do not depend on scenario identity", async () => {
  const first = await bundle();
  const second = await bundle();
  second.profile = { ...second.profile, id: "unrelated-scenario", version: "v9", description: "other" };
  const mock = async () => ({
    a_relation: "supports" as const,
    b_relation: "contradicts" as const,
    verdict: "A" as const,
    confidence: "medium" as const,
    citations: ["A:one", "B:one"],
  });
  const baseline = await judgePairCase({ bundle: first, case: first.cases[0], orientation: "AB", complete: mock });
  const renamed = await judgePairCase({ bundle: second, case: second.cases[0], orientation: "AB", complete: mock });
  expect(renamed.canonical_verdict).toBe(baseline.canonical_verdict);
  expect(renamed.state).toBe(baseline.state);
  expect(renamed.prompt_hash).toBe(baseline.prompt_hash);
});

test("observed verdicts must cite both candidates", async () => {
  const scenario = await bundle();
  const decision = await judgePairCase({
    bundle: scenario,
    case: scenario.cases[0],
    orientation: "AB",
    complete: async () => ({
      a_relation: "supports",
      b_relation: "contradicts",
      verdict: "A",
      confidence: "high",
      citations: ["A:one"],
    }),
  });
  expect(decision.state).toBe("invalid");
  expect(decision.reason).toContain("both candidates");
});

test("scenario adapters namespace candidate evidence so identical paths do not collide", async () => {
  for (const scenario of ["gateway-v3", "source-authority-v2"]) {
    const scenarioDir = join(import.meta.dir, "scenarios", scenario);
    const module = await import(`${scenarioDir}/adapter.ts`);
    const loaded = await module.loadScenario(scenarioDir);
    const pairCase = loaded.cases.find(
      (candidate) => candidate.a.items.length > 0 && candidate.b.items.length > 0,
    );
    expect(pairCase).toBeDefined();
    const aIds = pairCase!.a.items.map((item) => item.id);
    const bIds = pairCase!.b.items.map((item) => item.id);
    expect(aIds.every((id) => id.startsWith("A:"))).toBe(true);
    expect(bIds.every((id) => id.startsWith("B:"))).toBe(true);
    expect(new Set([...aIds, ...bIds]).size).toBe(aIds.length + bIds.length);
  }
});
