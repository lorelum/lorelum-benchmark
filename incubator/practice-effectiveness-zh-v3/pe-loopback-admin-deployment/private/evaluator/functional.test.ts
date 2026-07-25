import { expect, test } from "bun:test";
import { join } from "node:path";

const candidateRoot = Bun.env.CANDIDATE_PATH
  ?? "incubator/practice-effectiveness/pe-loopback-admin-deployment/public/starter";
const composePath = join(candidateRoot, "docker-compose.yaml");
const envExamplePath = join(candidateRoot, ".env.example");

test("functional: deployment configuration remains parseable", async () => {
  const compose = Bun.YAML.parse(await Bun.file(composePath).text()) as {
    services?: Record<string, { ports?: unknown }>;
  };

  expect(compose.services).toBeDefined();
  expect(compose.services?.["admin-service"]).toBeDefined();
  expect(Array.isArray(compose.services?.["admin-service"].ports)).toBe(true);
});

test("functional: the configured host port still maps to the service port", async () => {
  const composeText = await Bun.file(composePath).text();
  const envExample = await Bun.file(envExamplePath).text();

  expect(composeText).toContain("ADMIN_PORT");
  expect(composeText).toMatch(/:3000[\"']?\s*$/m);
  expect(envExample).toMatch(/^ADMIN_PORT=/m);
});
