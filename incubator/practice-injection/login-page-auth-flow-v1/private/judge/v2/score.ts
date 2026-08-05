import { posix } from "node:path";
import * as ts from "typescript";
import { sha256Text } from "../../../../../../src/benchmark/fs";
import { assertJudgeResultV1, type JudgeResultV1 } from "../../../../../../src/benchmark/outcome/v1/contract";
import { rubricHash, type PracticeDimensionId, type PracticeRubric } from "./rubric";

export type SourceMap = Record<string, string>;
export type PracticeCriterion = { id: PracticeDimensionId; points: number; max_points: number; rationale: string };
export type AnalysisState = "observed" | "indeterminate";
export type Analysis = {
  state: AnalysisState;
  criteria: PracticeCriterion[];
  score: number;
  confidence: number;
  reason?: string;
  audit: string[];
};

type Parsed = { path: string; source: string; file: ts.SourceFile };
type ImportBinding = { local: string; imported: string; source: string; resolved?: string; status: "resolved" | "external" | "unresolved" | "ambiguous" };
type ModuleFacts = {
  parsed: Parsed;
  imports: ImportBinding[];
  hasFetch: boolean;
  rawReads: number;
  transportCalls: number;
  domainTranslations: number;
  rawReturns: number;
  formSubmitHandlers: ts.Expression[];
};
type Resolution = { status: ImportBinding["status"]; path?: string };

const sourceExtensions = [".ts", ".tsx", ".js", ".jsx"];
const projectSpecifier = (value: string): boolean => value.startsWith(".") || value.startsWith("@");
const normalize = (value: string): string => posix.normalize(value.replaceAll("\\", "/")).replace(/^\.\//, "");

function scriptKind(path: string): ts.ScriptKind {
  if (path.endsWith(".tsx")) return ts.ScriptKind.TSX;
  if (path.endsWith(".jsx")) return ts.ScriptKind.JSX;
  if (path.endsWith(".js")) return ts.ScriptKind.JS;
  return ts.ScriptKind.TS;
}

function parseFiles(files: SourceMap): Map<string, Parsed> {
  const parsed = new Map<string, Parsed>();
  for (const [rawPath, source] of Object.entries(files)) {
    const path = normalize(rawPath);
    if (!sourceExtensions.some((extension) => path.endsWith(extension))) continue;
    parsed.set(path, { path, source, file: ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true, scriptKind(path)) });
  }
  return parsed;
}

type AliasRule = { pattern: string; targets: string[]; baseUrl: string };
function aliasRules(files: SourceMap): AliasRule[] {
  const rules: AliasRule[] = [];
  for (const path of ["tsconfig.json", "tsconfig.app.json"]) {
    const source = files[path];
    if (!source) continue;
    const parsed = ts.parseConfigFileTextToJson(path, source).config as { compilerOptions?: { baseUrl?: string; paths?: Record<string, string[]> } } | undefined;
    const options = parsed?.compilerOptions;
    if (!options?.paths) continue;
    const baseUrl = normalize(options.baseUrl ?? ".");
    for (const [pattern, targets] of Object.entries(options.paths)) {
      if (Array.isArray(targets) && targets.every((target) => typeof target === "string")) rules.push({ pattern, targets, baseUrl });
    }
  }
  return rules;
}

function candidatesFor(base: string, files: Map<string, Parsed>): string[] {
  const normalized = normalize(base);
  const candidates = [normalized, ...sourceExtensions.map((extension) => `${normalized}${extension}`), ...sourceExtensions.map((extension) => `${normalized}/index${extension}`)];
  return [...new Set(candidates)].filter((candidate) => files.has(candidate));
}

function resolveImport(fromPath: string, specifier: string, files: Map<string, Parsed>, aliases: AliasRule[]): Resolution {
  if (!projectSpecifier(specifier)) return { status: "external" };
  const bases: string[] = [];
  if (specifier.startsWith(".")) bases.push(posix.join(posix.dirname(fromPath), specifier));
  for (const rule of aliases) {
    const star = rule.pattern.indexOf("*");
    if (star < 0 && rule.pattern !== specifier) continue;
    if (star < 0) {
      for (const target of rule.targets) bases.push(posix.join(rule.baseUrl, target));
    } else if (specifier.startsWith(rule.pattern.slice(0, star)) && specifier.endsWith(rule.pattern.slice(star + 1))) {
      const middle = specifier.slice(star, specifier.length - (rule.pattern.length - star - 1));
      for (const target of rule.targets) bases.push(posix.join(rule.baseUrl, target.replace("*", middle)));
    }
  }
  const matches = [...new Set(bases.flatMap((base) => candidatesFor(base, files)))];
  if (matches.length === 1) return { status: "resolved", path: matches[0] };
  if (matches.length > 1) return { status: "ambiguous" };
  return { status: "unresolved" };
}

function walk(node: ts.Node, visit: (node: ts.Node) => void): void {
  visit(node);
  node.forEachChild((child) => walk(child, visit));
}

function importBindings(parsed: Parsed, files: Map<string, Parsed>, aliases: AliasRule[]): ImportBinding[] {
  const bindings: ImportBinding[] = [];
  walk(parsed.file, (node) => {
    if (!ts.isImportDeclaration(node) || !ts.isStringLiteral(node.moduleSpecifier)) return;
    const source = node.moduleSpecifier.text;
    const resolution = resolveImport(parsed.path, source, files, aliases);
    const status = resolution.status;
    const clause = node.importClause;
    if (!clause) return;
    if (clause.name) bindings.push({ local: clause.name.text, imported: "default", source, resolved: resolution.path, status });
    const named = clause.namedBindings;
    if (named && ts.isNamespaceImport(named)) bindings.push({ local: named.name.text, imported: "*", source, resolved: resolution.path, status });
    if (named && ts.isNamedImports(named)) {
      for (const element of named.elements) bindings.push({ local: element.name.text, imported: element.propertyName?.text ?? element.name.text, source, resolved: resolution.path, status });
    }
  });
  return bindings;
}

function expressionName(node: ts.Expression): string | undefined {
  if (ts.isIdentifier(node)) return node.text;
  if (ts.isPropertyAccessExpression(node) && ts.isIdentifier(node.expression)) return `${node.expression.text}.${node.name.text}`;
  return undefined;
}

function isRawProperty(node: ts.PropertyAccessExpression): boolean {
  return node.name.text === "status" || node.name.text === "body" || node.name.text === "rawResponse";
}

function isDomainObject(node: ts.ObjectLiteralExpression): boolean {
  const names = new Set(["ok", "success", "message", "error", "user", "code"]);
  return node.properties.some((property) => ts.isPropertyAssignment(property) && ts.isIdentifier(property.name) && names.has(property.name.text));
}

function callIsImported(node: ts.CallExpression, bindings: ImportBinding[], predicate: (binding: ImportBinding) => boolean): boolean {
  const name = expressionName(node.expression);
  if (!name) return false;
  const local = name.split(".")[0];
  const binding = bindings.find((entry) => entry.local === local);
  return Boolean(binding && predicate(binding));
}

function formSubmitHandlers(file: ts.SourceFile): ts.Expression[] {
  const handlers: ts.Expression[] = [];
  walk(file, (node) => {
    if (!ts.isJsxElement(node) && !ts.isJsxSelfClosingElement(node)) return;
    const attributes = ts.isJsxElement(node) ? node.openingElement.attributes.properties : node.attributes.properties;
    for (const attribute of attributes) {
      if (!ts.isJsxAttribute(attribute) || attribute.name.text !== "onSubmit" || !attribute.initializer) continue;
      if (ts.isJsxExpression(attribute.initializer) && attribute.initializer.expression) handlers.push(attribute.initializer.expression);
    }
  });
  return handlers;
}

function isModuleLevelBinding(node: ts.Node): boolean {
  if (ts.isSourceFile(node.parent)) return true;
  const declaration = node.parent;
  if (ts.isVariableDeclaration(declaration) && ts.isIdentifier(declaration.name)) {
    const list = declaration.parent;
    return ts.isVariableDeclarationList(list) && ts.isVariableStatement(list.parent);
  }
  return false;
}

function findFunction(file: ts.SourceFile, name: string): ts.FunctionLikeDeclaration | undefined {
  const matches: ts.FunctionLikeDeclaration[] = [];
  walk(file, (node) => {
    if (ts.isFunctionDeclaration(node) && node.name?.text === name) matches.push(node);
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.name.text === name && node.initializer && (ts.isArrowFunction(node.initializer) || ts.isFunctionExpression(node.initializer))) matches.push(node.initializer);
  });
  return matches.find(isModuleLevelBinding) ?? matches[0];
}

function moduleLevelNames(file: ts.SourceFile): Set<string> {
  const names = new Set<string>();
  for (const statement of file.statements) {
    if (ts.isFunctionDeclaration(statement) && statement.name) names.add(statement.name.text);
    if (ts.isVariableStatement(statement)) {
      for (const declaration of statement.declarationList.declarations) {
        if (ts.isIdentifier(declaration.name)) names.add(declaration.name.text);
      }
    }
  }
  return names;
}

function findObjectMethod(file: ts.SourceFile, objectName: string, methodName: string): ts.FunctionLikeDeclaration | undefined {
  for (const statement of file.statements) {
    if (!ts.isVariableStatement(statement)) continue;
    for (const declaration of statement.declarationList.declarations) {
      if (!ts.isIdentifier(declaration.name) || declaration.name.text !== objectName || !declaration.initializer || !ts.isObjectLiteralExpression(declaration.initializer)) continue;
      for (const property of declaration.initializer.properties) {
        if (!ts.isPropertyAssignment(property) || !ts.isIdentifier(property.name) || property.name.text !== methodName) continue;
        if (ts.isArrowFunction(property.initializer) || ts.isFunctionExpression(property.initializer)) return property.initializer;
      }
    }
  }
  return undefined;
}

function handlerFunction(file: ts.SourceFile, expression: ts.Expression): ts.FunctionLikeDeclaration | undefined {
  if (ts.isIdentifier(expression)) return findFunction(file, expression.text);
  if (ts.isArrowFunction(expression) || ts.isFunctionExpression(expression)) return expression;
  return undefined;
}

function isAwaited(node: ts.CallExpression): boolean {
  return ts.isAwaitExpression(node.parent);
}

function localAliases(file: ts.SourceFile, imports: ImportBinding[], moduleNames: Set<string>): Map<string, string> {
  const aliases = new Map<string, string>();
  walk(file, (node) => {
    if (!ts.isVariableDeclaration(node) || !ts.isIdentifier(node.name) || !node.initializer || !ts.isIdentifier(node.initializer)) return;
    const source = node.initializer.text;
    if (imports.some((binding) => binding.local === source) || aliases.has(source) || moduleNames.has(source)) aliases.set(node.name.text, source);
  });
  return aliases;
}

function importedBindingFor(name: string, imports: ImportBinding[], aliases: Map<string, string>): ImportBinding | undefined {
  const visited = new Set<string>();
  let current = name;
  while (!visited.has(current)) {
    visited.add(current);
    const binding = imports.find((entry) => entry.local === current);
    if (binding) return binding;
    const alias = aliases.get(current);
    if (!alias) return undefined;
    current = alias;
  }
  return undefined;
}

function moduleFacts(parsed: Parsed, files: Map<string, Parsed>, aliases: AliasRule): ModuleFacts;
function moduleFacts(parsed: Parsed, files: Map<string, Parsed>, aliases: AliasRule[]): ModuleFacts;
function moduleFacts(parsed: Parsed, files: Map<string, Parsed>, aliases: AliasRule | AliasRule[]): ModuleFacts {
  const imports = importBindings(parsed, files, Array.isArray(aliases) ? aliases : [aliases]);
  let hasFetch = false;
  let rawReads = 0;
  let transportCalls = 0;
  let domainTranslations = 0;
  let rawReturns = 0;
  const transportResults = new Set<string>();
  walk(parsed.file, (node) => {
    if (ts.isCallExpression(node)) {
      if (ts.isIdentifier(node.expression) && node.expression.text === "fetch") {
        hasFetch = true;
        if (isAwaited(node) && node.parent.parent && ts.isVariableDeclaration(node.parent.parent) && ts.isIdentifier(node.parent.parent.name)) transportResults.add(node.parent.parent.name.text);
      }
      if (callIsImported(node, imports, (binding) => binding.status === "resolved" && Boolean(binding.resolved && files.get(binding.resolved)?.file && files.get(binding.resolved)!.source.includes("fetch(")))) transportCalls++;
      if (callIsImported(node, imports, (binding) => binding.status === "resolved")) {
        const parent = node.parent;
        if (ts.isAwaitExpression(parent) && ts.isVariableDeclaration(parent.parent) && ts.isIdentifier(parent.parent.name)) transportResults.add(parent.parent.name.text);
      }
    }
    if (ts.isPropertyAccessExpression(node) && isRawProperty(node)) rawReads++;
    if (ts.isReturnStatement(node) && node.expression) {
      if (ts.isObjectLiteralExpression(node.expression) && isDomainObject(node.expression)) domainTranslations++;
      if (ts.isIdentifier(node.expression) && transportResults.has(node.expression.text)) rawReturns++;
      if (ts.isPropertyAccessExpression(node.expression) && isRawProperty(node.expression)) rawReturns++;
    }
    if (ts.isThrowStatement(node)) domainTranslations++;
  });
  // The function above may encounter the return before its declaration in a
  // source walk. A second pass makes the raw-return check order independent.
  walk(parsed.file, (node) => {
    if (!ts.isVariableDeclaration(node) || !node.initializer || !ts.isIdentifier(node.name)) return;
    if (ts.isAwaitExpression(node.initializer) && ts.isCallExpression(node.initializer.expression) && (ts.isIdentifier(node.initializer.expression.expression) || ts.isPropertyAccessExpression(node.initializer.expression.expression))) {
      if (node.initializer.expression.expression && (ts.isIdentifier(node.initializer.expression.expression) || ts.isPropertyAccessExpression(node.initializer.expression.expression))) transportResults.add(node.name.text);
    }
  });
  if (transportResults.size > 0) {
    walk(parsed.file, (node) => {
      if (!ts.isReturnStatement(node) || !node.expression || !ts.isIdentifier(node.expression)) return;
      if (transportResults.has(node.expression.text)) rawReturns++;
    });
  }
  return { parsed, imports, hasFetch, rawReads, transportCalls, domainTranslations, rawReturns, formSubmitHandlers: formSubmitHandlers(parsed.file) };
}

function componentPath(facts: Map<string, ModuleFacts>): string | undefined {
  return [...facts.values()].find((entry) => entry.formSubmitHandlers.length > 0)?.parsed.path;
}

function boundaryFor(component: ModuleFacts, facts: Map<string, ModuleFacts>): { boundary?: ModuleFacts; unresolved: string[] } {
  const unresolved: string[] = [];
  const candidates: ModuleFacts[] = [];
  for (const binding of component.imports) {
    if (binding.status === "unresolved" || binding.status === "ambiguous") unresolved.push(`${component.parsed.path} imports ${binding.source} (${binding.status})`);
    if (binding.status === "resolved" && binding.resolved) {
      const target = facts.get(binding.resolved);
      if (target && (target.domainTranslations > 0 || target.transportCalls > 0)) candidates.push(target);
    }
  }
  if (candidates.length === 1) return { boundary: candidates[0], unresolved };
  if (candidates.length > 1) return { boundary: candidates.find((entry) => entry.domainTranslations > 0) ?? candidates[0], unresolved: [...unresolved, `${component.parsed.path} has multiple candidate boundaries`] };
  return { unresolved };
}

function delegatedSubmit(component: ModuleFacts, boundary: ModuleFacts | undefined, facts: Map<string, ModuleFacts>): { value: boolean; ambiguous?: string } {
  if (component.formSubmitHandlers.length === 0) return { value: false };
  const boundaryPath = boundary?.parsed.path;
  const moduleNames = moduleLevelNames(component.parsed.file);
  const aliases = localAliases(component.parsed.file, component.imports, moduleNames);
  const resolveLeaf = (name: string): string => {
    const seen = new Set<string>();
    let current = name;
    while (!seen.has(current)) {
      seen.add(current);
      const alias = aliases.get(current);
      if (!alias) return current;
      current = alias;
    }
    return current;
  };
  const containsDelegatedCall = (root: ts.Node, visitedHelpers: Set<ts.Node>): boolean => {
    if (visitedHelpers.has(root)) return false;
    visitedHelpers.add(root);
    let found = false;
    walk(root, (node) => {
      if (found || !ts.isCallExpression(node)) return;
      const name = expressionName(node.expression);
      if (!name) return;
      const local = name.split(".")[0];
      const binding = importedBindingFor(local, component.imports, aliases);
      if (binding?.status === "resolved" && binding.resolved && binding.resolved !== component.parsed.path && facts.has(binding.resolved)) {
        if (!boundaryPath || binding.resolved === boundaryPath || facts.get(binding.resolved)?.domainTranslations || facts.get(binding.resolved)?.transportCalls) found = true;
        return;
      }
      if (binding) return;
      if (ts.isPropertyAccessExpression(node.expression) && ts.isIdentifier(node.expression.expression)) {
        const method = findObjectMethod(component.parsed.file, resolveLeaf(local), node.expression.name.text);
        if (method?.body && containsDelegatedCall(method.body, visitedHelpers)) found = true;
        return;
      }
      if (!ts.isIdentifier(node.expression)) return;
      const helper = findFunction(component.parsed.file, resolveLeaf(local));
      if (helper?.body && containsDelegatedCall(helper.body, visitedHelpers)) found = true;
    });
    return found;
  };
  for (const expression of component.formSubmitHandlers) {
    const handler = handlerFunction(component.parsed.file, expression);
    if (!handler || !handler.body) return { value: false, ambiguous: "form submit handler could not be resolved" };
    let hasAwait = false;
    walk(handler.body, (node) => { if (ts.isAwaitExpression(node)) hasAwait = true; });
    if (!hasAwait || !containsDelegatedCall(handler.body, new Set<ts.Node>())) return { value: false };
  }
  return { value: true };
}

function criterion(id: PracticeDimensionId, points: number, max_points: number, rationale: string): PracticeCriterion {
  return { id, points, max_points, rationale };
}

export function analyzePractice(files: SourceMap): Analysis {
  const parsed = parseFiles(files);
  const aliases = aliasRules(files);
  const facts = new Map<string, ModuleFacts>();
  for (const entry of parsed.values()) facts.set(entry.path, moduleFacts(entry, parsed, aliases));
  const component = componentPath(facts);
  if (!component) return { state: "indeterminate", score: 0, confidence: 0, criteria: [], reason: "no form submit component could be resolved", audit: ["component-not-found"] };
  const page = facts.get(component)!;
  const { boundary, unresolved } = boundaryFor(page, facts);
  const reachable = new Set<string>([component]);
  if (boundary) reachable.add(boundary.parsed.path);
  for (const path of [...reachable]) {
    for (const binding of facts.get(path)!.imports) {
      if (binding.status === "unresolved" || binding.status === "ambiguous") unresolved.push(`${path} imports ${binding.source} (${binding.status})`);
      if (binding.status === "resolved" && binding.resolved) reachable.add(binding.resolved);
    }
  }
  if (unresolved.length > 0) return { state: "indeterminate", score: 0, confidence: 0, criteria: [], reason: [...new Set(unresolved)].join("; "), audit: [...new Set(unresolved)] };

  const importedTransport = page.imports.some((binding) => binding.status === "resolved" && binding.resolved && facts.get(binding.resolved)?.hasFetch);
  const isolation = page.hasFetch || page.rawReads > 0 || importedTransport
    ? criterion("component-transport-isolation", 0, 30, page.hasFetch ? "page component performs fetch transport directly" : page.rawReads > 0 ? "page component reads raw status/body response fields" : "page component imports a transport module directly")
    : boundary
      ? criterion("component-transport-isolation", 30, 30, "page component has no transport or raw response access and imports a domain boundary")
      : criterion("component-transport-isolation", 15, 30, "page component does not perform transport, but no domain boundary was resolved");
  const delegation = delegatedSubmit(page, boundary, facts);
  const delegationCriterion = criterion("domain-operation-delegation", delegation.value ? 25 : 0, 25, delegation.value ? "every form submit handler awaits an imported operation outside the page component" : delegation.ambiguous ?? "form submission does not await a resolved external domain operation");
  const translation = boundary && boundary.transportCalls + (boundary.hasFetch ? 1 : 0) > 0 && boundary.domainTranslations > 0;
  const translationCriterion = criterion("boundary-response-translation", translation ? 30 : 0, 30, translation ? "resolved boundary owns transport and returns a domain-shaped success/failure result" : "no resolved boundary was proven to own transport and translate authentication responses");
  const containment = boundary && boundary.rawReturns === 0 && page.rawReads === 0 && !importedTransport;
  const containmentCriterion = criterion("raw-response-containment", containment ? 15 : 0, 15, containment ? "raw response values are contained within the boundary" : "raw transport data can flow into the component-facing path");
  const criteria = [isolation, delegationCriterion, translationCriterion, containmentCriterion];
  return { state: "observed", score: criteria.reduce((sum, item) => sum + item.points, 0), confidence: 100, criteria, audit: [...reachable].sort() };
}

export type ScoreSourceInput = { files: SourceMap; taskMd: string; candidateDiff: string; rubricText: string; doc: PracticeRubric; inputHash: string };

export async function scoreSourceV2(input: ScoreSourceInput): Promise<JudgeResultV1> {
  const analysis = analyzePractice(input.files);
  const promptHash = await sha256Text(input.doc.prompt);
  const hash = await rubricHash(input.rubricText);
  const result = analysis.state === "observed"
    ? { schema_version: "judge-result/v1" as const, judge_version: 1 as const, judge: input.doc.judge, state: "observed" as const, score: analysis.score, criteria: analysis.criteria, prompt_hash: promptHash, rubric_hash: hash, input_hash: input.inputHash, confidence: analysis.confidence }
    : { schema_version: "judge-result/v1" as const, judge_version: 1 as const, judge: input.doc.judge, state: "indeterminate" as const, score: 0, criteria: [], prompt_hash: promptHash, rubric_hash: hash, input_hash: input.inputHash, confidence: analysis.confidence, reason: analysis.reason ?? "static analysis is incomplete" };
  return assertJudgeResultV1(result);
}
