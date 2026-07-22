import { cp, mkdtemp, rm } from "node:fs/promises";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";

const privateRoot = resolve(import.meta.dir, "..");
const incubatorRoot = resolve(privateRoot, "..", "..");
const starterRoot = resolve(incubatorRoot, "public", "starter", "app");
const evaluator = resolve(import.meta.dir, "evaluate.ts");
const candidates = [
  ["reference", resolve(privateRoot, "reference", "dashboard-runtime.ts"), true],
  ["naive", resolve(privateRoot, "naive", "dashboard-runtime.ts"), false],
  ["mutation-duplicate-workspace-read", resolve(privateRoot, "mutations", "duplicate-workspace-read.ts"), false],
  ["mutation-quota-after-workspace", resolve(privateRoot, "mutations", "quota-after-workspace.ts"), false],
  ["mutation-projects-after-quota", resolve(privateRoot, "mutations", "projects-after-quota.ts"), false],
] as const;

async function run(name: string, implementation: string, expectedFullScore: boolean): Promise<void> {
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    const temporaryRoot = await mkdtemp(join(tmpdir(), "lorelum-realistic-dashboard-"));
    const candidateRoot = join(temporaryRoot, "app");
    try {
      await cp(starterRoot, candidateRoot, { recursive: true, filter: (path) => !path.includes("node_modules") && !path.includes(".next") });
      await Bun.write(join(candidateRoot, "lib", "dashboard-runtime.ts"), Bun.file(implementation));
      const child = Bun.spawn([process.execPath, "run", evaluator, candidateRoot, starterRoot], { stdout: "pipe", stderr: "pipe" });
      const [stdout, stderr, status] = await Promise.all([new Response(child.stdout).text(), new Response(child.stderr).text(), child.exited]);
      const result = JSON.parse(stdout) as { semantic: { passed: boolean }; protection: { passed: boolean }; quality: { score: number } };
      const valid = status === 0 && result.semantic.passed && result.protection.passed && (expectedFullScore ? result.quality.score === 100 : result.quality.score < 100);
      if (!valid) throw new Error(`${name} attempt ${attempt} was not calibrated: ${stdout}\n${stderr}`);
      console.log(`${name} attempt ${attempt}: ${result.quality.score}/100`);
    } finally {
      await rm(temporaryRoot, { recursive: true, force: true });
    }
  }
}

for (const [name, implementation, expectedFullScore] of candidates) await run(name, implementation, expectedFullScore);
console.log("Dashboard RSC reference, naive control, and all rule-attributed mutations calibrated twice.");
