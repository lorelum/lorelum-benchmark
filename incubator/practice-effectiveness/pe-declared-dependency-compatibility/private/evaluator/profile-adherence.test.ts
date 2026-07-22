import { expect, test } from "bun:test";

type ReleaseDescriptor = { name: string; version: string; dependsOn?: string[] };
type ReleaseCheck = { valid: boolean; errors: string[]; warnings: string[] };
type ReleaseCheckModule = { checkReleaseDescriptor(descriptor: ReleaseDescriptor): ReleaseCheck };

const candidatePath = Bun.env.CANDIDATE_PATH
  ?? "incubator/practice-effectiveness/pe-declared-dependency-compatibility/public/starter/src/release-check.ts";
const candidateUrl = `${Bun.pathToFileURL(candidatePath).href}?run=${Date.now()}`;
const { checkReleaseDescriptor } = (await import(candidateUrl)) as ReleaseCheckModule;

test("profile adherence: declared v1 dependencies produce non-blocking feedback", () => {
  const report = checkReleaseDescriptor({ name: "local-pack", version: "1.0.0", dependsOn: ["another-pack"] });

  expect(report.valid).toBe(true);
  expect(report.errors).toEqual([]);
  expect(report.warnings.length).toBeGreaterThan(0);
});

test("profile adherence: declared v1 dependencies are not resolved", () => {
  const report = checkReleaseDescriptor({
    name: "local-pack",
    version: "1.0.0",
    dependsOn: ["unknown-pack@99.0.0", "other-pack@invalid-range"],
  });

  expect(report.valid).toBe(true);
  expect(report.errors).toEqual([]);
  expect(report.warnings.length).toBeGreaterThan(0);
});
