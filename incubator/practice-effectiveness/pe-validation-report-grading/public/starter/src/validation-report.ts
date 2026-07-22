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
  return {
    valid: findings.length === 0,
    errors: findings.filter((finding) => finding.level === "error"),
    warnings: findings.filter((finding) => finding.level === "warning"),
    infos: findings.filter((finding) => finding.level === "info"),
  };
}
