import { join } from "node:path";

const expected = { bun: "1.4.2", node: "24.21.0", pi: "0.85.1" } as const;
const manifestOnly = Bun.argv.includes("--manifest-only");
const root = process.cwd();

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

function assertEqual(actual: unknown, expectedValue: string, label: string): void {
  if (actual !== expectedValue) fail(`${label} does not match: expected ${expectedValue}, received ${String(actual)}`);
}

async function readCommandVersion(command: string): Promise<string> {
  const child = Bun.spawn([command, "--version"], { cwd: root, stdout: "pipe", stderr: "pipe" });
  const [exitCode, stdout, stderr] = await Promise.all([child.exited, new Response(child.stdout).text(), new Response(child.stderr).text()]);
  if (exitCode !== 0) fail(`Unable to resolve ${command} version: ${(stderr || stdout).trim()}`);
  return (stdout || stderr).trim();
}

const packageJson = await Bun.file(join(root, "package.json")).json() as { engines?: Record<string, unknown>; devDependencies?: Record<string, unknown> };
assertEqual(packageJson.engines?.bun, expected.bun, "package.json engines.bun");
assertEqual(packageJson.engines?.node, expected.node, "package.json engines.node");
assertEqual(packageJson.devDependencies?.["@earendil-works/pi-coding-agent"], expected.pi, "package.json Pi dependency");

for (const relativePath of [
  "environments/formal-pi-deepseek-v4-pro/v2/environment.yaml",
  "environments/local-pi/v3/environment.yaml",
  "environments/local-pi/v4/environment.yaml",
  "environments/local-wsl-pi/v3/environment.yaml"
]) {
  const environment = Bun.YAML.parse(await Bun.file(join(root, relativePath)).text()) as Record<string, unknown>;
  assertEqual(environment.bun, expected.bun, `${relativePath} bun`);
  assertEqual(environment.node, expected.node, `${relativePath} node`);
  const agentRuntime = environment.agent_runtime as Record<string, unknown> | undefined;
  assertEqual(agentRuntime?.version, expected.pi, `${relativePath} agent_runtime.version`);
  const dependencies = environment.dependencies as Record<string, unknown> | undefined;
  assertEqual(dependencies?.package, `@earendil-works/pi-coding-agent@${expected.pi}`, `${relativePath} dependencies.package`);
}

if (!manifestOnly) {
  assertEqual(Bun.version, expected.bun, "Bun runtime");
  assertEqual(await readCommandVersion("node"), `v${expected.node}`, "Node runtime");
  assertEqual(await readCommandVersion("pi"), expected.pi, "Pi runtime");
}

console.log(`Runtime manifests are consistent${manifestOnly ? " (host checks skipped)" : " and host versions match"}.`);
