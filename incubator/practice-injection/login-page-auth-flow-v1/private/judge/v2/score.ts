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
type ImportBinding = { local: string; imported: string; source: string; resolved?: string; status: "resolved" | "external" | "unresolved" | "ambiguous" | "irrelevant" };
type ModuleFacts = {
  parsed: Parsed;
  imports: ImportBinding[];
  hasFetch: boolean;
  rawReads: number;
  transportCalls: number;
  domainTranslations: number;
  rawReturns: number;
  authSuccess: boolean;
  authFailure: boolean;
  formSubmitHandlers: ts.Expression[];
};
type Resolution = { status: ImportBinding["status"]; path?: string };

const sourceExtensions = [".ts", ".tsx", ".js", ".jsx"];
const nonSourceExtensions = [".css", ".scss", ".sass", ".less", ".styl", ".png", ".jpg", ".jpeg", ".gif", ".svg", ".webp", ".avif", ".ico", ".woff", ".woff2", ".ttf", ".eot", ".otf", ".mp3", ".mp4", ".webm", ".mov", ".wasm"];
const projectSpecifier = (value: string): boolean => value.startsWith(".") || value.startsWith("@");
const normalize = (value: string): string => posix.normalize(value.replaceAll("\\", "/")).replace(/^\.\//, "");
const isNonSourcePath = (value: string): boolean => nonSourceExtensions.some((extension) => value.endsWith(extension));

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

function allPaths(files: SourceMap): Set<string> {
  const paths = new Set<string>();
  for (const rawPath of Object.keys(files)) paths.add(normalize(rawPath));
  return paths;
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

function resolveImport(fromPath: string, specifier: string, files: Map<string, Parsed>, aliases: AliasRule[], paths: Set<string>): Resolution {
  if (!projectSpecifier(specifier)) return { status: "external" };
  if (isNonSourcePath(specifier)) return { status: "irrelevant" };
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
  if (bases.some((base) => paths.has(base) || isNonSourcePath(base))) return { status: "irrelevant" };
  return { status: "unresolved" };
}

function walk(node: ts.Node, visit: (node: ts.Node) => void): void {
  visit(node);
  node.forEachChild((child) => walk(child, visit));
}

function importBindings(parsed: Parsed, files: Map<string, Parsed>, aliases: AliasRule[], paths: Set<string>): ImportBinding[] {
  const bindings: ImportBinding[] = [];
  walk(parsed.file, (node) => {
    if (!ts.isImportDeclaration(node) || !ts.isStringLiteral(node.moduleSpecifier)) return;
    const source = node.moduleSpecifier.text;
    const resolution = resolveImport(parsed.path, source, files, aliases, paths);
    const status = resolution.status;
    if (status === "irrelevant") return;
    const clause = node.importClause;
    if (!clause) {
      if (status === "unresolved" || status === "ambiguous") bindings.push({ local: "", imported: "", source, resolved: resolution.path, status });
      return;
    }
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

function baseIdentifier(node: ts.Expression): string | undefined {
  let current = node;
  while (ts.isPropertyAccessExpression(current)) current = current.expression;
  if (ts.isIdentifier(current)) return current.text;
  return undefined;
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

function calledImportLocals(file: ts.SourceFile, imports: ImportBinding[]): Set<string> {
  const locals = new Set(imports.map((binding) => binding.local).filter((local) => local.length > 0));
  const called = new Set<string>();
  walk(file, (node) => {
    if (!ts.isCallExpression(node)) return;
    const name = expressionName(node.expression);
    if (!name) return;
    const local = name.split(".")[0];
    if (locals.has(local)) called.add(local);
  });
  return called;
}

function returnExpressionIsRaw(expression: ts.Expression, transportResults: Set<string>): boolean {
  let found = false;
  const visit = (node: ts.Node): void => {
    if (found) return;
    if (ts.isConditionalExpression(node)) {
      visit(node.whenTrue);
      visit(node.whenFalse);
      return;
    }
    if (ts.isIdentifier(node)) {
      if (transportResults.has(node.text) && !(ts.isPropertyAccessExpression(node.parent) && node.parent.expression === node)) {
        found = true;
        return;
      }
      return;
    }
    if (ts.isPropertyAccessExpression(node)) {
      const isChainTop = !ts.isPropertyAccessExpression(node.parent) || node.parent.expression !== node;
      if (isChainTop && isRawProperty(node)) {
        const base = baseIdentifier(node);
        if (base && transportResults.has(base)) {
          found = true;
          return;
        }
      }
    }
    node.forEachChild(visit);
  };
  visit(expression);
  return found;
}

function checkedStatus(node: ts.Expression): Map<string, "eq" | "ne"> {
  const map = new Map<string, "eq" | "ne">();
  const visit = (n: ts.Node) => {
    if (ts.isBinaryExpression(n) && (n.operatorToken.kind === ts.SyntaxKind.EqualsEqualsEqualsToken || n.operatorToken.kind === ts.SyntaxKind.EqualsEqualsToken || n.operatorToken.kind === ts.SyntaxKind.ExclamationEqualsEqualsToken || n.operatorToken.kind === ts.SyntaxKind.ExclamationEqualsToken)) {
      const eq = n.operatorToken.kind === ts.SyntaxKind.EqualsEqualsEqualsToken || n.operatorToken.kind === ts.SyntaxKind.EqualsEqualsToken;
      for (const side of [n.left, n.right]) {
        if (ts.isNumericLiteral(side)) map.set(side.text, eq ? "eq" : "ne");
      }
    }
    n.forEachChild(visit);
  };
  visit(node);
  return map;
}

function statementTranslatesToDomain(statement: ts.Statement | undefined, transportResults: Set<string>): boolean {
  if (!statement) return false;
  let translated = false;
  walk(statement, (node) => {
    if (translated) return;
    if (ts.isReturnStatement(node)) {
      if (!node.expression || !returnExpressionIsRaw(node.expression, transportResults)) translated = true;
      return;
    }
    if (ts.isThrowStatement(node)) {
      translated = true;
      return;
    }
  });
  return translated;
}

function expressionTranslatesToDomain(expression: ts.Expression | undefined, transportResults: Set<string>): boolean {
  if (!expression) return false;
  return !returnExpressionIsRaw(expression, transportResults);
}

function followingStatementsTranslate(node: ts.IfStatement, transportResults: Set<string>): boolean {
  if (!node.parent || !ts.isBlock(node.parent)) return false;
  const index = node.parent.statements.indexOf(node);
  if (index < 0) return false;
  return node.parent.statements.slice(index + 1).some((statement) => statementTranslatesToDomain(statement, transportResults));
}

function translatesAuthBranching(file: ts.SourceFile, transportResults: Set<string>): { success: boolean; failure: boolean } {
  let success = false;
  let failure = false;
  const note = (s: boolean, f: boolean): void => {
    if (s) success = true;
    if (f) failure = true;
  };
  walk(file, (node) => {
    if (success && failure) return;
    if (ts.isIfStatement(node)) {
      const statuses = checkedStatus(node.expression);
      const eq200 = statuses.get("200");
      const eq401 = statuses.get("401");
      if (eq200 === "eq") {
        note(statementTranslatesToDomain(node.thenStatement, transportResults), (node.elseStatement ? statementTranslatesToDomain(node.elseStatement, transportResults) : false) || followingStatementsTranslate(node, transportResults));
      } else if (eq200 === "ne") {
        note(node.elseStatement ? statementTranslatesToDomain(node.elseStatement, transportResults) : followingStatementsTranslate(node, transportResults), statementTranslatesToDomain(node.thenStatement, transportResults));
      } else if (eq401 === "eq") {
        note(node.elseStatement ? statementTranslatesToDomain(node.elseStatement, transportResults) : followingStatementsTranslate(node, transportResults), statementTranslatesToDomain(node.thenStatement, transportResults));
      } else if (eq401 === "ne") {
        note(statementTranslatesToDomain(node.thenStatement, transportResults), node.elseStatement ? statementTranslatesToDomain(node.elseStatement, transportResults) : false);
      }
    }
    if (ts.isConditionalExpression(node)) {
      const statuses = checkedStatus(node.condition);
      const eq200 = statuses.get("200");
      const eq401 = statuses.get("401");
      if (eq200 === "eq") note(expressionTranslatesToDomain(node.whenTrue, transportResults), expressionTranslatesToDomain(node.whenFalse, transportResults));
      else if (eq401 === "eq") note(expressionTranslatesToDomain(node.whenFalse, transportResults), expressionTranslatesToDomain(node.whenTrue, transportResults));
    }
  });
  return { success, failure };
}

function moduleFacts(parsed: Parsed, files: Map<string, Parsed>, aliases: AliasRule[], paths: Set<string>): ModuleFacts {
  const imports = importBindings(parsed, files, aliases, paths);
  const transportResults = new Set<string>();
  let hasFetch = false;
  let transportCalls = 0;
  let domainTranslations = 0;
  const candidates: Array<{ name: string; call: ts.CallExpression }> = [];
  walk(parsed.file, (node) => {
    if (ts.isCallExpression(node)) {
      if (ts.isIdentifier(node.expression) && node.expression.text === "fetch") hasFetch = true;
      if (callIsImported(node, imports, (binding) => binding.status === "resolved" && Boolean(binding.resolved && files.get(binding.resolved)?.source.includes("fetch(")))) transportCalls++;
    }
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer && ts.isAwaitExpression(node.initializer) && ts.isCallExpression(node.initializer.expression)) {
      candidates.push({ name: node.name.text, call: node.initializer.expression });
    }
    if (ts.isReturnStatement(node) && node.expression && ts.isObjectLiteralExpression(node.expression) && isDomainObject(node.expression)) domainTranslations++;
    if (ts.isThrowStatement(node)) domainTranslations++;
  });
  let changed = true;
  while (changed) {
    changed = false;
    for (const candidate of candidates) {
      if (transportResults.has(candidate.name)) continue;
      const call = candidate.call;
      const callee = call.expression;
      if (ts.isIdentifier(callee) && callee.text === "fetch") {
        transportResults.add(candidate.name);
        changed = true;
      } else if (callIsImported(call, imports, (binding) => binding.status === "resolved" && Boolean(binding.resolved && files.get(binding.resolved)?.source.includes("fetch(")))) {
        transportResults.add(candidate.name);
        changed = true;
      } else if (ts.isPropertyAccessExpression(callee) && callee.name.text === "json") {
        const receiver = baseIdentifier(callee);
        if (receiver && transportResults.has(receiver)) {
          transportResults.add(candidate.name);
          changed = true;
        }
      }
    }
  }
  let rawReads = 0;
  walk(parsed.file, (node) => {
    if (ts.isPropertyAccessExpression(node) && isRawProperty(node)) {
      const base = baseIdentifier(node);
      if (base && transportResults.has(base)) rawReads++;
    }
  });
  let rawReturns = 0;
  walk(parsed.file, (node) => {
    if (ts.isReturnStatement(node) && node.expression && returnExpressionIsRaw(node.expression, transportResults)) rawReturns++;
  });
  const { success: authSuccess, failure: authFailure } = translatesAuthBranching(parsed.file, transportResults);
  return { parsed, imports, hasFetch, rawReads, transportCalls, domainTranslations, rawReturns, authSuccess, authFailure, formSubmitHandlers: formSubmitHandlers(parsed.file) };
}

function componentPath(facts: Map<string, ModuleFacts>): string | undefined {
  const candidates = [...facts.values()].filter((entry) => entry.formSubmitHandlers.length > 0);
  if (candidates.length === 0) return undefined;
  const loginLike = candidates.filter((entry) => /login/i.test(entry.parsed.path));
  const pool = loginLike.length > 0 ? loginLike : candidates;
  pool.sort((a, b) => a.parsed.path.localeCompare(b.parsed.path));
  return pool[0].parsed.path;
}

function boundaryFor(component: ModuleFacts, facts: Map<string, ModuleFacts>): { boundary?: ModuleFacts; unresolved: string[] } {
  const unresolved: string[] = [];
  const candidates: ModuleFacts[] = [];
  for (const binding of component.imports) {
    if (binding.status === "unresolved" || binding.status === "ambiguous") unresolved.push(`${component.parsed.path} imports ${binding.source} (${binding.status})`);
    if (binding.status === "resolved" && binding.resolved) {
      const target = facts.get(binding.resolved);
      if (target && (target.domainTranslations > 0 || target.transportCalls > 0) && !candidates.includes(target)) candidates.push(target);
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
  const isDomainOperation = (binding: ImportBinding): boolean => {
    if (binding.status !== "resolved" || !binding.resolved) return false;
    if (boundaryPath && binding.resolved === boundaryPath) return true;
    const target = facts.get(binding.resolved);
    return Boolean(target && target.domainTranslations > 0);
  };
  const isPromiseChained = (node: ts.CallExpression): boolean => {
    if (ts.isPropertyAccessExpression(node.parent) && ["then", "catch", "finally"].includes(node.parent.name.text)) return true;
    return false;
  };
  const analyzeBody = (body: ts.Node, visited: Set<ts.Node>): { delegated: boolean; bare: boolean } => {
    if (visited.has(body)) return { delegated: false, bare: false };
    visited.add(body);
    let delegated = false;
    let bare = false;
    walk(body, (node) => {
      if (delegated) return;
      if (!ts.isCallExpression(node)) return;
      const name = expressionName(node.expression);
      if (!name) return;
      const local = name.split(".")[0];
      const binding = importedBindingFor(local, component.imports, aliases);
      if (binding && isDomainOperation(binding)) {
        if (ts.isAwaitExpression(node.parent) || isPromiseChained(node)) delegated = true;
        else bare = true;
        return;
      }
      if (binding) return;
      if (ts.isPropertyAccessExpression(node.expression) && ts.isIdentifier(node.expression.expression)) {
        const method = findObjectMethod(component.parsed.file, resolveLeaf(local), node.expression.name.text);
        if (method?.body) {
          const inner = analyzeBody(method.body, visited);
          if (inner.delegated) delegated = true;
          else if (inner.bare) bare = true;
        }
        return;
      }
      if (ts.isIdentifier(node.expression)) {
        const helper = findFunction(component.parsed.file, resolveLeaf(local));
        if (helper?.body) {
          const inner = analyzeBody(helper.body, visited);
          if (inner.delegated) delegated = true;
          else if (inner.bare) bare = true;
        }
      }
    });
    return { delegated, bare };
  };
  for (const expression of component.formSubmitHandlers) {
    const handler = handlerFunction(component.parsed.file, expression);
    if (!handler || !handler.body) return { value: false, ambiguous: "form submit handler could not be resolved" };
    const result = analyzeBody(handler.body, new Set<ts.Node>());
    if (result.delegated) continue;
    if (result.bare) return { value: false, ambiguous: "submit handler invokes a resolved external domain operation without await or promise chaining (unsupported analysis)" };
    return { value: false };
  }
  return { value: true };
}

function criterion(id: PracticeDimensionId, points: number, max_points: number, rationale: string): PracticeCriterion {
  return { id, points, max_points, rationale };
}

export function analyzePractice(files: SourceMap): Analysis {
  const parsed = parseFiles(files);
  const paths = allPaths(files);
  const aliases = aliasRules(files);
  const facts = new Map<string, ModuleFacts>();
  for (const entry of parsed.values()) facts.set(entry.path, moduleFacts(entry, parsed, aliases, paths));
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

  const calledLocals = calledImportLocals(page.parsed.file, page.imports);
  const importedTransport = page.imports.some((binding) => {
    if (binding.status !== "resolved" || !binding.resolved) return false;
    const target = facts.get(binding.resolved);
    if (!target || !target.hasFetch) return false;
    if (boundary && target.parsed.path === boundary.parsed.path) return false;
    if (target.domainTranslations > 0) return false;
    return calledLocals.has(binding.local);
  });
  const isolation = page.hasFetch || page.rawReads > 0 || importedTransport
    ? criterion("component-transport-isolation", 0, 30, page.hasFetch ? "page component performs fetch transport directly" : page.rawReads > 0 ? "page component reads raw status/body response fields" : "page component invokes a transport module directly")
    : boundary
      ? criterion("component-transport-isolation", 30, 30, "page component has no transport or raw response access and imports a domain boundary")
      : criterion("component-transport-isolation", 15, 30, "page component does not perform transport, but no domain boundary was resolved");
  const delegation = delegatedSubmit(page, boundary, facts);
  if (delegation.ambiguous) {
    return { state: "indeterminate", score: 0, confidence: 0, criteria: [], reason: delegation.ambiguous, audit: [...new Set(unresolved), "delegation-ambiguous"] };
  }
  const delegationCriterion = criterion("domain-operation-delegation", delegation.value ? 25 : 0, 25, delegation.value ? "every form submit handler awaits or promise-chains an imported domain operation outside the page component" : "form submission does not await a resolved external domain operation");
  const translation = boundary && boundary.transportCalls + (boundary.hasFetch ? 1 : 0) > 0 && boundary.domainTranslations > 0 && boundary.authSuccess && boundary.authFailure;
  const translationCriterion = criterion("boundary-response-translation", translation ? 30 : 0, 30, translation ? "resolved boundary owns transport and translates both success (200) and failure (401) into domain-shaped values" : "no resolved boundary was proven to own transport and translate both authentication success and failure");
  const containment = boundary && boundary.rawReturns === 0 && page.rawReads === 0 && page.rawReturns === 0 && !importedTransport;
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
