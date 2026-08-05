import { expect, test } from "bun:test";
import { cp, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { redactedInjectionTrace, resolveInjectionCalibration, resolvePracticePayload } from "./runtime";

const fixturePath = join(import.meta.dir, "..", "..", "..", "fixtures", "neutral");

async function withFixture(mutator: (path: string) => Promise<void>): Promise<string> {
  const path = await mkdtemp(join(tmpdir(), "lorelum-injection-v2-"));
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

const projectConventionMetadata = `delivery_template: project-convention/v1
length_metric: project-convention/v1:utf8-rendered-characters
cards:
  - id: neutral.command-boundary
    version: v1
    path: oracle.command-boundary.v1.md
    rendered_characters: 127
    target_path: docs/frontend-guide.md
  - id: neutral.avatar-fallback
    version: v1
    path: irrelevant.avatar-fallback.v1.md
    rendered_characters: 119
    target_path: docs/frontend-guide.md
comparison:
  maximum_relative_difference: 0.10
  actual_relative_difference: 0.062992
  independently_reviewed: true
`;

test("v2 resolves project-convention payloads with a workspace target path", async () => {
  const path = await withFixture(async (candidate) => {
    await Bun.write(join(candidate, "private", "practices", "metadata.yaml"), projectConventionMetadata);
  });
  try {
    const profile = await resolveInjectionCalibration(path);
    const baseline = await resolvePracticePayload(path, profile, "baseline");
    const oracle = await resolvePracticePayload(path, profile, "oracle-practice");
    const irrelevant = await resolvePracticePayload(path, profile, "irrelevant-practice");
    const trace = redactedInjectionTrace(profile, oracle);

    expect(profile.calibration).toMatchObject({ length_metric: "project-convention/v1:utf8-rendered-characters", maximum_relative_difference: 0.1 });
    expect(baseline.practice).toBeUndefined();
    expect(oracle.practice).toMatchObject({ id: "neutral.command-boundary", version: "v1", delivery_template: "project-convention/v1", target_path: "docs/frontend-guide.md" });
    expect(oracle.practice?.text).toContain("Keep user interface state separate");
    expect(irrelevant.practice).toMatchObject({ id: "neutral.avatar-fallback", version: "v1", delivery_template: "project-convention/v1", target_path: "docs/frontend-guide.md" });
    expect(irrelevant.practice?.text).toContain("Provide a deterministic avatar fallback");
    expect(irrelevant.practice?.text).not.toContain("Keep user interface state separate");
    const serializedProfile = JSON.stringify(profile);
    expect(serializedProfile).not.toContain("Keep user interface state separate");
    expect(serializedProfile).not.toContain("private/practices");
    expect(JSON.stringify(trace)).not.toContain("Keep user interface state separate");
  } finally {
    await rm(path, { force: true, recursive: true });
  }
});

test("v2 rejects project-convention metadata without a valid target_path", async () => {
  const cases: Array<{ label: string; from: string; to: string; expected: string }> = [
    { label: "missing target_path", from: "    target_path: docs/frontend-guide.md\n", to: "", expected: "target_path is required" },
    { label: "escaping target_path", from: "    target_path: docs/frontend-guide.md", to: "    target_path: ../outside.md", expected: "must be normalized" },
    { label: "absolute target_path", from: "    target_path: docs/frontend-guide.md", to: "    target_path: /etc/guide.md", expected: "must be relative" },
    { label: "non-markdown target_path", from: "    target_path: docs/frontend-guide.md", to: "    target_path: docs/guide.txt", expected: "must end with .md" },
    { label: "wrong length_metric", from: "length_metric: project-convention/v1:utf8-rendered-characters", to: "length_metric: practice-card/v1:utf8-rendered-characters", expected: "length_metric must be" },
  ];
  for (const entry of cases) {
    const path = await withFixture(async (candidate) => {
      await Bun.write(join(candidate, "private", "practices", "metadata.yaml"), projectConventionMetadata);
      await replace(join(candidate, "private", "practices", "metadata.yaml"), entry.from, entry.to);
    });
    try {
      await expect(resolveInjectionCalibration(path)).rejects.toThrow(entry.expected);
    } finally {
      await rm(path, { force: true, recursive: true });
    }
  }
});

test("v2 still validates hashes and rendered-character measurements", async () => {
  const hashPath = await withFixture(async (candidate) => {
    await Bun.write(join(candidate, "private", "practices", "metadata.yaml"), projectConventionMetadata);
    await replace(join(candidate, "private", "conditions.yaml"), "01070f9c26aca534fbcca15dc02e407a667a067f2e88f7376b7b06425af3c204", "ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff");
  });
  const stalePath = await withFixture(async (candidate) => {
    await Bun.write(join(candidate, "private", "practices", "metadata.yaml"), projectConventionMetadata);
    const cardPath = join(candidate, "private", "practices", "oracle.command-boundary.v1.md");
    await Bun.write(cardPath, `${await Bun.file(cardPath).text()}Additional declared content.\n`);
    await replace(join(candidate, "private", "conditions.yaml"), "01070f9c26aca534fbcca15dc02e407a667a067f2e88f7376b7b06425af3c204", await sha256(cardPath));
  });
  try {
    await expect(resolveInjectionCalibration(hashPath)).rejects.toThrow("Practice hash does not match");
    await expect(resolveInjectionCalibration(stalePath)).rejects.toThrow("metadata rendered_characters disagrees");
  } finally {
    await rm(hashPath, { force: true, recursive: true });
    await rm(stalePath, { force: true, recursive: true });
  }
});
