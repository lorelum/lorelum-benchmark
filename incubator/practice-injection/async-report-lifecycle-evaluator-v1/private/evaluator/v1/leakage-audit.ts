import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { listRelativeFiles } from "./files";
import { loadEvaluatorIdentity } from "./identity";
import { buildEvaluatorResult, CHECK_IDS } from "./result";
import { judgeHardGateSummary } from "./summary";

const PRIVATE_MARKERS = [
  "async-report-deterministic-evaluator",
  "oracle.yaml",
  "fixtures/manifest.yaml",
  "private/evaluator",
  ...CHECK_IDS,
];

function fail(message: string): never {
  throw new Error(`Leakage audit failed: ${message}`);
}

const identity = await loadEvaluatorIdentity();
const publicRoot = join(identity.candidateRoot, "public");
for (const relativePath of await listRelativeFiles(publicRoot)) {
  const text = await readFile(join(publicRoot, relativePath), "utf8").catch(() => "");
  for (const marker of PRIVATE_MARKERS) {
    if (text.includes(marker)) fail(`${relativePath} contains ${marker}`);
  }
}

const summary = judgeHardGateSummary(buildEvaluatorResult(CHECK_IDS.map((id) => ({ id, status: "pass" }))));
const summaryText = JSON.stringify(summary);
for (const forbidden of ["reason", "fixture", "oracle", "practice", "pack", "delivery", "condition", identity.root]) {
  if (summaryText.includes(forbidden)) fail(`judge summary contains ${forbidden}`);
}
if (Object.keys(summary).sort().join(",") !== "check_ids,evaluator_version,overall_status") fail("judge summary shape is not allowlisted");

console.log(JSON.stringify({ leakage_audit: "pass" }));
