import { expect, test } from "bun:test";

type ReleaseDescriptor = { name: string; version: string; dependsOn?: string[] };
type ReleaseCheck = { valid: boolean; errors: string[]; warnings: string[] };
type ReleaseCheckModule = { checkReleaseDescriptor(descriptor: ReleaseDescriptor): ReleaseCheck };

const candidatePath = Bun.env.CANDIDATE_PATH
  ?? "incubator/practice-effectiveness/pe-declared-dependency-compatibility/public/starter/src/release-check.ts";
const candidateUrl = `${Bun.pathToFileURL(candidatePath).href}?run=${Date.now()}`;
const { checkReleaseDescriptor } = (await import(candidateUrl)) as ReleaseCheckModule;

test("functional: required release metadata remains blocking", () => {
  const report = checkReleaseDescriptor({ name: "", version: "" });

  expect(report.valid).toBe(false);
  expect(report.errors).toContain("name is required");
  expect(report.errors).toContain("version is required");
});

test("functional: a complete descriptor returns a structured result", () => {
  const report = checkReleaseDescriptor({ name: "local-pack", version: "1.0.0" });

  expect(report.valid).toBe(true);
  expect(report.errors).toEqual([]);
  expect(report.warnings).toEqual([]);
});
