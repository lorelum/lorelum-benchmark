export type EvaluatorCheckV2 = { id: string; passed: boolean; failure_reason?: string };
export type EvaluatorProbeV2 = { id: string; points: number; max_points: number };

export type EvaluatorResultV2 = {
  schema_version: "evaluator-result/v2";
  evaluator_version: 2;
  semantic: { passed: boolean; checks: EvaluatorCheckV2[] };
  quality: { score: number; probes: EvaluatorProbeV2[] };
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function fail(message: string): never {
  throw new Error(`Invalid evaluator result v2: ${message}`);
}

function validId(value: unknown): value is string {
  return typeof value === "string" && /^[a-z0-9-]+$/.test(value);
}

export function assertEvaluatorResultV2(value: unknown): EvaluatorResultV2 {
  if (!isRecord(value) || value.schema_version !== "evaluator-result/v2" || value.evaluator_version !== 2 || !isRecord(value.semantic) || !isRecord(value.quality)) fail("missing top-level fields");
  const semantic = value.semantic;
  const quality = value.quality;
  if (typeof semantic.passed !== "boolean" || !Array.isArray(semantic.checks) || semantic.checks.length === 0) fail("semantic checks are required");
  const checkIds = new Set<string>();
  for (const check of semantic.checks) {
    if (!isRecord(check) || !validId(check.id) || typeof check.passed !== "boolean" || (check.failure_reason !== undefined && (typeof check.failure_reason !== "string" || !check.failure_reason))) fail("semantic check is invalid");
    if (!checkIds.add(check.id)) fail(`duplicate semantic check: ${check.id}`);
    if (check.passed && check.failure_reason !== undefined) fail(`passing semantic check has failure reason: ${check.id}`);
    if (!check.passed && check.failure_reason === undefined) fail(`failing semantic check has no failure reason: ${check.id}`);
  }
  if (semantic.passed !== semantic.checks.every((check) => isRecord(check) && check.passed === true)) fail("semantic pass status disagrees with checks");
  if (!Number.isInteger(quality.score) || quality.score < 0 || quality.score > 100 || !Array.isArray(quality.probes)) fail("quality score is invalid");
  const probeIds = new Set<string>();
  let points = 0;
  for (const probe of quality.probes) {
    if (!isRecord(probe) || !validId(probe.id) || !Number.isInteger(probe.points) || !Number.isInteger(probe.max_points) || probe.points < 0 || probe.max_points < 1 || probe.points > probe.max_points) fail("quality probe is invalid");
    if (!probeIds.add(probe.id)) fail(`duplicate quality probe: ${probe.id}`);
    points += probe.points;
  }
  if (!semantic.passed && (quality.score !== 0 || quality.probes.length !== 0)) fail("semantic failure must score zero without probes");
  if (semantic.passed && (quality.probes.length === 0 || points !== quality.score || quality.probes.reduce((sum, probe) => sum + (isRecord(probe) ? Number(probe.max_points) : 0), 0) !== 100)) fail("successful semantic evaluation must report 100 quality points");
  return value as EvaluatorResultV2;
}

export function evaluatorResultFromOutput(output: string): EvaluatorResultV2 | undefined {
  for (const line of output.split(/\r?\n/).filter(Boolean).reverse()) {
    try {
      const parsed = JSON.parse(line) as unknown;
      if (isRecord(parsed) && parsed.schema_version === "evaluator-result/v2") return assertEvaluatorResultV2(parsed);
    } catch {
      continue;
    }
  }
  return undefined;
}
