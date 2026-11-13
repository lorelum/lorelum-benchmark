import { expect, test } from "bun:test";
import { EventEmitter } from "node:events";
import type { ChildProcessWithoutNullStreams } from "node:child_process";
import { runEvaluationSession, type DockerResult } from "./evaluation-session";
import { parseVerifierContract } from "./evaluator";

const contract = {
  schema_version: "coding-verifier/v1",
  driver: ["/usr/bin/node", "/verifier/driver.mjs"],
  candidate: ["/usr/bin/python3", "/workspace/main.py"],
  timeout_ms: 120_000,
};


test("rejects paths outside mounts, shell commands and unsupported contract fields", () => {
  for (const patch of [
    { driver: ["node", "/verifier/driver.mjs"] },
    { driver: ["/usr/bin/node", "/verifier/../workspace/driver.mjs"] },
    { candidate: ["/usr/bin/python3", "/verifier/private.py"] },
    { candidate: ["/bin/sh", "-c", "echo test"] },
    { timeout_ms: 0 }, { timeout_ms: 300_001 }, { extra: true },
  ]) expect(() => parseVerifierContract({ ...contract, ...patch })).toThrow();
});

const ok: DockerResult = { code: 0, stdout: "", stderr: "", failed: false };
const missing: DockerResult = { code: 1, stdout: "", stderr: "No such container", failed: false };
const driverId = "a".repeat(64), candidateId = "b".repeat(64);

test("create clients exit before cleanup; an unknown create and missing container remain unverified", async () => {
  const delayed = Promise.withResolvers<DockerResult>();
  const firstFinished = Promise.withResolvers<void>();
  const calls: string[] = [];
  const session = runEvaluationSession({
    names: ["driver", "candidate"], createArgs: [["create", "driver"], ["create", "candidate"]], env: {}, timeoutMs: 10_000,
    docker: async args => {
      calls.push(args.join(" "));
      if (args[0] === "create" && args[1] === "driver") { firstFinished.resolve(); return missing; }
      if (args[0] === "create") return delayed.promise;
      return args[0] === "inspect" ? missing : ok;
    },
    communicate: async () => { throw new Error("must not start"); },
  });
  await firstFinished.promise;
  expect(calls).toEqual(["create driver", "create candidate"]);
  delayed.resolve({ ...ok, stdout: candidateId });
  const outcome = await session;
  expect(calls).toEqual(["create driver", "create candidate", 'inspect --format {{index .Config.Labels "lorelum.evaluation"}} driver', `rm -f -v ${candidateId}`]);
  expect(outcome).toEqual({ result: undefined, failed: true, cleanupVerified: false });
});

test("a timed-out create cannot be declared cleaned when its daemon creates the container later", async () => {
  let daemonHasContainer = false;
  const afterMissing = Promise.withResolvers<void>();
  const lateCreate = afterMissing.promise.then(() => { daemonHasContainer = true; });
  const outcome = await runEvaluationSession({
    names: ["driver", "candidate"], createArgs: [["create", "driver"], ["create", "candidate"]], env: {}, timeoutMs: 1000,
    docker: async args => {
      if (args[0] === "create" && args[1] === "driver") return { ...missing, failed: true };
      if (args[0] === "create") return { ...ok, stdout: candidateId };
      if (args.at(-1) === "driver") { afterMissing.resolve(); return missing; }
      return ok;
    },
    communicate: async () => { throw new Error("must not start"); },
  });
  await lateCreate;
  expect(daemonHasContainer).toBe(true);
  expect(outcome.failed).toBe(true);
  expect(outcome.cleanupVerified).toBe(false);
});

test("an unknown create never removes a container owned by another session", async () => {
  const removed: string[] = [];
  const outcome = await runEvaluationSession({
    names: ["driver", "candidate"], createArgs: [["create", "driver"], ["create", "candidate"]], env: {}, timeoutMs: 1000,
    docker: async args => {
      if (args[0] === "create" && args[1] === "driver") return { ...missing, failed: true };
      if (args[0] === "create") return { ...ok, stdout: candidateId };
      if (args[0] === "inspect") return { ...ok, stdout: "different-owner" };
      removed.push(args.at(-1)!);
      return ok;
    },
    communicate: async () => { throw new Error("must not start"); },
  });
  expect(removed).toEqual([candidateId]);
  expect(outcome.cleanupVerified).toBe(false);
});

test.each(["normal", "timeout", "delete failure"] as const)("session waits for both start clients before cleanup: %s", async scenario => {
  const clients: EventEmitter[] = [];
  const killed = Promise.withResolvers<void>();
  const events: string[] = [];
  const communicating = Promise.withResolvers<void>();
  const timeout = Promise.withResolvers<string>();
  const session = runEvaluationSession({
    names: ["driver", "candidate"], createArgs: [["create", "driver"], ["create", "candidate"]], env: {}, timeoutMs: 10_000,
    docker: async args => {
      events.push(args.join(" "));
      if (args[0] === "create") return { ...ok, stdout: args[1] === "driver" ? driverId : candidateId };
      return args[0] === "rm" && scenario === "delete failure" ? { ...ok, code: 1, stderr: "permission denied" } : ok;
    },
    start: id => {
      const name = id === driverId ? "driver" : "candidate";
      const child = new EventEmitter() as ChildProcessWithoutNullStreams;
      child.kill = () => { events.push(`kill ${name}`); if (name === "candidate") killed.resolve(); return true; };
      clients.push(child);
      return child;
    },
    communicate: async () => {
      communicating.resolve();
      return scenario === "timeout" ? timeout.promise : "evaluated";
    },
  });
  if (scenario === "timeout") {
    await communicating.promise;
    expect(events).toEqual(["create driver", "create candidate"]);
    timeout.resolve("indeterminate");
  }
  await killed.promise;
  expect(events).toEqual(["create driver", "create candidate", "kill driver", "kill candidate"]);
  clients[0].emit("close", 0);
  await Promise.resolve();
  expect(events).toHaveLength(4);
  clients[1].emit("close", 0);
  const outcome = await session;
  expect(events.slice(4)).toEqual([`rm -f -v ${driverId}`, `rm -f -v ${candidateId}`]);
  expect(outcome.result).toBe(scenario === "timeout" ? "indeterminate" : "evaluated");
  expect(outcome.failed).toBe(false);
  expect(outcome.cleanupVerified).toBe(scenario !== "delete failure");
});
