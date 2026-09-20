import type { JudgeInput, PublicRunMaterial } from "../../input";
import { asyncReportReplanProvider, buildAsyncReportJudgeInput } from "./provider";
import { evaluationPlan, evaluationPlanHash } from "./plan";
import { rubricHash } from "./rubric";
import { calibrationIdentity } from "./calibration";
import type { ReplanEvidence } from "./types";

export async function buildReplanJudgeInput(evidence: ReplanEvidence, material: PublicRunMaterial[] = []): Promise<JudgeInput> {
  return buildAsyncReportJudgeInput(evidence, material);
}

export async function getAsyncReportReplanEvaluationInstance(provider = asyncReportReplanProvider) {
  return {
    plan: evaluationPlan,
    plan_hash: await evaluationPlanHash(),
    evidence_schema: "replan-evidence/v1" as const,
    projectEvidence: (await import("./evidence")).projectReplanEvidence,
    rubric_hash: await rubricHash(),
    calibration: await calibrationIdentity(),
    provider,
    buildInput: buildReplanJudgeInput,
    result_schema: "judge-result/v1" as const,
    accounting_schema: "async-report-replan-judge-accounting/v1" as const,
  };
}
