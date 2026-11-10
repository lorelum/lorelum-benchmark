import { describe, expect, test } from "bun:test";
import { auditNativeTrace as auditNative, type NativeTraceFile, type NativeTraceProof, type NativeStdoutProof } from "./native-audit";

const proof: NativeTraceProof = {
  runFinished: true, allProcessesAndExecsCaptured: true, allLoreExecutionsUseKnownExecvePaths: true,
  stringsAndArgvUntruncated: true, execsAndExitsCaptured: true, stdout: [],
};
// Synthetic fixtures explicitly attest their stdout writes; this is not evidence
// that a real runner has established fd attribution or coverage.
function auditNativeTrace(files: NativeTraceFile[], evidence?: NativeTraceProof) {
  if (!evidence) return auditNative(files);
  const stdout: NativeStdoutProof[] = [];
  for (const source of files) {
    let current: NativeStdoutProof | undefined;
    for (const [index, line] of source.text.split("\n").entries()) {
      if (/^execve\("(?:\/usr\/local\/bin\/lore|\/opt\/lorelum\/lore)"/.test(line)) {
        current = { file: source.file, exec_line: index + 1, writes: [], completeAndExclusive: true };
        stdout.push(current);
      } else if (/^execve/.test(line) || line.startsWith("+++")) current = undefined;
      else {
        const match = line.match(/^write\((\d+),/);
        if (current && match) current.writes.push({ line: index + 1, fd: Number(match[1]) });
      }
    }
  }
  return auditNative(files, { ...evidence, stdout });
}
const file = (text: string, name = "trace.123"): NativeTraceFile => ({ file: name, text });
const envelope = (command: string, data: unknown) => JSON.stringify({ protocolVersion: 2, toolVersion: "0.1.0-alpha.7", command, ok: true, data });
const empty = envelope("query", { mode: "semantic", coverage: "complete", results: [] });
const found = envelope("query", { mode: "semantic", coverage: "complete", results: [{ practiceId: "p", contentDigest: "sha256:x" }] });
const exec = (path: string, args: string[]) => `execve(${JSON.stringify(path)}, [${[path, ...args].map((arg) => JSON.stringify(arg)).join(", ")}], 0x7fff /* 42 vars */) = 0\n`;
const write = (text: string) => `write(1, ${JSON.stringify(text)}, ${Buffer.byteLength(text)}) = ${Buffer.byteLength(text)}\n`;
const run = (output: string, args = ["--json", "--store-root", "/tmp/store", "query", "--", "secret query"], code = 0, path = "/usr/local/bin/lore") =>
  exec(path, args) + write(output) + `+++ exited with ${code} +++\n`;

describe("native Lore strace audit", () => {
  test("uses proof before concluding absence and rejects incomplete files", () => {
    const idle = file('execve("/bin/sh", ["sh"], 0x1 /* 0 vars */) = 0\n+++ exited with 0 +++\n');
    expect(auditNativeTrace([idle], proof).query).toBe("not-queried");
    expect(auditNativeTrace([idle]).query).toBe("indeterminate");
    expect(auditNativeTrace([], proof).query).toBe("indeterminate");
    expect(auditNativeTrace([file(idle.text.replace("+++ exited with 0 +++\n", ""))], proof).query).toBe("indeterminate");
    expect(auditNativeTrace([file(idle.text.trimEnd())], proof).query).toBe("indeterminate");
    expect(auditNativeTrace([idle, idle], proof).query).toBe("indeterminate");
    expect(auditNativeTrace([file("garbage\n+++ exited with 0 +++\n")], proof).query).toBe("indeterminate");
  });

  test("correlates separate processes, bytes and line locations without exposing content", () => {
    const get = envelope("get", { practice: { id: "secret-id" }, contentDigest: "sha256:x", sources: [] });
    const first = exec("/opt/lorelum/lore", ["--json", "query", "--", "secret query"]) + write(found.slice(0, 25)) + write(found.slice(25)) + "+++ exited with 0 +++\n";
    const result = auditNativeTrace([file(first), file(run(get, ["--json", "get", "--", "secret-id"]), "trace.124")], proof);
    expect(result.query).toBe("queried");
    expect(result.calls).toEqual([
      { command: "query", status: "success", file: "trace.123", exec_line: 1, exit_line: 4, stdout_lines: [2, 3] },
      { command: "get", status: "success", file: "trace.124", exec_line: 1, exit_line: 3, stdout_lines: [2] },
    ]);
    expect(JSON.stringify(result)).not.toContain("secret");
  });

  test("requires per-write attribution for Bun stdout aliases and checks each locator", () => {
    const trace = file(exec("/opt/lorelum/lore", ["--json", "query", "--", "private"]) +
      write(empty) + write(found).replace("write(1,", "write(8,") + "+++ exited with 0 +++\n");
    const attribution: NativeStdoutProof = {
      file: trace.file, exec_line: 1, completeAndExclusive: true, writes: [{ line: 3, fd: 8 }],
    };
    const withProof = (stdout: NativeStdoutProof[]) => auditNative([trace], { ...proof, stdout });
    expect(withProof([attribution]).query).toBe("queried");
    expect(withProof([attribution]).calls[0].stdout_lines).toEqual([3]);
    expect(withProof([]).query).toBe("indeterminate");
    expect(withProof([{ ...attribution, writes: [{ line: 3, fd: 1 }] }]).query).toBe("indeterminate");
    expect(withProof([{ ...attribution, writes: [{ line: 4, fd: 8 }] }]).query).toBe("indeterminate");
    expect(withProof([{ ...attribution, writes: [{ line: 3, fd: 8 }, { line: 3, fd: 8 }] }]).query).toBe("indeterminate");
    expect(withProof([attribution, attribution]).query).toBe("indeterminate");
    expect(withProof([{ ...attribution, file: "trace.other" }]).query).toBe("indeterminate");
  });

  test("does not infer stdout ownership solely from a dup or a matching envelope", () => {
    const trace = file(exec("/usr/local/bin/lore", ["--json", "query", "x"]) +
      "dup(1) = 8\nclose(8) = 0\nopenat(AT_FDCWD, \"/tmp/other\", O_WRONLY) = 8\n" +
      write(found).replace("write(1,", "write(8,") + "+++ exited with 0 +++\n");
    expect(auditNative([trace], proof).query).toBe("indeterminate");
    expect(auditNative([trace]).query).toBe("indeterminate");
  });

  test("classifies empty, error, contradictory and non-JSON responses", () => {
    const failed = JSON.stringify({ protocolVersion: 2, toolVersion: "v", command: "query", ok: false, error: { message: "private" } });
    expect(auditNativeTrace([file(run(empty))], proof).query).toBe("queried-empty");
    expect(auditNativeTrace([file(run(failed, undefined, 2))], proof).query).toBe("query-failed");
    expect(auditNativeTrace([file(run(failed))], proof).query).toBe("indeterminate");
    expect(auditNativeTrace([file(run(found, undefined, 1))], proof).query).toBe("indeterminate");
    expect(auditNativeTrace([file(run("plain output"))], proof).query).toBe("indeterminate");
    expect(auditNativeTrace([file(run(envelope("get", {})))], proof).query).toBe("indeterminate");
    expect(auditNativeTrace([file(run(envelope("query", { mode: "semantic", coverage: "partial", results: [] })))], proof).query).toBe("indeterminate");
  });

  test("fails closed on truncated, unsupported or ambiguous invocation and output", () => {
    const examples = [
      run(empty).replace('"query", "--", "secret query"', '"query", ...'),
      run(empty).replace('write(1, ', 'write(1, "truncated"..., '),
      run(empty).replace(/ = (\d+)\n\+\+\+/, " = 1\n+++"),
      run(empty).replace("+++ exited with 0 +++", "+++ killed by SIGKILL +++"),
      run(empty).replace('"--json", "--store-root"', '"--unknown", "--store-root"'),
      'execveat(AT_FDCWD, "/opt/lorelum/lore", ["lore", "query"], 0x1, 0) = 0\n+++ exited with 0 +++\n',
      'execve("/usr/local/bin/lore", ["lore", "query"], 0x1) = -1 ENOENT (No such file or directory)\n+++ exited with 1 +++\n',
      run(empty).replace("+++ exited with 0 +++", 'execve("/bin/sh", ["sh"], 0x1) = 0\n+++ exited with 0 +++'),
    ];
    for (const text of examples) expect(auditNativeTrace([file(text)], proof).query).toBe("indeterminate");
    const noProof = auditNativeTrace([file(run(found))]);
    expect(noProof.calls[0].status).toBe("indeterminate");
    expect(noProof.query).toBe("indeterminate");
  });

  test("does not mistake option values for commands and keeps get distinct", () => {
    const other = exec("/usr/local/bin/lore", ["--store-root", "query", "pack", "install", "x"]) + "+++ exited with 0 +++\n";
    expect(auditNativeTrace([file(other)], proof).query).toBe("not-queried");
    const get = envelope("get", { practice: { id: "p" }, contentDigest: "sha256:x", sources: [] });
    const result = auditNativeTrace([file(run(get, ["--json", "get", "p"]))], proof);
    expect(result.query).toBe("not-queried");
    expect(result.calls[0].status).toBe("success");
  });
});
