import { cp, mkdtemp, rm } from "node:fs/promises";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";

const taskRoot = resolve(import.meta.dir, "..");
const incubatorRoot = resolve(taskRoot, "..", "..");
const starterRoot = resolve(incubatorRoot, "public", "starter", "app");
const evaluator = resolve(import.meta.dir, "evaluate.ts");
const candidates = [
  ["reference", resolve(taskRoot, "reference", "app", "team", "page.tsx"), 100],
  ["naive", resolve(taskRoot, "naive", "app", "team", "page.tsx"), 0],
  ["mutation-serialization-leak", resolve(taskRoot, "mutations", "serialization-leak", "app", "team", "page.tsx"), 50],
  ["mutation-duplicate-props", resolve(taskRoot, "mutations", "duplicate-props", "app", "team", "page.tsx"), 50],
] as const;

for (const [name, implementation, expectedScore] of candidates) {
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    const temporaryRoot = await mkdtemp(join(tmpdir(), "lorelum-realistic-team-"));
    const candidateRoot = join(temporaryRoot, "app");
    try {
      await cp(starterRoot, candidateRoot, { recursive: true, filter: (path) => !path.includes("node_modules") && !path.includes(".next") });
      await Bun.write(join(candidateRoot, "app", "team", "page.tsx"), Bun.file(implementation));
      const child = Bun.spawn([process.execPath, "run", evaluator, candidateRoot, starterRoot], { stdout: "pipe", stderr: "pipe" });
      const [stdout, stderr, code] = await Promise.all([new Response(child.stdout).text(), new Response(child.stderr).text(), child.exited]);
      const result = JSON.parse(stdout) as { semantic: { passed: boolean }; protection: { passed: boolean }; quality: { score: number } };
      if (code !== 0 || !result.semantic.passed || !result.protection.passed || result.quality.score !== expectedScore) {
        throw new Error(`${name} attempt ${attempt} was not calibrated: ${stdout}\n${stderr}`);
      }
      console.log(`${name} attempt ${attempt}: ${result.quality.score}/100`);
    } finally {
      await rm(temporaryRoot, { recursive: true, force: true });
    }
  }
}

console.log("Team directory reference, semantic control, and per-rule mutations calibrated twice.");
