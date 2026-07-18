import { basename } from "node:path";
import { sha256File } from "../../../fs";

export type CommandResult = { exitCode: number; stdout: string; stderr: string };
export type CommandRunner = (args: string[]) => Promise<CommandResult>;

type S3Location = { bucket: string; prefix: string };

function fail(message: string): never {
  throw new Error(message);
}

function checksumBase64(sha256: string): string {
  if (!/^[a-f0-9]{64}$/.test(sha256)) fail("Artifact SHA-256 must be lowercase hexadecimal");
  const bytes = new Uint8Array(sha256.match(/../g)!.map((part) => Number.parseInt(part, 16)));
  return btoa(String.fromCharCode(...bytes));
}

export function parseS3Uri(uri: string): S3Location {
  const match = /^s3:\/\/([a-z0-9][a-z0-9.-]{1,61}[a-z0-9])(?:\/(.*))?$/.exec(uri);
  if (!match) fail(`Artifact storage URI must be an S3 URI: ${uri}`);
  return { bucket: match[1], prefix: (match[2] ?? "").replace(/^\/+|\/+$/g, "") };
}

async function runAws(args: string[]): Promise<CommandResult> {
  const child = Bun.spawn(["aws", ...args], { stdout: "pipe", stderr: "pipe" });
  return {
    exitCode: await child.exited,
    stdout: await new Response(child.stdout).text(),
    stderr: await new Response(child.stderr).text()
  };
}

function parseJson(output: string, label: string): Record<string, unknown> {
  try {
    const value = JSON.parse(output) as unknown;
    if (!value || typeof value !== "object" || Array.isArray(value)) fail(`${label} did not return a JSON object`);
    return value as Record<string, unknown>;
  } catch (error) {
    fail(`${label} did not return valid JSON: ${error instanceof Error ? error.message : String(error)}`);
  }
}

export async function uploadImmutableS3Artifact(path: string, storageUri: string, runId: string, runner: CommandRunner = runAws): Promise<{ uri: string; sha256: string }> {
  const { bucket, prefix } = parseS3Uri(storageUri);
  const sha256 = await sha256File(path);
  const key = [prefix, runId, basename(path)].filter(Boolean).join("/");
  const checksum = checksumBase64(sha256);
  const put = await runner(["s3api", "put-object", "--bucket", bucket, "--key", key, "--body", path, "--checksum-algorithm", "SHA256", "--checksum-sha256", checksum, "--output", "json"]);
  if (put.exitCode !== 0) fail(`S3 artifact upload failed for ${path}: ${put.stderr.trim() || put.stdout.trim()}`);
  const upload = parseJson(put.stdout, "S3 artifact upload");
  if (typeof upload.VersionId !== "string" || upload.VersionId.length === 0) fail(`S3 artifact upload did not return a version ID: ${path}`);

  const head = await runner(["s3api", "head-object", "--bucket", bucket, "--key", key, "--version-id", upload.VersionId, "--checksum-mode", "ENABLED", "--output", "json"]);
  if (head.exitCode !== 0) fail(`S3 artifact verification failed for ${path}: ${head.stderr.trim() || head.stdout.trim()}`);
  const verified = parseJson(head.stdout, "S3 artifact verification");
  if (verified.VersionId !== upload.VersionId) fail(`S3 artifact version verification failed for ${path}`);
  if (typeof verified.ObjectLockMode !== "string" || typeof verified.ObjectLockRetainUntilDate !== "string") fail(`S3 artifact is not protected by Object Lock: ${path}`);
  if (verified.ChecksumSHA256 !== checksum) fail(`S3 artifact checksum verification failed for ${path}`);
  return { uri: `s3://${bucket}/${key}?versionId=${encodeURIComponent(upload.VersionId)}`, sha256 };
}
