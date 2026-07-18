import Ajv2020 from "ajv/dist/2020";
import type { ErrorObject, ValidateFunction } from "ajv";
import { isAbsolute, relative, resolve } from "node:path";
import { directoryExists, joinPath, listDirectories, listFiles, pathExists, relativePath, sha256File, workspaceRoot } from "./fs";

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

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function insideWorkspace(path: string): boolean {
  const root = resolve(workspaceRoot);
  const candidate = resolve(path);
  const fromRoot = relative(root, candidate);
  return !fromRoot.startsWith("..") && !isAbsolute(fromRoot);
}

async function commitIsAncestor(commit: string): Promise<boolean> {
  const check = Bun.spawn(["git", "merge-base", "--is-ancestor", commit, "HEAD"], { cwd: workspaceRoot, stdout: "ignore", stderr: "ignore" });
  return (await check.exited) === 0;
}

async function validateExperimentPlan(path: string, plan: Record<string, unknown>): Promise<void> {
  const suite = plan.suite;
  if (!isRecord(suite) || typeof suite.id !== "string" || typeof suite.version !== "string") return;
  const suitePath = joinPath(workspaceRoot, "suites", suite.id);
  const suiteManifestPath = joinPath(suitePath, "suite.yaml");
  await requirePath(suiteManifestPath);
  const suiteDocument = await validateYaml(suiteManifestPath, "suite.schema.json");
  if (!suiteDocument) return;
  if (suiteDocument.id !== suite.id || suiteDocument.version !== suite.version) failures.push(`Experiment suite does not match suite manifest: ${relativePath(path)}`);

  const declaredTasks = new Map<string, Record<string, unknown>>();
  if (Array.isArray(suiteDocument.tasks)) {
    for (const task of suiteDocument.tasks) {
      if (!isRecord(task) || typeof task.id !== "string") continue;
      if (declaredTasks.has(task.id)) failures.push(`Experiment suite has duplicate task id: ${suite.id}/${task.id}`);
      declaredTasks.set(task.id, task);
    }
  }
  const taskSets = ["smoke_tasks", "full_tasks"] as const;
  for (const setName of taskSets) {
    const tasks = plan[setName];
    if (!Array.isArray(tasks)) continue;
    for (const taskId of tasks) {
      if (typeof taskId !== "string") continue;
      const declared = declaredTasks.get(taskId);
      if (!declared) {
        failures.push(`Experiment ${setName} references undeclared task: ${suite.id}/${taskId}`);
        continue;
      }
      if (typeof declared.path !== "string") continue;
      const taskCardPath = joinPath(suitePath, declared.path, "public", "task.yaml");
      const taskCard = await validateYaml(taskCardPath, "task-card.schema.json");
      if (!taskCard || taskCard.id !== taskId) failures.push(`Experiment task does not match task card: ${suite.id}/${taskId}`);
    }
  }

  const conditionIds = new Set<string>();
  if (Array.isArray(plan.conditions)) {
    for (const condition of plan.conditions) {
      if (!isRecord(condition) || typeof condition.id !== "string" || typeof condition.treatment !== "string") continue;
      if (!conditionIds.add(condition.id)) failures.push(`Experiment has duplicate condition: ${relativePath(path)}/${condition.id}`);
      if (!Array.isArray(suiteDocument.conditions) || !suiteDocument.conditions.includes(condition.id)) failures.push(`Experiment condition is not declared by suite: ${suite.id}/${condition.id}`);
      const [treatmentId, treatmentVersion] = condition.treatment.split("/");
      if (!treatmentId || !treatmentVersion) {
        failures.push(`Experiment treatment reference is invalid: ${condition.treatment}`);
        continue;
      }
      const treatmentPath = joinPath(workspaceRoot, "treatments", treatmentId, treatmentVersion, "treatment.yaml");
      await requirePath(treatmentPath);
      const treatment = await validateYaml(treatmentPath, "treatment.schema.json");
      if (treatment && (treatment.id !== treatmentId || treatment.version !== treatmentVersion)) failures.push(`Experiment treatment does not match path: ${condition.treatment}`);
    }
  }

  const environment = plan.environment;
  if (isRecord(environment) && typeof environment.id === "string" && typeof environment.version === "string") {
    const environmentPath = joinPath(workspaceRoot, "environments", environment.id, environment.version, "environment.yaml");
    await requirePath(environmentPath);
    const environmentDocument = await validateYaml(environmentPath, "environment.schema.json");
    if (environmentDocument && (environmentDocument.id !== environment.id || environmentDocument.version !== environment.version)) failures.push(`Experiment environment does not match path: ${environment.id}/${environment.version}`);
    const planAgent = plan.agent;
    const planModel = plan.model;
    const environmentAgent = environmentDocument?.agent_runtime;
    const environmentModel = environmentDocument?.model;
    if (isRecord(planAgent) && isRecord(environmentAgent) && (planAgent.id !== environmentAgent.id || planAgent.version !== environmentAgent.version || planAgent.command !== environmentAgent.command)) {
      failures.push(`Experiment agent does not match environment: ${relativePath(path)}`);
    }
    if (isRecord(planModel) && isRecord(environmentModel) && (planModel.id !== environmentModel.id || planModel.version !== environmentModel.version)) {
      failures.push(`Experiment model does not match environment: ${relativePath(path)}`);
    }
    const dependencies = environmentDocument?.dependencies;
    if (isRecord(dependencies) && typeof dependencies.lockfile === "string" && typeof dependencies.lockfile_sha256 === "string") {
      const lockfilePath = joinPath(workspaceRoot, dependencies.lockfile);
      await requirePath(lockfilePath);
      if (await pathExists(lockfilePath) && (await sha256File(lockfilePath)) !== dependencies.lockfile_sha256) failures.push(`Environment lockfile hash does not match: ${relativePath(lockfilePath)}`);
    }
  }

  if (plan.run_kind === "smoke" && plan.repetitions !== 1) failures.push(`Smoke experiment must use exactly one repetition: ${relativePath(path)}`);

  if (typeof plan.source_commit === "string" && !(await commitIsAncestor(plan.source_commit))) failures.push(`Experiment source_commit is not an ancestor of HEAD: ${plan.source_commit}`);
  if (typeof plan.system_prompt_path === "string" && typeof plan.system_prompt_hash === "string") {
    const promptPath = resolve(workspaceRoot, plan.system_prompt_path);
    if (!insideWorkspace(promptPath)) failures.push(`Experiment system prompt escapes workspace: ${plan.system_prompt_path}`);
    else if (!(await pathExists(promptPath))) failures.push(`Experiment system prompt is missing: ${relativePath(promptPath)}`);
    else if ((await sha256File(promptPath)) !== plan.system_prompt_hash) failures.push(`Experiment system prompt hash does not match: ${relativePath(promptPath)}`);
  }
}

async function validateRunRecords(): Promise<void> {
  const recordsPath = joinPath(workspaceRoot, "results", "records");
  if (!(await directoryExists(recordsPath))) return;
  const runIds = new Set<string>();
  for (const file of await listFiles(recordsPath)) {
    if (!file.endsWith(".json")) continue;
    const path = joinPath(recordsPath, file);
    let record: Record<string, unknown> | null = null;
    try {
      const parsed = JSON.parse(await Bun.file(path).text()) as unknown;
      record = isRecord(parsed) ? parsed : null;
    } catch (error) {
      failures.push(`Invalid JSON in ${relativePath(path)}: ${error instanceof Error ? error.message : String(error)}`);
      continue;
    }
    if (!record) {
      failures.push(`Run record must be a JSON object: ${relativePath(path)}`);
      continue;
    }
    const validator = await schemaValidator("run-record.schema.json");
    if (!validator) continue;
    if (!validator(record)) {
      addSchemaFailures(path, validator.errors);
      continue;
    }
    const runId = record.run_id;
    if (typeof runId === "string" && !runIds.add(runId)) failures.push(`Duplicate run record id: ${runId}`);
    const environment = record.environment;
    const runManifest = record.run_manifest;
    if (isRecord(environment) && environment.id === "formal-pi-deepseek-v4-pro" && (!isRecord(runManifest) || typeof runManifest.uri !== "string" || !/^s3:\/\/[^?]+\?versionId=.+$/.test(runManifest.uri))) {
      failures.push(`Formal run record must reference a versioned S3 manifest: ${relativePath(path)}`);
    }
  }
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

async function validateVersionedManifests(path: string, manifestName: string, schema: string, label: string): Promise<void> {
  for (const id of await listDirectories(path)) {
    const idPath = joinPath(path, id);
    for (const version of await listDirectories(idPath)) {
      if (!/^v[1-9][0-9]*$/.test(version)) {
        failures.push(`${label} version must be v<number>: ${relativePath(joinPath(idPath, version))}`);
        continue;
      }
      const manifestPath = joinPath(idPath, version, manifestName);
      await requirePath(manifestPath);
      const document = await validateYaml(manifestPath, schema);
      if (document && (document.id !== id || document.version !== version)) {
        failures.push(`${label} identity must match path: ${relativePath(manifestPath)}`);
      }
    }
  }
}

const suitesPath = joinPath(workspaceRoot, "suites");
for (const schema of ["suite.schema.json", "task-card.schema.json", "run-record.schema.json", "run-manifest.schema.json", "treatment.schema.json", "environment.schema.json", "artifact.schema.json", "report.schema.json", "coverage-manifest.schema.json", "pi-run-request-v2.schema.json", "pi-run-artifact-manifest-v2.schema.json", "experiment-plan.schema.json"]) {
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

const experimentsPath = joinPath(workspaceRoot, "experiments");
await requirePath(experimentsPath);
for (const file of await listFiles(experimentsPath)) {
  if (file.endsWith(".yaml")) {
    const planPath = joinPath(experimentsPath, file);
    const plan = await validateYaml(planPath, "experiment-plan.schema.json");
    if (plan) await validateExperimentPlan(planPath, plan);
  }
}

await validateRunRecords();

await validateVersionedManifests(joinPath(workspaceRoot, "treatments"), "treatment.yaml", "treatment.schema.json", "Treatment");
await validateVersionedManifests(joinPath(workspaceRoot, "environments"), "environment.yaml", "environment.schema.json", "Environment");

for (const path of [joinPath(workspaceRoot, "schemas"), suitesPath, joinPath(workspaceRoot, "treatments"), joinPath(workspaceRoot, "environments"), experimentsPath, joinPath(workspaceRoot, "src")]) await findNodeModules(path);

if (failures.length > 0) {
  console.error("Workspace validation failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("Workspace layout is valid.");
