import { expect, test } from "bun:test";
import { access, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { classifyPreflightFailure, preflightPiAndModel, preflightTimeoutMs, type CommandRunner } from "./preflight";

const successfulResult = { code: 0, stdout: "0.80.10\n", stderr: "", timedOut: false, durationMs: 1 };

test("Pi preflight uses an isolated, tool-free command and removes its temporary directory", async () => {
  const repository = await mkdtemp(join(tmpdir(), "lorelum-preflight-repository-"));
  const sentinel = join(repository, "sentinel.txt");
  const calls: Array<{ command: string[]; cwd: string; timeoutMs?: number }> = [];
  await writeFile(sentinel, "unchanged");
  const fakePi: CommandRunner = async (command, cwd, timeoutMs) => {
    calls.push({ command, cwd, timeoutMs });
    if (command.includes("--print") && (!["--no-tools", "--no-context-files", "--no-skills", "--no-extensions"].every((flag) => command.includes(flag)))) {
      await writeFile(sentinel, "changed");
    }
    return successfulResult;
  };

  await expect(preflightPiAndModel("fake-pi", "deepseek/deepseek-v4-pro", fakePi)).resolves.toEqual({ version: "0.80.10" });
  expect(calls).toHaveLength(2);
  expect(calls[0].command).toEqual(["fake-pi", "--version"]);
  expect(calls[1].command).toEqual([
    "fake-pi", "--print", "--no-session", "--no-tools", "--no-context-files", "--no-skills", "--no-extensions", "--model", "deepseek/deepseek-v4-pro", "Reply with exactly: ok"
  ]);
  expect(calls[1].timeoutMs).toBe(preflightTimeoutMs);
  expect(calls[0].cwd).toBe(calls[1].cwd);
  expect(calls[1].cwd).not.toBe(repository);
  await expect(readFile(sentinel, "utf8")).resolves.toBe("unchanged");
  await expect(access(calls[1].cwd)).rejects.toThrow();
});

test("Pi preflight accepts a normal delayed response within its bounded allowance", async () => {
  const fakePi: CommandRunner = async (command, _cwd, timeoutMs) => command.includes("--version")
    ? successfulResult
    : { ...successfulResult, durationMs: (timeoutMs ?? 0) - 1 };

  await expect(preflightPiAndModel("fake-pi", "deepseek/deepseek-v4-pro", fakePi)).resolves.toEqual({ version: "0.80.10" });
});

test("Pi preflight fails closed when its isolated probe times out", async () => {
  const fakePi: CommandRunner = async (command) => command.includes("--version")
    ? successfulResult
    : { code: null, stdout: "", stderr: "", timedOut: true, durationMs: preflightTimeoutMs };

  await expect(preflightPiAndModel("fake-pi", "deepseek/deepseek-v4-pro", fakePi)).rejects.toThrow("model unreachable: preflight timed out after 90s");
  expect(classifyPreflightFailure({ code: null, stdout: "", stderr: "", timedOut: true, durationMs: preflightTimeoutMs })).toBe("model unreachable: preflight timed out after 90s");
});
