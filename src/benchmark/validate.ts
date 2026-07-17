import Ajv2020 from "ajv/dist/2020";
import type { ErrorObject, ValidateFunction } from "ajv";
import { directoryExists, joinPath, listDirectories, listFiles, pathExists, relativePath, workspaceRoot } from "./fs";

const failures: string[] = [];
const lifecycleStages = new Set(["candidate", "pilot", "frozen", "official", "published", "retired"]);
const ajv = new Ajv2020({ allErrors: true });
const schemaValidators = new Map<string, ValidateFunction>();

type DiscoveredTask = {
  document: Record<string, unknown>;
  manifestPath: string;
};

async function requirePath(path: string): Promise<void> {
  if (!(await pathExists(path))) failures.push(`Missing required path: ${relativePath(path)}`);
}

async function readYaml(path: string): Promise<Record<string, unknown> | null> {
  try {
    return Bun.YAML.parse(await Bun.file(path).text()) as Record<string, unknown>;
  } catch (error) {
    failures.push(`Invalid YAML in ${relativePath(path)}: ${error instanceof Error ? error.message : String(error)}`);
    return null;
  }
}

function addSchemaFailures(path: string, errors: ErrorObject[] | null | undefined): void {
  for (const error of errors ?? []) {
    const location = error.instancePath || "/";
    failures.push(`Schema violation in ${relativePath(path)} at ${location}: ${error.message ?? error.keyword}`);
  }
}

async function schemaValidator(schema: string): Promise<ValidateFunction | null> {
  const existing = schemaValidators.get(schema);
  if (existing) return existing;

  const schemaPath = joinPath(workspaceRoot, "schemas", schema);
  try {
    const validator = ajv.compile(JSON.parse(await Bun.file(schemaPath).text()));
    schemaValidators.set(schema, validator);
    return validator;
  } catch (error) {
    failures.push(`Invalid JSON Schema in ${relativePath(schemaPath)}: ${error instanceof Error ? error.message : String(error)}`);
    return null;
  }
}

async function validateYaml(path: string, schema: string): Promise<Record<string, unknown> | null> {
  const document = await readYaml(path);
  if (!document || typeof document !== "object") return null;
  const validator = await schemaValidator(schema);
  if (!validator) return null;
  if (!validator(document)) {
    addSchemaFailures(path, validator.errors);
    return null;
  }
  return document;
}

async function findNodeModules(path: string): Promise<void> {
  for (const file of await listFiles(path)) {
    if (file.split("/").includes("node_modules")) failures.push(`Installed dependency directory is not allowed: ${relativePath(joinPath(path, file))}`);
  }
}

async function findForbiddenPublicFiles(path: string): Promise<void> {
  for (const file of await listFiles(path)) {
    if (file === "oracle.yaml" || file.split("/").includes("evaluator")) {
      failures.push(`Private evaluation asset is exposed under public/: ${relativePath(joinPath(path, file))}`);
    }
  }
}

const suitesPath = joinPath(workspaceRoot, "suites");
for (const schema of ["suite.schema.json", "task-card.schema.json", "run-record.schema.json", "run-manifest.schema.json", "treatment.schema.json", "environment.schema.json", "artifact.schema.json", "report.schema.json", "coverage-manifest.schema.json"]) {
  await requirePath(joinPath(workspaceRoot, "schemas", schema));
}

for (const suite of await listDirectories(suitesPath)) {
  const suitePath = joinPath(suitesPath, suite);
  const suiteManifest = joinPath(suitePath, "suite.yaml");
  await requirePath(suiteManifest);
  const suiteDocument = await validateYaml(suiteManifest, "suite.schema.json");
  if (suiteDocument && !lifecycleStages.has(String(suiteDocument.lifecycle_stage))) {
    failures.push(`Invalid lifecycle_stage in ${relativePath(suiteManifest)}`);
  }

  const tasksPath = joinPath(suitePath, "tasks");
  await requirePath(tasksPath);
  const discovered = new Map<string, DiscoveredTask>();
  for (const taskSlug of await listDirectories(tasksPath)) {
    const taskSlugPath = joinPath(tasksPath, taskSlug);
    for (const revision of await listDirectories(taskSlugPath)) {
      if (!/^v[1-9][0-9]*$/.test(revision)) {
        failures.push(`Task revision must be v<number>: ${relativePath(joinPath(taskSlugPath, revision))}`);
        continue;
      }

      const taskPath = joinPath(taskSlugPath, revision);
      const publicPath = joinPath(taskPath, "public");
      const privatePath = joinPath(taskPath, "private");
      const taskCard = joinPath(publicPath, "task.yaml");
      for (const requiredPath of [joinPath(publicPath, "task.md"), joinPath(publicPath, "starter"), taskCard, joinPath(privatePath, "evaluator"), joinPath(privatePath, "oracle.yaml"), joinPath(privatePath, "snapshot.json")]) {
        await requirePath(requiredPath);
      }
      const taskDocument = await validateYaml(taskCard, "task-card.schema.json");
      if (taskDocument) {
        const expectedId = `${taskSlug}-${revision}`;
        if (taskDocument.id !== expectedId) failures.push(`Task id '${taskDocument.id}' must match ${expectedId} in ${relativePath(taskCard)}`);
        if (taskDocument.version !== Number(revision.slice(1))) failures.push(`Task version must match ${revision} in ${relativePath(taskCard)}`);
        if (!Number.isInteger(taskDocument.evaluator_version) || Number(taskDocument.evaluator_version) < 1) failures.push(`evaluator_version must be a positive integer in ${relativePath(taskCard)}`);
        if (!lifecycleStages.has(String(taskDocument.lifecycle_stage))) failures.push(`Invalid lifecycle_stage in ${relativePath(taskCard)}`);
        discovered.set(expectedId, { document: taskDocument, manifestPath: `tasks/${taskSlug}/${revision}` });
      }
      await findForbiddenPublicFiles(publicPath);
    }
  }

  if (suiteDocument && Array.isArray(suiteDocument.tasks)) {
    const declared = new Map<string, Record<string, unknown>>();
    for (const task of suiteDocument.tasks) {
      if (task && typeof task === "object" && typeof (task as Record<string, unknown>).id === "string") {
        const entry = task as Record<string, unknown>;
        const id = entry.id as string;
        if (declared.has(id)) failures.push(`Duplicate task id in suite manifest: ${suite}/${id}`);
        else declared.set(id, entry);
      }
    }
    for (const [id, task] of discovered) {
      const entry = declared.get(id);
      if (!entry) failures.push(`Task is missing from suite manifest: ${suite}/${id}`);
      else {
        if (entry.path !== task.manifestPath) failures.push(`Task path disagrees with suite manifest: ${suite}/${id}`);
        if (entry.lifecycle_stage !== task.document.lifecycle_stage) failures.push(`Task lifecycle_stage disagrees with suite manifest: ${suite}/${id}`);
      }
      if (task.document.track !== suiteDocument.track) failures.push(`Task track disagrees with suite manifest: ${suite}/${id}`);
      for (const condition of task.document.applicable_conditions as string[]) {
        if (!(suiteDocument.conditions as string[]).includes(condition)) {
          failures.push(`Task condition is not declared by suite: ${suite}/${id}/${condition}`);
        }
      }
    }
    for (const id of declared.keys()) if (!discovered.has(id)) failures.push(`Suite manifest references missing task: ${suite}/${id}`);

    const coverageManifest = joinPath(suitePath, "manifests", "coverage.yaml");
    const requiresCoverage = suiteDocument.track === "performance-skill-comparison";
    if (requiresCoverage) await requirePath(coverageManifest);
    if (await pathExists(coverageManifest)) {
      const coverageDocument = await validateYaml(coverageManifest, "coverage-manifest.schema.json");
      if (coverageDocument && Array.isArray(coverageDocument.covered_rules)) {
        const coveredRules = new Set<string>();
        for (const rule of coverageDocument.covered_rules as Record<string, unknown>[]) {
          const ruleId = rule.id as string;
          if (coveredRules.has(ruleId)) failures.push(`Duplicate coverage rule id: ${suite}/${ruleId}`);
          else coveredRules.add(ruleId);
          for (const taskId of rule.tasks as string[]) {
            if (!declared.has(taskId)) failures.push(`Coverage manifest references missing task: ${suite}/${taskId}`);
          }
        }
      }
    }
  }
}

for (const path of [joinPath(workspaceRoot, "schemas"), suitesPath, joinPath(workspaceRoot, "src")]) await findNodeModules(path);

if (failures.length > 0) {
  console.error("Workspace validation failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("Workspace layout is valid.");
