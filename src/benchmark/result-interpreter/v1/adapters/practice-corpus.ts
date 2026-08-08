/**
 * practice-diagnostic-corpus/v1 - consolidates multiple profile-diagnostic-summary/v3
 * documents (the #91 expanded-sample corpus) into result-interpreter/v1 units and
 * produces a redacted diagnostic summary report.
 *
 * Slot-replacement follows the #91 N2 denominator rule: a re-admission rerun replaces
 * only the failed/missing slot it targets, never adds a denominator, and counts are
 * never merged across plans. Replacing an already-evaluated slot or using a
 * non-evaluated replacement entry fails closed.
 */

import { interpret } from "../interpret";
import { practiceDecisionRule, practiceToInterpretationInput } from "./practice";
import type { AttemptEntry, ConditionOutcomeCounts, InterpretationInput, SampleUnit, Verdict } from "../types";

export type CorpusUnitSpec = {
  candidate: string;
  profile_input_hash: string;
  primary: string;
  replacements?: Array<{ condition_id: string; repeat: number; source: string }>;
};

export type CorpusManifest = {
  schema_version: "practice-diagnostic-corpus/v1";
  sources: Record<string, string>;
  units: CorpusUnitSpec[];
  historical?: { label: string; note: string };
};

export type CorpusReportUnit = {
  candidate: string;
  profile_input_hash: string;
  verdict: Verdict;
  reasons: string[];
  evidence: SampleUnit;
  conditions: Record<string, ConditionOutcomeCounts>;
};

export type CorpusReport = {
  schema_version: "practice-diagnostic-corpus-report/v1";
  generated_at: string;
  units: CorpusReportUnit[];
  aggregate: {
    verdict_distribution: Record<Verdict, number>;
    execution_gaps: string[];
    overall: "diagnostic-only" | "uncertain";
  };
  historical?: { label: string; note: string };
};

const hashPattern = /^[a-f0-9]{64}$/;

function fail(message: string): never {
  throw new Error(`Invalid practice-diagnostic-corpus/v1 input: ${message}`);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function plannedKey(conditionId: string, repeat: number): string {
  return `${conditionId}\0${repeat}`;
}

function validateManifest(value: unknown): CorpusManifest {
  if (!isRecord(value)) fail("manifest must be an object");
  if (value.schema_version !== "practice-diagnostic-corpus/v1") fail(`schema_version must be practice-diagnostic-corpus/v1, got ${String(value.schema_version)}`);
  if (!isRecord(value.sources)) fail("sources must be an object");
  const sources: Record<string, string> = {};
  for (const [name, rel] of Object.entries(value.sources)) {
    if (typeof rel !== "string" || rel.length === 0) fail(`sources.${name} must be a non-empty relative path`);
    sources[name] = rel;
  }
  if (!Array.isArray(value.units) || value.units.length === 0) fail("units must be a non-empty array");
  const units: CorpusUnitSpec[] = value.units.map((raw, index) => {
    if (!isRecord(raw)) fail(`units[${index}] must be an object`);
    const candidate = raw.candidate;
    const inputHash = raw.profile_input_hash;
    const primary = raw.primary;
    if (typeof candidate !== "string" || candidate.length === 0) fail(`units[${index}].candidate must be a non-empty string`);
    if (typeof inputHash !== "string" || !hashPattern.test(inputHash)) fail(`units[${index}].profile_input_hash must be a 64-hex hash`);
    if (typeof primary !== "string" || !(primary in sources)) fail(`units[${index}].primary must reference a declared source`);
    const spec: CorpusUnitSpec = { candidate, profile_input_hash: inputHash, primary };
    if (raw.replacements !== undefined) {
      if (!Array.isArray(raw.replacements)) fail(`units[${index}].replacements must be an array`);
      spec.replacements = raw.replacements.map((replacement, j) => {
        if (!isRecord(replacement)) fail(`units[${index}].replacements[${j}] must be an object`);
        const conditionId = replacement.condition_id;
        const repeat = replacement.repeat;
        const source = replacement.source;
        if (typeof conditionId !== "string" || conditionId.length === 0) fail(`units[${index}].replacements[${j}].condition_id is invalid`);
        if (!Number.isInteger(repeat) || (repeat as number) < 1) fail(`units[${index}].replacements[${j}].repeat must be a positive integer`);
        if (typeof source !== "string" || !(source in sources)) fail(`units[${index}].replacements[${j}].source must reference a declared source`);
        return { condition_id: conditionId, repeat: repeat as number, source };
      });
    }
    return spec;
  });
  const manifest: CorpusManifest = { schema_version: "practice-diagnostic-corpus/v1", sources, units };
  if (isRecord(value.historical) && typeof value.historical.label === "string" && typeof value.historical.note === "string") {
    manifest.historical = { label: value.historical.label, note: value.historical.note };
  }
  return manifest;
}

function findUnit(input: InterpretationInput, candidate: string, inputHash: string) {
  return input.units.find((unit) => unit.plan.sample_unit.candidate === candidate && unit.plan.sample_unit.input_hash === inputHash);
}

/** Consolidates the corpus into a single result-interpreter/v1 InterpretationInput. */
export function practiceCorpusToInterpretationInput(manifestValue: unknown, summaries: Record<string, unknown>): InterpretationInput {
  const manifest = validateManifest(manifestValue);
  const units: InterpretationInput["units"] = [];
  for (const spec of manifest.units) {
    const primary = summaries[spec.primary];
    if (primary === undefined) fail(`missing primary source: ${spec.primary}`);
    const input = practiceToInterpretationInput(primary);
    const unit = findUnit(input, spec.candidate, spec.profile_input_hash);
    if (!unit) fail(`no unit ${spec.candidate}/${spec.profile_input_hash} in primary source ${spec.primary}`);

    let entries = [...unit.entries];
    const byKey = new Map(entries.map((entry) => [plannedKey(entry.condition_id, entry.repeat), entry]));
    for (const replacement of spec.replacements ?? []) {
      const key = plannedKey(replacement.condition_id, replacement.repeat);
      const target = byKey.get(key);
      if (target && target.outcome.health === "evaluated") fail(`replacement targets already-evaluated slot ${replacement.condition_id}#${replacement.repeat}`);
      const sourceSummary = summaries[replacement.source];
      if (sourceSummary === undefined) fail(`missing replacement source: ${replacement.source}`);
      const replacementInput = practiceToInterpretationInput(sourceSummary);
      const replacementUnit = findUnit(replacementInput, spec.candidate, spec.profile_input_hash);
      if (!replacementUnit) fail(`no unit ${spec.candidate}/${spec.profile_input_hash} in replacement source ${replacement.source}`);
      const picks = replacementUnit.entries.filter((entry) => entry.condition_id === replacement.condition_id && entry.outcome.health === "evaluated");
      if (picks.length === 0) fail(`replacement source has no evaluated entry for ${replacement.condition_id}`);
      const pick: AttemptEntry = {
        ...picks[0],
        sample_unit: unit.plan.sample_unit,
        condition_id: replacement.condition_id,
        repeat: replacement.repeat,
      };
      entries = entries.map((entry) => (plannedKey(entry.condition_id, entry.repeat) === key ? pick : entry));
      byKey.set(key, pick);
    }
    units.push({ plan: unit.plan, entries, decision_rule: practiceDecisionRule });
  }
  return { units };
}

/** Builds the redacted machine-readable corpus report. */
export function practiceCorpusReport(manifestValue: unknown, summaries: Record<string, unknown>): CorpusReport {
  const manifest = validateManifest(manifestValue);
  const input = practiceCorpusToInterpretationInput(manifest, summaries);
  const summary = interpret(input);
  const units: CorpusReportUnit[] = summary.units.map((unit) => ({
    candidate: unit.sample_unit.candidate,
    profile_input_hash: unit.sample_unit.input_hash,
    verdict: unit.verdict,
    reasons: unit.reasons,
    evidence: unit.sample_unit,
    conditions: unit.conditions,
  }));
  return {
    schema_version: "practice-diagnostic-corpus-report/v1",
    generated_at: new Date().toISOString(),
    units,
    aggregate: {
      verdict_distribution: summary.cross_unit.verdict_distribution,
      execution_gaps: summary.cross_unit.execution_gaps,
      overall: summary.overall,
    },
    ...(manifest.historical ? { historical: manifest.historical } : {}),
  };
}

/** Renders the redacted human-readable markdown report. */
export function practiceCorpusReportMarkdown(report: CorpusReport): string {
  const lines: string[] = [];
  lines.push("# #92 Practice 注入诊断汇总（脱敏）");
  lines.push("");
  lines.push(`生成时间：${report.generated_at}`);
  lines.push("");
  lines.push("## 单元判定");
  lines.push("");
  for (const unit of report.units) {
    lines.push(`### ${unit.candidate}`);
    lines.push("");
    lines.push(`- verdict: \`${unit.verdict}\``);
    lines.push(`- 证据：source_commit=\`${unit.evidence.source_commit}\`、snapshot_id=\`${unit.evidence.snapshot_id}\`、profile_input_hash=\`${unit.evidence.input_hash}\``);
    if (unit.reasons.length > 0) lines.push(`- reasons: ${unit.reasons.join(", ")}`);
    lines.push("");
    lines.push("| 条件 | planned | evaluated | joint_pass |");
    lines.push("| --- | --- | --- | --- |");
    for (const [condition, counts] of Object.entries(unit.conditions)) {
      lines.push(`| ${condition} | ${counts.planned} | ${counts.evaluated} | ${counts.joint_pass} |`);
    }
    lines.push("");
  }
  lines.push("## 跨单元分布与执行缺口");
  lines.push("");
  lines.push(`verdict_distribution: ${JSON.stringify(report.aggregate.verdict_distribution)}`);
  lines.push(`execution_gaps: ${report.aggregate.execution_gaps.length === 0 ? "无" : report.aggregate.execution_gaps.join("; ")}`);
  lines.push(`overall: \`${report.aggregate.overall}\``);
  lines.push("");
  if (report.historical) {
    lines.push("## 历史背景（不可比较）");
    lines.push("");
    lines.push(`- ${report.historical.label}: ${report.historical.note}`);
    lines.push("");
  }
  lines.push("## 收口（#92 口径）");
  lines.push("");
  if (report.aggregate.overall === "uncertain") {
    lines.push("- **不确定**：存在执行缺口/未完成单元，按 #92 口径不强行推进，缺口如上列出。");
  } else if (report.aggregate.verdict_distribution.signal > 0) {
    lines.push("- **成功（诊断级方向性信号）**：已按 strict joint-pass rule 产出逐单元判定，存在 signal 单元；仅为诊断证据，不构成通用结论，扩大样本后需复核。");
  } else {
    lines.push("- **成功（无方向性信号）**：全部单元健康，判定为 diagnostic-only。");
  }
  lines.push("- 本汇总未创建正式 run manifest / record / suite revision；无加权总分、无聚合 signal。");
  lines.push("");
  return lines.join("\n");
}