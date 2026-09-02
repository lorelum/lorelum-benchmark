import { readdir, readFile } from "node:fs/promises";
import { join, relative, resolve, sep } from "node:path";
import ts from "typescript";
import { sha256File, sha256Text } from "../../../fs";
import { isGeneratedWorkspacePath } from "../../../kernel/profiles/shared/workspace-generated/v1";
import type {
  StructureCheck,
  StructureCheckId,
  StructureEvaluationInput,
  StructureEvaluationResult,
  StructureLabel,
  StructureMetrics,
} from "./types";

type Role = "handler" | "transport" | "policy" | "ledger" | "registry" | "unknown";
type Declaration = {
  key: string;
  file: string;
  kind: string;
  name: string;
  astNodeCount: number;
  normalizedHash: string;
  roles: Set<Role>;
  imports: Set<string>;
  calls: Set<string>;
  evidence: Set<string>;
};

const networkSignals = ["fetch(", "http.request", "https.request", "new request", "xmlhttprequest", "axios"];
const ledgerSignals = [".jsonl", "appendfile", "usage", "cost", "billing", "charge", "latency_ms", "trace_id"];
const policySignals = ["retry", "fallback", "timeout", "budget", "idempot", "semaphore", "mutex", "reservation", "concurren"];
const handlerSignals = ["incomingmessage", "serverresponse", "sendjson", "route", "endpoint", "create_request_handler", "request", "response"];

function normalized(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function collectIdentifiers(node: ts.Node): string[] {
  const identifiers: string[] = [];
  const visit = (child: ts.Node): void => {
    if (ts.isIdentifier(child)) identifiers.push(child.text);
    child.forEachChild(visit);
  };
  visit(node);
  return identifiers;
}

async function productionFiles(root: string): Promise<string[]> {
  const output: string[] = [];
  async function walk(current: string): Promise<void> {
    const entries = await readdir(current, { withFileTypes: true });
    for (const entry of entries) {
      if (isGeneratedWorkspacePath(entry.name)) continue;
      const path = join(current, entry.name);
      if (entry.isDirectory()) await walk(path);
      else if (entry.isFile() && /\.(ts|tsx)$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name)) output.push(path);
    }
  }
  await walk(resolve(root));
  return output.sort();
}

function declarationName(node: ts.Node): string {
  const named = node as { name?: ts.Node };
  if (named.name && ts.isIdentifier(named.name)) return named.name.text;
  if (ts.isVariableStatement(node)) {
    const declaration = node.declarationList.declarations[0];
    return declaration && ts.isIdentifier(declaration.name) ? declaration.name.text : "<anonymous>";
  }
  return "<anonymous>";
}

function declarationIdentity(node: ts.Node, file: string, source: ts.SourceFile): string {
  const name = declarationName(node);
  if (name !== "<anonymous>") return `${file}::${name}`;
  const { line, character } = source.getLineAndCharacterOfPosition(node.getStart());
  return `${file}::<${line + 1}:${character + 1}>`;
}

function clientTableEntries(node: ts.ObjectLiteralExpression): boolean {
  return node.properties.length >= 2 && node.properties.every((property) => {
    const initializer = (property as ts.PropertyAssignment).initializer;
    if (!initializer) return false;
    if (ts.isIdentifier(initializer)) return true;
    // A per-provider client object must bind at least one callable member by
    // identifier (for example `{ chat: chatWithHalo }`), keeping the table an
    // executable dispatch surface rather than passive configuration.
    return ts.isObjectLiteralExpression(initializer) && initializer.properties.some((member) => {
      const value = (member as ts.PropertyAssignment).initializer;
      return value !== undefined && ts.isIdentifier(value);
    });
  });
}

async function collectDeclaration(node: ts.Node, file: string, source: ts.SourceFile, transportUsage: Map<string, Set<string>>): Promise<Declaration | null> {
  const isDeclaration = ts.isFunctionDeclaration(node) || ts.isClassDeclaration(node) || ts.isMethodDeclaration(node)
    || ts.isVariableStatement(node) || ts.isInterfaceDeclaration(node) || ts.isTypeAliasDeclaration(node)
    || ts.isEnumDeclaration(node);
  if (!isDeclaration) return null;
  const declaration: Declaration = {
    key: declarationIdentity(node, file, source),
    file,
    kind: ts.SyntaxKind[node.kind],
    name: declarationName(node),
    astNodeCount: 0,
    normalizedHash: "",
    roles: new Set<Role>(),
    imports: new Set(),
    calls: new Set(),
    evidence: new Set(),
  };
  const visit = (child: ts.Node): void => {
    declaration.astNodeCount++;
    const lower = child.getText(source).toLowerCase();
    for (const signal of networkSignals) if (lower.includes(signal)) { declaration.roles.add("transport"); declaration.evidence.add("outbound-network-call"); }
    for (const signal of ledgerSignals) if (lower.includes(signal)) { declaration.roles.add("ledger"); declaration.evidence.add(`ledger:${signal}`); }
    for (const signal of policySignals) if (lower.includes(signal)) { declaration.roles.add("policy"); declaration.evidence.add(`policy:${signal}`); }
    for (const signal of handlerSignals) if (lower.includes(signal)) { declaration.roles.add("handler"); declaration.evidence.add(`handler:${signal}`); }
    const dispatchEntries = ts.isObjectLiteralExpression(child) && clientTableEntries(child);
    if (dispatchEntries || (ts.isSwitchStatement(child) && child.caseBlock.clauses.length >= 2)) {
      declaration.roles.add("registry"); declaration.evidence.add("multi-entry dispatch");
    }
    if (ts.isCallExpression(child)) declaration.calls.add(normalized(child.expression.getText(source)));
    if (ts.isCallExpression(child) && networkSignals.some((signal) => ` ${normalized(child.expression.getText(source)).toLowerCase()}(`.includes(signal))) {
      // Endpoint/base-URL constants passed into an outbound call inherit the
      // transport role from their executable use site; the declaration itself
      // stays passive data and has no other role evidence.
      collectIdentifiers(child).forEach((identifier) => {
        if (!transportUsage.has(identifier)) transportUsage.set(identifier, new Set());
        transportUsage.get(identifier)!.add(file);
      });
    }
    if (ts.isNewExpression(child)) declaration.calls.add(normalized(`new ${child.expression.getText(source)}`));
    if (ts.isImportDeclaration(child) && child.importClause) {
      declaration.imports.add(child.moduleSpecifier.getText(source).replace(/["']/g, ""));
      if (child.importClause.name) declaration.imports.add(child.importClause.name.text);
      child.importClause.namedBindings?.forEachChild((binding) => {
        if (ts.isImportSpecifier(binding)) declaration.imports.add(binding.name.text);
      });
    }
    child.forEachChild(visit);
  };
  visit(node);
  const stripped = node.getText(source).replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*/g, "");
  declaration.normalizedHash = await sha256Text(normalized(stripped));
  if (declaration.roles.size === 0) declaration.roles.add("unknown");
  return declaration;
}

export async function analyzeSource(root: string): Promise<{ files: string[]; declarations: Declaration[]; reasons: string[] }> {
  const reasons: string[] = [];
  const files = await productionFiles(root);
  const declarations: Declaration[] = [];
  const transportUsage = new Map<string, Set<string>>();
  for (const path of files) {
    const file = relative(resolve(root), path).split(sep).join("/");
    let source: ts.SourceFile;
    try {
      const text = await readFile(path, "utf8");
      source = ts.createSourceFile(path, text, ts.ScriptTarget.Latest, true, path.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
    } catch (error) {
      reasons.push(`unparseable:${file}`);
      continue;
    }
    if (source.parseDiagnostics.length > 0) reasons.push(`parse-error:${file}`);
    const collect = async (node: ts.Node): Promise<void> => {
      const declaration = await collectDeclaration(node, file, source, transportUsage);
      if (declaration) declarations.push(declaration);
    };
    for (const statement of source.statements) {
      await collect(statement);
      if (ts.isClassDeclaration(statement)) {
        for (const member of statement.members) {
          if (ts.isMethodDeclaration(member)) await collect(member);
        }
      }
    }
  }
  for (const declaration of declarations) {
    if (declaration.roles.size !== 1 || !declaration.roles.has("unknown")) continue;
    const usedInFiles = transportUsage.get(declaration.name);
    if (usedInFiles && usedInFiles.has(declaration.file)) {
      declaration.roles.add("transport");
      declaration.evidence.add("transport:endpoint-argument");
    }
  }
  return { files, declarations, reasons };
}

function changedDeclarations(stage1: Declaration[], stage2: Declaration[]): { changed: Declaration[]; deleted: number; replaced: number } {
  const before = new Map(stage1.map((declaration) => [declaration.key, declaration]));
  const after = new Map(stage2.map((declaration) => [declaration.key, declaration]));
  const changed: Declaration[] = [];
  let replaced = 0;
  for (const declaration of stage2) {
    const original = before.get(declaration.key);
    if (!original || original.normalizedHash !== declaration.normalizedHash) changed.push(declaration);
  }
  for (const declaration of stage1) {
    const replacement = after.get(declaration.key);
    if (!replacement) changed.push(declaration);
    else if (replacement.normalizedHash !== declaration.normalizedHash) replaced++;
  }
  return { changed, deleted: stage1.filter((declaration) => !after.has(declaration.key)).length, replaced };
}

function metrics(stage1: Declaration[], stage2: Declaration[]): StructureMetrics {
  const { changed, deleted, replaced } = changedDeclarations(stage1, stage2);
  const byFile = new Map<string, number>();
  for (const declaration of changed) byFile.set(declaration.file, (byFile.get(declaration.file) ?? 0) + 1);
  const count = (role: Role) => changed.filter((declaration) => declaration.roles.has(role)).length;
  const total = Math.max(1, changed.length);
  return {
    changed_production_files: new Set(changed.map((declaration) => declaration.file)).size,
    changed_declarations: changed.length,
    handler_changed_declarations: count("handler"),
    policy_changed_declarations: count("policy"),
    ledger_changed_declarations: count("ledger"),
    transport_changed_declarations: count("transport"),
    deleted_stage_1_declarations: deleted,
    replaced_stage_1_declarations: replaced,
    normalized_changed_ast_nodes: changed.reduce((sum, declaration) => sum + declaration.astNodeCount, 0),
    maximum_single_file_edit_share: changed.length === 0 ? 0 : Math.max(0, ...byFile.values()) / total,
  };
}

function check(id: StructureCheckId, state: StructureLabel, reason: string): StructureCheck {
  return { id, state, reason };
}

function dominantRole(declaration: Declaration): Role {
  if (declaration.roles.has("transport")) return "transport";
  if (declaration.roles.has("handler")) return "handler";
  if (declaration.roles.has("ledger")) return "ledger";
  if (declaration.roles.has("policy")) return "policy";
  if (declaration.roles.has("registry")) return "registry";
  return "unknown";
}

type SourceAnalysis = Awaited<ReturnType<typeof analyzeSource>>;

function structuralChecks(stage1: SourceAnalysis, stage2: SourceAnalysis, structureMetrics: StructureMetrics): StructureCheck[] {
  if (stage1.reasons.length > 0 || stage2.reasons.length > 0) {
    return ["handler-stability", "transport-isolation", "policy-continuity", "ledger-continuity", "provider-extension-locality", "diff-classifiability"]
      .map((id) => check(id as StructureCheckId, "indeterminate", "source classification ambiguity"));
  }
  const handlers = (source: typeof stage1) => source.declarations.filter((declaration) => dominantRole(declaration) === "handler");
  const policies = (source: typeof stage1) => source.declarations.filter((declaration) => dominantRole(declaration) === "policy");
  const ledgers = (source: typeof stage1) => source.declarations.filter((declaration) => dominantRole(declaration) === "ledger");
  const transports = (source: typeof stage1) => source.declarations.filter((declaration) => dominantRole(declaration) === "transport");
  const handlerStable = handlers(stage1).length > 0 && handlers(stage2).length > 0
    && handlers(stage2).every((handler) => dominantRole(handler) !== "transport" && !handler.roles.has("transport"))
    && handlers(stage1).every((handler) => stage2.declarations.some((candidate) => candidate.key === handler.key && candidate.normalizedHash === handler.normalizedHash));
  const policyContinuous = policies(stage1).length > 0 && stage2.declarations.some((declaration) => policies(stage1).some((policy) => policy.key === declaration.key && policy.normalizedHash === declaration.normalizedHash));
  const ledgerContinuous = ledgers(stage1).length > 0 && stage2.declarations.some((declaration) => ledgers(stage1).some((ledger) => ledger.key === declaration.key && ledger.normalizedHash === declaration.normalizedHash));
  const { changed } = changedDeclarations(stage1.declarations, stage2.declarations);
  const transportNames = new Set(transports(stage2).map((declaration) => declaration.name));
  const crossedBoundary = changed.filter((declaration) => dominantRole(declaration) === "handler" && (
    dominantRole(declaration) !== "transport" && declaration.roles.has("transport") ||
    [...declaration.calls].some((call) => transportNames.has(call.split(".").pop() ?? call))
  ));
  const transportIsolated = transports(stage2).length >= 2 && crossedBoundary.length === 0 && handlerStable;
  const locality = transports(stage2).length >= 2 && changed.every((declaration) => ["transport", "registry", "handler"].includes(dominantRole(declaration)));
  const share = structureMetrics.maximum_single_file_edit_share;
  const roleEvidence = new Set(changed.map((declaration) => dominantRole(declaration)));
  const classifiable = changed.length === 0 || !roleEvidence.has("unknown");
  return [
    check("handler-stability", handlerStable ? "pass" : "fail", handlerStable ? "stage 1 handler behavior preserved" : "handler changed, missing, or directly performs transport"),
    check("transport-isolation", transportIsolated ? "pass" : "fail", transportIsolated ? "outbound transport remains adapter-local" : "transport role absent or crosses a non-transport boundary"),
    check("policy-continuity", policyContinuous ? "pass" : "fail", policyContinuous ? "retry/fallback/budget policy remains stable" : "no stable executable policy boundary"),
    check("ledger-continuity", ledgerContinuous ? "pass" : "fail", ledgerContinuous ? "usage and billing observation remains stable" : "no stable executable ledger boundary"),
    check("provider-extension-locality", locality && share < 0.75 ? "pass" : "fail", locality && share < 0.75 ? "provider extension is local and concentrated" : "provider addition rewrites unrelated boundaries or is too diffuse"),
    check("diff-classifiability", classifiable ? "pass" : "indeterminate", classifiable ? "all production declarations have executable role evidence" : "one or more production declarations lack sufficient role evidence"),
  ];
}

async function verifySnapshot(root: string, files: { path: string; sha256: string }[]): Promise<boolean> {
  for (const expected of files) {
    try {
      const content = await readFile(join(root, expected.path));
      if (await sha256File(join(root, expected.path)) !== expected.sha256) return false;
    } catch {
      return false;
    }
  }
  return files.length > 0;
}

export async function evaluateTwoStageStructure(input: StructureEvaluationInput): Promise<StructureEvaluationResult> {
  const [stage1, stage2] = await Promise.all([analyzeSource(input.stage_1_root), analyzeSource(input.stage_2_root)]);
  const snapshotValid = await verifySnapshot(input.stage_1_root, input.stage_1_snapshot.files);
  const structureMetrics = metrics(stage1.declarations, stage2.declarations);
  const checks: StructureCheck[] = [
    check("stage-1-semantic", input.semantic.stage_1 === "pass" ? "pass" : input.semantic.stage_1 === "fail" ? "fail" : "indeterminate", "stage 1 semantic gate"),
    check("stage-2-semantic", input.semantic.stage_2 === "pass" ? "pass" : input.semantic.stage_2 === "fail" ? "fail" : "indeterminate", "stage 2 semantic gate"),
    check("stage-1-snapshot-integrity", snapshotValid ? "pass" : "fail", snapshotValid ? "stage 1 snapshot matches immutable inputs" : "stage 1 snapshot mismatch"),
    ...structuralChecks(stage1, stage2, structureMetrics),
  ];
  const snapshotUnhealthy = !snapshotValid;
  const structuralAmbiguous = checks.slice(3).some((entry) => entry.state === "indeterminate");
  const structurePass = checks.every((entry) => entry.state === "pass");
  return {
    schema_version: "two-stage-structure-result/v1",
    execution_health: snapshotUnhealthy ? "execution-unhealthy" : "evaluated",
    checks,
    metrics: structureMetrics,
    structure_pass: structurePass,
  };
}
