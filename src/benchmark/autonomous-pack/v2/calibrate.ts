import Ajv2020 from "ajv/dist/2020";
import { lstat, mkdir, readFile, realpath, writeFile } from "node:fs/promises";
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { sha256SnapshotDirectory } from "../v1/snapshot";
import { evaluateSemantic } from "./evaluator";
import { inspectCodingTask } from "./task";

type Calibration = { schema_version: "coding-calibration/v1"; workspaces: { path: string; expected_semantic: "pass" | "fail" | "not-run"; purpose: string }[] };
const schema = JSON.parse(await readFile(new URL("../../../../schemas/coding-calibration-v1.schema.json", import.meta.url), "utf8"));
const validate = new Ajv2020({ allErrors: true, strict: true }).compile(schema);
const inside = (a: string, b: string) => { const r = relative(a, b); return r === "" || (r !== ".." && !r.startsWith(`..${sep}`) && !isAbsolute(r)); };

/** Evaluate declared calibration workspaces using the same isolated verifier
 * as a pilot. This optional author diagnostic never runs an Agent or model. */
export async function calibrateTask(taskPath: string, imageId: string, outputPath: string) {
  const task = await inspectCodingTask(taskPath);
  if (!/^sha256:[a-f0-9]{64}$/.test(imageId) || !isAbsolute(outputPath)) throw new Error("Invalid calibration image or output");
  const manifestPath = join(task.calibrationRoot, "expectations.json");
  const stat = await lstat(manifestPath);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 64_000) throw new Error("Invalid calibration manifest");
  const raw: unknown = JSON.parse(await readFile(manifestPath, "utf8"));
  if (!validate(raw)) throw new Error("Invalid calibration manifest");
  const manifest = raw as Calibration;
  if (new Set(manifest.workspaces.map(item => item.path)).size !== manifest.workspaces.length) throw new Error("Duplicate calibration workspace");
  const root = join(await realpath(dirname(resolve(outputPath))), basename(resolve(outputPath)));
  if (inside(task.root, root) || inside(root, task.root)) throw new Error("Calibration output overlaps task");
  await mkdir(root, { mode: 0o700 });
  const results = [];
  for (const [index, item] of manifest.workspaces.entries()) {
    const workspace = join(task.calibrationRoot, item.path);
    const outcome = await evaluateSemantic({ workspace, evaluatorRoot: task.evaluatorRoot, evaluatorSha256: task.identities.evaluator_sha256, imageId, outputDirectory: join(root, String(index)) });
    const matches = outcome.semantic === item.expected_semantic && (item.expected_semantic === "not-run" ? outcome.health !== "evaluated" : outcome.health === "evaluated");
    results.push({ workspace: item.path, expected: item.expected_semantic, observed: outcome.semantic, health: outcome.health, matches });
  }
  if (await sha256SnapshotDirectory(task.calibrationRoot) !== task.identities.calibration_sha256) throw new Error("Calibration changed during execution");
  const summary = { schema_version: "coding-calibration-result/v1", task_id: task.declaration.id, evaluator_sha256: task.identities.evaluator_sha256, calibration_sha256: task.identities.calibration_sha256, image_id: imageId, passed: results.every(item => item.matches), results };
  await writeFile(join(root, "summary.json"), JSON.stringify(summary, null, 2) + "\n", { flag: "wx", mode: 0o600 });
  return summary;
}
