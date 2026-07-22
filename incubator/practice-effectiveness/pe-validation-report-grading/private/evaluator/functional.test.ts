import { expect, test } from "bun:test";

type ValidationLevel = "error" | "warning" | "info";
type ValidationFinding = { level: ValidationLevel; code: string; message: string };
type ValidationReport = {
  valid: boolean;
  errors: ValidationFinding[];
  warnings: ValidationFinding[];
  infos: ValidationFinding[];
};
type ValidationReportModule = {
  buildValidationReport(findings: ValidationFinding[]): ValidationReport;
};

const candidatePath = Bun.env.CANDIDATE_PATH
  ?? "incubator/practice-effectiveness/pe-validation-report-grading/public/starter/src/validation-report.ts";
const candidateUrl = `${Bun.pathToFileURL(candidatePath).href}?run=${Date.now()}`;
const { buildValidationReport } = (await import(candidateUrl)) as ValidationReportModule;

test("functional: findings are retained in structured level buckets", () => {
  const error = { level: "error", code: "bad-id", message: "Identifier is invalid" } as const;
  const warning = { level: "warning", code: "missing-summary", message: "Summary is absent" } as const;
  const info = { level: "info", code: "similar-entry", message: "A similar entry exists" } as const;
  const report = buildValidationReport([warning, info, error]);

  expect(report.errors).toContainEqual(error);
  expect(report.warnings).toContainEqual(warning);
  expect(report.infos).toContainEqual(info);
  expect(report.errors).toHaveLength(1);
  expect(report.warnings).toHaveLength(1);
  expect(report.infos).toHaveLength(1);
});

test("functional: empty input has empty structured buckets", () => {
  const report = buildValidationReport([]);

  expect(report.errors).toEqual([]);
  expect(report.warnings).toEqual([]);
  expect(report.infos).toEqual([]);
});
