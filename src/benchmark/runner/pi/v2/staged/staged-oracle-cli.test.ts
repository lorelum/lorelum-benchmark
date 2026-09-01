import { cp, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, expect, test } from "bun:test";

const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map((path) => rm(path, { recursive: true, force: true }))); });

test("declared Stage 1 and Stage 2 oracle commands execute without model calls", async () => {
  const candidate = resolve("incubator/practice-injection/llm-provider-gateway-v4");
  const oracle = Bun.YAML.parse(await Bun.file(join(candidate, "private/oracle.yaml")).text()) as {
    semantic_oracle: Record<"stage_1" | "stage_2", { command: string; expected: string }>;
  };
  const workspace = await mkdtemp(join(tmpdir(), "staged-oracle-cli-"));
  roots.push(workspace);

  await cp(join(candidate, "public/starter/app"), join(workspace, "stage-1", "app"), { recursive: true });
  await cp(join(candidate, "private/calibration/sets/two-stage-structure/v1/overlays/oracle-reference"), join(workspace, "stage-2", "app"), { recursive: true });
  const run = (command: string, stage: string) => {
    const argv = command.replaceAll("<workspace>", join(workspace, stage)).split(" ");
    return Bun.spawnSync(argv, { cwd: candidate, stdout: "pipe", stderr: "pipe" });
  };
  const stage1 = run(oracle.semantic_oracle.stage_1.command, "stage-1");
  const stage2 = run(oracle.semantic_oracle.stage_2.command, "stage-2");
  expect(stage1.exitCode).toBe(0);
  expect(stage2.exitCode).toBe(0);
  expect(JSON.parse(new TextDecoder().decode(stage1.stdout))).toEqual({ stage: 1, semantic: "pass" });
  expect(JSON.parse(new TextDecoder().decode(stage2.stdout))).toEqual({ stage: 2, semantic: "pass" });
});