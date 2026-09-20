import { expect, test } from "bun:test";
import { loadCalibrationFixtures } from "./calibration";
import { assertAsyncReportAccounting, buildAccounting } from "./accounting";

test("versioned v1 schema documents and fixture/accounting shapes are present", async () => {
  const evidenceSchema = await Bun.file("schemas/replan-evidence-v1.schema.json").json();
  const planSchema = await Bun.file("schemas/async-report-replan-evaluation-plan-v1.schema.json").json();
  const accountingSchema = await Bun.file("schemas/async-report-replan-judge-accounting-v1.schema.json").json();
  const fixtures = await loadCalibrationFixtures();
  expect(evidenceSchema.properties.schema_version.const).toBe("replan-evidence/v1");
  expect(planSchema.properties.method.const).toBe("llm-subjective");
  expect(accountingSchema.properties.schema_version.const).toBe("async-report-replan-judge-accounting/v1");
  expect(fixtures).toHaveLength(3);
  const accounting = buildAccounting({ state: "not-run", blind_case_id: "case-1", plan: { id: "p", version: "v1", hash: "a".repeat(64) }, evidence: { schema_version: "replan-evidence/v1", hash: "b".repeat(64) }, rubric: { id: "r", version: "v1", hash: "c".repeat(64) }, prompt_hash: "d".repeat(64), input_hash: "e".repeat(64), provider: { id: "p", version: "v1", model: null }, calibration: { id: "c", version: "v1", hash: "f".repeat(64), status: "not-run" }, calls: { calibration: 0, scoring: 0 }, duration_ms: 0, failure_reason: "not run" });
  expect(accounting.usage.input_tokens).toBe("unavailable");
  const missingReason = structuredClone(accounting) as Record<string, unknown>;
  delete missingReason.failure_reason;
  expect(() => assertAsyncReportAccounting(missingReason)).toThrow();
  const fractional = structuredClone(accounting) as Record<string, unknown>;
  (fractional.usage as Record<string, unknown>).input_tokens = 1.5;
  expect(() => assertAsyncReportAccounting(fractional)).toThrow();
  const nestedExtra = structuredClone(accounting) as Record<string, unknown>;
  (nestedExtra.provider as Record<string, unknown>).secret = "must reject";
  expect(() => assertAsyncReportAccounting(nestedExtra)).toThrow();
  const redacted = buildAccounting({ state: "judge-unavailable", blind_case_id: "case-1", plan: { id: "p", version: "v1", hash: "a".repeat(64) }, evidence: { schema_version: "replan-evidence/v1", hash: "b".repeat(64) }, rubric: { id: "r", version: "v1", hash: "c".repeat(64) }, prompt_hash: "d".repeat(64), input_hash: "e".repeat(64), provider: { id: "p", version: "v1", model: null }, calibration: { id: "c", version: "v1", hash: "f".repeat(64), status: "diagnostic" }, calls: { calibration: 0, scoring: 0 }, duration_ms: 0, failure_reason: "evaluator/scoring private/secret" });
  expect(redacted.failure_reason).not.toContain("evaluator");
  expect(redacted.failure_reason).not.toContain("scoring");
  expect(redacted.failure_reason).not.toContain("private");
});
