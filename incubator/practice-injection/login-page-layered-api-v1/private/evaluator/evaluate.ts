import { join, resolve } from "node:path";

const appRoot = resolve(Bun.argv[2] ?? "public/starter/app");
const evaluatorRoot = resolve(import.meta.dirname);

async function run(command: string[], cwd: string): Promise<number> {
  const child = Bun.spawn(command, { cwd, stdout: "inherit", stderr: "inherit" });
  return await child.exited;
}

const semanticExitCode = await run(["bun", "run", "test"], appRoot);
const probeExitCode = await run(["bun", "run", join(evaluatorRoot, "verify-layering.ts"), appRoot], process.cwd());

console.log(JSON.stringify({ semantic: semanticExitCode === 0 ? "pass" : "fail", practice_probe: probeExitCode === 0 ? "pass" : "fail" }));
process.exit(semanticExitCode === 0 && probeExitCode === 0 ? 0 : 1);
