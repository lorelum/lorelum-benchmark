import { expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { sha256SnapshotDirectory } from "./snapshot";
import { collectBlindReview, prepareBlindReview, validateBlindReview } from "./blind-review";
import { applyBlindReview } from "./quality-observations";

const hash = (value: string) => createHash("sha256").update(value).digest("hex");

test("blind packets hide condition labels and reject changed reviewer artifacts", async () => {
  const root = await mkdtemp(join(tmpdir(), "lorelum-review-test-"));
  try {
    const starter = join(root, "starter"), candidate = join(root, "candidate"), rubricFile = join(root, "rubric.md"), outputDirectory = join(root, "packets");
    await mkdir(starter); await mkdir(candidate);
    await writeFile(join(starter, "source.js"), "export const n = 1;\n");
    await writeFile(join(candidate, "source.js"), "export const n = 2;\n");
    const rubric = "Assess clarity independently of condition.\n";
    await writeFile(rubricFile, rubric);
    await prepareBlindReview({ items: [{ id: "private-condition-name", starter, starterSha256: await sha256SnapshotDirectory(starter), workspace: candidate, workspaceSha256: await sha256SnapshotDirectory(candidate) }], rubricFile, rubricSha256: hash(rubric), criteria: ["clarity"], outputDirectory });
    const reviewDir = join(outputDirectory, "review");
    for (const name of await readdir(reviewDir)) expect(await readFile(join(reviewDir, name), "utf8")).not.toContain("private-condition-name");
    const index = JSON.parse(await readFile(join(reviewDir, "index.json"), "utf8"));
    const blindId: string = index.blind_ids[0];
    const review = { blind_id: blindId, probes: [{ id: "clarity", status: "not-observed", evidence: "State transition is difficult to follow." }] };
    const result = await collectBlindReview(outputDirectory, review);
    expect(result.id).toBe("private-condition-name");
    expect(result.quality_probes).toEqual([{ id: "clarity", status: "not-observed", points: null, max_points: null }]);
    await writeFile(join(reviewDir, `${blindId}.diff`), "changed\n");
    await expect(collectBlindReview(outputDirectory, review)).rejects.toThrow("identity mismatch");
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("review assessment requires unique criteria and concrete evidence", () => {
  const id = "packet";
  expect(() => validateBlindReview({ blind_id: id, probes: [{ id: "clarity", status: "observed", evidence: "" }] }, id, ["clarity"])).toThrow();
  expect(() => validateBlindReview({ blind_id: id, probes: [{ id: "clarity", status: "observed", evidence: "x" }, { id: "clarity", status: "observed", evidence: "x" }] }, id, ["clarity", "coverage"])).toThrow();
  expect(validateBlindReview({ blind_id: id, probes: [{ id: "clarity", status: "indeterminate", evidence: "No relevant source was available." }] }, id, ["clarity"]).quality).toBe("indeterminate");
});

test("quality review binds to the evaluated workspace and stays outside agent input", async () => {
  const root = await mkdtemp(join(tmpdir(), "lorelum-review-bind-"));
  try {
    const starter = join(root, "starter"), workspace = join(root, "workspace"), rubricFile = join(root, "rubric"), packets = join(root, "packets");
    await mkdir(starter); await mkdir(workspace);
    await writeFile(join(starter, "file"), "old");
    await writeFile(join(workspace, "file"), "new");
    await writeFile(rubricFile, "clarity");
    const planSha = "a".repeat(64), workspaceSha = await sha256SnapshotDirectory(workspace);
    await prepareBlindReview({ items: [{ id: `${planSha}:0`, starter, starterSha256: await sha256SnapshotDirectory(starter), workspace, workspaceSha256: workspaceSha }], rubricFile, rubricSha256: hash("clarity"), criteria: ["clarity"], outputDirectory: packets });
    const index = JSON.parse(await readFile(join(packets, "review", "index.json"), "utf8"));
    const review = { blind_id: index.blind_ids[0], probes: [{ id: "clarity", status: "not-observed", evidence: "The state transition is hard to follow." }] };
    const identityPath = join(root, "identity.json");
    const identity = JSON.stringify({ algorithm: "autonomous-pack-tree/v1", uri: pathToFileURL(workspace).href, sha256: workspaceSha });
    await writeFile(identityPath, identity);
    const observation = { schema_version: "autonomous-pack-observation/v1", plan_id: "plan", plan_sha256: planSha, pair_id: "pair", condition: "empty-store", ordinal: 0, input_sha256: planSha, common_sha256: planSha, pack_snapshot_sha256: null, index_sha256: null, verification: { input: true, isolation: true, treatment: true, reasons: [] }, health: "evaluated", failure_reasons: [], semantic: "pass", quality: "not-run", quality_probes: [], trace: { complete: true, query: "not-queried", get_success: 0, get_failed: 0, get_indeterminate: 0 }, duration_ms: null, cost_usd: null, input_tokens: null, output_tokens: null, total_tokens: null, artifacts: [{ kind: "workspace-identity", uri: pathToFileURL(identityPath).href, sha256: hash(identity) }] };
    await expect(applyBlindReview(observation, packets, review, join(workspace, "private-review.json"))).rejects.toThrow("outside");
    const result = await applyBlindReview(observation, packets, review, join(root, "private-review.json"));
    expect(result.semantic).toBe("pass");
    expect(result.quality_probes[0].status).toBe("not-observed");
    await writeFile(join(workspace, "file"), "changed after evaluation");
    await expect(applyBlindReview(observation, packets, review, join(root, "other-review.json"))).rejects.toThrow("Workspace changed");
  } finally { await rm(root, { recursive: true, force: true }); }
});
