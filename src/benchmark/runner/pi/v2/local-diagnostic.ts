import type { PiRunRequestV2, PiRunResultV2 } from "./types";

export type EvaluatorDiagnostic = {
  schema_version: "evaluator-result/v2";
  semantic: { passed: boolean };
  quality: { score: number };
};

export type LocalDiagnosticEntry = {
  run_id: string;
  task: string;
  condition: string;
  repeat: number;
  status: "execution-failed" | "evaluated";
  pi?: PiRunResultV2;
  evaluator?: EvaluatorDiagnostic;
  error?: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function taskReferenceFromId(taskId: string): string {
  const revisionIndex = taskId.lastIndexOf("-v");
  const revision = taskId.slice(revisionIndex + 1);
  const slug = taskId.slice(0, revisionIndex);
  if (revisionIndex <= 0 || !/^v[1-9][0-9]*$/.test(revision) || !slug) {
    throw new Error(`Task id must end in -v<number>: ${taskId}`);
  }
  return `${slug}/${revision}`;
}

export function lastStructuredJson<T>(output: string, schemaVersion: string): T {
  for (const line of output.split(/\r?\n/).reverse()) {
    try {
      const value = JSON.parse(line) as unknown;
      if (isRecord(value) && value.schema_version === schemaVersion) return value as T;
    } catch {
      // Pi's JSON trace may contain non-result events and diagnostic text.
    }
  }
  throw new Error(`Expected ${schemaVersion} in command output`);
}

export function piResultFromOutput(output: string): PiRunResultV2 {
  return lastStructuredJson<PiRunResultV2>(output, "pi-run-result/v2");
}

export function evaluatorResultFromOutput(output: string): EvaluatorDiagnostic {
  return lastStructuredJson<EvaluatorDiagnostic>(output, "evaluator-result/v2");
}

export function failedExecutionEntry(request: PiRunRequestV2, error: string, pi?: PiRunResultV2): LocalDiagnosticEntry {
  return {
    run_id: request.run_id,
    task: request.task.id,
    condition: request.condition_id,
    repeat: request.repeat,
    status: "execution-failed",
    ...(pi ? { pi } : {}),
    error
  };
}
