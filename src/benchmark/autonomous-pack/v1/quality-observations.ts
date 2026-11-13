import { readFile, realpath, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { sha256File } from "../../fs";
import { collectBlindReview } from "./blind-review";
import { sha256SnapshotDirectory } from "./snapshot";
import { assertObservation, type AutonomousObservation } from "./summary";

/** Attach human-only quality evidence to the exact evaluated workspace. The
 * evidence file is private; it must not be mounted in an agent workspace. */
export async function applyBlindReview(value: unknown, packetDirectory: string, review: unknown, evidenceFile: string): Promise<AutonomousObservation> {
  assertObservation(value);
  if (value.health !== "evaluated" || value.artifacts.some(artifact => artifact.kind === "quality-review")) throw new Error("Observation cannot receive a quality review");
  const identities = value.artifacts.filter(artifact => artifact.kind === "workspace-identity");
  if (identities.length !== 1) throw new Error("Missing workspace identity");
  const identityPath = fileURLToPath(identities[0].uri);
  if (await sha256File(identityPath) !== identities[0].sha256) throw new Error("Workspace identity artifact changed");
  const identity: unknown = JSON.parse(await readFile(identityPath, "utf8"));
  if (!identity || typeof identity !== "object" || Array.isArray(identity)) throw new Error("Invalid workspace identity");
  const data = identity as Record<string, unknown>;
  if (data.algorithm !== "autonomous-pack-tree/v1" || typeof data.uri !== "string" || typeof data.sha256 !== "string" || !/^[a-f0-9]{64}$/.test(data.sha256)) throw new Error("Invalid workspace identity");
  const workspace = await realpath(fileURLToPath(data.uri));
  if (await sha256SnapshotDirectory(workspace) !== data.sha256) throw new Error("Workspace changed after evaluation");
  const parent = await realpath(dirname(resolve(evidenceFile)));
  const target = joinTarget(parent, resolve(evidenceFile));
  const reviewerDirectory = await realpath(resolve(packetDirectory, "review"));
  const isInside = (parentPath: string) => {
    const nested = relative(parentPath, target);
    return nested === "" || (nested !== ".." && !nested.startsWith(`..${sep}`) && !isAbsolute(nested));
  };
  if (isInside(workspace) || isInside(reviewerDirectory)) throw new Error("Quality evidence must stay outside the agent workspace and reviewer packet");
  const assessment = await collectBlindReview(packetDirectory, review);
  if (assessment.id !== `${value.plan_sha256}:${value.ordinal}` || assessment.workspaceSha256 !== data.sha256) throw new Error("Blind review belongs to another observation or workspace");
  await writeFile(target, JSON.stringify({ plan_sha256: value.plan_sha256, ordinal: value.ordinal, review, evidence: assessment.evidence }, null, 2) + "\n", { flag: "wx", mode: 0o600 });
  const result: AutonomousObservation = { ...value, quality: assessment.quality, quality_probes: assessment.quality_probes, artifacts: [...value.artifacts, { kind: "quality-review", uri: pathToFileURL(target).href, sha256: await sha256File(target) }] };
  assertObservation(result);
  return result;
}

function joinTarget(parent: string, path: string): string {
  const name = relative(dirname(path), path);
  if (!name || name.includes(sep) || name === "." || name === "..") throw new Error("Invalid evidence path");
  return resolve(parent, name);
}
