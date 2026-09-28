import { join } from "node:path";
import { candidateHash, emptyCandidate, hashJson, loadFixtureTrees, projectSourceMap, readScenarioJson } from "../shared";
import type { ScenarioAdapter, ScenarioBundle, PairCase, RubricCriterion } from "../../types";

type RubricDocument = {
  id: string;
  version: string;
  criteria: Array<RubricCriterion & { include_patterns: string[] }>;
};

type CaseDocument = {
  cases: Array<{
    id: string;
    criterion_id: string;
    kind: "decisive" | "equivalent" | "insufficient";
    a_fixture: string;
    b_fixture: string;
    insufficient_reason?: string;
  }>;
};

const root = join(import.meta.dir, "..", "..");
const candidateRoot = join(process.cwd(), "incubator/practice-injection/llm-provider-gateway-v3");

export async function loadScenario(): Promise<ScenarioBundle> {
  const [profile, rubric, caseDocument, labels] = await Promise.all([
    readScenarioJson<ScenarioBundle["profile"]>(join(import.meta.dir, "profile.json")),
    readScenarioJson<RubricDocument>(join(import.meta.dir, "rubric.json")),
    readScenarioJson<CaseDocument>(join(import.meta.dir, "cases.json")),
    readScenarioJson<ScenarioBundle["labels"]>(join(root, "private/calibration/labels/gateway-v3.json")),
  ]);
  const fixtures = await loadFixtureTrees({
    manifestPath: join(candidateRoot, "private/calibration/sets.yaml"),
    candidateRoot,
    setId: "quality-probe",
    setVersion: "v3",
  });
  const criteria = new Map(rubric.criteria.map((criterion) => [criterion.id, criterion]));
  const cases: PairCase[] = [];
  for (const entry of caseDocument.cases) {
    const criterion = criteria.get(entry.criterion_id);
    if (!criterion) throw new Error(`Missing gateway criterion ${entry.criterion_id}`);
    const aFiles = fixtures[entry.a_fixture];
    const bFiles = fixtures[entry.b_fixture];
    if (!aFiles || !bFiles) throw new Error(`Missing gateway fixture for ${entry.id}`);
    const aProjected = entry.insufficient_reason?.includes("A") ? emptyCandidate() : await projectSourceMap({
      sourceId: "A",
      files: aFiles,
      includePatterns: criterion.include_patterns,
      maxTotalChars: 6_000,
      maxItemChars: 2_500,
    });
    const bProjected = entry.insufficient_reason?.includes("B") ? emptyCandidate() : await projectSourceMap({
      sourceId: "B",
      files: bFiles,
      includePatterns: criterion.include_patterns,
      maxTotalChars: 6_000,
      maxItemChars: 2_500,
    });
    const a = aProjected;
    const b = bProjected;
    cases.push({
      id: entry.id,
      criterion: { id: criterion.id, description: criterion.description },
      kind: entry.kind,
      a,
      b,
      ...(entry.insufficient_reason ? { insufficient_reason: entry.insufficient_reason } : {}),
      provenance: {
        source_ids: [entry.a_fixture, entry.b_fixture],
        evidence_hash: await hashJson({ a: await candidateHash(a), b: await candidateHash(b) }),
      },
    });
  }
  return {
    profile,
    rubric: { id: rubric.id, version: rubric.version, criteria: rubric.criteria.map(({ include_patterns: _patterns, ...criterion }) => criterion) },
    cases,
    labels,
  };
}

export default { loadScenario } satisfies ScenarioAdapter;
