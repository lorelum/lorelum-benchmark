import { expect, test } from "bun:test";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { sha256File } from "../../fs";
import { sha256SnapshotDirectory } from "../v1/snapshot";
import { hashContract } from "../v1/plan";
import { prepareExperiment, type PrepareConfiguration } from "./prepare";
import { exportBundle, verifyBundle } from "./bundle";
import { runPairedPilot } from "./paired-runner";

async function fixture(root: string): Promise<PrepareConfiguration> {
  const pack = join(root, "pack"); await mkdir(pack); await writeFile(join(pack, "pack.yaml"), "id: fixture\n");
  const model = join(root, "model"); await writeFile(model, "model fixture");
  const empty = join(root, "empty.tar"), installed = join(root, "installed.tar");
  await writeFile(empty, "empty index"); await writeFile(installed, "installed index");
  const pack_sha256 = await sha256SnapshotDirectory(pack), model_sha256 = await sha256File(model);
  const profile_id = "a".repeat(64), encoding_id = "b".repeat(64);
  const meta = async (condition: string, archive: string, path: string) => writeFile(path, JSON.stringify({ condition, pack_sha256, model_sha256, profile_id, encoding_id, index_sha256: await sha256File(archive) }));
  const emptyMeta = join(root, "empty.json"), installedMeta = join(root, "installed.json");
  await meta("empty-store", empty, emptyMeta); await meta("pack-installed", installed, installedMeta);
  const environment = join(root, "environment.yaml"), params = join(root, "model.json"), system = join(root, "system.txt");
  await writeFile(environment, `agent_runtime:\n  id: pi\nmodel:\n  id: provider/model\nembedding:\n  model_sha256: ${model_sha256}\n  profile_id: ${profile_id}\n  encoding_id: ${encoding_id}\n  retrieval_method: single-vector\ntask_runtimes:\n  node: '26'\n`);
  await writeFile(params, JSON.stringify({ api_model_id: "model", context_window: 1024, max_tokens: 128 }));
  await writeFile(system, "Complete the task.\n");
  return {
    id: "bundle-test", tasks: [resolve("incubator/autonomous-pack/config-migration-v2")], packSource: pack,
    environment, agentImage: "sha256:" + "c".repeat(64), proxyImage: "sha256:" + "d".repeat(64),
    modelParameters: params, systemPrompt: system, modelFile: model,
    indexes: { empty: { archive: empty, metadata: emptyMeta }, installed: { archive: installed, metadata: installedMeta } },
    repetitions: 1, orderSeed: 1, budget: { max_turns: 2, max_duration_ms: 1000 }, auditWaitMs: 1000,
  };
}

test("bundle detects task declaration tampering even if its entry checksum is updated", async () => {
  const root = await mkdtemp(join(tmpdir(), "pack-reuse-"));
  try {
    const config = await fixture(root);
    const path = await prepareExperiment(config, join(root, "prepared"), "https://example.invalid/v1");
    const pilot = JSON.parse(await readFile(path, "utf8"));
    const bundle = join(root, "handoff");
    await exportBundle(pilot, bundle);
    const restored = await verifyBundle(bundle);
    expect(restored.plan.task_contracts[0].runtime).toBe("node");
    const declaration = join(bundle, "data/tasks/0/private/candidate.yaml");
    await writeFile(declaration, (await readFile(declaration, "utf8")).replace("runtime: node", "runtime: python"));
    const manifestPath = join(bundle, "manifest.json");
    const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
    manifest.entries.find((entry: { key: string }) => entry.key === "task:0:declaration").sha256 = await sha256File(declaration);
    await writeFile(manifestPath, JSON.stringify(manifest));
    await expect(verifyBundle(bundle)).rejects.toThrow("Bundle task declaration does not match plan");
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("bundle rejects malformed entry identities and paths", async () => {
  const root = await mkdtemp(join(tmpdir(), "pack-bundle-entry-"));
  try {
    const config = await fixture(root);
    const pilotPath = await prepareExperiment(config, join(root, "prepared"), "https://example.invalid/v1");
    const bundle = join(root, "handoff");
    await exportBundle(JSON.parse(await readFile(pilotPath, "utf8")), bundle);
    const manifestPath = join(bundle, "manifest.json");
    const original = JSON.parse(await readFile(manifestPath, "utf8"));
    for (const change of [{ sha256: "bad" }, { path: "../outside" }, { path: "data/../outside" }]) {
      const manifest = structuredClone(original);
      Object.assign(manifest.entries[0], change);
      await writeFile(manifestPath, JSON.stringify(manifest));
      await expect(verifyBundle(bundle)).rejects.toThrow();
    }
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("preparation rejects an environment without the task's declared runtime", async () => {
  const root = await mkdtemp(join(tmpdir(), "pack-runtime-"));
  try {
    const config = await fixture(root);
    await writeFile(config.environment, (await readFile(config.environment, "utf8")).replace("node: '26'", "python: '3.13'"));
    await expect(prepareExperiment(config, join(root, "prepared"), "https://example.invalid/v1")).rejects.toThrow("Environment and execution profile mismatch");
  } finally { await rm(root, { recursive: true, force: true }); }
});

for (const scenario of ["missing embedding", "embedding identity mismatch", "invalid model parameters"] as const) {
  test(`preparation, bundle and runner reject ${scenario}`, async () => {
    const root = await mkdtemp(join(tmpdir(), "pack-input-"));
    try {
      const config = await fixture(root);
      const pilotPath = await prepareExperiment(config, join(root, "prepared"), "https://example.invalid/v1");
      const pilot = JSON.parse(await readFile(pilotPath, "utf8"));
      const bundle = join(root, "handoff");
      await exportBundle(pilot, bundle);
      const key = scenario === "invalid model parameters" ? "modelParameters" : "environment";
      const invalid = (text: string) => scenario === "invalid model parameters"
        ? JSON.stringify({ api_model_id: "model", context_window: 10, max_tokens: 11 })
        : scenario === "missing embedding"
          ? text.replace(/embedding:\n(?:  .*\n){4}/, "")
          : text.replace(/  profile_id: [a-f0-9]{64}/, `  profile_id: ${"f".repeat(64)}`);
      const inputPath = key === "environment" ? config.environment : config.modelParameters;
      const message = scenario === "invalid model parameters" ? "Invalid model parameters" : "Environment and execution profile mismatch";
      await writeFile(inputPath, invalid(await readFile(inputPath, "utf8")));
      await expect(prepareExperiment(config, join(root, "invalid-prepared"), "https://example.invalid/v1")).rejects.toThrow(message);

      const preparedPath = pilot.sources.common[key];
      await writeFile(preparedPath, invalid(await readFile(preparedPath, "utf8")));
      const planKey = key === "environment" ? "environment_sha256" : "model_parameters_sha256";
      pilot.plan.plan.common[planKey] = await sha256File(preparedPath);
      await expect(exportBundle(pilot, join(root, "invalid-handoff"))).rejects.toThrow(message);
      await expect(runPairedPilot({ ...pilot, outputDirectory: join(root, "run"), upstreamBaseUrl: "https://example.invalid/v1", upstreamApiKey: "test" })).rejects.toThrow(message);

      const bundlePath = join(bundle, `data/common/${key}`);
      await writeFile(bundlePath, invalid(await readFile(bundlePath, "utf8")));
      const manifestPath = join(bundle, "manifest.json");
      const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
      const sha = await sha256File(bundlePath);
      manifest.entries.find((entry: { key: string }) => entry.key === `common:${key}`).sha256 = sha;
      manifest.plan.plan.common[planKey] = sha;
      manifest.plan_sha256 = hashContract(manifest.plan);
      await writeFile(manifestPath, JSON.stringify(manifest));
      await expect(verifyBundle(bundle)).rejects.toThrow(message);
    } finally { await rm(root, { recursive: true, force: true }); }
  });
}
