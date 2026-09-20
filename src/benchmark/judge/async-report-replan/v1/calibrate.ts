import { asyncReportJudgeEnv, httpAsyncReportJudgeCompletion } from "./llm";
import { fixedRubricHashes } from "./score";
import { buildAsyncReportJudgeInput, scoreForCalibration } from "./provider";
import { runCalibration } from "./calibration";

export async function runRealCalibration(env: Record<string, string | undefined> = Bun.env) {
  const resolved = asyncReportJudgeEnv(env);
  if (!resolved.real) return runCalibration({ mode: "real", env, score: async () => { throw new Error("real calibration is not enabled"); } });
  let complete: ReturnType<typeof httpAsyncReportJudgeCompletion> | undefined;
  const rubric = await fixedRubricHashes();
  return runCalibration({
    mode: "real",
    env,
    score: async (evidence) => {
      complete ??= httpAsyncReportJudgeCompletion(env);
      const input = await buildAsyncReportJudgeInput(evidence);
      return (await scoreForCalibration(input, { judge: { id: "judge-agent/async-report-replan/v1", version: "v1" }, rubric_hash: rubric.hash, input_hash: input.input_hash }, complete)).result;
    },
  });
}

if (import.meta.main) console.log(JSON.stringify(await runRealCalibration(), null, 2));
