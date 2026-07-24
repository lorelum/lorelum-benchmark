import { expect, test } from "bun:test";
import { mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { joinPath, sha256Directory } from "../../../fs";
import { resolveSkillBundle, stageSkillBundle } from "./treatment-resolver";

async function writeBundle(path: string): Promise<void> {
  await mkdir(join(path, "rules"), { recursive: true });
  await Bun.write(join(path, "SKILL.md"), "---\nname: vercel-react-best-practices\ndescription: test\n---\n\nRead rules/example.md.\n");
  await Bun.write(join(path, "rules", "example.md"), "# Example rule\n");
}

test("uses a verified cached native Skill bundle and stages its rule tree", async () => {
  const root = join(tmpdir(), `lorelum-treatment-${crypto.randomUUID()}`);
  const cache = join(root, "cache");
  const source = join(root, "source");
  try {
    await writeBundle(source);
    const sha256 = await sha256Directory(source);
    const cached = join(cache, sha256);
    await writeBundle(cached);
    const treatment = {
      kind: "skill",
      injection: { mode: "pi-skill", skill_name: "vercel-react-best-practices", skill_path: "SKILL.md" },
      source: {
        repository: "https://github.com/vercel-labs/agent-skills.git",
        revision: "f8a72b9603728bb92a217a879b7e62e43ad76c81",
        path: "skills/react-best-practices",
        bundle_sha256: sha256
      }
    };

    const bundle = await resolveSkillBundle(treatment, cache);
    const stagedSkill = await stageSkillBundle(bundle, join(root, "staging"));

    expect(stagedSkill.replaceAll("\\", "/")).toBe(joinPath(root, "staging", "SKILL.md").replaceAll("\\", "/"));
    expect(await Bun.file(stagedSkill).text()).toContain("Read rules/example.md.");
    expect(await Bun.file(join(root, "staging", "rules", "example.md")).text()).toBe("# Example rule\n");
    expect(await Bun.file(join(root, "staging", "AGENTS.md")).exists()).toBe(false);
    const { loadSkills } = await import("@earendil-works/pi-coding-agent");
    const loaded = loadSkills({ agentDir: root, cwd: root, includeDefaults: false, skillPaths: [stagedSkill] });
    expect(loaded.skills).toHaveLength(1);
    expect(loaded.skills[0]?.filePath.replaceAll("\\", "/")).toBe(stagedSkill.replaceAll("\\", "/"));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
