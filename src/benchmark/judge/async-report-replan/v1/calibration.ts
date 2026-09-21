import { join } from "node:path";
import { createHmac } from "node:crypto";
import { listFiles, sha256File, sha256Text } from "../../../fs";
import { canonicalJson } from "./canonical";
import { assertReplanEvidence, assertReplanEvidenceIntegrity, projectReplanEvidence } from "./evidence";
import { providerId, type CalibrationReport, type CalibrationScope, type CalibrationStatus, type JudgeUsage, type ReplanEvidence, type RawReplanAttempt, type UsageValue } from "./types";
import type { JudgeResultV1 } from "../../../outcome/v1/contract";

export const calibrationId = "async-report-replan-judge-calibration" as const;
export const calibrationVersion = "v1" as const;
const mockCalibrationKey = "mock-calibration-key-v1";

export function calibrationScope(model: string | null): CalibrationScope {
  return { provider_id: providerId, provider_version: "v1", model };
}

export type CalibrationFixtureId = "reference" | "equivalent" | "anti-pattern";
export type CalibrationFixture = { id: CalibrationFixtureId; evidence: ReplanEvidence };
export type CalibrationThresholds = {
  reference_min: number;
  equivalent_max_difference: number;
  anti_pattern_max: number;
  reference_min_difference: number;
};

type CalibrationManifestFixture = { id: CalibrationFixtureId; case_id: string; file: string };
type CalibrationManifest = {
  schema_version: "async-report-replan-judge-calibration/v1";
  id: typeof calibrationId;
  version: typeof calibrationVersion;
  fixtures: CalibrationManifestFixture[];
  repetitions: number;
  max_calls: number;
  thresholds: CalibrationThresholds;
};
type CalibrationExpected = {
  schema_version: "async-report-replan-judge-calibration-expected/v1";
  reference: { minimum: number };
  equivalent: { max_difference_from: "reference"; maximum_difference: number };
  "anti-pattern": { maximum: number; minimum_difference_from: "reference"; minimum_difference: number };
};
type CalibrationContract = { manifest: CalibrationManifest; thresholds: CalibrationThresholds };

const privateCalibrationDir = join(import.meta.dir, "private", "calibration");
const publicCalibrationFixtureDir = join(import.meta.dir, "calibration", "fixtures");
const calibrationSnapshotPath = join(privateCalibrationDir, "snapshot.json");
const calibrationManifestPath = join(privateCalibrationDir, "manifest.json");
const calibrationExpectedPath = join(privateCalibrationDir, "expected.json");
const calibrationCapabilities = new WeakMap<object, { active: boolean; evidenceHashes: Set<string> }>();
const calibrationFixtureIds: CalibrationFixtureId[] = ["reference", "equivalent", "anti-pattern"];

export function isCalibrationScoreCapability(value: unknown): boolean {
  return Boolean(value) && typeof value === "object" && calibrationCapabilities.get(value as object)?.active === true;
}

export function calibrationCapabilityAllows(value: unknown, evidenceHash: string): boolean {
  const capability = Boolean(value) && typeof value === "object" ? calibrationCapabilities.get(value as object) : undefined;
  return capability?.active === true && capability.evidenceHashes.has(evidenceHash);
}

function record(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}

function exactKeys(value: Record<string, unknown>, allowed: string[], label: string): void {
  if (Object.keys(value).some((key) => !allowed.includes(key))) throw new Error(`calibration ${label} contains unsupported fields`);
}

function unavailableUsage(): JudgeUsage {
  return { input_tokens: "unavailable", output_tokens: "unavailable", total_tokens: "unavailable", cost_usd: "unavailable" };
}

type CalibrationScore = JudgeResultV1 | { result: JudgeResultV1; usage?: Partial<JudgeUsage> };

function unpackCalibrationScore(value: CalibrationScore): { result: JudgeResultV1; usage?: Partial<JudgeUsage> } {
  if (value && typeof value === "object" && "result" in value && value.result && typeof value.result === "object") return value as { result: JudgeResultV1; usage?: Partial<JudgeUsage> };
  return { result: value as JudgeResultV1 };
}

type UsageAccumulator = Record<keyof JudgeUsage, number | null | undefined>;

function newUsageAccumulator(): UsageAccumulator {
  return { input_tokens: undefined, output_tokens: undefined, total_tokens: undefined, cost_usd: undefined };
}

function addUsage(accumulator: UsageAccumulator, usage?: Partial<JudgeUsage>): void {
  for (const key of Object.keys(accumulator) as Array<keyof JudgeUsage>) {
    const value = usage?.[key];
    if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
      accumulator[key] = null;
      continue;
    }
    if (accumulator[key] !== null) accumulator[key] = (accumulator[key] ?? 0) + value;
  }
}

function finalizeUsage(accumulator: UsageAccumulator): JudgeUsage {
  return {
    input_tokens: accumulator.input_tokens ?? "unavailable",
    output_tokens: accumulator.output_tokens ?? "unavailable",
    total_tokens: accumulator.total_tokens ?? "unavailable",
    cost_usd: accumulator.cost_usd ?? "unavailable",
  } satisfies Record<keyof JudgeUsage, UsageValue>;
}

function validUsage(value: unknown): value is JudgeUsage {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const usage = value as Record<string, unknown>;
  return ["input_tokens", "output_tokens", "total_tokens", "cost_usd"].every((key) => {
    const item = usage[key];
    return item === "unavailable" || (typeof item === "number" && Number.isFinite(item) && item >= 0 && (key === "cost_usd" || Number.isInteger(item)));
  });
}

function validFixtureId(value: unknown): value is CalibrationFixtureId {
  return typeof value === "string" && calibrationFixtureIds.includes(value as CalibrationFixtureId);
}

function validOpaqueCaseId(value: unknown): value is string {
  return typeof value === "string" && /^case-[a-z0-9]{12,64}$/.test(value);
}

async function loadCalibrationContract(): Promise<CalibrationContract> {
  const manifest = await Bun.file(calibrationManifestPath).json() as unknown;
  const expected = await Bun.file(calibrationExpectedPath).json() as unknown;
  if (!record(manifest) || !record(expected)) throw new Error("calibration contract is not an object");
  exactKeys(manifest, ["schema_version", "id", "version", "fixtures", "repetitions", "max_calls", "thresholds"], "manifest");
  exactKeys(expected, ["schema_version", "reference", "equivalent", "anti-pattern"], "expected");
  if (manifest.schema_version !== "async-report-replan-judge-calibration/v1" || manifest.id !== calibrationId || manifest.version !== calibrationVersion) throw new Error("calibration manifest identity is invalid");
  if (expected.schema_version !== "async-report-replan-judge-calibration-expected/v1") throw new Error("calibration expected identity is invalid");
  if (!Number.isInteger(manifest.repetitions) || (manifest.repetitions as number) < 1 || !Number.isInteger(manifest.max_calls) || (manifest.max_calls as number) < 1) throw new Error("calibration manifest budget is invalid");
  if (!Array.isArray(manifest.fixtures) || manifest.fixtures.length !== calibrationFixtureIds.length) throw new Error("calibration manifest fixtures are invalid");

  const fixtures = manifest.fixtures as unknown[];
  const seen = new Set<string>();
  for (const item of fixtures) {
    if (!record(item)) throw new Error("calibration manifest fixture is invalid");
    exactKeys(item, ["id", "case_id", "file"], "manifest fixture");
    if (!validFixtureId(item.id) || seen.has(item.id)) throw new Error("calibration manifest fixture id is invalid");
    if (!validOpaqueCaseId(item.case_id) || typeof item.file !== "string" || item.file !== `${item.case_id}.json`) throw new Error("calibration manifest fixture file is invalid");
    seen.add(item.id);
  }
  if (JSON.stringify([...seen].sort()) !== JSON.stringify([...calibrationFixtureIds].sort())) throw new Error("calibration manifest fixture set is invalid");

  const reference = record(expected.reference);
  const equivalent = record(expected.equivalent);
  const antiPattern = record(expected["anti-pattern"]);
  if (!reference || !equivalent || !antiPattern) throw new Error("calibration expected thresholds are invalid");
  exactKeys(reference, ["minimum"], "expected reference");
  exactKeys(equivalent, ["max_difference_from", "maximum_difference"], "expected equivalent");
  exactKeys(antiPattern, ["maximum", "minimum_difference_from", "minimum_difference"], "expected anti-pattern");
  if (equivalent.max_difference_from !== "reference" || antiPattern.minimum_difference_from !== "reference") throw new Error("calibration expected threshold anchors are invalid");
  const thresholdFields = [reference.minimum, equivalent.maximum_difference, antiPattern.maximum, antiPattern.minimum_difference];
  if (thresholdFields.some((value) => !Number.isInteger(value) || (value as number) < 0 || (value as number) > 100)) throw new Error("calibration expected threshold values are invalid");
  const thresholds: CalibrationThresholds = {
    reference_min: reference.minimum as number,
    equivalent_max_difference: equivalent.maximum_difference as number,
    anti_pattern_max: antiPattern.maximum as number,
    reference_min_difference: antiPattern.minimum_difference as number,
  };
  if (!record(manifest.thresholds) || canonicalJson(manifest.thresholds) !== canonicalJson(thresholds)) throw new Error("calibration manifest and expected thresholds disagree");
  return { manifest: manifest as unknown as CalibrationManifest, thresholds };
}

function calibrationSourcePath(relativeName: string): string {
  if (relativeName.startsWith("private/") && !relativeName.includes("..")) return join(privateCalibrationDir, relativeName.slice("private/".length));
  if (relativeName.startsWith("public/") && !relativeName.includes("..")) return join(publicCalibrationFixtureDir, relativeName.slice("public/".length));
  throw new Error("calibration snapshot source path is invalid");
}

async function calibrationSourceFiles(): Promise<string[]> {
  const privateFiles = (await listFiles(privateCalibrationDir)).filter((file) => file !== "snapshot.json").map((file) => `private/${file}`);
  const publicFiles = (await listFiles(publicCalibrationFixtureDir)).map((file) => `public/${file}`);
  return [...privateFiles, ...publicFiles].sort();
}

async function issueReport(report: Omit<CalibrationReport, "attestation">, attestationKey?: string): Promise<CalibrationReport> {
  return { ...report, attestation: await calibrationAttestation(report, attestationKey) };
}

async function calibrationAttestation(report: Omit<CalibrationReport, "attestation">, attestationKey?: string): Promise<string> {
  const snapshotHash = await sha256File(calibrationSnapshotPath).catch(() => "unavailable");
  const rubricHash = await (await import("./rubric")).rubricHash().catch(() => "unavailable");
  const payload = canonicalJson({ schema_version: "async-report-replan-calibration-attestation/v1", report, snapshot_hash: snapshotHash, rubric_hash: rubricHash });
  return attestationKey ? createHmac("sha256", attestationKey).update(payload).digest("hex") : "unavailable";
}

export function calibrationAttestationKey(mode: "mock" | "real", env: Record<string, string | undefined> = Bun.env): string | undefined {
  return mode === "mock" ? mockCalibrationKey : env.LORELUM_JUDGE_CALIBRATION_KEY;
}

function safeCallCount(value: unknown, maxCalls: number): number | undefined {
  return Number.isInteger(value) && (value as number) >= 0 && (value as number) <= maxCalls ? value as number : undefined;
}

function validMedians(value: unknown): value is Partial<Record<CalibrationFixtureId, number>> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const medians = value as Record<string, unknown>;
  if (Object.keys(medians).some((key) => !calibrationFixtureIds.includes(key as CalibrationFixtureId))) return false;
  return calibrationFixtureIds.every((key) => Number.isInteger(medians[key]) && Number.isFinite(medians[key]) && (medians[key] as number) >= 0 && (medians[key] as number) <= 100);
}

function median(values: number[]): number {
  if (values.length === 0) throw new Error("cannot take median of empty scores");
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

export async function loadCalibrationFixtures(): Promise<CalibrationFixture[]> {
  const contract = await loadCalibrationContract();
  const fixtures: CalibrationFixture[] = [];
  for (const entry of contract.manifest.fixtures) {
    const value = await Bun.file(join(publicCalibrationFixtureDir, entry.file)).json();
    assertReplanEvidence(value);
    await assertReplanEvidenceIntegrity(value);
    const stored = value as ReplanEvidence;
    if (stored.blind_case_id !== entry.case_id) throw new Error("calibration fixture case identity does not match the private manifest");
    const events = [
      ...stored.assistant_stages.map((stage) => ({ type: "message_end", message: { role: "assistant", stage: stage.stage, content: [{ type: "text", text: stage.text }] } })),
      ...stored.tool_actions.flatMap((action) => {
        const toolCallId = `fixture-tool-${action.order}`;
        const args = action.tool === "bash"
          ? { command: action.target === "command:typecheck" ? "bun typecheck" : action.target === "command:test" ? "bun test" : "bun run check" }
          : { path: action.target };
        return [
          { type: "tool_execution_start", toolCallId, stage: action.stage, toolName: action.tool, args },
          { type: "tool_execution_end", toolCallId, isError: action.status === "failure", result: action.summary === undefined ? {} : { summary: action.summary } },
        ];
      }),
    ];
    const projected = await projectReplanEvidence({
      blind_case_id: stored.blind_case_id,
      execution_health: stored.execution_health,
      public_user_turns: stored.public_user_turns.map(({ stage, text }) => ({ stage, text })),
      events,
      final_candidate_diff: stored.final_candidate_diff,
    } satisfies RawReplanAttempt);
    if (!projected.ok || canonicalJson(projected.evidence) !== canonicalJson(stored)) throw new Error("calibration fixture is not a projector-issued evidence package");
    fixtures.push({ id: entry.id, evidence: projected.evidence });
  }
  return fixtures;
}

export async function calibrationIdentity(): Promise<{ id: typeof calibrationId; version: typeof calibrationVersion; hash: string }> {
  const files = await calibrationSourceFiles();
  const entries = await Promise.all(files.map(async (file) => `${file}\0${await Bun.file(calibrationSourcePath(file)).text()}`));
  return { id: calibrationId, version: calibrationVersion, hash: await sha256Text(entries.join("\n")) };
}

export async function resolveCalibrationStatus(report?: CalibrationReport, expectedScope?: CalibrationScope, attestationKey?: string): Promise<{ id: string; version: string; hash: string; status: CalibrationStatus; calls: number; duration_ms: number; usage: JudgeUsage; reason?: string }> {
  const identity = await calibrationIdentity();
  const resolution = (status: CalibrationStatus, calls: number, source?: Partial<Pick<CalibrationReport, "duration_ms" | "usage">>, reason?: string) => ({ ...identity, status, calls, duration_ms: source?.duration_ms ?? 0, usage: source?.usage ?? unavailableUsage(), ...(reason ? { reason } : {}) });
  let contract: CalibrationContract;
  try {
    contract = await loadCalibrationContract();
  } catch {
    return resolution("diagnostic", 0, undefined, "calibration contract is invalid");
  }
  if (!report) return resolution("not-run", 0, undefined, "no calibration report was supplied");
  if (!report || typeof report !== "object" || Object.keys(report).some((key) => !["id", "version", "hash", "status", "calls", "medians", "scope", "duration_ms", "usage", "attestation", "reason"].includes(key)) || typeof report.attestation !== "string" || !Number.isInteger(report.duration_ms) || report.duration_ms < 0 || !validUsage(report.usage)) return resolution("diagnostic", 0, undefined, "calibration report shape is invalid");
  const calls = safeCallCount(report.calls, contract.manifest.max_calls);
  if (calls === undefined) return resolution("diagnostic", 0, report, "calibration call count is invalid");
  if (!validMedians(report.medians)) return resolution("diagnostic", calls, report, "calibration medians are invalid");
  if (!report.scope || report.scope.provider_id !== providerId || report.scope.provider_version !== "v1" || (typeof report.scope.model !== "string" && report.scope.model !== null)) return resolution("diagnostic", calls, report, "calibration scope is invalid");
  const verificationKey = attestationKey ?? (expectedScope?.model === "mock" ? calibrationAttestationKey("mock") : undefined);
  if (!verificationKey) return resolution("diagnostic", calls, report, "calibration attestation key is unavailable");
  const { attestation: _attestation, ...reportWithoutAttestation } = report;
  if (report.attestation !== await calibrationAttestation(reportWithoutAttestation, verificationKey)) return resolution("diagnostic", calls, report, "calibration attestation does not match the issued package");
  if (report.id !== identity.id || report.version !== identity.version || report.hash !== identity.hash) return resolution("diagnostic", calls, report, "calibration identity does not match the frozen v1 package");
  if (expectedScope && canonicalJson(report.scope) !== canonicalJson(expectedScope)) return resolution("diagnostic", calls, report, "calibration scope does not match the scoring provider/model");
  if (!(await verifyCalibrationSnapshot())) return resolution("diagnostic", calls, report, "calibration snapshot is not verified");
  const gate = await evaluateCalibrationMedians(report.medians, contract.thresholds);
  if (report.status !== "qualified" || calls !== contract.manifest.max_calls || !gate.qualified) return resolution("diagnostic", calls, report, "calibration gate is not qualified");
  return resolution("qualified", calls, report);
}

export async function verifyCalibrationSnapshot(): Promise<boolean> {
  const snapshot = await Bun.file(calibrationSnapshotPath).json() as { source_files?: Record<string, string>; rubric_hash?: string };
  if (!snapshot.source_files || typeof snapshot.rubric_hash !== "string") return false;
  const actualFiles = await calibrationSourceFiles();
  const snapshotFiles = Object.keys(snapshot.source_files).sort();
  if (JSON.stringify(actualFiles) !== JSON.stringify(snapshotFiles)) return false;
  for (const [file, expected] of Object.entries(snapshot.source_files)) if (await sha256File(calibrationSourcePath(file)) !== expected) return false;
  return snapshot.rubric_hash === await (await import("./rubric")).rubricHash();
}

export async function evaluateCalibrationMedians(medians: Partial<Record<CalibrationFixtureId, number>>, suppliedThresholds?: CalibrationThresholds): Promise<{ qualified: boolean; reason?: string }> {
  const thresholds = suppliedThresholds ?? (await loadCalibrationContract()).thresholds;
  if (!validMedians(medians)) return { qualified: false, reason: "calibration medians are invalid" };
  const reference = medians.reference;
  const equivalent = medians.equivalent;
  const antiPattern = medians["anti-pattern"];
  if (reference === undefined || equivalent === undefined || antiPattern === undefined) return { qualified: false, reason: "calibration did not produce all fixture medians" };
  if (reference < thresholds.reference_min) return { qualified: false, reason: "reference median is below the minimum" };
  if (Math.abs(reference - equivalent) > thresholds.equivalent_max_difference) return { qualified: false, reason: "equivalent median differs too much from reference" };
  if (antiPattern > thresholds.anti_pattern_max) return { qualified: false, reason: "anti-pattern median is above the maximum" };
  if (reference - antiPattern < thresholds.reference_min_difference) return { qualified: false, reason: "reference and anti-pattern are not sufficiently separated" };
  return { qualified: true };
}

function observedScore(result: JudgeResultV1): number | undefined {
  return result.state === "observed" && Number.isInteger(result.score) ? result.score : undefined;
}

export async function runCalibration(options: {
  mode: "mock" | "real";
  score: (evidence: ReplanEvidence, capability: unknown) => Promise<CalibrationScore>;
  repetitions?: number;
  max_calls?: number;
  env?: Record<string, string | undefined>;
  scope?: CalibrationScope;
  attestation_key?: string;
}): Promise<CalibrationReport> {
  const started = performance.now();
  const usageAccumulator = newUsageAccumulator();
  const elapsed = () => Math.max(0, Math.round(performance.now() - started));
  const finish = (report: Omit<CalibrationReport, "attestation" | "duration_ms" | "usage">, attestationKey?: string) => issueReport({ ...report, duration_ms: elapsed(), usage: finalizeUsage(usageAccumulator) }, attestationKey);
  const scope = options.scope ?? calibrationScope(options.mode === "real" ? options.env?.LORELUM_JUDGE_MODEL ?? null : "mock");
  const attestationKey = options.attestation_key ?? calibrationAttestationKey(options.mode, options.env);
  if (!(await verifyCalibrationSnapshot())) return finish({ id: calibrationId, version: calibrationVersion, hash: await sha256Text("unverified calibration snapshot"), status: "diagnostic", calls: 0, medians: {}, scope, reason: "calibration snapshot is not verified" }, attestationKey);
  let contract: CalibrationContract;
  try {
    contract = await loadCalibrationContract();
  } catch {
    return finish({ id: calibrationId, version: calibrationVersion, hash: await sha256Text("invalid calibration contract"), status: "diagnostic", calls: 0, medians: {}, scope, reason: "calibration contract is invalid" }, attestationKey);
  }
  const identity = await calibrationIdentity();
  const repetitions = options.repetitions ?? contract.manifest.repetitions;
  const maxCalls = options.max_calls ?? contract.manifest.max_calls;
  if (!Number.isInteger(repetitions) || repetitions !== contract.manifest.repetitions || !Number.isInteger(maxCalls) || maxCalls !== contract.manifest.max_calls) return finish({ ...identity, status: "diagnostic", calls: 0, medians: {}, scope, reason: "calibration budget does not match v1" }, attestationKey);
  if (options.mode === "real" && options.env?.LORELUM_JUDGE_REAL !== "1") return finish({ ...identity, status: "not-run", calls: 0, medians: {}, scope, reason: "real calibration requires LORELUM_JUDGE_REAL=1" }, attestationKey);
  if (options.mode === "real" && !attestationKey) return finish({ ...identity, status: "diagnostic", calls: 0, medians: {}, scope, reason: "real calibration requires LORELUM_JUDGE_CALIBRATION_KEY" }, attestationKey);
  const medians: Partial<Record<CalibrationFixtureId, number>> = {};
  let calls = 0;
  const fixtures = await loadCalibrationFixtures();
  const capability = {};
  const capabilityState = { active: true, evidenceHashes: new Set(fixtures.map((fixture) => fixture.evidence.evidence_hash)) };
  calibrationCapabilities.set(capability, capabilityState);
  try {
    for (const fixture of fixtures) {
      const scores: number[] = [];
      for (let repeat = 0; repeat < repetitions; repeat += 1) {
        if (calls >= maxCalls) return finish({ ...identity, status: "diagnostic", calls, medians, scope, reason: "calibration call budget exceeded" }, attestationKey);
        let score: number | undefined;
        try {
          const attempt = unpackCalibrationScore(await options.score(fixture.evidence, capability));
          addUsage(usageAccumulator, attempt.usage);
          score = observedScore(attempt.result);
        } catch {
          addUsage(usageAccumulator);
          return finish({ ...identity, status: "diagnostic", calls: calls + 1, medians, scope, reason: "calibration Judge call was unavailable" }, attestationKey);
        }
        calls += 1;
        if (score === undefined) return finish({ ...identity, status: "diagnostic", calls, medians, scope, reason: "calibration did not produce an observed score" }, attestationKey);
        scores.push(score);
      }
      medians[fixture.id] = median(scores);
    }
    const gate = await evaluateCalibrationMedians(medians, contract.thresholds);
    return finish({ ...identity, status: gate.qualified ? "qualified" : "diagnostic", calls, medians, scope, ...(gate.reason ? { reason: gate.reason } : {}) }, attestationKey);
  } finally {
    capabilityState.active = false;
  }
}
