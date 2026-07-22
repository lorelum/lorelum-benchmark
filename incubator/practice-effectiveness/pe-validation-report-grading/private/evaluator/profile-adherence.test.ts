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

test("profile adherence: non-blocking feedback keeps the report valid", () => {
  const report = buildValidationReport([
    { level: "warning", code: "missing-summary", message: "Summary is absent" },
    { level: "info", code: "similar-entry", message: "A similar entry exists" },
  ]);

  expect(report.valid).toBe(true);
});

test("profile adherence: blocking feedback invalidates the report", () => {
  const report = buildValidationReport([
    { level: "error", code: "bad-id", message: "Identifier is invalid" },
    { level: "warning", code: "missing-summary", message: "Summary is absent" },
  ]);

  expect(report.valid).toBe(false);
});
