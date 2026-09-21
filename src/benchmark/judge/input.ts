import { resolve, relative, isAbsolute } from "node:path";
import { realpath } from "node:fs/promises";
import { sha256Text, workspaceRoot } from "../fs";
import { absolutePathPattern, containsSensitiveCredential, redactAbsolutePaths, redactSensitiveCredentials } from "./privacy";

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

const publicMaterialKinds = new Set<PublicRunMaterial["kind"]>(["public/task.md", "public/starter", "candidate-diff", "candidate-source", "declared-public"]);

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
  return privateMarkers.some((marker) => lower.includes(marker.toLowerCase())) || absolutePathPattern.test(text) || containsSensitiveCredential(text);
}

function redactToken(text: string): string {
  let out = redactSensitiveCredentials(redactAbsolutePaths(text));
  for (const marker of privateMarkers) {
    const escaped = marker.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    out = out.replace(new RegExp(escaped, "gi"), "[redacted]");
  }
  return out;
}

export function redactedReason(reason: string): string {
  return `judge input rejected: ${redactToken(reason)}`;
}

function normalizedPath(path: string): string {
  return path.split("\\").join("/");
}

function publicRootRelativePath(path: string): string | undefined {
  const segments = normalizedPath(path).split("/").filter(Boolean);
  if (segments[0] === "public") return "public";
  if (segments[0] === "suites" && segments[2] === "tasks" && /^v[0-9]+$/.test(segments[4] ?? "") && segments[5] === "public") {
    return segments.slice(0, 6).join("/");
  }
  if (segments[0] === "incubator" && ["practice-injection", "skill-trigger-orchestration"].includes(segments[1] ?? "") && segments[3] === "public") {
    return segments.slice(0, 4).join("/");
  }
  if (segments[0] === "src" && segments[1] === "benchmark" && segments[2] === "kernel" && segments[3] === "fixtures" && segments[5] === "public") {
    return segments.slice(0, 6).join("/");
  }
  return undefined;
}

function isInside(root: string, target: string): boolean {
  const fromRoot = normalizedPath(relative(root, target));
  return !isAbsolute(fromRoot) && fromRoot !== ".." && !fromRoot.startsWith("../");
}

function samePath(left: string, right: string): boolean {
  const normalize = (value: string) => normalizedPath(value).replace(/\/$/, "");
  const a = normalize(left);
  const b = normalize(right);
  return process.platform === "win32" ? a.toLowerCase() === b.toLowerCase() : a === b;
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
  if (!publicRootRelativePath(fromRoot)) {
    return { allowed: false, reason: `path is not under a public root: ${path}` };
  }
  return { allowed: true };
}

async function readMaterial(item: PublicRunMaterial): Promise<PublicRunMaterial> {
  if (!item || typeof item.path !== "string" || typeof item.kind !== "string" || !publicMaterialKinds.has(item.kind) || Object.keys(item).some((key) => !["path", "kind", "content"].includes(key))) {
    throw new Error(redactedReason("material shape or kind is not allowlisted"));
  }
  const check = isAllowedPublicPath(item.path);
  if (!check.allowed) {
    throw new Error(redactedReason(`material outside allowlist: ${check.reason}`));
  }
  const resolvedFile = resolve(workspaceRoot, item.path);
  const publicRootRelative = publicRootRelativePath(relative(workspaceRoot, resolvedFile));
  if (!publicRootRelative) throw new Error(redactedReason("material public root could not be resolved"));
  const publicRoot = resolve(workspaceRoot, publicRootRelative);
  let realFile: string;
  let realRoot: string;
  let realWorkspaceRoot: string;
  try {
    realFile = await realpath(resolvedFile);
    realRoot = await realpath(publicRoot);
    realWorkspaceRoot = await realpath(workspaceRoot);
  } catch {
    throw new Error(redactedReason("material realpath could not be verified"));
  }
  const expectedRealRoot = resolve(realWorkspaceRoot, publicRootRelative);
  if (!samePath(realRoot, expectedRealRoot) || !isInside(realWorkspaceRoot, realRoot) || !isInside(realWorkspaceRoot, realFile) || !isInside(realRoot, realFile)) throw new Error(redactedReason("material realpath escapes the workspace or public root"));
  const file = Bun.file(resolvedFile);
  if (!(await file.exists())) {
    throw new Error(redactedReason(`material does not exist: ${item.path}`));
  }
  const content = await file.text();
  if (looksPrivate(content)) throw new Error(redactedReason("material content contains private or absolute-path material"));
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
