import { cp, mkdtemp, rm } from "node:fs/promises";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { expect, test } from "bun:test";

const incubatorRoot = resolve(import.meta.dir, "..", "..", "..");
const baselineRoot = resolve(incubatorRoot, "public", "starter", "app");
const evaluator = resolve(import.meta.dir, "evaluate.ts");

test("rejects protected source changes before installing or building a candidate", async () => {
  const temporaryRoot = await mkdtemp(join(tmpdir(), "lorelum-realistic-team-protection-"));
  const candidateRoot = join(temporaryRoot, "app");
  try {
    await cp(baselineRoot, candidateRoot, { recursive: true, filter: (path) => !path.includes("node_modules") && !path.includes(".next") });
    await Bun.write(join(candidateRoot, "package.json"), "{}\n");
    const child = Bun.spawn([process.execPath, "run", evaluator, candidateRoot, baselineRoot], { stdout: "pipe", stderr: "pipe" });
    const [stdout, exitCode] = await Promise.all([new Response(child.stdout).text(), child.exited]);
    const result = JSON.parse(stdout) as { semantic: { failures: string[] }; protection: { passed: boolean; failures: string[] } };
    expect(exitCode).toBe(1);
    expect(result.semantic.failures).toContain("candidate violated protected-source policy");
    expect(result.protection.passed).toBeFalse();
    expect(result.protection.failures).toContain("protected file changed: package.json");
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
  }
});
