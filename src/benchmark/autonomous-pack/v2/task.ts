import Ajv2020 from "ajv/dist/2020";
import { lstat, readFile, realpath } from "node:fs/promises";
import { isAbsolute, join, resolve } from "node:path";
import { sha256File } from "../../fs";
import { hashContract } from "../v1/plan";
import { sha256SnapshotDirectory } from "../v1/snapshot";

export type CodingTask = {
  schema_version: "coding-task/v1";
  id: string;
  lifecycle_stage: "candidate";
  public: { task: "public/task.md"; starter: "public/starter" };
  environment: { runtime: string };
  verifier: { root: "private/evaluator"; contract: "private/evaluator/contract.json" };
  calibration: { root: "private/calibration" };
};

export type ResolvedCodingTask = {
  declaration: CodingTask;
  root: string;
  publicRoot: string;
  evaluatorRoot: string;
  calibrationRoot: string;
  identities: {
    declaration_sha256: string;
    task_sha256: string;
    starter_sha256: string;
    input_sha256: string;
    evaluator_sha256: string;
    calibration_sha256: string;
  };
};

const schema = JSON.parse(await readFile(new URL("../../../../schemas/coding-task-v1.schema.json", import.meta.url), "utf8"));
const validate = new Ajv2020({ allErrors: true, strict: true }).compile(schema);

export function parseCodingTask(raw: string): CodingTask {
  if (Buffer.byteLength(raw) > 64 * 1024) throw new Error("Task declaration is too large");
  const value: unknown = Bun.YAML.parse(raw);
  if (!validate(value)) throw new Error(`Invalid coding task declaration: ${JSON.stringify(validate.errors)}`);
  return value as CodingTask;
}

async function requireKind(path: string, kind: "file" | "directory"): Promise<void> {
  const stat = await lstat(path);
  if (stat.isSymbolicLink() || (kind === "file" ? !stat.isFile() : !stat.isDirectory())) {
    throw new Error(`Task ${kind} is missing or is a link`);
  }
}

/** Resolve fixed public/private paths and identify their actual bytes, never
 * materializing private content into the public workspace. Image and runner
 * identities are fixed separately by the experiment plan. */
export async function inspectCodingTask(candidatePath: string): Promise<ResolvedCodingTask> {
  if (!isAbsolute(candidatePath)) throw new Error("Task path must be absolute");
  const root = resolve(candidatePath);
  await requireKind(root, "directory");
  const canonical = await realpath(root);
  for (const segment of ["public", "private", "public/starter", "private/evaluator", "private/calibration"]) {
    await requireKind(join(canonical, segment), "directory");
  }
  for (const segment of ["private/candidate.yaml", "public/task.md", "private/evaluator/contract.json"]) {
    await requireKind(join(canonical, segment), "file");
  }
  const manifestPath = join(canonical, "private/candidate.yaml");
  const declaration = parseCodingTask(await readFile(manifestPath, "utf8"));
  const [declarationSha, taskSha, starterSha, evaluatorSha, calibrationSha] = await Promise.all([
    sha256File(manifestPath), sha256File(join(canonical, declaration.public.task)),
    sha256SnapshotDirectory(join(canonical, declaration.public.starter)),
    sha256SnapshotDirectory(join(canonical, declaration.verifier.root)),
    sha256SnapshotDirectory(join(canonical, declaration.calibration.root)),
  ]);
  return {
    declaration, root: canonical, publicRoot: join(canonical, "public"),
    evaluatorRoot: join(canonical, declaration.verifier.root),
    calibrationRoot: join(canonical, declaration.calibration.root),
    identities: {
      declaration_sha256: declarationSha, task_sha256: taskSha, starter_sha256: starterSha,
      input_sha256: hashContract({ task_sha256: taskSha, starter_sha256: starterSha }),
      evaluator_sha256: evaluatorSha, calibration_sha256: calibrationSha,
    },
  };
}
