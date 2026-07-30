import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "bun:test";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import lorelumExtension from "./lorelum-extension";

type Tool = { name: string; execute: (...args: any[]) => Promise<{ content: Array<{ text: string }> }> };
type Handler = (event: unknown, ctx: { cwd: string }) => Promise<void>;

function fakePi() {
  const handlers = new Map<string, Handler[]>();
  const tools = new Map<string, Tool>();
  const pi = {
    on(event: string, handler: Handler) {
      handlers.set(event, [...(handlers.get(event) ?? []), handler]);
    },
    registerTool(tool: Tool) {
      tools.set(tool.name, tool);
    },
  } as unknown as ExtensionAPI;
  return { handlers, tools, pi };
}

async function invoke(handlers: Map<string, Handler[]>, event: string, payload: unknown, cwd: string): Promise<void> {
  for (const handler of handlers.get(event) ?? []) await handler(payload, { cwd });
}

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "lorelum-extension-v2-"));
  const practicePath = join(root, "practice.md");
  const auditPath = join(root, "audit.jsonl");
  await writeFile(join(root, "task.md"), "Dashboard handles fetchProjects during navigation.\n");
  await writeFile(practicePath, "## 建议\n\n1. 让组件的异步副作用在组件卸载后不再影响状态；在 effect 返回的清理函数中使后续响应失效。\n");
  return { root, practicePath, auditPath };
}

function configureEnvironment(practicePath: string, auditPath: string): () => void {
  const previous = {
    condition: process.env.LORELUM_MOCK_CONDITION,
    practicePath: process.env.LORELUM_MOCK_PRACTICE_PATH,
    practiceSha: process.env.LORELUM_MOCK_PRACTICE_SHA256,
    auditPath: process.env.LORELUM_MOCK_AUDIT_PATH,
  };
  process.env.LORELUM_MOCK_CONDITION = "lorelum-retrieval";
  process.env.LORELUM_MOCK_PRACTICE_PATH = practicePath;
  process.env.LORELUM_MOCK_PRACTICE_SHA256 = "practice-hash";
  process.env.LORELUM_MOCK_AUDIT_PATH = auditPath;
  return () => {
    process.env.LORELUM_MOCK_CONDITION = previous.condition;
    process.env.LORELUM_MOCK_PRACTICE_PATH = previous.practicePath;
    process.env.LORELUM_MOCK_PRACTICE_SHA256 = previous.practiceSha;
    process.env.LORELUM_MOCK_AUDIT_PATH = previous.auditPath;
  };
}

test("read completion without args is observed without throwing", async () => {
  const { root, practicePath, auditPath } = await fixture();
  const restore = configureEnvironment(practicePath, auditPath);
  try {
    const { handlers, pi } = fakePi();
    lorelumExtension(pi);
    await invoke(handlers, "tool_execution_start", { toolName: "read", toolCallId: "read-1", args: { path: "task.md" } }, root);
    await invoke(handlers, "tool_execution_end", { toolName: "read", toolCallId: "read-1", isError: false }, root);
    const audit = await readFile(auditPath, "utf8");
    expect(audit).toContain('"event":"public_input_read"');
    expect(audit).toContain('"path":"task.md"');
  } finally {
    restore();
    await rm(root, { recursive: true, force: true });
  }
});

test("records only a real, redacted Skill chain", async () => {
  const { root, practicePath, auditPath } = await fixture();
  const restore = configureEnvironment(practicePath, auditPath);
  try {
    const { handlers, tools, pi } = fakePi();
    lorelumExtension(pi);
    await invoke(handlers, "tool_execution_start", { toolName: "read", toolCallId: "read-1", args: { path: "task.md" } }, root);
    await invoke(handlers, "tool_execution_end", { toolName: "read", toolCallId: "read-1", isError: false }, root);
    await tools.get("skills_list")!.execute("discover", { query: "Dashboard fetchProjects navigation", public_refs: ["task.md"] }, undefined, undefined, { cwd: root });
    await tools.get("skills_load")!.execute("load", { id: "lorelum" });
    const response = await tools.get("lorelum_query")!.execute("query", { query: "Dashboard fetchProjects navigation", public_refs: ["task.md"] }, undefined, undefined, { cwd: root });
    const serialized = JSON.stringify(response);
    expect(serialized).toContain("behavior_constraint");
    expect(serialized).not.toContain("private/practices");
    expect(serialized).not.toContain("# React");
    const audit = await readFile(auditPath, "utf8");
    for (const event of ["skill_discovered", "skill_loaded", "practice_query_issued", "practice_query_resolved"]) expect(audit).toContain(`"event":"${event}"`);
    expect(audit).not.toContain(practicePath);
  } finally {
    restore();
    await rm(root, { recursive: true, force: true });
  }
});

test("rejects unanchored guidance discovery without recording a discovery event", async () => {
  const { root, practicePath, auditPath } = await fixture();
  const restore = configureEnvironment(practicePath, auditPath);
  try {
    const { tools, pi } = fakePi();
    lorelumExtension(pi);
    await expect(tools.get("skills_list")!.execute("discover", { query: "policy PX-47", public_refs: ["task.md"] }, undefined, undefined, { cwd: root })).rejects.toThrow("already read");
    const audit = await readFile(auditPath, "utf8");
    expect(audit).toContain("skill_discovery_rejected");
    expect(audit).not.toContain('"event":"skill_discovered"');
  } finally {
    restore();
    await rm(root, { recursive: true, force: true });
  }
});

test("does not fabricate discovery or query events", async () => {
  const { root, practicePath, auditPath } = await fixture();
  const restore = configureEnvironment(practicePath, auditPath);
  try {
    const { handlers, pi } = fakePi();
    lorelumExtension(pi);
    await invoke(handlers, "tool_execution_start", { toolName: "read", toolCallId: "read-1", args: { path: "task.md" } }, root);
    await invoke(handlers, "tool_execution_end", { toolName: "read", toolCallId: "read-1", isError: false }, root);
    const audit = await readFile(auditPath, "utf8");
    expect(audit).toContain("public_input_read");
    expect(audit).not.toContain("skill_discovered");
    expect(audit).not.toContain("practice_query");
  } finally {
    restore();
    await rm(root, { recursive: true, force: true });
  }
});
