import { resolve } from "node:path";
import { sha256Text } from "../../../../../src/benchmark/fs";
import { buildJudgeInput } from "../../../../../src/benchmark/judge/input";
import { assertJudgeResultV1, type JudgeCriteriaV1, type JudgeResultV1 } from "../../../../../src/benchmark/outcome/v1/contract";
import { rubricHash, loadRubric } from "../judge/rubric";
import { scoreSource, type SourceMap } from "../judge/score";
import { aggregateRuns } from "../judge/aggregate";

const candidateRoot = resolve(import.meta.dir, "../..");

export type JudgeAttemptOutcome = {
  state: "observed" | "indeterminate" | "judge-unavailable";
  sidecar: JudgeResultV1 | null;
  score: number | null;
  criteria: JudgeCriteriaV1[];
  confidence: number;
  reason: string | null;
  report: { scores: number[]; median: number; spread: number; low_confidence: boolean; disagreement: boolean } | null;
  hashes: { prompt_hash: string | null; rubric_hash: string | null; input_hash: string | null };
  judge: { id: string; version: string };
};

const generatedDirectories = new Set(["node_modules", "dist", "test-results", "playwright-report", ".vite"]);

export async function readSourceMap(appRoot: string): Promise<SourceMap> {
  const files: SourceMap = {};
  for await (const file of new Bun.Glob("**/*").scan({ cwd: appRoot, onlyFiles: true })) {
    const normalized = file.replaceAll("\\", "/");
    if (generatedDirectories.has(normalized.split("/")[0])) continue;
    files[normalized] = await Bun.file(resolve(appRoot, file)).text();
  }
  return files;
}

function redactedReason(message: string): string {
  return message
    .replace(/(?:sk-|api[_-]?key["']?\s*[:=]\s*["']?|bearer\s+)[A-Za-z0-9._~+/\-]{8,}={0,2}/gi, "<redacted>")
    .replace(/\b[A-Za-z0-9_\-]{20,}\b/g, "<redacted>");
}

export async function runJudge(appRoot: string, taskMd: string, count: number): Promise<JudgeAttemptOutcome> {
  const { text: rubricText, doc } = await loadRubric();
  const judge = { id: doc.judge.id, version: doc.judge.version };
  const promptHash = await sha256Text(doc.prompt);
  const hash = await rubricHash(rubricText);
  try {
    const files = await readSourceMap(appRoot);
    const candidateDiff = Object.entries(files)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([path, content]) => `${path}\0${content}`)
      .join("\n");
    const input = await buildJudgeInput({ task_md: taskMd, candidate_diff: candidateDiff, rubric: rubricText });
    const runs: Array<{ score: number; confidence: number; criteria: JudgeCriteriaV1[] }> = [];
    for (let attempt = 0; attempt < count; attempt++) {
      const result = await scoreSource({ files, taskMd, candidateDiff, rubricText, doc, inputHash: input.input_hash });
      runs.push({ score: result.score, confidence: result.confidence, criteria: result.criteria });
    }
    const aggregate = aggregateRuns(runs, doc.thresholds);
    const hashes = { prompt_hash: promptHash, rubric_hash: hash, input_hash: input.input_hash };
    if (aggregate.state === "observed") {
      const sidecar = assertJudgeResultV1({
        schema_version: "judge-result/v1",
        judge_version: 1,
        judge,
        state: "observed",
        score: aggregate.score,
        criteria: aggregate.criteria,
        prompt_hash: promptHash,
        rubric_hash: hash,
        input_hash: input.input_hash,
        confidence: aggregate.confidence,
      });
      return {
        state: "observed",
        sidecar,
        score: aggregate.score,
        criteria: aggregate.criteria,
        confidence: aggregate.confidence,
        reason: null,
        report: { ...aggregate.report, low_confidence: aggregate.report.lowConfidence, disagreement: aggregate.report.disagreement },
        hashes,
        judge,
      };
    }
    const sidecar = assertJudgeResultV1({
      schema_version: "judge-result/v1",
      judge_version: 1,
      judge,
      state: "indeterminate",
      score: 0,
      criteria: [],
      prompt_hash: promptHash,
      rubric_hash: hash,
      input_hash: input.input_hash,
      confidence: aggregate.confidence,
      reason: aggregate.reason ?? "judge score disagreement",
    });
    return {
      state: "indeterminate",
      sidecar,
      score: null,
      criteria: [],
      confidence: aggregate.confidence,
      reason: aggregate.reason ?? null,
      report: { ...aggregate.report, low_confidence: aggregate.report.lowConfidence, disagreement: aggregate.report.disagreement },
      hashes,
      judge,
    };
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    return {
      state: "judge-unavailable",
      sidecar: null,
      score: null,
      criteria: [],
      confidence: 0,
      reason: redactedReason(detail),
      report: null,
      hashes: { prompt_hash: promptHash, rubric_hash: hash, input_hash: null },
      judge,
    };
  }
}
