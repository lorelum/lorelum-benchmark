import { expect, test } from "bun:test";

type GuidanceEntry = { id: string };
type DecisionBranch = { label: string; targets: string[] };
type DecisionConfig = { id: string; branches: DecisionBranch[] };
type PublicationCheck = { valid: boolean; errors: string[] };
type PublicationCheckModule = {
  checkPublication(entries: GuidanceEntry[], decisions: DecisionConfig[]): PublicationCheck;
};

const candidatePath = Bun.env.CANDIDATE_PATH
  ?? "incubator/practice-effectiveness/pe-dangling-recommendation-reference/public/starter/src/publication-check.ts";
const candidateUrl = `${Bun.pathToFileURL(candidatePath).href}?run=${Date.now()}`;
const { checkPublication } = (await import(candidateUrl)) as PublicationCheckModule;

test("functional: local entry and decision shape errors remain blocking", () => {
  const report = checkPublication([{ id: "" }], [{ id: "", branches: [] }]);

  expect(report.valid).toBe(false);
  expect(report.errors).toContain("entry id is required");
  expect(report.errors).toContain("decision id is required");
});

test("functional: complete local configuration remains publishable", () => {
  const report = checkPublication(
    [{ id: "entry-a" }, { id: "entry-b" }],
    [{ id: "choose-a", branches: [{ label: "Use A", targets: ["entry-a"] }] }],
  );

  expect(report.valid).toBe(true);
  expect(report.errors).toEqual([]);
});
