export type ValidationLevel = "error" | "warning" | "info";

export interface ValidationFinding {
  level: ValidationLevel;
  code: string;
  message: string;
}

export interface ValidationReport {
  valid: boolean;
  errors: ValidationFinding[];
  warnings: ValidationFinding[];
  infos: ValidationFinding[];
}

export function buildValidationReport(findings: ValidationFinding[]): ValidationReport {
  const errors = findings.filter((finding) => finding.level === "error");
  return {
    valid: errors.length === 0,
    errors,
    warnings: findings.filter((finding) => finding.level === "warning"),
    infos: findings.filter((finding) => finding.level === "info"),
  };
}
