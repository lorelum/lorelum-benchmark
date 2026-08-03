import { sha256Text } from "../fs";

export type PublicRunMaterial = {
  path: string;
  kind: "public/task.md" | "public/starter" | "candidate-diff" | "candidate-source" | "declared-public";
};

export type JudgeInput = {
  task_md: string;
  candidate_diff: string;
  rubric: string;
  input_hash: string;
  material: PublicRunMaterial[];
};

const privateMarkers = ["private/", "oracle", "condition_id", "practice_observation", "practice payload", "calibration"];

function redact(value: string): string {
  return value
    .split(/\r?\n/)
    .map((line) => (looksPrivate(line) ? "[redacted]" : line))
    .join("\n");
}

export function looksPrivate(text: string): boolean {
  const lower = text.toLowerCase();
  return privateMarkers.some((marker) => lower.includes(marker.toLowerCase()));
}

export function redactedReason(reason: string): string {
  return `judge input rejected: ${redact(reason)}`;
}

function allowlisted(material: PublicRunMaterial): boolean {
  return material.path.startsWith("public/") || material.kind === "declared-public";
}

export async function buildJudgeInput(input: {
  task_md: string;
  candidate_diff: string;
  rubric: string;
  material?: PublicRunMaterial[];
}): Promise<JudgeInput> {
  const { task_md, candidate_diff, rubric } = input;
  if (looksPrivate(task_md) || looksPrivate(candidate_diff) || looksPrivate(rubric)) {
    throw new Error(redactedReason("input contains private, condition, Practice, Oracle, or calibration material"));
  }
  const material = input.material ?? [];
  for (const item of material) {
    if (!allowlisted(item)) {
      throw new Error(redactedReason(`material outside allowlist: ${item.path}`));
    }
  }
  const inputHash = await sha256Text([task_md, candidate_diff, rubric].join("\n"));
  return { task_md, candidate_diff, rubric, input_hash: inputHash, material };
}

export { sha256Text };