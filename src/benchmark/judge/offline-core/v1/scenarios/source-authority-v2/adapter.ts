import { join } from "node:path";
import { candidateHash, emptyCandidate, hashJson, loadFixtureTrees, projectSourceMap, readScenarioJson } from "../shared";
import type { PairCase, RubricCriterion, ScenarioAdapter, ScenarioBundle } from "../../types";

type SourceAuthorityRubric = {
  id: string;
  version: string;
  dimensions: Array<{ id: string; max_points: number; description: string }>;
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
const candidateRoot = join(process.cwd(), "incubator/skill-trigger-orchestration/async-cleanup-v4");
const fixedRubricPath = join(process.cwd(), "src/benchmark/judge/skill-trigger-source-authority/v2/rubric.yaml");

export async function loadScenario(): Promise<ScenarioBundle> {
  const [profile, rubricDocument, caseDocument, projection, labels] = await Promise.all([
    readScenarioJson<ScenarioBundle["profile"]>(join(import.meta.dir, "profile.json")),
    Bun.file(fixedRubricPath).text().then((text) => Bun.YAML.parse(text) as SourceAuthorityRubric),
    readScenarioJson<CaseDocument>(join(import.meta.dir, "cases.json")),
    readScenarioJson<Record<string, string[]>>(join(import.meta.dir, "projection.json")),
    readScenarioJson<ScenarioBundle["labels"]>(join(root, "private/calibration/labels/source-authority-v2.json")),
  ]);
  const fixtures = await loadFixtureTrees({
    manifestPath: join(candidateRoot, "private/calibration/sets.yaml"),
    candidateRoot,
    setId: "operation-authority",
    setVersion: "v1",
  });
  const criteria = new Map<string, RubricCriterion>(rubricDocument.dimensions.map((dimension) => [
    dimension.id,
    { id: dimension.id, description: dimension.description },
  ]));
  const cases: PairCase[] = [];
  for (const entry of caseDocument.cases) {
    const criterion = criteria.get(entry.criterion_id);
    if (!criterion) throw new Error(`Missing source-authority criterion ${entry.criterion_id}`);
    const patterns = projection[entry.criterion_id];
    if (!patterns) throw new Error(`Missing source-authority projection for ${entry.criterion_id}`);
    const aFiles = fixtures[entry.a_fixture];
    const bFiles = fixtures[entry.b_fixture];
    if (!aFiles || !bFiles) throw new Error(`Missing source-authority fixture for ${entry.id}`);
    const a = entry.insufficient_reason?.includes("A") ? emptyCandidate() : await projectSourceMap({
      sourceId: "A",
      files: aFiles,
      includePatterns: patterns,
      maxTotalChars: 7_000,
      maxItemChars: 4_000,
    });
    const b = entry.insufficient_reason?.includes("B") ? emptyCandidate() : await projectSourceMap({
      sourceId: "B",
      files: bFiles,
      includePatterns: patterns,
      maxTotalChars: 7_000,
      maxItemChars: 4_000,
    });
    cases.push({
      id: entry.id,
      criterion,
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
    rubric: {
      id: rubricDocument.id,
      version: rubricDocument.version,
      criteria: [...criteria.values()],
    },
    cases,
    labels,
  };
}

export default { loadScenario } satisfies ScenarioAdapter;
