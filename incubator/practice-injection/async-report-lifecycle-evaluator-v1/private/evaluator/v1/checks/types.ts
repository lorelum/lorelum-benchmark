import type { TestApp, TestResponse, WorkerResult } from "../harness";
import type { CheckId } from "../result";

export class SemanticFailure extends Error {
  constructor() {
    super("semantic failure");
    this.name = "SemanticFailure";
  }
}

export type CheckDefinition = {
  id: CheckId;
  run: (app: TestApp) => Promise<void>;
};

function fail(): never {
  throw new SemanticFailure();
}

export function expect(condition: unknown): asserts condition {
  if (!condition) fail();
}

export function record(value: unknown): Record<string, unknown> {
  expect(Boolean(value) && typeof value === "object" && !Array.isArray(value));
  return value as Record<string, unknown>;
}

export function expectStatus(response: TestResponse, status: number): void {
  expect(response.status === status);
}

export function expectWorkerExit(result: WorkerResult): void {
  expect(result.exitCode === 0);
}

export function expectWorkerRecord(result: WorkerResult): Record<string, unknown> {
  return record(result.value);
}
