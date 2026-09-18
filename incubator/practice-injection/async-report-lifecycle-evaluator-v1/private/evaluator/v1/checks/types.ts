import type { TestApp, TestResponse, WorkerResult } from "../harness";
import type { CheckId } from "../result";

export class SemanticFailure extends Error {
  constructor(public readonly reason: string) {
    super(reason);
    this.name = "SemanticFailure";
  }
}

export type CheckDefinition = {
  id: CheckId;
  run: (app: TestApp) => Promise<void>;
};

export function fail(reason: string): never {
  throw new SemanticFailure(reason);
}

export function expect(condition: unknown, reason: string): asserts condition {
  if (!condition) fail(reason);
}

export function record(value: unknown): Record<string, unknown> {
  expect(Boolean(value) && typeof value === "object" && !Array.isArray(value), "invalid-json-response");
  return value as Record<string, unknown>;
}

export function expectStatus(response: TestResponse, status: number, reason: string): void {
  expect(response.status === status, reason);
}

export function expectWorkerExit(result: WorkerResult, exitCode = 0): void {
  expect(result.exitCode === exitCode, "worker-exit-code-mismatch");
}

export function expectWorkerRecord(result: WorkerResult): Record<string, unknown> {
  return record(result.value);
}
