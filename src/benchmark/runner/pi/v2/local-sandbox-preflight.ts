import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { workspaceRoot } from "../../../fs";
import { containerCommand, containerEnvironment, containerVersionCommand, localContainerImageInspectCommand, localContainerSandbox } from "./sandbox";

function fail(message: string): never {
  throw new Error(message);
}

async function run(command: string[], env: Record<string, string>): Promise<{ exitCode: number; stdout: string; stderr: string }> {
  const child = Bun.spawn(command, { cwd: workspaceRoot, env, stdout: "pipe", stderr: "pipe" });
  return { exitCode: await child.exited, stdout: await new Response(child.stdout).text(), stderr: await new Response(child.stderr).text() };
}

function requireSuccess(result: { exitCode: number; stdout: string; stderr: string }, label: string): void {
  if (result.exitCode !== 0) fail(`${label} failed: ${result.stderr.trim() || result.stdout.trim()}`);
}

if (Bun.env.LORELUM_LOCAL_EXPERIMENT !== "1") fail("Local sandbox preflight requires LORELUM_LOCAL_EXPERIMENT=1");

const environmentPath = join(workspaceRoot, "environments", "local-wsl-pi", "v1", "environment.yaml");
const environment = Bun.YAML.parse(await Bun.file(environmentPath).text()) as Record<string, unknown>;
const sandbox = localContainerSandbox(environment);
const cliEnv = { PATH: Bun.env.PATH ?? "", ...containerEnvironment("sandbox-preflight", sandbox) };

requireSuccess(await run(localContainerImageInspectCommand(sandbox), cliEnv), "Local container image inspection");
requireSuccess(await run(containerVersionCommand(sandbox), cliEnv), "Local container runtime version check");

const root = await mkdtemp(join(tmpdir(), "lorelum-local-sandbox-"));
try {
  const workspace = join(root, "workspace");
  const skill = join(root, "SKILL.md");
  await mkdir(join(workspace, "starter"), { recursive: true });
  await Bun.write(join(workspace, "starter", "candidate.txt"), "candidate\n");
  await writeFile(skill, "isolated skill\n");
  const probe = containerCommand(
    { execution: { command: "pi", args: [], seed: 0, budget: { max_turns: 1, max_duration_ms: 1 }, tool_policy_hash: "" } } as never,
    sandbox,
    workspace,
    skill,
    "pi",
    ["--version"]
  );
  requireSuccess(await run(probe, { ...cliEnv, AWS_SECRET_ACCESS_KEY: "host-secret", GITHUB_TOKEN: "host-token" }), "Local sandbox probe");
  const securityProbe = [
    "docker", "run", "--rm", "--read-only", "--cap-drop=ALL", "--security-opt=no-new-privileges", "--network", "none",
    "--workdir", sandbox.workspace_path, "--tmpfs", "/tmp:rw,noexec,nosuid,size=64m",
    "--mount", `type=bind,src=${workspace},dst=${sandbox.workspace_path}`,
    "--mount", `type=bind,src=${skill},dst=${sandbox.skill_path},readonly`, "--entrypoint", "/bin/sh", sandbox.image,
    "-ec", `test ! -e ${sandbox.workspace_path}/../private; test -z "$AWS_SECRET_ACCESS_KEY"; test -z "$GITHUB_TOKEN"; test "$(cat ${sandbox.skill_path})" = "isolated skill"; ! touch ${sandbox.skill_path}`
  ];
  requireSuccess(await run(securityProbe, cliEnv), "Local sandbox isolation probe");
} finally {
  await rm(root, { force: true, recursive: true });
}

console.log("Local WSL Pi sandbox preflight passed");
