import { expect, test } from "bun:test";
import { listFiles, workspaceRoot } from "../../../fs";
import { join } from "node:path";
import { deliverPreparedPractice, loadPackPracticeTreatment, publicTraceHasPrivateMaterial } from "./contract";

const root = join(workspaceRoot, "treatments", "agentic-coding-replan-on-material-drift", "v1");

test("treatment private material has no public workspace or evaluator copy", async () => {
  const files = await listFiles(root);
  expect(files.some((file) => file.replaceAll("\\", "/").startsWith("public/"))).toBe(false);
  expect(files.some((file) => /(?:evaluator|oracle|scoring|packRoot|store)/i.test(file))).toBe(false);
  const prepared = await loadPackPracticeTreatment(root);
  const trace = deliverPreparedPractice(prepared, { condition_id: "p1-practice", node: "task_start", declared: true }).trace;
  expect(publicTraceHasPrivateMaterial(trace)).toBe(false);
  expect(JSON.stringify(trace)).not.toContain(prepared.payload.text);
  expect(JSON.stringify(trace)).not.toContain(prepared.payload.practice_id);
  expect(JSON.stringify(trace)).not.toContain(prepared.payload.card_sha256);

  const unsafeTrace = { ...trace, practice_id: prepared.payload.practice_id, card_sha256: prepared.payload.card_sha256 } as typeof trace & { practice_id: string; card_sha256: string };
  expect(publicTraceHasPrivateMaterial(unsafeTrace)).toBe(true);
});
