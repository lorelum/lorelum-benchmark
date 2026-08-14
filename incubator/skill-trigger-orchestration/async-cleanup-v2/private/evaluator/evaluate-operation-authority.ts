import { join, resolve } from "node:path";

const appRoot = resolve(Bun.argv[2] ?? "public/starter/app");
const evaluatorRoot = resolve(import.meta.dirname);
const modes = ["scope-resolve", "scope-reject", "reload-resolve", "reload-reject", "background-resolve", "background-reject"] as const;

async function run(command: string[], cwd: string): Promise<number> {
  const child = Bun.spawn(command, { cwd, stdout: "inherit", stderr: "inherit" });
  return await child.exited;
}

const semanticExitCode = await run(["bun", "run", "test"], appRoot);
const structureExitCode = await run(["bun", "run", join(evaluatorRoot, "verify-operation-authority.ts"), appRoot], process.cwd());
const runtimeResults: Array<{ mode: typeof modes[number]; exitCode: number }> = [];
for (const mode of modes) {
  const exitCode = structureExitCode === 0
    ? await run(["bun", "run", join(evaluatorRoot, "verify-operation-authority-runtime.ts"), appRoot, "--mode", mode], process.cwd())
    : 1;
  runtimeResults.push({ mode, exitCode });
}
const runtime = Object.fromEntries(runtimeResults.map(({ mode, exitCode }) => [mode, exitCode === 0 ? "pass" : "fail"]));
const practiceProbe = structureExitCode === 0 && runtimeResults.every(({ exitCode }) => exitCode === 0) ? "pass" : "fail";

console.log(JSON.stringify({
  semantic: semanticExitCode === 0 ? "pass" : "fail",
  ast_probe: structureExitCode === 0 ? "pass" : "fail",
  runtime_scope_resolve_probe: runtime["scope-resolve"],
  runtime_scope_reject_probe: runtime["scope-reject"],
  runtime_reload_resolve_probe: runtime["reload-resolve"],
  runtime_reload_reject_probe: runtime["reload-reject"],
  runtime_background_resolve_probe: runtime["background-resolve"],
  runtime_background_reject_probe: runtime["background-reject"],
  practice_probe: practiceProbe,
}));
process.exit(semanticExitCode === 0 && practiceProbe === "pass" ? 0 : 1);
