import { join } from "node:path";
import { runCalibration, calibrationScope, type CalibrationFixtureId } from "../../../../judge/async-report-replan/v1/calibration";
import type { CalibrationReport } from "../../../../judge/async-report-replan/v1/types";
import type { JudgeResultV1 } from "../../../../outcome/v1/contract";
import { workspaceRoot } from "../../../../fs";
import { evaluateCalibrationGateChecks, type JudgeCalibrationDiagnostics } from "./timing-pilot-judge-diagnostics";

export const testCalibrationKey = "timing-pilot-diagnostic-test-calibration-key";
export const testJudgeModel = "deepseek/deepseek-v4-flash";

export async function diagnosticCalibrationFixture(): Promise<{ report: CalibrationReport; diagnostics: JudgeCalibrationDiagnostics; env: Record<string, string> }> {
  const env = { LORELUM_JUDGE_REAL: "1", LORELUM_JUDGE_MODEL: testJudgeModel, LORELUM_JUDGE_CALIBRATION_KEY: testCalibrationKey };
  const fixtures = await (await import("../../../../judge/async-report-replan/v1/calibration")).loadCalibrationFixtures();
  const groups = new Map(fixtures.map((fixture) => [fixture.evidence.blind_case_id, fixture.id]));
  const repetitions = new Map<CalibrationFixtureId, number>();
  const values: Record<CalibrationFixtureId, number[]> = { reference: [60, 62, 64], equivalent: [60, 61, 62], "anti-pattern": [50, 55, 60] };
  const observations: JudgeCalibrationDiagnostics["observations"][number][] = [];
  let callIndex = 0;
  const report = await runCalibration({
    mode: "real", env, scope: calibrationScope(testJudgeModel), attestation_key: testCalibrationKey,
    score: async (evidence) => {
      const group = groups.get(evidence.blind_case_id);
      if (!group) throw new Error("test fixture group missing");
      const repetition = (repetitions.get(group) ?? 0) + 1;
      repetitions.set(group, repetition);
      const score = values[group][repetition - 1]!;
      callIndex += 1;
      observations.push({
        call_index: callIndex, fixture_group: group, opaque_case_id: "case-" + callIndex.toString(16).padStart(12, "0"), repetition,
        status: "observed", score, confidence: 90, criteria: [], prompt_hash: "a".repeat(64), input_hash: "b".repeat(64), duration_ms: 1,
        usage: { input_tokens: 2, output_tokens: 1, total_tokens: 3, cost_usd: "unavailable" },
      });
      return { result: { state: "observed", score, confidence: 90 } as unknown as JudgeResultV1, usage: { input_tokens: 2, output_tokens: 1, total_tokens: 3, cost_usd: "unavailable" } };
    },
  });
  if (report.status !== "diagnostic" || report.calls !== 9) throw new Error("test calibration must be a complete diagnostic report");
  const manifest = await Bun.file(join(workspaceRoot, "src/benchmark/judge/async-report-replan/v1/private/calibration/manifest.json")).json() as { thresholds: JudgeCalibrationDiagnostics["thresholds"] };
  const thresholds = manifest.thresholds!;
  const diagnostics: JudgeCalibrationDiagnostics = {
    schema_version: "async-report-timing-pilot-judge-calibration-diagnostics/v1", status: "captured",
    calibration: { id: report.id, version: report.version, hash: report.hash, status: report.status, model: report.scope.model, calls: report.calls, duration_ms: report.duration_ms, usage: report.usage, medians: report.medians, ...(report.reason ? { report_reason: report.reason } : {}) },
    contract_snapshot_verified: true, thresholds, gate_checks: evaluateCalibrationGateChecks(report.medians, thresholds), observations,
  };
  return { report, diagnostics, env };
}
