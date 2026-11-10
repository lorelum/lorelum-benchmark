import type { QueryAudit } from "./trace";

/** Each entry is one unmodified `strace -ff` process file, named for audit correlation. */
export type NativeTraceFile = { file: string; text: string };
/**
 * Runner attestation, not something this parser can establish from a trace. All fields
 * must be true: the run is finished; every descendant and every relevant exec attempt
 * was captured in exactly one supplied file; all Lore executions (including aliases,
 * scripts, hard links and execveat) are represented as execve of one of the two paths;
 * strace recorded untruncated strings/argv and every execve and process exit.
 * This attestation does not establish stdout attribution: each query/get also needs
 * a separate NativeStdoutProof backed by system audit of the process and its fd
 * lifecycle. A runner that cannot establish any part MUST omit the proof.
 */
/**
 * For one invocation, a runner attests that the listed writes, in this process
 * file and after this exec, are all and only the bytes of that invocation's
 * stdout, in trace order. This includes all aliases, fd reuse and descendants;
 * no unlisted write, other syscall, process or lost/truncated record contributed.
 * Entries refer to trace line numbers and their actual fd, not merely fd 1.
 * Attribution may require system-level fd lifecycle evidence; a guessed alias,
 * matching JSON, or an observed write(8) alone is not proof.
 */
export type NativeStdoutProof = {
  file: string;
  exec_line: number;
  writes: { line: number; fd: number }[];
  completeAndExclusive: true;
};
export type NativeTraceProof = {
  runFinished: true;
  allProcessesAndExecsCaptured: true;
  allLoreExecutionsUseKnownExecvePaths: true;
  stringsAndArgvUntruncated: true;
  execsAndExitsCaptured: true;
  stdout: NativeStdoutProof[];
};
export type NativeCall = {
  command: "query" | "get";
  status: "success" | "empty" | "failed" | "indeterminate";
  file: string;
  exec_line: number;
  exit_line: number | null;
  stdout_lines: number[];
};
export type NativeAudit = { complete: boolean; query: QueryAudit; calls: NativeCall[]; errors: string[] };

const proofKeys: (Exclude<keyof NativeTraceProof, "stdout">)[] = ["runFinished", "allProcessesAndExecsCaptured", "allLoreExecutionsUseKnownExecvePaths", "stringsAndArgvUntruncated", "execsAndExitsCaptured"];
const paths: Record<string, true> = { "/usr/local/bin/lore": true, "/opt/lorelum/lore": true };

function object(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

// Decode strace's C-quoted byte strings, rather than treating them as JSON strings.
function quoted(input: string, start: number): { bytes: Buffer; end: number } | undefined {
  if (input[start] !== '"') return;
  const bytes: number[] = [];
  let i = start + 1;
  while (i < input.length) {
    const c = input[i++];
    if (c === '"') return { bytes: Buffer.from(bytes), end: i };
    if (c !== "\\") {
      const code = input.codePointAt(i - 1)!;
      if (code > 0xffff) i++;
      bytes.push(...Buffer.from(String.fromCodePoint(code), "utf8"));
      continue;
    }
    if (i >= input.length) return;
    const escape = input[i++];
    const simple: Record<string, number> = { n: 10, r: 13, t: 9, b: 8, f: 12, v: 11, a: 7, "\\": 92, '"': 34 };
    if (Object.hasOwn(simple, escape)) bytes.push(simple[escape]);
    else if (escape === "x") {
      const hex = input.slice(i, i + 2);
      if (!/^[0-9a-fA-F]{2}$/.test(hex)) return;
      bytes.push(parseInt(hex, 16)); i += 2;
    } else if (/[0-7]/.test(escape)) {
      const octal = escape + (input.slice(i).match(/^[0-7]{0,2}/)?.[0] ?? "");
      i += octal.length - 1;
      const value = parseInt(octal, 8);
      if (value > 255) return;
      bytes.push(value);
    } else return;
  }
}

function exec(line: string): { path: string; argv: string[]; succeeded: boolean } | undefined {
  if (!line.startsWith("execve(")) return;
  const path = quoted(line, 7);
  if (!path || !line.slice(path.end).startsWith(", [")) return;
  let i = path.end + 3;
  const argv: string[] = [];
  while (line[i] !== "]") {
    const arg = quoted(line, i);
    if (!arg) return;
    argv.push(arg.bytes.toString("utf8")); i = arg.end;
    if (line[i] === "," && line[i + 1] === " ") i += 2;
    else if (line[i] !== "]") return;
  }
  // strace may render the environment as a pointer, vector, or /* N vars */.
  const suffix = line.slice(i + 1);
  const result = suffix.match(/^, .*\)\s+=\s+(-?\d+)(?:\s+.*)?$/);
  if (!result) return;
  return { path: path.bytes.toString("utf8"), argv, succeeded: result[1] === "0" };
}

function command(argv: string[]): "query" | "get" | "other" | "unknown" {
  if (!argv.length) return "unknown";
  for (let i = 1; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--json" || arg === "--no-project") continue;
    if (arg === "--store-root" || arg === "--cache-root") {
      if (++i >= argv.length || !argv[i]) return "unknown";
      continue;
    }
    if (/^--(?:store-root|cache-root)=.+/.test(arg)) continue;
    if (arg.startsWith("-")) return "unknown";
    return arg === "query" || arg === "get" ? arg : "other";
  }
  return "unknown";
}

function status(commandName: NativeCall["command"], output: Buffer, exitCode: number): NativeCall["status"] {
  let value: unknown;
  try {
    const text = new TextDecoder("utf-8", { fatal: true }).decode(output);
    value = JSON.parse(text);
  } catch { return "indeterminate"; }
  if (!object(value) || value.protocolVersion !== 2 || typeof value.toolVersion !== "string" || value.command !== commandName || typeof value.ok !== "boolean") return "indeterminate";
  if (!value.ok) return exitCode !== 0 && object(value.error) ? "failed" : "indeterminate";
  if (exitCode !== 0 || !object(value.data)) return "indeterminate";
  if (commandName === "get") {
    return object(value.data.practice) && typeof value.data.practice.id === "string" && typeof value.data.contentDigest === "string" && Array.isArray(value.data.sources) ? "success" : "indeterminate";
  }
  if (value.data.state === "preparing" || value.data.state === "indexing" || value.data.mode !== "semantic" || value.data.coverage !== "complete" || !Array.isArray(value.data.results)) return "indeterminate";
  if (value.data.results.some((item: unknown) => !object(item) || typeof item.practiceId !== "string" || !item.practiceId || typeof item.contentDigest !== "string" || !item.contentDigest)) return "indeterminate";
  return value.data.results.length ? "success" : "empty";
}

/** Audit independent `strace -ff` files; never returns argv, stdout or stderr contents. */
export function auditNativeTrace(files: NativeTraceFile[], proof?: NativeTraceProof): NativeAudit {
  const calls: NativeCall[] = [];
  const errors: string[] = [];
  const proven = !!proof && proofKeys.every((key) => proof[key] === true) && Array.isArray(proof.stdout);
  if (!proven) errors.push("Missing complete native trace proof");
  if (!files.length) errors.push("No native trace files");
  const names = new Set<string>();
  for (const file of files) {
    if (!file.file || names.has(file.file)) { errors.push("Missing or duplicate trace file name"); continue; }
    names.add(file.file);
    if (file.text && !file.text.endsWith("\n")) errors.push(`Truncated trace file ${file.file}`);
    let current: { call: NativeCall; chunks: Buffer[]; invalid: boolean; writes: Map<number, number>; seen: Set<number> } | undefined;
    let exited = false;
    const lines = file.text.split(/\r?\n/);
    for (let n = 0; n < lines.length; n++) {
      const line = lines[n];
      if (!line) continue;
      const location = `${file.file}:${n + 1}`;
      if (exited) { errors.push(`Events after process exit at ${location}`); continue; }
      if (line.startsWith("execve(") || line.startsWith("execveat(")) {
        if (current) { current.invalid = true; errors.push(`Exec after Lore start at ${location}`); }
        const event = exec(line);
        if (!event) { errors.push(`Unparseable exec at ${location}`); continue; }
        if (!Object.hasOwn(paths, event.path)) continue;
        const cmd = command(event.argv);
        if (cmd === "unknown") { errors.push(`Unrecognized Lore invocation at ${location}`); continue; }
        if (cmd === "other") continue;
        const call: NativeCall = { command: cmd, status: "indeterminate", file: file.file, exec_line: n + 1, exit_line: null, stdout_lines: [] };
        calls.push(call);
        if (!event.succeeded) { errors.push(`Lore exec failed at ${location}`); continue; }
        const matches = proven ? proof!.stdout.filter((entry) => entry && entry.file === file.file && entry.exec_line === n + 1) : [];
        const attribution = matches.length === 1 ? matches[0] : undefined;
        const writes = new Map<number, number>();
        let valid = !!attribution && attribution.completeAndExclusive === true && Array.isArray(attribution.writes);
        if (valid) for (const item of attribution!.writes) {
          if (!item || !Number.isSafeInteger(item.line) || item.line <= n + 1 || !Number.isSafeInteger(item.fd) || item.fd < 0 || writes.has(item.line)) { valid = false; break; }
          writes.set(item.line, item.fd);
        }
        if (!valid) errors.push(`Missing or invalid stdout attribution at ${location}`);
        current = { call, chunks: [], invalid: !valid, writes, seen: new Set<number>() };
        continue;
      }
      const end = line.match(/^\+\+\+ exited with (\d+) \+\+\+$/);
      if (end) {
        exited = true;
        if (current) {
          current.call.exit_line = n + 1;
          if (current.seen.size !== current.writes.size) {
            current.invalid = true;
            errors.push(`Unmatched stdout attribution at ${location}`);
          }
          if (!current.invalid && proven) current.call.status = status(current.call.command, Buffer.concat(current.chunks), Number(end[1]));
        }
        continue;
      }
      if (/^\+\+\+ killed by /.test(line)) { exited = true; if (current) current.call.exit_line = n + 1; errors.push(`Process killed at ${location}`); continue; }
      if (current && current.writes.has(n + 1)) {
        const fd = current.writes.get(n + 1)!;
        const match = line.match(/^write\((\d+), /);
        const data = match && quoted(line, match[0].length);
        const suffix = data && line.slice(data.end).match(/^, (\d+)\)\s+=\s+(-?\d+)(?:\s+.*)?$/);
        if (!match || Number(match[1]) !== fd || !data || !suffix || Number(suffix[1]) !== data.bytes.length || Number(suffix[2]) !== data.bytes.length) {
          current.invalid = true; errors.push(`Incomplete stdout write at ${location}`);
        } else { current.chunks.push(data.bytes); current.call.stdout_lines.push(n + 1); current.seen.add(n + 1); }
      }
      if (!/^[a-zA-Z_][a-zA-Z_0-9]*\(.*\)\s+=\s+.+$/.test(line) && !/^--- SIG[A-Z0-9]+ .* ---$/.test(line)) {
        errors.push(`Unrecognized or incomplete trace line at ${location}`);
        if (current) current.invalid = true;
      }
    }
    if (!exited) errors.push(`Missing process exit in ${file.file}`);
  }
  const complete = errors.length === 0;
  const queries = calls.filter((call) => call.command === "query");
  let query: QueryAudit;
  if (!complete || queries.some((call) => call.status === "indeterminate")) query = "indeterminate";
  else if (!queries.length) query = "not-queried";
  else if (queries.some((call) => call.status === "failed")) query = "query-failed";
  else if (queries.some((call) => call.status === "success")) query = "queried";
  else query = "queried-empty";
  return { complete, query, calls, errors };
}
