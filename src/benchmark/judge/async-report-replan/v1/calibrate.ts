import { canonicalJson } from "./canonical";
import { asyncReportJudgeEnv, httpAsyncReportJudgeCompletion } from "./llm";
import { evaluationPlanHash } from "./plan";
import { fixedRubricHashes, scoreReplanEvidence } from "./score";
import { runCalibration } from "./calibration";
import { sha256Text } from "../../../fs";

export async function runRealCalibration(env: Record<string, string | undefined> = Bun.env) {
  const resolved = asyncReportJudgeEnv(env);
  if (!resolved.real) return runCalibration({ mode: "real", env, score: async () => { throw new Error("real calibration is not enabled"); } });
  const complete = httpAsyncReportJudgeCompletion(env);
  const [planHash, rubric] = await Promise.all([evaluationPlanHash(), fixedRubricHashes()]);
  return runCalibration({
    mode: "real",
    env,
    score: async (evidence) => (await scoreReplanEvidence({ evidence, rubric: await (await import("./rubric")).loadRubric(), rubric_hash: rubric.hash, input_hash: await sha256Text(canonicalJson({ plan_hash: planHash, evidence_hash: evidence.evidence_hash })), judge: { id: "judge-agent/async-report-replan/v1", version: "v1" }, complete })).result,
  });
}

if (import.meta.main) console.log(JSON.stringify(await runRealCalibration(), null, 2));
