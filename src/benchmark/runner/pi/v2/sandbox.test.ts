import { expect, test } from "bun:test";
import { containerCommand, containerEnvironment, containerName, containerRemoveCommand, formalContainerSandbox, localContainerSandbox } from "./sandbox";

const image = "ghcr.io/lorelum/lorelum-benchmark/formal-pi@sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const environment = {
  sandbox: {
    container: {
      runtime: "docker",
      image,
      network: "lorelum-formal-egress",
      proxy_url: "http://lorelum-egress-proxy:3128",
      allowed_endpoint: "api.deepseek.com:443",
      workspace_path: "/workspace",
      skill_path: "/lorelum/treatment/SKILL.md",
      pids_limit: 256,
      memory_limit: "2g"
    }
  }
};

const request = {
  run_id: "test-run",
  execution: {
    command: "pi",
    args: ["--print"],
    seed: 1,
    budget: { max_turns: 1, max_duration_ms: 1 },
    tool_policy_hash: "test"
  }
} as never;

test("requires a digest-pinned formal container image", () => {
  expect(() => formalContainerSandbox({ sandbox: { container: { ...environment.sandbox.container, image: "ghcr.io/lorelum/lorelum-benchmark/formal-pi:v1" } } })).toThrow("Formal container sandbox is invalid");
});

test("builds a minimal baseline container command", () => {
  const sandbox = formalContainerSandbox(environment);
  const command = containerCommand(request, sandbox, "/host/public-workspace");

  expect(command).toContain("--read-only");
  expect(command).toContain("--cap-drop=ALL");
  expect(command).toContain("--security-opt=no-new-privileges");
  expect(command).toContain("--name");
  expect(command).toContain(containerName("test-run"));
  expect(command).toContain("--network");
  expect(command).toContain("lorelum-formal-egress");
  expect(command).toContain("type=bind,src=/host/public-workspace,dst=/workspace");
  expect(command).not.toContain("/lorelum/treatment/SKILL.md");
  expect(command).not.toContain("AWS_SECRET_ACCESS_KEY");
  expect(command).not.toContain("GITHUB_TOKEN");
  expect(command).toContain(image);
});

test("provides a deterministic force-remove command for timeout cleanup", () => {
  expect(containerRemoveCommand("test-run")).toEqual(["docker", "rm", "--force", "lorelum-pi-test-run"]);
});

test("mounts only the staged G1 skill as read-only", () => {
  const sandbox = formalContainerSandbox(environment);
  const command = containerCommand(request, sandbox, "/host/public-workspace", "/host/staged/SKILL.md");

  expect(command).toContain("type=bind,src=/host/staged,dst=/lorelum/treatment,readonly");
});

test("passes only the API key and fixed proxy environment", () => {
  const variables = containerEnvironment("api-key", formalContainerSandbox(environment));

  expect(variables).toEqual({
    DEEPSEEK_API_KEY: "api-key",
    HTTPS_PROXY: "http://lorelum-egress-proxy:3128",
    HTTP_PROXY: "http://lorelum-egress-proxy:3128",
    NO_PROXY: ""
  });
  expect(() => containerEnvironment(undefined, formalContainerSandbox(environment))).toThrow("DEEPSEEK_API_KEY");
});

test("uses a separately marked local container without proxy credentials", () => {
  const local = localContainerSandbox({
    sandbox: {
      enforcement: "local-container-experiment",
      container: {
        runtime: "docker",
        image: "lorelum-formal-pi:local",
        network: "bridge",
        workspace_path: "/workspace",
        skill_path: "/lorelum/treatment/SKILL.md",
        pids_limit: 128,
        memory_limit: "1g"
      }
    }
  });
  const command = containerCommand(request, local, "/host/public-workspace");

  expect(command).toContain("bridge");
  expect(command).not.toContain("HTTPS_PROXY");
  expect(containerEnvironment("api-key", local)).toEqual({ DEEPSEEK_API_KEY: "api-key" });
});
