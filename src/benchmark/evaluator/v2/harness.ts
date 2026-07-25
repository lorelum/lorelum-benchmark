import { assertEvaluatorResultV2, type EvaluatorResultV2 } from "./result";

export type SemanticCheck = { id: string; run: () => void | Promise<void> };
export type QualityProbe = { id: string; maxPoints: number; run: () => number | Promise<number> };

function failureReason(error: unknown): string {
  return error instanceof Error && error.message ? error.message : String(error);
}

function uniqueIds(items: Array<{ id: string }>, label: string): void {
  const ids = new Set<string>();
  for (const item of items) {
    if (!/^[a-z0-9-]+$/.test(item.id)) throw new Error(`${label} id is invalid: ${item.id}`);
    if (!ids.add(item.id)) throw new Error(`${label} id is duplicated: ${item.id}`);
  }
}

export async function evaluateV2(semanticChecks: SemanticCheck[], qualityProbes: QualityProbe[]): Promise<EvaluatorResultV2> {
  if (semanticChecks.length === 0) throw new Error("At least one semantic check is required");
  uniqueIds(semanticChecks, "Semantic check");
  uniqueIds(qualityProbes, "Quality probe");
  if (qualityProbes.reduce((sum, probe) => sum + probe.maxPoints, 0) !== 100) throw new Error("Quality probe maximum points must total 100");

  const checks = [];
  for (const check of semanticChecks) {
    try {
      await check.run();
      checks.push({ id: check.id, passed: true });
    } catch (error) {
      checks.push({ id: check.id, passed: false, failure_reason: failureReason(error) });
    }
  }
  if (checks.some((check) => !check.passed)) {
    return assertEvaluatorResultV2({
      schema_version: "evaluator-result/v2",
      evaluator_version: 2,
      semantic: { passed: false, checks },
      quality: { score: 0, probes: [] }
    });
  }

  const probes = [];
  for (const probe of qualityProbes) {
    let points = 0;
    try {
      points = await probe.run();
    } catch {
      points = 0;
    }
    if (!Number.isInteger(points) || points < 0 || points > probe.maxPoints) throw new Error(`Quality probe returned invalid points: ${probe.id}`);
    probes.push({ id: probe.id, points, max_points: probe.maxPoints });
  }
  return assertEvaluatorResultV2({
    schema_version: "evaluator-result/v2",
    evaluator_version: 2,
    semantic: { passed: true, checks },
    quality: { score: probes.reduce((sum, probe) => sum + probe.points, 0), probes }
  });
}
