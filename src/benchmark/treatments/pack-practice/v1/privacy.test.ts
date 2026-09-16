import { expect, test } from "bun:test";
import { listFiles, workspaceRoot } from "../../../fs";
import { join } from "node:path";
import { loadPackPracticeTreatment, publicTraceHasPrivateMaterial } from "./contract";

const root = join(workspaceRoot, "treatments", "agentic-coding-replan-on-material-drift", "v1");

test("treatment private material has no public workspace or evaluator copy", async () => {
  const files = await listFiles(root);
  expect(files.some((file) => file.replaceAll("\\", "/").startsWith("public/"))).toBe(false);
  expect(files.some((file) => /(?:evaluator|oracle|scoring|packRoot|store)/i.test(file))).toBe(false);
  const prepared = await loadPackPracticeTreatment(root);
  const trace = {
    schema_version: "pack-practice-delivery-trace/v1" as const,
    condition_id: "p1-practice",
    node: "task_start" as const,
    treatment_id: prepared.manifest.id,
    treatment_version: prepared.manifest.version,
    practice_id: prepared.payload.practice_id,
    card_sha256: prepared.payload.card_sha256,
    status: "delivered" as const
  };
  expect(publicTraceHasPrivateMaterial(trace)).toBe(false);
  expect(JSON.stringify(trace)).not.toContain(prepared.payload.text);
});
