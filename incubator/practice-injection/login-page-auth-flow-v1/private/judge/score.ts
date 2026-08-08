import { dirname, join } from "node:path";
import { sha256Text } from "../../../../../src/benchmark/fs";
import { assertJudgeResultV1, type JudgeCriteriaV1, type JudgeResultV1 } from "../../../../../src/benchmark/outcome/v1/contract";
import { rubricHash, type RubricDoc, type RubricDimension } from "./rubric";

export type SourceMap = Record<string, string>; // repository-relative path -> file content

export type DimensionResult = JudgeCriteriaV1 & { id: RubricDimension["id"] };

type ModuleKind = "transport" | "boundary" | "component" | "other";

function classifyModule(content: string): ModuleKind {
  if (/\bfetch\s*\(/.test(content)) return "transport";
  // A boundary module does not own transport but translates transport results
  // into domain-shaped results (ok: true / ok: false) for components.
  if (/\bok\s*:\s*(true|false)\b/.test(content) && /\bimport\b/.test(content)) return "boundary";
  if (/<form/.test(content)) return "component";
  return "other";
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function resolveImport(fromPath: string, specifier: string, files: SourceMap): string | null {
  if (!specifier.startsWith(".")) return null; // bare or aliased imports are resolved structurally
  const base = dirname(fromPath);
  const candidates = [
    join(base, specifier),
    join(base, `${specifier}.ts`),
    join(base, `${specifier}.tsx`),
    join(base, `${specifier}.js`),
    join(base, `${specifier}.jsx`),
    join(base, specifier, "index.ts"),
    join(base, specifier, "index.tsx"),
    join(base, specifier, "index.js"),
    join(base, specifier, "index.jsx"),
  ].map((candidate) => candidate.split("\\").join("/"));
  for (const candidate of candidates) {
    for (const key of Object.keys(files)) {
      if (key.split("\\").join("/") === candidate) return key;
    }
  }
  return null;
}

function importedModuleKinds(compPath: string, comp: string, files: SourceMap): ModuleKind[] {
  const kinds: ModuleKind[] = [];
  for (const match of comp.matchAll(/\bfrom\s+["']([^"']+)["']/g)) {
    const resolved = resolveImport(compPath, match[1], files);
    if (resolved) kinds.push(classifyModule(files[resolved]));
  }
  return kinds;
}

function projectImportSpecifiers(comp: string): string[] {
  return [...comp.matchAll(/\bfrom\s+["']([^"']+)["']/g)]
    .map((match) => match[1])
    .filter((specifier) => specifier.startsWith(".") || specifier.startsWith("@"));
}

// Boolean submission flags captured from useState(false|true) destructuring.
// The in-progress flag is preferred: the one whose setter is toggled to true.
function booleanStateFlags(comp: string): Array<{ flag: string; setter: string }> {
  const flags: Array<{ flag: string; setter: string }> = [];
  for (const match of comp.matchAll(/const\s*\[\s*([A-Za-z_$][\w$]*)\s*,\s*(set[A-Za-z_$][\w$]*)\s*\]\s*=\s*useState\s*(?:<[^>]*>)?\(\s*(?:false|true)\s*\)/g)) {
    flags.push({ flag: match[1], setter: match[2] });
  }
  return flags.sort((left, right) => {
    const leftToggled = new RegExp(`\\b${escapeRegex(left.setter)}\\(\\s*true\\s*\\)`).test(comp) ? 1 : 0;
    const rightToggled = new RegExp(`\\b${escapeRegex(right.setter)}\\(\\s*true\\s*\\)`).test(comp) ? 1 : 0;
    return rightToggled - leftToggled;
  });
}

function scoreApiPageBoundary(compPath: string, comp: string, files: SourceMap): DimensionResult {
  if (/\bfetch\s*\(/.test(comp)) {
    return { id: "api-page-boundary", points: 0, max_points: 30, rationale: "component performs HTTP transport directly (fetch inside the component)" };
  }
  const readsRaw = /\.status\b/.test(comp) || /\.body\b/.test(comp);
  if (readsRaw) {
    return { id: "api-page-boundary", points: 10, max_points: 30, rationale: "component reads raw transport response fields (status or body); delegate status translation to a boundary module" };
  }
  const kinds = importedModuleKinds(compPath, comp, files);
  if (kinds.includes("boundary")) {
    return { id: "api-page-boundary", points: 30, max_points: 30, rationale: "component delegates HTTP transport and status translation to a boundary module" };
  }
  if (kinds.includes("transport")) {
    return { id: "api-page-boundary", points: 10, max_points: 30, rationale: "component imports a transport module directly without an intermediate boundary" };
  }
  // Aliased or otherwise unresolvable project imports: the component does not
  // fetch or read raw responses, so treat delegation as satisfied structurally.
  if (projectImportSpecifiers(comp).length > 0) {
    return { id: "api-page-boundary", points: 30, max_points: 30, rationale: "component delegates transport through an imported boundary module; the module target is not present in the scored snapshot" };
  }
  return { id: "api-page-boundary", points: 15, max_points: 30, rationale: "no clear transport delegation path is present in the component" };
}

function scoreStateHandling(comp: string): DimensionResult {
  const flag = booleanStateFlags(comp)[0];
  const esc = flag ? escapeRegex(flag.flag) : null;
  const setterEsc = flag ? escapeRegex(flag.setter) : null;
  const checks: Array<[boolean, number, string]> = [
    [Boolean(flag && setterEsc && new RegExp(`\\b${setterEsc}\\(`).test(comp) && /\bfinally\b/.test(comp)), 6, "submission state is tracked and reset when the request settles"],
    [Boolean(esc && new RegExp(`disabled=\\{${esc}\\}`).test(comp)), 8, "inputs and the submit button are disabled while submitting"],
    [Boolean(esc && new RegExp(`if\\s*\\(\\s*${esc}\\s*\\)\\s*return`).test(comp)), 6, "duplicate submission is guarded"],
    [/role="status"/.test(comp), 5, "success feedback is visible to the user"],
    [/role="alert"/.test(comp), 5, "failure feedback is visible to the user"],
  ];
  const met = checks.filter(([ok]) => ok);
  const points = met.reduce((sum, [, weight]) => sum + weight, 0);
  const rationale = met.length === checks.length
    ? "submission state, disable-during-request, duplicate-submit guard, and success and failure feedback are all present"
    : `partial state handling: ${met.map(([, , label]) => label).join("; ") || "no state handling observed"}`;
  return { id: "state-handling", points, max_points: 30, rationale };
}

function scoreFormExperience(comp: string): DimensionResult {
  const flag = booleanStateFlags(comp)[0];
  const esc = flag ? escapeRegex(flag.flag) : null;
  const checks: Array<[boolean, number, string]> = [
    [Boolean(esc && new RegExp(`disabled=\\{${esc}\\}`).test(comp)), 6, "controls are disabled during submission"],
    [/type="email"/.test(comp) && /type="password"/.test(comp), 4, "appropriate email and password input types"],
    [/autoComplete/.test(comp), 2, "autocomplete attributes are present"],
    [Boolean(esc && new RegExp(`aria-busy=\\{${esc}\\}`).test(comp)), 4, "busy state is exposed to assistive technology"],
    [Boolean(esc && new RegExp(`if\\s*\\(\\s*${esc}\\s*\\)\\s*return`).test(comp)), 4, "duplicate submission is prevented"],
  ];
  const met = checks.filter(([ok]) => ok);
  const points = met.reduce((sum, [, weight]) => sum + weight, 0);
  const rationale = met.length === checks.length
    ? "input types, autocomplete, disable-during-request, busy state, and duplicate-submit prevention are all present"
    : `partial form experience: ${met.map(([, , label]) => label).join("; ") || "no form-experience signals observed"}`;
  return { id: "form-experience", points, max_points: 20, rationale };
}

function scoreUiUx(comp: string): DimensionResult {
  const checks: Array<[boolean, number, string]> = [
    [/<label/.test(comp), 5, "form controls have labels"],
    [/aria-labelledby/.test(comp) && /<h1/.test(comp), 5, "page has a clear heading"],
    [/role="status"/.test(comp) || /role="alert"/.test(comp), 5, "feedback uses accessible status or alert roles"],
    [/<main/.test(comp) && /<section/.test(comp), 5, "page uses semantic layout"],
  ];
  const met = checks.filter(([ok]) => ok);
  const points = met.reduce((sum, [, weight]) => sum + weight, 0);
  const rationale = met.length === checks.length
    ? "labels, heading, accessible feedback roles, and semantic layout are all present"
    : `partial ui and ux: ${met.map(([, , label]) => label).join("; ") || "no ui and ux signals observed"}`;
  return { id: "ui-ux", points, max_points: 20, rationale };
}

export function scoreDimensions(files: SourceMap): DimensionResult[] {
  const formFiles = Object.keys(files).filter((path) => /<form/.test(files[path]));
  if (formFiles.length === 0) {
    throw new Error("judge rubric scoring requires at least one component with a form");
  }
  // Prefer the file that wires an onSubmit handler (the page's form); fall back
  // to the first form-bearing file so shared form components are not mistaken
  // for the scored login page.
  const compPath = formFiles.find((path) => /onSubmit/.test(files[path])) ?? formFiles[0];
  const comp = files[compPath];
  return [
    scoreApiPageBoundary(compPath, comp, files),
    scoreStateHandling(comp),
    scoreFormExperience(comp),
    scoreUiUx(comp),
  ];
}

export type ScoreSourceInput = {
  files: SourceMap;
  taskMd: string;
  candidateDiff: string;
  rubricText: string;
  doc: RubricDoc;
  inputHash: string;
  confidence?: number;
};

export async function scoreSource(input: ScoreSourceInput): Promise<JudgeResultV1> {
  const criteria = scoreDimensions(input.files);
  const score = criteria.reduce((sum, criterion) => sum + criterion.points, 0);
  const promptHash = await sha256Text(input.doc.prompt);
  const hash = await rubricHash(input.rubricText);
  return assertJudgeResultV1({
    schema_version: "judge-result/v1",
    judge_version: 1,
    judge: { id: input.doc.judge.id, version: input.doc.judge.version },
    state: "observed",
    score,
    criteria,
    prompt_hash: promptHash,
    rubric_hash: hash,
    input_hash: input.inputHash,
    confidence: input.confidence ?? 100,
  });
}
