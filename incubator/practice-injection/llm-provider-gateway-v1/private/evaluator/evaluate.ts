import { join, resolve } from "node:path";

const appRoot = resolve(Bun.argv[2] ?? "public/starter/app");
const evaluatorRoot = resolve(import.meta.dirname);
const candidateRoot = resolve(evaluatorRoot, "..", "..");

async function practiceObservation(): Promise<{ practice_observation: string; observation_reason?: string }> {
  const child = Bun.spawn([process.execPath, "run", join(evaluatorRoot, "verify-provider-gateway.ts"), appRoot], { cwd: process.cwd(), stdout: "pipe", stderr: "pipe" });
  const [output] = await Promise.all([new Response(child.stdout).text(), child.exited]);
  for (const line of output.trim().split(/\r?\n/).reverse()) {
    try {
      const value = JSON.parse(line) as { practice_observation?: unknown; failures?: unknown; reason?: unknown };
      if (value.practice_observation === "observed" || value.practice_observation === "not-observed" || value.practice_observation === "indeterminate") {
        const reason = Array.isArray(value.failures) && value.failures.length > 0 ? value.failures.join("; ") : typeof value.reason === "string" ? value.reason : undefined;
        return { practice_observation: value.practice_observation, ...(reason ? { observation_reason: reason } : {}) };
      }
    } catch {
      // The private probe may include diagnostics before its final result.
    }
  }
  return { practice_observation: "indeterminate", observation_reason: "invalid-probe-output" };
}

const semanticPass = await Bun.spawn([process.execPath, "run", "test"], { cwd: appRoot, stdout: "inherit", stderr: "inherit" }).exited === 0;
const observation = await practiceObservation();
const semantic = semanticPass ? "pass" : "fail";
console.log(JSON.stringify({ semantic, ...observation }));
process.exit(semanticPass ? 0 : 1);