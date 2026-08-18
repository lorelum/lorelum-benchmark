import { expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { redactedSkillTriggerTrace, resolveSkillTrigger, resolveSkillTriggerPayload } from "./runtime";

async function sha256Bytes(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

const oracleCard = `---
id: react.async-lifecycle
title: React 异步副作用生命周期
stage: effect-cleanup
tech_stack: [react, typescript]
applies_when: 当 React 组件在 useEffect 中发起异步请求并处理其响应时。
severity: warn
delivery_template: practice-card/v1
---

# React 异步副作用生命周期

## 建议

1. 让组件的异步副作用在组件卸载后不再影响状态；在 effect 返回的清理函数中使后续响应失效。
2. 使用可取消的信号或已挂载标志，在清理时标记请求结果不再适用。
3. 仅在结果仍有效时更新状态，避免卸载后写入。

## 常见反模式

- 在 useEffect 中发起请求并直接 setState，不返回清理函数。
- 清理函数为空，请求仍在途时组件卸载导致状态写入。
- 将请求移到组件外但未取消，卸载后仍处理响应。
`;

const irrelevantCard = `---
id: react.form-validation
title: React 表单校验
stage: form-submit
tech_stack: [react, typescript]
applies_when: 当 React 表单在提交前需要对字段进行客户端校验时。
severity: warn
delivery_template: practice-card/v1
---

# React 表单校验

## 建议

1. 让表单在提交前对必填字段进行客户端校验，给出可操作的错误提示。
2. 使用稳定的字段标识组织校验规则，把校验逻辑收敛到可复用模块。
3. 仅在字段值变更或提交时触发校验，避免每次渲染都重算。

## 常见反模式

- 提交前不校验，直接把空值或非法值发给服务端。
- 将校验规则分散在多个组件中，难以复用与测试。
- 每次渲染都执行校验，造成不必要的性能开销。
- 把校验错误信息硬编码在组件内，无法集中维护与本地化。
`;

async function buildCandidate(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "lorelum-skill-trigger-"));
  const privateRoot = join(root, "private");
  const practiceRoot = join(privateRoot, "practices");
  await mkdir(practiceRoot, { recursive: true });

  await writeFile(join(practiceRoot, "oracle.async-lifecycle.v1.md"), oracleCard);
  await writeFile(join(practiceRoot, "irrelevant.form-validation.v1.md"), irrelevantCard);

  const oracleSha = await sha256Bytes(oracleCard);
  const irrelevantSha = await sha256Bytes(irrelevantCard);
  const oracleChars = [...oracleCard].length;
  const irrelevantChars = [...irrelevantCard].length;
  const actualDiff = Math.abs(oracleChars - irrelevantChars) / oracleChars;

  const metadata = `delivery_template: practice-card/v1
length_metric: practice-card/v1:utf8-rendered-characters
cards:
  - id: react.async-lifecycle
    version: v1
    path: oracle.async-lifecycle.v1.md
    rendered_characters: ${oracleChars}
  - id: react.form-validation
    version: v1
    path: irrelevant.form-validation.v1.md
    rendered_characters: ${irrelevantChars}
comparison:
  maximum_relative_difference: 0.10
  actual_relative_difference: ${actualDiff.toFixed(6)}
  independently_reviewed: true
`;
  await writeFile(join(practiceRoot, "metadata.yaml"), metadata);

  const conditions = `version: v1
conditions:
  - id: baseline
    status: declared
    channel: none
    practice: none
  - id: lorelum-retrieval
    status: declared
    channel: mock-retrieval-tool-call
    practice:
      path: private/practices/oracle.async-lifecycle.v1.md
      sha256: ${oracleSha}
  - id: irrelevant-practice
    status: declared
    channel: mock-retrieval-tool-call
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
    expect(profile.conditions["lorelum-retrieval"].channel).toBe("mock-retrieval-tool-call");
    expect(profile.conditions["lorelum-retrieval"].practice).toMatchObject({ id: "react.async-lifecycle", version: "v1" });
    expect(profile.conditions["irrelevant-practice"].practice).toMatchObject({ id: "react.form-validation", version: "v1" });
    expect(profile.decision_rule.relation).toBe("lorelum-passes-and-irrelevant-fails");
    const serialized = JSON.stringify(profile);
    expect(serialized).not.toContain("异步副作用在组件卸载后不再影响状态");
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
      matched_practice: { id: "react.async-lifecycle", version: "v1", sha256: profile.conditions["lorelum-retrieval"].practice!.sha256 },
      behavior_constraint: "异步副作用不得在组件卸载后继续影响状态",
    };
    const payload = await resolveSkillTriggerPayload(root, profile, "lorelum-retrieval", mockResult);
    const events = [
      { event: "public_input_read", path: "app/src/Dashboard.tsx", sha256: "a".repeat(64), anchors: ["dashboard"] },
      { event: "skill_discovered", tool_call_id: "discover-1", skill_id: "lorelum", skill_version: "mock-v2" },
      { event: "skill_loaded", tool_call_id: "load-1", skill_id: "lorelum", skill_version: "mock-v2" },
      { event: "practice_query_issued", query_id: "query-1", query_sha256: await sha256Bytes("Dashboard useEffect") },
      { event: "practice_query_resolved", query_id: "query-1", practice_id: "react.async-lifecycle", practice_version: "v1", practice_sha256: mockResult.matched_practice.sha256, behavior_constraint_sha256: await sha256Bytes(mockResult.behavior_constraint) },
    ];
    const trace = redactedSkillTriggerTrace(profile, payload, events);
    expect(trace.condition_id).toBe("lorelum-retrieval");
    expect(trace.channel).toBe("mock-retrieval-tool-call");
    expect(trace.events).toHaveLength(5);
    expect(trace.events[0].event).toBe("public_input_read");
    expect(trace.practice_id).toBe("react.async-lifecycle");
    const serialized = JSON.stringify(trace);
    expect(serialized).not.toContain("异步副作用不得在组件卸载后继续影响状态");
    expect(serialized).not.toContain("private/practices");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("rejects oracle-practice ceiling", async () => {
  const root = await withCandidate(async (path) => {
    await replace(join(path, "private/conditions.yaml"), "  - id: baseline", "  - id: oracle-practice\n    status: declared\n    channel: mock-retrieval-tool-call\n    practice:\n      path: private/practices/oracle.async-lifecycle.v1.md\n      sha256: ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff\n  - id: baseline");
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
    await replace(join(path, "private/conditions.yaml"), "  - id: baseline\n    status: declared\n    channel: none", "  - id: baseline\n    status: declared\n    channel: mock-retrieval-tool-call");
  });
  try {
    await expect(resolveSkillTrigger(root)).rejects.toThrow("baseline.channel must be none");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("rejects stale rendered_characters in metadata", async () => {
  const root = await withCandidate(async (path) => {
    const cardPath = join(path, "private/practices/oracle.async-lifecycle.v1.md");
    await Bun.write(cardPath, `${await Bun.file(cardPath).text()}追加内容使长度变化。\n`);
    const newSha = await sha256Bytes(await Bun.file(cardPath).text());
    await replace(join(path, "private/conditions.yaml"), /sha256: [a-f0-9]{64}/, `sha256: ${newSha}`);
  });
  try {
    await expect(resolveSkillTrigger(root)).rejects.toThrow("rendered_characters disagrees");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
