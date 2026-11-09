import { randomUUID } from "node:crypto";

const [agentImage, auditImage] = process.argv.slice(2);
if (process.argv.length !== 4 || ![agentImage, auditImage].every(value => /^sha256:[a-f0-9]{64}$/.test(value ?? ""))) {
  throw new Error("Usage: bun run audit-preflight.ts <agent-image-id> <audit-image-id>");
}
const suffix = randomUUID();
const agent = `lorelum-audit-agent-${suffix}`;
const auditor = `lorelum-audit-tracer-${suffix}`;
const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !/API_KEY|TOKEN|SECRET|PASSWORD|CREDENTIAL|^LORELUM_/i.test(key)));

async function docker(args: string[]): Promise<string> {
  const child = Bun.spawn(["docker", ...args], { env, stdout: "pipe", stderr: "pipe" });
  const [exit, stdout, stderr] = await Promise.all([child.exited, new Response(child.stdout).text(), new Response(child.stderr).text()]);
  if (exit !== 0) throw new Error(`Docker ${args[0]} failed (exit ${exit}): ${stderr.trim()}`);
  return stdout.trim();
}
async function until(reader: ReadableStreamDefaultReader<Uint8Array>, phrase: string): Promise<string> {
  const decoder = new TextDecoder();
  let text = "";
  while (!text.includes(phrase)) {
    const { value, done } = await Promise.race([reader.read(), Bun.sleep(15_000).then(() => { throw new Error(`Timed out waiting for ${phrase}`); })]);
    if (done) throw new Error(`Stream ended before ${phrase}`);
    text += decoder.decode(value, { stream: true });
  }
  return text;
}
let logFollower: { kill(): void } | undefined;
let tracer: { kill(): void } | undefined;
try {
  for (const image of [agentImage, auditImage]) {
    if (await docker(["image", "inspect", "--format", "{{.Id}}", image]) !== image) throw new Error("Image ID mismatch");
  }
  await docker([
    "run", "-d", "--name", agent, "--network", "none", "--read-only", "--tmpfs", "/tmp:rw,nosuid,nodev,size=256m,mode=1777",
    "--cap-drop", "ALL", "--security-opt", "no-new-privileges", "--entrypoint", "sh", agentImage,
    "-c", "mkfifo /tmp/audit-gate; echo audit-gate-ready; read x </tmp/audit-gate; lore --json --store-root /tmp/store --no-project query --mode keyword -- probe; rc=$?; echo audit-probe-exit:$rc; read x </tmp/audit-gate; exit $rc",
  ]);
  const follower = Bun.spawn(["docker", "logs", "--follow", agent], { env, stdout: "pipe", stderr: "pipe" });
  logFollower = follower;
  const readyReader = follower.stdout.getReader();
  await until(readyReader, "audit-gate-ready");
  await readyReader.cancel();
  follower.kill();
  const traceProcess = Bun.spawn([
    "docker", "run", "--rm", "--name", auditor, "--pid", `container:${agent}`, "--network", "none",
    "--cap-drop", "ALL", "--cap-add", "SYS_PTRACE", "--security-opt", "seccomp=unconfined", "--security-opt", "no-new-privileges", "--user", "0",
    auditImage, "-f", "-s", "65535", "-e", "trace=execve,execveat,write,writev,exit_group", "-p", "1",
  ], { env, stdout: "pipe", stderr: "pipe" });
  tracer = traceProcess;
  const reader = traceProcess.stderr.getReader();
  let trace = await until(reader, "attached");
  const remaining = (async () => {
    const decoder = new TextDecoder();
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      trace += decoder.decode(value, { stream: true });
    }
    trace += decoder.decode();
  })();
  await docker(["exec", agent, "sh", "-c", "printf go > /tmp/audit-gate"]);
  const completed = Bun.spawn(["docker", "logs", "--follow", agent], { env, stdout: "pipe", stderr: "pipe" });
  logFollower = completed;
  const completedReader = completed.stdout.getReader();
  await until(completedReader, "audit-probe-exit:0");
  await completedReader.cancel();
  completed.kill();
  await docker(["kill", "--signal", "INT", auditor]);
  const [exit] = await Promise.all([traceProcess.exited, remaining]);
  await docker(["exec", agent, "sh", "-c", "printf go > /tmp/audit-gate"]);
  const agentExit = await docker(["wait", agent]);
  if (![0, 130].includes(exit) || agentExit !== "0") throw new Error(`Probe or audit process failed (tracer ${exit}, agent ${agentExit})`);
  if (!trace.includes('execve(\"/usr/local/bin/lore\"') || !trace.includes("protocolVersion") || !trace.includes('\\\"command\\\":\\\"query\\\"')) {
    throw new Error("Audit did not capture native Lore invocation and response");
  }
  console.log("Separate tracer observed native Lore exec and JSON response; full audit coverage is not established.");
} finally {
  logFollower?.kill();
  tracer?.kill();
  await docker(["rm", "-f", auditor]).catch(() => {});
  await docker(["rm", "-f", agent]).catch(() => {});
}
