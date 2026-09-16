import { expect, test } from "bun:test";
import { cp, mkdir, mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { workspaceRoot } from "../../../fs";
import { createAuditSidecar, deliverPreparedPractice, loadPackPracticeTreatment, parseLoreGetResponse, parseLoreQueryResponse, publicTraceHasPrivateMaterial } from "./contract";
import { timingNodes } from "./types";

const treatmentRoot = join(workspaceRoot, "treatments", "agentic-coding-replan-on-material-drift", "v1");

async function copyTreatment(): Promise<string> {
  const tempRoot = await mkdtemp(join(Bun.env.TEMP ?? workspaceRoot, "pack-practice-treatment-"));
  const root = join(tempRoot, "agentic-coding-replan-on-material-drift", "v1");
  await mkdir(root, { recursive: true });
  await cp(treatmentRoot, root, { recursive: true });
  return root;
}

test("loads the fixed agentic-coding v0.4.0 treatment and verifies all identities", async () => {
  const prepared = await loadPackPracticeTreatment(treatmentRoot);
  expect(prepared.manifest.pack.ref).toBe("agentic-coding-v0.4.0");
  expect(prepared.manifest.pack.commit).toBe("df89b8d432a01c53361a0e23df6896a772942b09");
  expect(prepared.payload.practice_id).toBe("agentic-coding.implementation.replan-on-material-drift");
  expect(prepared.payload.content_digest).toBe("8913dc851d1b51e5610010b8ea9804b47c31109b8514620187f54e00ca7eb3f9");
  expect(prepared.payload.card_sha256).toBe("4a8de5d1546bfd7ed074b8f40e06ad142c4cb79ebdc90781f4b5c87b1bf03b97");
  expect(prepared.applicability.changed_dimensions).toEqual({ scope: true, risk: true, verification: true });
});

test("delivers the same card at all three timing nodes and redacts public traces", async () => {
  const prepared = await loadPackPracticeTreatment(treatmentRoot);
  const deliveries = timingNodes.map((node) => deliverPreparedPractice(prepared, { condition_id: "p1-practice", node, declared: true }));
  expect(deliveries.every((delivery) => delivery.trace.status === "delivered")).toBe(true);
  expect(new Set(deliveries.map((delivery) => delivery.payload?.card_sha256)).size).toBe(1);
  expect(new Set(deliveries.map((delivery) => delivery.payload?.text)).size).toBe(1);
  expect(deliveries.every((delivery) => !publicTraceHasPrivateMaterial(delivery.trace))).toBe(true);
  expect(deliveries.every((delivery) => !Object.hasOwn(delivery.trace, "practice_id"))).toBe(true);
  expect(deliveries.every((delivery) => !Object.hasOwn(delivery.trace, "card_sha256"))).toBe(true);
  expect(deliveries.every((delivery) => !JSON.stringify(delivery.trace).includes(prepared.payload.practice_id))).toBe(true);
  expect(deliveries.every((delivery) => !JSON.stringify(delivery.trace).includes(prepared.payload.card_sha256))).toBe(true);

  const audit = createAuditSidecar(prepared, deliveries);
  expect(audit.identity_consistent).toBe(true);
  expect(audit.provenance.commit).toBe("df89b8d432a01c53361a0e23df6896a772942b09");
  expect(audit.deliveries.every((delivery) => delivery.practice_id === prepared.payload.practice_id && delivery.card_sha256 === prepared.payload.card_sha256)).toBe(true);
  expect(JSON.stringify(audit)).not.toContain(prepared.payload.text);
  const partialAudit = createAuditSidecar(prepared, deliveries.slice(0, 2));
  expect(partialAudit.identity_consistent).toBe(false);
});

test("baseline and undeclared conditions receive no Practice payload", async () => {
  const prepared = await loadPackPracticeTreatment(treatmentRoot);
  const delivery = deliverPreparedPractice(prepared, { condition_id: "baseline", node: "task_start", declared: false });
  expect(delivery.payload).toBeUndefined();
  expect(delivery.trace.status).toBe("not-declared");
  expect(Object.hasOwn(delivery.trace, "practice_id")).toBe(false);
});

test("fails closed when the private card is modified", async () => {
  const root = await copyTreatment();
  try {
    await Bun.write(join(root, "private", "practice.md"), "tampered\n");
    await expect(loadPackPracticeTreatment(root)).rejects.toThrow(/card hash/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("fails closed when Pack provenance drifts", async () => {
  const root = await copyTreatment();
  try {
    const path = join(root, "treatment.yaml");
    const text = await Bun.file(path).text();
    await Bun.write(path, text.replace("agentic-coding-v0.4.0", "agentic-coding-v0.3.0"));
    await expect(loadPackPracticeTreatment(root)).rejects.toThrow(/agentic-coding-v0.4.0/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("rejects a manifest id or version that is not bound to its treatment path", async () => {
  const root = await copyTreatment();
  try {
    const path = join(root, "treatment.yaml");
    const text = await Bun.file(path).text();
    await Bun.write(path, text.replace("id: agentic-coding-replan-on-material-drift", "id: ../../private-leak"));
    await expect(loadPackPracticeTreatment(root)).rejects.toThrow(/treatment id/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("does not mark mixed-condition deliveries as identity consistent", async () => {
  const prepared = await loadPackPracticeTreatment(treatmentRoot);
  const deliveries = timingNodes.map((node, index) => deliverPreparedPractice(prepared, { condition_id: index === 0 ? "p1-practice" : "other-condition", node, declared: true }));
  const audit = createAuditSidecar(prepared, deliveries);
  expect(audit.identity_consistent).toBe(false);
});

test("requires the exact timing node set for identity consistency", async () => {
  const prepared = await loadPackPracticeTreatment(treatmentRoot);
  const first = deliverPreparedPractice(prepared, { condition_id: "p1-practice", node: "task_start", declared: true });
  const second = deliverPreparedPractice(prepared, { condition_id: "p1-practice", node: "task_start", declared: true });
  const third = deliverPreparedPractice(prepared, { condition_id: "p1-practice", node: "first_implementation_checkpoint", declared: true });
  expect(createAuditSidecar(prepared, [first, second, third]).identity_consistent).toBe(false);
});


test("returns explicit failure or unsupported status without moving delivery", async () => {
  const prepared = await loadPackPracticeTreatment(treatmentRoot);
  const missing = deliverPreparedPractice(undefined, { condition_id: "p1-practice", node: "constraint_followup", declared: true });
  expect(missing.trace.status).toBe("failed");
  const unsupported = deliverPreparedPractice(prepared, { condition_id: "p1-practice", node: "first_implementation_checkpoint", declared: true, supported: false });
  expect(unsupported.trace.status).toBe("unsupported");
  expect(unsupported.payload).toBeUndefined();
});

test("fails closed for a tampered prepared payload", async () => {
  const prepared = await loadPackPracticeTreatment(treatmentRoot);
  const tampered = { ...prepared, payload: { ...prepared.payload, text: "tampered\n" } };
  const delivery = deliverPreparedPractice(tampered, { condition_id: "p1-practice", node: "task_start", declared: true });
  expect(delivery.trace.status).toBe("failed");
  expect(delivery.payload).toBeUndefined();
});

test("rejects an applicability basis hash drift", async () => {
  const root = await copyTreatment();
  try {
    const path = join(root, "private", "applicability.yaml");
    await Bun.write(path, `${await Bun.file(path).text()}\n`);
    await expect(loadPackPracticeTreatment(root)).rejects.toThrow(/applicability basis hash/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("rejects malformed Lore query and get entries instead of filtering them", async () => {
  const prepared = await loadPackPracticeTreatment(treatmentRoot);
  const result = prepared.selection.query.results[0];
  expect(() => parseLoreQueryResponse({ mode: "semantic", results: [result, null] })).toThrow(/query result 1/);
  expect(() => parseLoreQueryResponse({ mode: "semantic", results: [{ ...result, techStack: ["agentic-coding", 7] }] })).toThrow(/techStack/);

  const practice = {
    id: prepared.payload.practice_id,
    title: "Replan When New Facts Change the Work",
    stage: "implementation",
    tech_stack: ["agentic-coding"],
    applies_when: prepared.applicability.applies_when,
    severity: "warn",
    body: prepared.payload.text
  };
  const source = { packName: "agentic-coding", sourcePath: prepared.manifest.practice.source_path };
  expect(() => parseLoreGetResponse({ practice, contentDigest: prepared.payload.content_digest, sources: [source, null] })).toThrow(/get source 1/);
  expect(() => parseLoreGetResponse({ practice: { ...practice, tech_stack: ["agentic-coding", 7] }, contentDigest: prepared.payload.content_digest, sources: [source] })).toThrow(/tech_stack/);
});

test("verifies the recorded selection rank against the query result position", async () => {
  const root = await copyTreatment();
  try {
    const path = join(root, "private", "selection.json");
    const text = await Bun.file(path).text();
    await Bun.write(path, text.replace('"selected_rank": 1', '"selected_rank": 99'));
    await expect(loadPackPracticeTreatment(root)).rejects.toThrow(/selected_rank/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});