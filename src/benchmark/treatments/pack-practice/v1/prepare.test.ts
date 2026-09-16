import { expect, test } from "bun:test";
import { join } from "node:path";
import { workspaceRoot } from "../../../fs";
import { loadPackPracticeTreatment } from "./contract";
import { preparePackPractice, LorePreparationError, type LoreCommandResult } from "./prepare";
import type { PackPracticeManifest } from "./types";

const treatmentRoot = join(workspaceRoot, "treatments", "agentic-coding-replan-on-material-drift", "v1");
const queryText = "I am implementing an asynchronous report lifecycle. After the initial plan, new facts require old and new clients and workers to run concurrently and allow application rollback. These facts may change the delivered behavior, risks, and verification boundary; I need guidance on when to pause and replan before continuing implementation.";

async function fixtureRunner(): Promise<{ runner: (args: string[]) => Promise<LoreCommandResult>; calls: string[][] }> {
  const prepared = await loadPackPracticeTreatment(treatmentRoot);
  const selection = prepared.selection;
  const calls: string[][] = [];
  return {
    calls,
    runner: async (args) => {
      calls.push(args);
      const command = args[2];
      if (command === "pack") return { exitCode: 0, stdout: JSON.stringify({ ok: true, data: { pack: { name: "agentic-coding", version: "0.4.0" } } }), stderr: "" };
      if (command === "query") return { exitCode: 0, stdout: JSON.stringify({ ok: true, data: { mode: "semantic", results: selection.query.results } }), stderr: "" };
      if (command === "get") {
        const body = prepared.payload.text;
        return {
          exitCode: 0,
          stdout: JSON.stringify({ ok: true, data: { practice: { id: prepared.payload.practice_id, title: "Replan When New Facts Change the Work", stage: "implementation", tech_stack: ["agentic-coding"], applies_when: prepared.applicability.applies_when, severity: "warn", body }, contentDigest: prepared.payload.content_digest, sources: [{ packName: "agentic-coding", sourcePath: prepared.manifest.practice.source_path, packRoot: "<isolated-store>/packs/p-agentic-coding/current" }] } }),
          stderr: ""
        };
      }
      throw new Error(`unexpected args: ${args.join(" ")}`);
    }
  };
}

test("prepare runs one fixed install/query/get sequence and returns Lore provenance", async () => {
  const prepared = await loadPackPracticeTreatment(treatmentRoot);
  const fixture = await fixtureRunner();
  const result = await preparePackPractice({
    manifest: prepared.manifest as PackPracticeManifest,
    storeRoot: "<isolated-store>",
    queryText,
    loreCliVersion: "0.1.0-alpha.1",
    commandRunner: fixture.runner,
    sourceHashResolver: async () => prepared.manifest.practice.source_sha256
  });
  expect(fixture.calls.map((args) => args.slice(2, 5))).toEqual([
    ["pack", "install", "agentic-coding@0.4.0"],
    ["query", queryText, "--mode"],
    ["get", prepared.manifest.practice.id]
  ]);
  expect(result.selection.captured_from).toBe("lore-cli");
  expect(result.selection.query.selected_practice_id).toBe(prepared.manifest.practice.id);
  expect(result.selection.get.card_sha256).toBe(prepared.manifest.practice.card_sha256);
});

test("prepare returns indeterminate when semantic query omits the expected Practice", async () => {
  const prepared = await loadPackPracticeTreatment(treatmentRoot);
  const fixture = await fixtureRunner();
  const missing = async (args: string[]) => {
    const result = await fixture.runner(args);
    if (args[2] === "query") return { ...result, stdout: JSON.stringify({ ok: true, data: { mode: "semantic", results: [] } }) };
    return result;
  };
  await expect(preparePackPractice({ manifest: prepared.manifest as PackPracticeManifest, storeRoot: "<isolated-store>", queryText, loreCliVersion: "0.1.0-alpha.1", commandRunner: missing, sourceHashResolver: async () => prepared.manifest.practice.source_sha256 })).rejects.toMatchObject({ kind: "indeterminate" } satisfies Partial<LorePreparationError>);
});

test("prepare never silently changes semantic mode after a preparation error", async () => {
  const prepared = await loadPackPracticeTreatment(treatmentRoot);
  const runner = async (args: string[]) => {
    if (args[2] === "pack") return { exitCode: 0, stdout: JSON.stringify({ ok: true, data: { pack: { name: "agentic-coding", version: "0.4.0" } } }), stderr: "" };
    return { exitCode: 1, stdout: JSON.stringify({ ok: true, data: { state: "preparing" } }), stderr: "semantic model is preparing" };
  };
  await expect(preparePackPractice({ manifest: prepared.manifest as PackPracticeManifest, storeRoot: "<isolated-store>", queryText, loreCliVersion: "0.1.0-alpha.1", commandRunner: runner, sourceHashResolver: async () => prepared.manifest.practice.source_sha256 })).rejects.toMatchObject({ kind: "indeterminate" } satisfies Partial<LorePreparationError>);
});
