import { dirname } from "node:path";
import type { PiRunRequestV2 } from "./types";

export type FormalContainerSandbox = {
  runtime: "docker";
  image: string;
  network: string;
  proxy_url: string;
  allowed_endpoint: string;
  workspace_path: string;
  skill_path: string;
  pids_limit: number;
  memory_limit: string;
};

type Environment = Record<string, unknown>;

function fail(message: string): never {
  throw new Error(message);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isDigestReference(value: unknown): value is string {
  return typeof value === "string" && /^ghcr\.io\/[a-z0-9._/-]+@sha256:[a-f0-9]{64}$/.test(value);
}

export function formalContainerSandbox(environment: Environment): FormalContainerSandbox {
  const sandbox = environment.sandbox;
  if (!isRecord(sandbox) || !isRecord(sandbox.container)) fail("Formal environment must define a container sandbox");
  const container = sandbox.container;
  if (
    container.runtime !== "docker" ||
    !isDigestReference(container.image) ||
    typeof container.network !== "string" || !/^[a-zA-Z0-9][a-zA-Z0-9_.-]*$/.test(container.network) ||
    typeof container.proxy_url !== "string" || !/^http:\/\/[a-zA-Z0-9][a-zA-Z0-9.-]*:[1-9][0-9]{0,4}$/.test(container.proxy_url) ||
    container.allowed_endpoint !== "api.deepseek.com:443" ||
    container.workspace_path !== "/workspace" ||
    container.skill_path !== "/lorelum/treatment/SKILL.md" ||
    !Number.isInteger(container.pids_limit) || container.pids_limit < 1 ||
    typeof container.memory_limit !== "string" || !/^[1-9][0-9]*[kKmMgG]$/.test(container.memory_limit)
  ) {
    fail("Formal container sandbox is invalid");
  }
  return container as FormalContainerSandbox;
}

function mount(source: string, destination: string, readonly = false): string {
  return `type=bind,src=${source},dst=${destination}${readonly ? ",readonly" : ""}`;
}

export function containerName(runId: string): string {
  return `lorelum-pi-${runId}`;
}

export function containerEnvironment(apiKey: string | undefined, sandbox: FormalContainerSandbox): Record<string, string> {
  if (!apiKey) fail("Formal Pi execution requires DEEPSEEK_API_KEY");
  return {
    DEEPSEEK_API_KEY: apiKey,
    HTTPS_PROXY: sandbox.proxy_url,
    HTTP_PROXY: sandbox.proxy_url,
    NO_PROXY: ""
  };
}

export function containerCommand(request: PiRunRequestV2, sandbox: FormalContainerSandbox, workspacePath: string, skillPath?: string, command = request.execution.command, args = request.execution.args): string[] {
  const commandLine = [
    "docker", "run", "--rm", "--name", containerName(request.run_id), "--read-only", "--cap-drop=ALL", "--security-opt=no-new-privileges", "--pids-limit", String(sandbox.pids_limit), "--memory", sandbox.memory_limit,
    "--network", sandbox.network, "--workdir", sandbox.workspace_path,
    "--tmpfs", "/tmp:rw,noexec,nosuid,size=64m",
    "--mount", mount(workspacePath, sandbox.workspace_path),
    "-e", "DEEPSEEK_API_KEY", "-e", `HTTPS_PROXY=${sandbox.proxy_url}`, "-e", `HTTP_PROXY=${sandbox.proxy_url}`, "-e", "NO_PROXY="
  ];
  if (skillPath) commandLine.push("--mount", mount(dirname(skillPath), dirname(sandbox.skill_path), true));
  commandLine.push(sandbox.image);
  if (command !== "pi") fail("Formal container execution must use pi");
  return [...commandLine, ...args];
}

export function containerVersionCommand(sandbox: FormalContainerSandbox): string[] {
  return [
    "docker", "run", "--rm", "--network", "none", "--read-only", "--cap-drop=ALL", "--security-opt=no-new-privileges",
    "--tmpfs", "/tmp:rw,noexec,nosuid,size=64m", "--entrypoint", "/bin/sh", sandbox.image,
    "-ec", "test \"$(bun --version)\" = \"1.3.11\"; test \"$(node --version)\" = \"v22.19.0\"; command -v pi >/dev/null; test \"$(node -p \\\"require('@earendil-works/pi-coding-agent/package.json').version\\\")\" = \"0.80.10\""
  ];
}

export function containerImageInspectCommand(sandbox: FormalContainerSandbox): string[] {
  return ["docker", "image", "inspect", "--format", "{{index .RepoDigests 0}}", sandbox.image];
}

export function containerRemoveCommand(runId: string): string[] {
  return ["docker", "rm", "--force", containerName(runId)];
}
