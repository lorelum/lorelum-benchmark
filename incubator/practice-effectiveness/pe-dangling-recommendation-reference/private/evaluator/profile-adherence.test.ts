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

test("profile adherence: every relevant decision target resolves to a local entry", () => {
  const report = checkPublication(
    [{ id: "entry-a" }, { id: "entry-b" }],
    [
      { id: "first", branches: [{ label: "First", targets: ["entry-a"] }] },
      { id: "second", branches: [{ label: "Second", targets: ["entry-b"] }] },
    ],
  );

  expect(report.valid).toBe(true);
  expect(report.errors).toEqual([]);
});

test("profile adherence: an unresolved decision target blocks publication", () => {
  const report = checkPublication(
    [{ id: "entry-a" }],
    [
      { id: "first", branches: [{ label: "First", targets: ["entry-a"] }] },
      { id: "second", branches: [{ label: "Second", targets: ["missing-entry"] }] },
    ],
  );

  expect(report.valid).toBe(false);
  expect(report.errors.length).toBeGreaterThan(0);
});
