import { join } from "node:path";
import { hashJson, projectText, readScenarioJson } from "../shared";
import type { PairCase, ScenarioAdapter, ScenarioBundle } from "../../types";

type RubricDocument = {
  id: string;
  version: string;
  criteria: Array<{ id: string; description: string }>;
};

type FixtureDocument = {
  cases: Array<{
    id: string;
    criterion_id: string;
    kind: "decisive" | "equivalent" | "insufficient";
    a: string;
    b: string;
    insufficient_reason?: string;
  }>;
};

const root = join(import.meta.dir, "..", "..");

export async function loadScenario(): Promise<ScenarioBundle> {
  const [profile, rubric, fixtures, labels] = await Promise.all([
    readScenarioJson<ScenarioBundle["profile"]>(join(import.meta.dir, "profile.json")),
    readScenarioJson<RubricDocument>(join(import.meta.dir, "rubric.json")),
    readScenarioJson<FixtureDocument>(join(import.meta.dir, "fixtures.json")),
    readScenarioJson<ScenarioBundle["labels"]>(join(root, "private/calibration/labels/compaction-summary-v1.json")),
  ]);
  const criteria = new Map(rubric.criteria.map((criterion) => [criterion.id, criterion]));
  const cases: PairCase[] = [];
  for (const entry of fixtures.cases) {
    const criterion = criteria.get(entry.criterion_id);
    if (!criterion) throw new Error(`Missing compaction criterion ${entry.criterion_id}`);
    const a = await projectText({
      sourceId: "A",
      text: entry.a,
      label: "summary-a",
      summary: "Natural-language compaction summary A.",
    });
    const b = await projectText({
      sourceId: "B",
      text: entry.b,
      label: "summary-b",
      summary: "Natural-language compaction summary B.",
    });
    cases.push({
      id: entry.id,
      criterion,
      kind: entry.kind,
      a,
      b,
      ...(entry.insufficient_reason ? { insufficient_reason: entry.insufficient_reason } : {}),
      provenance: {
        source_ids: [entry.id],
        evidence_hash: await hashJson({ a: entry.a, b: entry.b }),
      },
    });
  }
  return {
    profile,
    rubric: { id: rubric.id, version: rubric.version, criteria: rubric.criteria },
    cases,
    labels,
  };
}

export default { loadScenario } satisfies ScenarioAdapter;
