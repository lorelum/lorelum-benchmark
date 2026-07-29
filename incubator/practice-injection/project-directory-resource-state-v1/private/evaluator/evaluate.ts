import { join, resolve } from "node:path";

const appRoot = resolve(Bun.argv[2] ?? "public/starter/app");
const evaluatorRoot = resolve(import.meta.dirname);
const run = async (command: string[], cwd: string) => await Bun.spawn(command, { cwd, stdout: "inherit", stderr: "inherit" }).exited;
async function practiceObservation(): Promise<{ practice_observation: string; observation_reason?: string }> {
  const child = Bun.spawn([process.execPath, "run", join(evaluatorRoot, "verify-resource-state.ts"), appRoot, appRoot], { cwd: process.cwd(), stdout: "pipe", stderr: "pipe" });
  const [output] = await Promise.all([new Response(child.stdout).text(), child.exited]);
  for (const line of output.trim().split(/\r?\n/).reverse()) {
    try {
      const value = JSON.parse(line) as { practice_observation?: unknown; observation_reason?: unknown };
      if (typeof value.practice_observation === "string" && (value.observation_reason === undefined || typeof value.observation_reason === "string")) {
        return value as { practice_observation: string; observation_reason?: string };
      }
    } catch {
      // The private probe may include diagnostics before its final result.
    }
  }
  return { practice_observation: "indeterminate", observation_reason: "invalid-probe-output" };
}
const semantic = await run(["bun", "run", "test"], appRoot);
const observation = await practiceObservation();
console.log(JSON.stringify({ semantic: semantic === 0 ? "pass" : "fail", ...observation }));
process.exit(semantic === 0 ? 0 : 1);
