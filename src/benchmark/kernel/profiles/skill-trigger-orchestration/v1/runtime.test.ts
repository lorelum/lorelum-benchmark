import { expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { sha256Text } from "../../../../fs";
import { redactedSkillTriggerTrace, resolveSkillTrigger, resolveSkillTriggerPayload } from "./runtime";

async function sha256OfText(text: string): Promise<string> {
  return sha256Text(text);
}

async function buildCandidate(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "lorelum-skill-trigger-"));
  const privateRoot = join(root, "private");
  const practiceRoot = join(privateRoot, "practices");
  await mkdir(practiceRoot, { recursive: true });

  const oracleCard = "<!-- id: async-lifecycle -->\n<!-- version: v1 -->\n# Async lifecycle\n\n异步副作用不得在组件卸载后继续影响状态。\n";
  const irrelevantCard = "<!-- id: form-validation -->\n<!-- version: v1 -->\n# Form validation\n\n表单字段应在提交前进行客户端校验。\n";
  await writeFile(join(practiceRoot, "oracle.async-lifecycle.v1.md"), oracleCard);
  await writeFile(join(practiceRoot, "irrelevant.form-validation.v1.md"), irrelevantCard);

  const oracleSha = await sha256OfText(oracleCard);
  const irrelevantSha = await sha256OfText(irrelevantCard);

  const conditions = `version: v1
conditions:
  - id: baseline
    status: declared
    channel: none
    practice: none
  - id: lorelum-retrieval
    status: declared
    channel: mock-retrieval-prompt-injection
    practice:
      path: private/practices/oracle.async-lifecycle.v1.md
      sha256: ${oracleSha}
  - id: irrelevant-practice
    status: declared
    channel: mock-retrieval-prompt-injection
    practice:
      path: private/practices/irrelevant.form-validation.v1.md
      sha256: ${irrelevantSha}
decision_rule:
  metric: joint-pass-count
  relation: lorelum-passes-and-irrelevant-fails
  controls: [baseline, irrelevant-practice]
  otherwise: diagnostic-only
`;
  await writeFile(join(privateRoot, "conditions.yaml"), conditions);
  return root;
}

async function withCandidate(mutator: (path: string) => Promise<void>): Promise<string> {
  const root = await buildCandidate();
  await mutator(root);
  return root;
}

async function replace(path: string, from: string, to: string): Promise<void> {
  const text = await Bun.file(path).text();
  await Bun.write(path, text.replace(from, to));
}

test("resolves declared lorelum-retrieval with redacted practice reference", async () => {
  const root = await buildCandidate();
  try {
    const profile = await resolveSkillTrigger(root);
    expect(profile.conditions.baseline.channel).toBe("none");
    expect(profile.conditions["lorelum-retrieval"].channel).toBe("mock-retrieval-prompt-injection");
    expect(profile.conditions["lorelum-retrieval"].practice).toMatchObject({ id: "async-lifecycle", version: "v1" });
    expect(profile.conditions["irrelevant-practice"].practice).toMatchObject({ id: "form-validation", version: "v1" });
    expect(profile.decision_rule.relation).toBe("lorelum-passes-and-irrelevant-fails");
    const serialized = JSON.stringify(profile);
    expect(serialized).not.toContain("异步副作用不得在组件卸载后继续影响状态");
    expect(serialized).not.toContain("private/practices");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("redacted trace carries three-layer events without practice text", async () => {
  const root = await buildCandidate();
  try {
    const profile = await resolveSkillTrigger(root);
    const mockResult = {
      scope_constraint: "该 useEffect 的异步副作用",
      matched_practice: { id: "async-lifecycle", version: "v1", sha256: profile.conditions["lorelum-retrieval"].practice!.sha256 },
      behavior_constraint: "异步副作用不得在组件卸载后继续影响状态",
    };
    const payload = await resolveSkillTriggerPayload(root, profile, "lorelum-retrieval", mockResult);
    const events = [
      { event: "discovered_and_loaded", skill_id: "lorelum", skill_version: "mock-v1" },
      { event: "query_occurred", practice_id: "async-lifecycle", practice_version: "v1", practice_sha256: mockResult.matched_practice.sha256 },
      { event: "constraint_adopted", behavior_constraint_sha256: await sha256OfText(mockResult.behavior_constraint) },
    ];
    const trace = redactedSkillTriggerTrace(profile, payload, events);
    expect(trace.condition_id).toBe("lorelum-retrieval");
    expect(trace.channel).toBe("mock-retrieval-prompt-injection");
    expect(trace.events).toHaveLength(3);
    expect(trace.events[0].event).toBe("discovered_and_loaded");
    expect(trace.practice_id).toBe("async-lifecycle");
    const serialized = JSON.stringify(trace);
    expect(serialized).not.toContain("异步副作用不得在组件卸载后继续影响状态");
    expect(serialized).not.toContain("private/practices");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("rejects oracle-practice ceiling", async () => {
  const root = await withCandidate(async (path) => {
    await replace(join(path, "private/conditions.yaml"), "  - id: baseline", "  - id: oracle-practice\n    status: declared\n    channel: mock-retrieval-prompt-injection\n    practice:\n      path: private/practices/oracle.async-lifecycle.v1.md\n      sha256: ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff\n  - id: baseline");
  });
  try {
    await expect(resolveSkillTrigger(root)).rejects.toThrow("oracle-practice must not be declared");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("rejects hash mismatch", async () => {
  const root = await withCandidate(async (path) => {
    await replace(join(path, "private/conditions.yaml"), /sha256: [a-f0-9]{64}/, "sha256: ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff");
  });
  try {
    await expect(resolveSkillTrigger(root)).rejects.toThrow("sha256 does not match");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("rejects baseline with non-none channel", async () => {
  const root = await withCandidate(async (path) => {
    await replace(join(path, "private/conditions.yaml"), "  - id: baseline\n    status: declared\n    channel: none", "  - id: baseline\n    status: declared\n    channel: mock-retrieval-prompt-injection");
  });
  try {
    await expect(resolveSkillTrigger(root)).rejects.toThrow("baseline.channel must be none");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
