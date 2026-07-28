import { expect, test } from "bun:test";
import { cp, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { isolate, materialize, registerMaterializer } from "../../../core/v1/core";
import { materializeReactVite, reactViteKind } from "../../../materializers";
import { listFiles } from "../../../../fs";
import { redactedInjectionTrace, resolveInjectionCalibration, resolvePracticePayload } from "./runtime";

const fixturePath = join(import.meta.dir, "..", "..", "..", "fixtures", "neutral");

registerMaterializer({ kind: reactViteKind, materialize: materializeReactVite });

async function withFixture(mutator: (path: string) => Promise<void>): Promise<string> {
  const path = await mkdtemp(join(tmpdir(), "lorelum-injection-profile-"));
  await cp(fixturePath, path, { recursive: true });
  await mutator(path);
  return path;
}

async function replace(path: string, from: string, to: string): Promise<void> {
  const text = await Bun.file(path).text();
  await Bun.write(path, text.replace(from, to));
}

async function sha256(path: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", await Bun.file(path).arrayBuffer());
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

test("resolves validated Practice cards as memory-only condition payloads", async () => {
  const profile = await resolveInjectionCalibration(fixturePath);
  const baseline = await resolvePracticePayload(fixturePath, profile, "baseline");
  const oracle = await resolvePracticePayload(fixturePath, profile, "oracle-practice");
  const trace = redactedInjectionTrace(profile, oracle);

  const serializedProfile = JSON.stringify(profile);
  expect(serializedProfile).not.toContain("Keep user interface state separate");
  expect(serializedProfile).not.toContain("Provide a deterministic avatar fallback");
  expect(serializedProfile).not.toContain("private/practices");
  expect(baseline.practice).toBeUndefined();
  expect(baseline.channel).toBe("none");
  expect(oracle.practice).toMatchObject({ id: "neutral.command-boundary", version: "v1" });
  expect(oracle.practice?.text).toContain("Keep user interface state separate");
  expect(profile.calibration).toMatchObject({ length_metric: "practice-card/v1:utf8-rendered-characters", maximum_relative_difference: 0.1, independently_reviewed: true });
  expect(profile.decision_rule).toMatchObject({ metric: "joint-pass-count", oracle_relation: "strictly-greater-than-each-control" });
  expect(trace).toMatchObject({ condition_id: "oracle-practice", channel: "condition-scoped-private-runtime", practice_id: "neutral.command-boundary", practice_version: "v1" });
  const serializedTrace = JSON.stringify(trace);
  expect(serializedTrace).not.toContain("Keep user interface state separate");
  expect(serializedTrace).not.toContain("private/practices");
  expect(JSON.stringify(oracle)).not.toContain("Provide a deterministic avatar fallback");
});

test("rejects malformed, duplicate, path-escaping, hash-mismatched, and metadata-mismatched declarations", async () => {
  const cases: Array<{ label: string; file: string; from: string; to: string; expected: string }> = [
    { label: "duplicate condition", file: "private/conditions.yaml", from: "decision_rule:", to: "  - id: baseline\n    status: declared\n    practice: none\ndecision_rule:", expected: "condition is duplicated" },
    { label: "escaping path", file: "private/conditions.yaml", from: "private/practices/oracle.command-boundary.v1.md", to: "../../public/task.md", expected: "Practice path must start" },
    { label: "hash mismatch", file: "private/conditions.yaml", from: "01070f9c26aca534fbcca15dc02e407a667a067f2e88f7376b7b06425af3c204", to: "ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff", expected: "Practice hash does not match" },
    { label: "metadata mismatch", file: "private/practices/metadata.yaml", from: "oracle.command-boundary.v1.md", to: "other-card.md", expected: "metadata must contain one card" },
  ];
  for (const entry of cases) {
    const path = await withFixture(async (candidate) => replace(join(candidate, entry.file), entry.from, entry.to));
    try {
      await expect(resolveInjectionCalibration(path)).rejects.toThrow(entry.expected);
    } finally {
      await rm(path, { force: true, recursive: true });
    }
  }
});

test("rejects invalid control arithmetic and decision-rule declarations", async () => {
  const lengthPath = await withFixture(async (candidate) => replace(join(candidate, "private", "practices", "metadata.yaml"), "actual_relative_difference: 0.062992", "actual_relative_difference: 0.5"));
  const rulePath = await withFixture(async (candidate) => replace(join(candidate, "private", "conditions.yaml"), "joint-pass-count", "semantic-pass-count"));
  const staleMeasurementPath = await withFixture(async (candidate) => {
    const cardPath = join(candidate, "private", "practices", "oracle.command-boundary.v1.md");
    await Bun.write(cardPath, `${await Bun.file(cardPath).text()}Additional declared content.\n`);
    await replace(join(candidate, "private", "conditions.yaml"), "01070f9c26aca534fbcca15dc02e407a667a067f2e88f7376b7b06425af3c204", await sha256(cardPath));
  });
  try {
    await expect(resolveInjectionCalibration(lengthPath)).rejects.toThrow("actual_relative_difference disagrees");
    await expect(resolveInjectionCalibration(rulePath)).rejects.toThrow("decision_rule must declare");
    await expect(resolveInjectionCalibration(staleMeasurementPath)).rejects.toThrow("metadata rendered_characters disagrees");
  } finally {
    await rm(lengthPath, { force: true, recursive: true });
    await rm(rulePath, { force: true, recursive: true });
    await rm(staleMeasurementPath, { force: true, recursive: true });
  }
});

test("materialized workspace and isolation audit never receive Practice cards", async () => {
  const output = await mkdtemp(join(tmpdir(), "lorelum-injection-workspace-"));
  try {
    await materialize({
      candidatePath: fixturePath,
      publicTaskPath: join(fixturePath, "public", "task.md"),
      publicStarterPath: join(fixturePath, "public", "starter"),
      outputPath: output,
      materializerKind: reactViteKind,
    });
    const files = await listFiles(join(output, "public"));
    expect(files.every((file) => !file.includes("practices"))).toBe(true);
    const workspaceText = await Promise.all(files.map((file) => Bun.file(join(output, "public", file)).text()));
    expect(workspaceText.join("\n")).not.toContain("Keep user interface state separate");
    const audit = await isolate({ workspacePath: join(output, "public"), privatePaths: [join(fixturePath, "private")] });
    expect(audit.passed).toBe(true);
  } finally {
    await rm(output, { force: true, recursive: true });
  }
});
