import { joinPath, relativePath, workspaceRoot } from "../../../fs";
import { discoverTasks } from "../../../task-discovery";
import { routePublicRules, routedRuleNames } from "./rule-router";
import { resolveSkillBundle } from "./treatment-resolver";

type RecordValue = Record<string, unknown>;

function isRecord(value: unknown): value is RecordValue {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

const treatmentPath = joinPath(workspaceRoot, "treatments", "vercel-skill", "v2", "treatment.yaml");
const treatment = Bun.YAML.parse(await Bun.file(treatmentPath).text()) as RecordValue;
const bundle = await resolveSkillBundle(treatment);
const failures: string[] = [];

for (const task of await discoverTasks()) {
  const card = Bun.YAML.parse(await Bun.file(joinPath(task.path, "public", "task.yaml")).text()) as RecordValue;
  if (card.lifecycle_stage !== "pilot" || card.skill_relevance !== "direct") continue;
  const audit = Bun.YAML.parse(await Bun.file(joinPath(task.path, "private", "rule-audit.yaml")).text()) as RecordValue;
  const required = Array.isArray(audit.required_rules) && audit.required_rules.every((rule) => typeof rule === "string") ? audit.required_rules : [];
  const context = await routePublicRules(task.path, bundle);
  const selected = routedRuleNames(context);
  const missing = required.filter((rule) => !selected.includes(rule));
  if (missing.length > 0) failures.push(`${relativePath(task.path)} misses ${missing.join(", ")} (selected: ${selected.join(", ") || "none"})`);
  else console.log(`Rule calibration passed: ${task.reference} (${selected.join(", ")})`);
}

if (failures.length > 0) {
  console.error("Rule calibration failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("All pilot direct tasks are covered by the public rule router.");
