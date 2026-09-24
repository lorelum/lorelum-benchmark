import { describe, expect, test } from "bun:test";
import {
  createHarnessV1Client,
  isValidHarnessRequestV1,
  type ProcessResult,
  type ProcessRunner,
} from "./protocol-v1";

const commit = "6bf1e1b390df3bffad13d4131939b84126b0242c";
const profileId = "72c7404af9d533dce3dd5f5e62987fcb225ffdfd180ae2951879d3a54044c2a5";
const validRequest = {
  query: "Review the proposed change before committing it.",
  storeRoot: process.platform === "win32" ? "C:\\benchmark-store" : "/tmp/benchmark-store",
  embeddingProfileId: profileId,
  candidateWidth: 20,
  resultLimit: 5,
};
const corpusIds = new Set(["practice.core-sentinel", "practice.forbidden-sentinel", "practice.other"]);

function result(stdout: string, exitCode = 0, extra: Partial<ProcessResult> = {}): ProcessResult {
  return { exitCode, stdout, stderr: "", durationMs: 5, ...extra };
}

function fakeProcessRunner(harnessResult: ProcessResult, captured: Array<{ command: string[]; cwd: string; stdin: string }> = []): ProcessRunner {
  return async (command, cwd, stdin) => {
    captured.push({ command, cwd, stdin });
    if (command[0] === "git" && command[1] === "rev-parse" && command[2] === "--show-toplevel") return result(cwd);
    if (command[0] === "git" && command[1] === "rev-parse" && command[2] === "HEAD") return result(commit);
    if (command[0] === "git" && command[1] === "status") return result("");
    return harnessResult;
  };
}

async function clientFor(harnessResult: ProcessResult, captured?: Array<{ command: string[]; cwd: string; stdin: string }>) {
  return createHarnessV1Client({
    lorelumRoot: validRequest.storeRoot,
    lorelumCommit: commit,
    bunExecutable: "bun-test",
    processRunner: fakeProcessRunner(harnessResult, captured),
  });
}

describe("semantic retrieval harness protocol v1", () => {
  test("accepts only the five declared request fields and validates N/K", () => {
    expect(isValidHarnessRequestV1(validRequest)).toBe(true);
    expect(isValidHarnessRequestV1({ ...validRequest, goldLabels: ["practice.core-sentinel"] })).toBe(false);
    expect(isValidHarnessRequestV1({ ...validRequest, storeRoot: "relative/store" })).toBe(false);
    expect(isValidHarnessRequestV1({ ...validRequest, candidateWidth: 4, resultLimit: 5 })).toBe(false);
    expect(isValidHarnessRequestV1({ ...validRequest, candidateWidth: 51 })).toBe(false);
    expect(isValidHarnessRequestV1({ ...validRequest, embeddingProfileId: "not-a-profile" })).toBe(false);
    expect(isValidHarnessRequestV1({ ...validRequest, query: "   " })).toBe(false);
  });

  test("invokes one pinned checkout process with only the allowlisted request payload", async () => {
    const captured: Array<{ command: string[]; cwd: string; stdin: string }> = [];
    const stdout = JSON.stringify({
      status: "ok",
      candidateIds: ["practice.core-sentinel", "practice.other"],
      finalIds: ["practice.core-sentinel"],
    });
    const client = await clientFor(result(stdout), captured);
    const observation = await client.run(validRequest, corpusIds);

    expect(observation).toEqual({
      kind: "success",
      response: {
        status: "ok",
        candidateIds: ["practice.core-sentinel", "practice.other"],
        finalIds: ["practice.core-sentinel"],
      },
      exitCode: 0,
      durationMs: 5,
    });
    const harnessCall = captured.find((call) => call.command.includes("packages/backend/src/benchmark/semantic-retrieval-harness.ts"));
    expect(harnessCall).toBeDefined();
    expect(harnessCall?.command).toEqual(["bun-test", "packages/backend/src/benchmark/semantic-retrieval-harness.ts"]);
    expect(harnessCall?.cwd).toBe(validRequest.storeRoot);
    const payload = JSON.parse(harnessCall?.stdin ?? "{}") as Record<string, unknown>;
    expect(Object.keys(payload).sort()).toEqual(["candidateWidth", "embeddingProfileId", "query", "resultLimit", "storeRoot"]);
    expect(payload).toEqual(validRequest);
    expect(harnessCall?.stdin).not.toContain("goldLabels");
    expect(harnessCall?.stdin).not.toContain("practice.core-sentinel");
  });

  test("accepts a structured failure only with non-zero exit and never returns partial IDs", async () => {
    const client = await clientFor(result(JSON.stringify({ status: "error", errorCode: "index_unavailable" }), 2));
    await expect(client.run(validRequest, corpusIds)).resolves.toEqual({
      kind: "harness-error",
      errorCode: "index_unavailable",
      exitCode: 2,
      durationMs: 5,
    });
  });

  test("classifies exit/status mismatches as protocol failures", async () => {
    const successWithNonzeroExit = await clientFor(result(JSON.stringify({ status: "ok", candidateIds: [], finalIds: [] }), 2));
    const errorWithZeroExit = await clientFor(result(JSON.stringify({ status: "error", errorCode: "index_unavailable" }), 0));
    await expect(successWithNonzeroExit.run(validRequest, corpusIds)).resolves.toMatchObject({ kind: "protocol-error", errorCode: "exit-status-mismatch" });
    await expect(errorWithZeroExit.run(validRequest, corpusIds)).resolves.toMatchObject({ kind: "protocol-error", errorCode: "exit-status-mismatch" });
  });

  test("rejects duplicate, oversized, unknown, or non-subset result IDs", async () => {
    const badResponses = [
      { status: "ok", candidateIds: ["practice.core-sentinel", "practice.core-sentinel"], finalIds: ["practice.core-sentinel"] },
      { status: "ok", candidateIds: Array.from({ length: 21 }, () => "practice.other"), finalIds: [] },
      { status: "ok", candidateIds: ["practice.core-sentinel"], finalIds: ["practice.other"] },
      { status: "ok", candidateIds: ["not-in-pinned-corpus"], finalIds: [] },
      { status: "ok", candidateIds: [], finalIds: [], extra: "not allowed" },
    ];
    for (const response of badResponses) {
      const client = await clientFor(result(JSON.stringify(response)));
      await expect(client.run(validRequest, corpusIds)).resolves.toMatchObject({ kind: "protocol-error" });
    }
  });

  test("rejects multi-line output and an unknown stable error code", async () => {
    const extraLine = await clientFor(result(`${JSON.stringify({ status: "ok", candidateIds: [], finalIds: [] })}\nextra`));
    const unknownError = await clientFor(result(JSON.stringify({ status: "error", errorCode: "private-engine-detail" }), 2));
    await expect(extraLine.run(validRequest, corpusIds)).resolves.toMatchObject({ kind: "protocol-error", errorCode: "invalid-stdout" });
    await expect(unknownError.run(validRequest, corpusIds)).resolves.toMatchObject({ kind: "protocol-error", errorCode: "invalid-response" });
  });

  test("does not invoke the harness when the checkout is dirty or has a different HEAD", async () => {
    let harnessInvoked = false;
    const dirtyRunner: ProcessRunner = async (command, cwd) => {
      if (command[1] === "rev-parse" && command[2] === "--show-toplevel") return result(cwd);
      if (command[1] === "rev-parse" && command[2] === "HEAD") return result(commit);
      if (command[1] === "status") return result("?? untracked.ts");
      harnessInvoked = true;
      return result("{}");
    };
    await expect(createHarnessV1Client({ lorelumRoot: validRequest.storeRoot, lorelumCommit: commit, processRunner: dirtyRunner })).rejects.toThrow("Lorelum checkout must be clean");
    expect(harnessInvoked).toBe(false);

    const wrongHeadRunner: ProcessRunner = async (command, cwd) => {
      if (command[1] === "rev-parse" && command[2] === "--show-toplevel") return result(cwd);
      if (command[1] === "rev-parse" && command[2] === "HEAD") return result("a".repeat(40));
      return result("");
    };
    await expect(createHarnessV1Client({ lorelumRoot: validRequest.storeRoot, lorelumCommit: commit, processRunner: wrongHeadRunner })).rejects.toThrow("does not match the pinned commit");
  });

  test("classifies process timeout without parsing an error response", async () => {
    const client = await clientFor(result("", null, { timedOut: true }));
    await expect(client.run(validRequest, corpusIds)).resolves.toMatchObject({ kind: "process-error", errorCode: "timed-out" });
  });
});
