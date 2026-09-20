import { join } from "node:path";
import { listFiles, sha256File, sha256Text } from "../../../fs";
import { canonicalJson } from "./canonical";
import { assertReplanEvidence } from "./evidence";
import type { JudgeResultV1 } from "../../../outcome/v1/contract";
import type { CalibrationReport, CalibrationStatus, ReplanEvidence } from "./types";

export const calibrationId = "async-report-replan-judge-calibration" as const;
export const calibrationVersion = "v1" as const;
export const calibrationThresholds = Object.freeze({ reference_min: 75, equivalent_max_difference: 10, anti_pattern_max: 60, reference_min_difference: 15, repetitions: 3, max_calls: 9 });

export type CalibrationFixtureId = "reference" | "equivalent" | "anti-pattern";
export type CalibrationFixture = { id: CalibrationFixtureId; evidence: ReplanEvidence };

const calibrationDir = join(import.meta.dir, "private", "calibration");

function median(values: number[]): number {
  if (values.length === 0) throw new Error("cannot take median of empty scores");
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

function fixturePath(id: CalibrationFixtureId): string {
  return join(calibrationDir, `${id}.json`);
}

export async function loadCalibrationFixtures(): Promise<CalibrationFixture[]> {
  const ids: CalibrationFixtureId[] = ["reference", "equivalent", "anti-pattern"];
  const fixtures: CalibrationFixture[] = [];
  for (const id of ids) {
    const value = await Bun.file(fixturePath(id)).json();
    assertReplanEvidence(value);
    fixtures.push({ id, evidence: value });
  }
  return fixtures;
}

export async function calibrationIdentity(): Promise<{ id: typeof calibrationId; version: typeof calibrationVersion; hash: string }> {
  const files = (await listFiles(calibrationDir)).filter((file) => file !== "snapshot.json");
  const entries = await Promise.all(files.map(async (file) => `${file}\0${await Bun.file(join(calibrationDir, file)).text()}`));
  return { id: calibrationId, version: calibrationVersion, hash: await sha256Text(entries.join("\n")) };
}

export async function resolveCalibrationStatus(report?: CalibrationReport): Promise<{ id: string; version: string; hash: string; status: CalibrationStatus; calls: number; reason?: string }> {
  const identity = await calibrationIdentity();
  if (!report) return { ...identity, status: "not-run", calls: 0, reason: "no calibration report was supplied" };
  if (report.id !== identity.id || report.version !== identity.version || report.hash !== identity.hash) return { ...identity, status: "diagnostic", calls: report.calls, reason: "calibration identity does not match the frozen v1 package" };
  if (!(await verifyCalibrationSnapshot())) return { ...identity, status: "diagnostic", calls: report.calls, reason: "calibration snapshot is not verified" };
  const gate = evaluateCalibrationMedians(report.medians);
  if (report.status !== "qualified" || report.calls !== calibrationThresholds.max_calls || !gate.qualified) return { ...identity, status: "diagnostic", calls: report.calls, reason: report.reason ?? gate.reason ?? "calibration gate is not qualified" };
  return { ...identity, status: "qualified", calls: report.calls };
}

export async function verifyCalibrationSnapshot(): Promise<boolean> {
  const snapshot = await Bun.file(join(calibrationDir, "snapshot.json")).json() as { source_files?: Record<string, string>; rubric_hash?: string };
  if (!snapshot.source_files || typeof snapshot.rubric_hash !== "string") return false;
  const actualFiles = (await listFiles(calibrationDir)).filter((file) => file !== "snapshot.json").sort();
  const snapshotFiles = Object.keys(snapshot.source_files).sort();
  if (JSON.stringify(actualFiles) !== JSON.stringify(snapshotFiles)) return false;
  for (const [file, expected] of Object.entries(snapshot.source_files)) if (await sha256File(join(calibrationDir, file)) !== expected) return false;
  return snapshot.rubric_hash === await (await import("./rubric")).rubricHash();
}

function observedScore(result: JudgeResultV1): number | undefined {
  return result.state === "observed" && Number.isInteger(result.score) ? result.score : undefined;
}

export function evaluateCalibrationMedians(medians: Partial<Record<CalibrationFixtureId, number>>): { qualified: boolean; reason?: string } {
  const reference = medians.reference;
  const equivalent = medians.equivalent;
  const antiPattern = medians["anti-pattern"];
  if (reference === undefined || equivalent === undefined || antiPattern === undefined) return { qualified: false, reason: "calibration did not produce all fixture medians" };
  if (reference < calibrationThresholds.reference_min) return { qualified: false, reason: "reference median is below the minimum" };
  if (Math.abs(reference - equivalent) > calibrationThresholds.equivalent_max_difference) return { qualified: false, reason: "equivalent median differs too much from reference" };
  if (antiPattern > calibrationThresholds.anti_pattern_max) return { qualified: false, reason: "anti-pattern median is above the maximum" };
  if (reference - antiPattern < calibrationThresholds.reference_min_difference) return { qualified: false, reason: "reference and anti-pattern are not sufficiently separated" };
  return { qualified: true };
}

export async function runCalibration(options: {
  mode: "mock" | "real";
  score: (evidence: ReplanEvidence) => Promise<JudgeResultV1>;
  repetitions?: number;
  max_calls?: number;
  env?: Record<string, string | undefined>;
}): Promise<CalibrationReport> {
  if (!(await verifyCalibrationSnapshot())) return { id: calibrationId, version: calibrationVersion, hash: await sha256Text("unverified calibration snapshot"), status: "diagnostic", calls: 0, medians: {}, reason: "calibration snapshot is not verified" };
  const identity = await calibrationIdentity();
  const repetitions = options.repetitions ?? calibrationThresholds.repetitions;
  const maxCalls = options.max_calls ?? calibrationThresholds.max_calls;
  if (repetitions !== 3 || maxCalls > 9) return { ...identity, status: "diagnostic", calls: 0, medians: {}, reason: "calibration budget does not match v1" };
  if (options.mode === "real" && options.env?.LORELUM_JUDGE_REAL !== "1") return { ...identity, status: "not-run", calls: 0, medians: {}, reason: "real calibration requires LORELUM_JUDGE_REAL=1" };
  const medians: Partial<Record<CalibrationFixtureId, number>> = {};
  let calls = 0;
  for (const fixture of await loadCalibrationFixtures()) {
    const scores: number[] = [];
    for (let repeat = 0; repeat < repetitions; repeat += 1) {
      if (calls >= maxCalls) return { ...identity, status: "diagnostic", calls, medians, reason: "calibration call budget exceeded" };
      let score: number | undefined;
      try {
        score = observedScore(await options.score(fixture.evidence));
      } catch {
        return { ...identity, status: "diagnostic", calls: calls + 1, medians, reason: `fixture ${fixture.id} Judge call was unavailable` };
      }
      calls += 1;
      if (score === undefined) return { ...identity, status: "diagnostic", calls, medians, reason: `fixture ${fixture.id} did not produce an observed score` };
      scores.push(score);
    }
    medians[fixture.id] = median(scores);
  }
  const gate = evaluateCalibrationMedians(medians);
  return { ...identity, status: gate.qualified ? "qualified" : "diagnostic", calls, medians, ...(gate.reason ? { reason: gate.reason } : {}) };
}

export function calibrationReportHash(report: CalibrationReport): Promise<string> {
  return sha256Text(canonicalJson(report));
}
