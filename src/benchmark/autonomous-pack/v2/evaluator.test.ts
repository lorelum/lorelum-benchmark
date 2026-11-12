import { expect, test } from "bun:test";
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
