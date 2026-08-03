import { resolve, relative, isAbsolute } from "node:path";
import { sha256Text, workspaceRoot } from "../fs";

export type PublicRunMaterial = {
  path: string;
  kind: "public/task.md" | "public/starter" | "candidate-diff" | "candidate-source" | "declared-public";
  content?: string;
};

export type JudgeInput = {
  task_md: string;
  candidate_diff: string;
  rubric: string;
  input_hash: string;
  material: PublicRunMaterial[];
};

// Known private markers. Path-level allowlist is the enforcement gate; these
// markers are a secondary guard for non-path string fields and only match
// path-like or key-like tokens to avoid rejecting legitimate public text.
const privateMarkers = [
  "private/",
  "oracle/",
  "oracle.yaml",
  "condition_id:",
  "practice_payload",
  "practice payload",
  "calibration/",
  "evaluator/",
  ".practice-runtime/",
  "rule-audit"
];

export function looksPrivate(text: string): boolean {
  const lower = text.toLowerCase();
  return privateMarkers.some((marker) => lower.includes(marker.toLowerCase()));
}

function redactToken(text: string): string {
  let out = text;
  for (const marker of privateMarkers) {
    out = out.replaceAll(marker.toLowerCase(), "[redacted]").replaceAll(marker.toUpperCase(), "[redacted]");
  }
  return out;
}

export function redactedReason(reason: string): string {
  return `judge input rejected: ${redactToken(reason)}`;
}

function normalizedPath(path: string): string {
  return path.split("\\").join("/");
}

// Path-level allowlist: the resolved path must stay inside the workspace and
// pass through a directory segment named exactly "public" (for example
// public/... or suites/<suite>/tasks/<slug>/vN/public/...).
export function isAllowedPublicPath(path: string): { allowed: boolean; reason?: string } {
  const resolved = resolve(workspaceRoot, path);
  const fromRoot = relative(workspaceRoot, resolved);
  if (isAbsolute(fromRoot) || fromRoot.startsWith("..") || normalizedPath(fromRoot).startsWith("..")) {
    return { allowed: false, reason: `path escapes workspace: ${path}` };
  }
  const segments = normalizedPath(fromRoot).split("/").filter(Boolean);
  if (!segments.includes("public")) {
    return { allowed: false, reason: `path is not under a public root: ${path}` };
  }
  return { allowed: true };
}

async function readMaterial(item: PublicRunMaterial): Promise<PublicRunMaterial> {
  const check = isAllowedPublicPath(item.path);
  if (!check.allowed) {
    throw new Error(redactedReason(`material outside allowlist: ${check.reason}`));
  }
  const file = Bun.file(resolve(workspaceRoot, item.path));
  if (!(await file.exists())) {
    throw new Error(redactedReason(`material does not exist: ${item.path}`));
  }
  const content = await file.text();
  return { ...item, content };
}

export async function buildJudgeInput(input: {
  task_md: string;
  candidate_diff: string;
  rubric: string;
  material?: PublicRunMaterial[];
}): Promise<JudgeInput> {
  const { task_md, candidate_diff, rubric } = input;
  if (looksPrivate(task_md) || looksPrivate(candidate_diff) || looksPrivate(rubric)) {
    throw new Error(redactedReason("input contains known private markers"));
  }
  const material = [];
  for (const item of input.material ?? []) {
    material.push(await readMaterial(item));
  }
  const materialParts = await Promise.all(
    material.map(async (item) => `${normalizedPath(item.path)}\0${item.content ?? ""}`)
  );
  const inputHash = await sha256Text([task_md, candidate_diff, rubric, ...materialParts].join("\n"));
  return { task_md, candidate_diff, rubric, input_hash: inputHash, material };
}

export { sha256Text, workspaceRoot };