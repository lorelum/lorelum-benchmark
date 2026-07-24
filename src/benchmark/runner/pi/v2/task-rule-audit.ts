export type TaskRuleAudit = {
  manifestPath: string;
  sha256: string;
  treatment: { id: string; version: string };
  requiredRules: string[];
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function taskRuleAuditFromDocument(document: unknown, manifestPath: string, sha256: string, taskId: string): TaskRuleAudit {
  if (!isRecord(document) || document.task_id !== taskId || !isRecord(document.treatment)) {
    throw new Error(`Task rule audit does not match ${taskId}`);
  }
  const treatment = document.treatment;
  if (typeof treatment.id !== "string" || typeof treatment.version !== "string" || !Array.isArray(document.required_rules) || !document.required_rules.every((rule) => typeof rule === "string")) {
    throw new Error(`Task rule audit is invalid for ${taskId}`);
  }
  return {
    manifestPath,
    sha256,
    treatment: { id: treatment.id, version: treatment.version },
    requiredRules: [...document.required_rules]
  };
}

export function taskRuleAuditFromArtifact(value: unknown): TaskRuleAudit | undefined {
  if (!isRecord(value) || typeof value.manifest_path !== "string" || typeof value.sha256 !== "string" || !isRecord(value.treatment) || !Array.isArray(value.required_rules)) return undefined;
  const treatment = value.treatment;
  if (typeof treatment.id !== "string" || typeof treatment.version !== "string" || !value.required_rules.every((rule) => typeof rule === "string")) return undefined;
  return {
    manifestPath: value.manifest_path,
    sha256: value.sha256,
    treatment: { id: treatment.id, version: treatment.version },
    requiredRules: [...value.required_rules]
  };
}
