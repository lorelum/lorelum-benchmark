import { expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseS3Uri, uploadImmutableS3Artifact, type CommandRunner } from "./s3";

test("parses a versioned S3 storage prefix", () => {
  expect(parseS3Uri("s3://benchmark-artifacts/runs/formal")).toEqual({ bucket: "benchmark-artifacts", prefix: "runs/formal" });
  expect(() => parseS3Uri("protected://runs")).toThrow("Artifact storage URI must be an S3 URI");
});

test("uploads and verifies an Object Lock protected artifact", async () => {
  const directory = await mkdtemp(join(tmpdir(), "lorelum-s3-test-"));
  const artifactPath = join(directory, "artifact.log");
  await Bun.write(artifactPath, "artifact payload\n");
  const commands: string[][] = [];
  const runner: CommandRunner = async (args) => {
    commands.push(args);
    if (args[1] === "put-object") return { exitCode: 0, stdout: JSON.stringify({ VersionId: "version-123" }), stderr: "" };
    return {
      exitCode: 0,
      stdout: JSON.stringify({
        VersionId: "version-123",
        ObjectLockMode: "COMPLIANCE",
        ObjectLockRetainUntilDate: "2030-01-01T00:00:00Z",
        ChecksumSHA256: "tM0ZSAo2T3WRkz65OnBy+TfhHm3vOrIfyFqhdbAHDgg="
      }),
      stderr: ""
    };
  };

  try {
    const uploaded = await uploadImmutableS3Artifact(artifactPath, "s3://benchmark-artifacts/runs", "smoke-001", runner);
    expect(uploaded.uri).toBe("s3://benchmark-artifacts/runs/smoke-001/artifact.log?versionId=version-123");
    expect(uploaded.sha256).toBe("b4cd19480a364f7591933eb93a7072f937e11e6def3ab21fc85aa175b0070e08");
    expect(commands).toHaveLength(2);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("rejects an artifact without Object Lock", async () => {
  const directory = await mkdtemp(join(tmpdir(), "lorelum-s3-test-"));
  const artifactPath = join(directory, "artifact.log");
  await Bun.write(artifactPath, "artifact payload\n");
  const runner: CommandRunner = async (args) => args[1] === "put-object"
    ? { exitCode: 0, stdout: JSON.stringify({ VersionId: "version-123" }), stderr: "" }
    : { exitCode: 0, stdout: JSON.stringify({ VersionId: "version-123" }), stderr: "" };

  try {
    await expect(uploadImmutableS3Artifact(artifactPath, "s3://benchmark-artifacts/runs", "smoke-001", runner)).rejects.toThrow("Object Lock");
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
