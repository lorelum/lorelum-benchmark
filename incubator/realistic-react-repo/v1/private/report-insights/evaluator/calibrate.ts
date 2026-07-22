import { cp, mkdtemp, rm } from "node:fs/promises";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";

const taskRoot = resolve(import.meta.dir, "..");
const incubatorRoot = resolve(taskRoot, "..", "..");
const starterRoot = resolve(incubatorRoot, "public", "starter", "app");
const evaluator = resolve(import.meta.dir, "evaluate.ts");
const candidates = [
  ["reference", resolve(taskRoot, "reference", "components", "reports", "insights-panel.tsx"), true],
  ["naive", resolve(taskRoot, "naive", "components", "reports", "insights-panel.tsx"), false],
  ["mutation-eager-load", resolve(taskRoot, "mutations", "eager-load", "components", "reports", "insights-panel.tsx"), false],
] as const;

for (const [name, panel, expectedFullScore] of candidates) {
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    const temporaryRoot = await mkdtemp(join(tmpdir(), "lorelum-realistic-report-"));
    const candidateRoot = join(temporaryRoot, "app");
    try {
      await cp(starterRoot, candidateRoot, { recursive: true, filter: (path) => !path.includes("node_modules") && !path.includes(".next") });
      await Bun.write(join(candidateRoot, "components", "reports", "insights-panel.tsx"), Bun.file(panel));
      const child = Bun.spawn([process.execPath, "run", evaluator, candidateRoot, starterRoot], { stdout: "pipe", stderr: "pipe" });
      const [stdout, stderr, code] = await Promise.all([new Response(child.stdout).text(), new Response(child.stderr).text(), child.exited]);
      const result = JSON.parse(stdout) as { semantic: { passed: boolean }; protection: { passed: boolean }; quality: { score: number } };
      const valid = code === 0 && result.semantic.passed && result.protection.passed && (expectedFullScore ? result.quality.score === 100 : result.quality.score < 100);
      if (!valid) throw new Error(`${name} attempt ${attempt} was not calibrated: ${stdout}\n${stderr}`);
      console.log(`${name} attempt ${attempt}: ${result.quality.score}/100`);
    } finally {
      await rm(temporaryRoot, { recursive: true, force: true });
    }
  }
}

console.log("Report insights reference, naive control, and conditional-loading mutation calibrated twice.");
