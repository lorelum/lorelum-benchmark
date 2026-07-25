import { expect, test } from "bun:test";
import { failedExecutionEntry, lastStructuredJson, taskReferenceFromId } from "./local-diagnostic";
import type { PiRunRequestV2 } from "./types";

test("converts a hyphenated task id using its final revision suffix", () => {
  expect(taskReferenceFromId("report-insights-conditional-loading-v12")).toBe("report-insights-conditional-loading/v12");
  expect(() => taskReferenceFromId("report-v-next")).toThrow("Task id must end");
});

test("selects the final structured result from trace output", () => {
  const result = lastStructuredJson<{ schema_version: string; value: number }>([
    '{"schema_version":"pi-event/v1","value":1}',
    "human-readable diagnostic",
    '{"schema_version":"pi-run-result/v2","value":2}'
  ].join("\n"), "pi-run-result/v2");
  expect(result.value).toBe(2);
  expect(() => lastStructuredJson("not JSON", "evaluator-result/v2")).toThrow("Expected evaluator-result/v2");
});

test("records a failed execution without fabricating evaluator output", () => {
  const request = { run_id: "diagnostic-v1-task-v1-baseline-001", task: { id: "task-v1" }, condition_id: "baseline", repeat: 1 } as PiRunRequestV2;
  expect(failedExecutionEntry(request, "container failed")).toEqual({
    run_id: request.run_id,
    task: "task-v1",
    condition: "baseline",
    repeat: 1,
    status: "execution-failed",
    error: "container failed"
  });
});
