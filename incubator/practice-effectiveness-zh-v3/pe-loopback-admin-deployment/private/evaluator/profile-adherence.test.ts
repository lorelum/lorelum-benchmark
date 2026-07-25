import { expect, test } from "bun:test";
import { join } from "node:path";

const candidateRoot = Bun.env.CANDIDATE_PATH
  ?? "incubator/practice-effectiveness/pe-loopback-admin-deployment/public/starter";
const composePath = join(candidateRoot, "docker-compose.yaml");
const envExamplePath = join(candidateRoot, ".env.example");

test("profile adherence: the administrative port has an explicit loopback host binding", async () => {
  const compose = Bun.YAML.parse(await Bun.file(composePath).text()) as {
    services?: Record<string, { ports?: unknown }>;
  };
  const ports = compose.services?.["admin-service"]?.ports;

  expect(Array.isArray(ports)).toBe(true);
  expect(ports).toContain("127.0.0.1:${ADMIN_PORT:-3000}:3000");
  expect(ports).not.toContain("${ADMIN_PORT:-3000}:3000");
  expect(ports).not.toContain("0.0.0.0:${ADMIN_PORT:-3000}:3000");
});

test("profile adherence: example configuration documents proxy-mediated access", async () => {
  const envExample = await Bun.file(envExamplePath).text();

  expect(envExample).toMatch(/reverse proxy/i);
  expect(envExample).toMatch(/TLS/i);
});
