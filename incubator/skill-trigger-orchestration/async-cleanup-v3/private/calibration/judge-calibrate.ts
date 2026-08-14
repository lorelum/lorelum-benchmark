import { resolve } from "node:path";
import { readFile } from "node:fs/promises";
import { resolveJudgeProvider } from "../../../../../src/benchmark/judge/providers";
import { buildJudgeInput } from "../../../../../src/benchmark/judge/input";
import { sourceMapToDiff } from "../../../../../src/benchmark/judge/source-map";
import { loadRubric } from "../../../../../src/benchmark/judge/skill-trigger-source-authority/v2/rubric";

const candidateRoot = resolve(import.meta.dir, "../..");
const overlayRoot = resolve(candidateRoot, "private/calibration/sets/operation-authority/v1/overlays");
const starterRoot = resolve(candidateRoot, "public/starter/app");

async function filesFor(variant: string): Promise<Record<string, string>> {
  const overlay = resolve(overlayRoot, variant);
  const read = async (path: string) => (await readFile(path, "utf8")).replace(/^\uFEFF/, "");
  return {
    "src/Dashboard.tsx": await read(resolve(overlay, "src/Dashboard.tsx")),
    "src/services/projects.ts": await read(resolve(overlay, "src/services/projects.ts")),
    "src/main.tsx": await read(resolve(starterRoot, "src/main.tsx")),
    "src/styles.css": await read(resolve(starterRoot, "src/styles.css")),
    "tests/dashboard.spec.ts": await read(resolve(starterRoot, "tests/dashboard.spec.ts")),
  };
}

const provider = resolveJudgeProvider("skill-trigger-source-authority/v2");
if (!provider) throw new Error("judge v2 provider not registered");
const taskMd = await readFile(resolve(candidateRoot, "public/task.md"), "utf8");
const { doc } = await loadRubric();

const results: Array<{ variant: string; state: string; score: number; confidence: number; criteria: Array<{ id: string; points: number }>; reason?: string }> = [];
for (const variant of ["reference", "anti-pattern", "equivalent"]) {
  const files = await filesFor(variant);
  const candidateDiff = sourceMapToDiff(files);
  const rubric = await provider.rubricText();
  const input = await buildJudgeInput({ task_md: taskMd, candidate_diff: candidateDiff, rubric });
  const result = await provider.score(input, {
    judge: { id: provider.id, version: provider.version },
    prompt: "score",
    prompt_hash: "0".repeat(64),
    rubric_hash: "0".repeat(64),
  });
  results.push({ variant, state: result.state, score: result.score, confidence: result.confidence, criteria: result.criteria.map((c) => ({ id: c.id, points: c.points, rationale: c.rationale })), reason: result.reason });
}

for (const row of results) console.log(JSON.stringify(row));
const reference = results.find((row) => row.variant === "reference");
const anti = results.find((row) => row.variant === "anti-pattern");
const equivalent = results.find((row) => row.variant === "equivalent");
const pass = reference?.state === "observed" && reference.score >= doc.thresholds.reference_min
  && anti?.state === "observed" && anti.score <= doc.thresholds.anti_pattern_max
  && equivalent?.state === "observed" && equivalent.score >= doc.thresholds.reference_min
  && reference.score - anti.score >= doc.thresholds.anti_pattern_gap;
console.log(JSON.stringify({ thresholds: doc.thresholds, calibration_pass: Boolean(pass) }));
process.exit(pass ? 0 : 1);
