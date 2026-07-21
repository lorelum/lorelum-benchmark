import { expect, test } from "bun:test";
import { mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { sha256Directory } from "../../../fs";
import { routePublicRules } from "./rule-router";

test("routes only public task material into a stable bounded rule context", async () => {
  const root = join(tmpdir(), `lorelum-rule-router-${crypto.randomUUID()}`);
  try {
    const task = join(root, "task");
    const bundle = join(root, "bundle");
    await mkdir(join(task, "public", "starter", "src"), { recursive: true });
    await mkdir(join(task, "private"), { recursive: true });
    await mkdir(join(bundle, "rules"), { recursive: true });
    await Bun.write(join(task, "public", "task.md"), "Conditionally cache one renderer module result.");
    await Bun.write(join(task, "public", "task.yaml"), "id: example-v1\n");
    await Bun.write(join(task, "public", "starter", "src", "example.ts"), "export async function render() {}\n");
    await Bun.write(join(task, "private", "rule-audit.yaml"), "required_rules: [private-only.md]\n");
    await Bun.write(join(bundle, "SKILL.md"), "# Skill\n");
    await Bun.write(join(bundle, "rules", "bundle-conditional.md"), "conditional module bundle\n");
    await Bun.write(join(bundle, "rules", "js-cache-function-results.md"), "cache function results\n");
    await Bun.write(join(bundle, "rules", "unrelated.md"), "unrelated signal\n");
    const skillBundle = { path: bundle, skillPath: join(bundle, "SKILL.md"), name: "test", repository: "test", revision: "0".repeat(40), sourcePath: "test", sha256: await sha256Directory(bundle) };
    const first = await routePublicRules(task, skillBundle);
    await Bun.write(join(task, "private", "rule-audit.yaml"), "required_rules: [changed-private-audit.md]\n");
    const second = await routePublicRules(task, skillBundle);

    expect(first.rules.length).toBeLessThanOrEqual(3);
    expect(first.rules.map((rule) => rule.path)).toContain("rules/bundle-conditional.md");
    expect(first.rules.map((rule) => rule.path)).toContain("rules/js-cache-function-results.md");
    expect(second).toEqual(first);
    expect(first.text).toContain("<lorelum-rule path=\"rules/bundle-conditional.md\"");
    expect(first.text).not.toContain("private-only");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
