import { existsSync } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

/**
 * verify-provider-gateway-v3.ts — responsibility-boundary probe for the
 * llm-provider-gateway-v3 candidate.
 *
 * Classification is based on the TypeScript import graph and structural data
 * flow. Responsibility names are intentionally not used as allowlists: a
 * centralized policy may use arbitrary method names, while a handler that only
 * borrows familiar names remains non-centralized.
 */

const appRoot = resolve(Bun.argv[2] ?? "public/starter/app");
const sourceRoot = join(appRoot, "src");
const parserRoot = resolve(Bun.argv[3] ?? appRoot);
const typescriptPath = join(parserRoot, "node_modules", "typescript", "lib", "typescript.js");

if (!existsSync(typescriptPath)) {
  console.error(`Missing TypeScript parser: ${typescriptPath}`);
  process.exit(2);
}

const ts = await import(pathToFileURL(typescriptPath).href);

type FunctionShape = {
  name: string;
  kind: "function" | "method";
  hasAwait: boolean;
  hasLoop: boolean;
  hasCatch: boolean;
  hasRequestOrResponseUse: boolean;
  hasCostArithmetic: boolean;
  readsState: string[];
  mutatesState: string[];
  iteratesState: string[];
};

type SourceFileShape = {
  path: string;
  source: any;
  imports: Array<{ specifier: string; symbols: string[] }>;
  stringLiterals: Set<string>;
  propertyNames: Set<string>;
  identifiers: Set<string>;
  hasFetchCall: boolean;
  hasProviderSdkImport: boolean;
  functions: FunctionShape[];
  stateNames: string[];
};

async function listTypeScriptFiles(root: string, relative = ""): Promise<string[]> {
  const entries = await readdir(join(root, relative), { withFileTypes: true }).catch(() => []);
  const files: string[] = [];
  for (const entry of entries) {
    const next = relative ? `${relative}/${entry.name}` : entry.name;
    if (entry.isDirectory()) files.push(...await listTypeScriptFiles(root, next));
    else if (entry.isFile() && entry.name.endsWith(".ts")) files.push(next);
  }
  return files.sort();
}

function propertyNameOf(node: any): string | undefined {
  return node?.name && ts.isIdentifier(node.name) ? node.name.text : undefined;
}

function stateNameFromExpression(node: any): string | undefined {
  if (!node) return undefined;
  if (ts.isIdentifier(node)) return node.text;
  if (ts.isPropertyAccessExpression(node) && ts.isIdentifier(node.expression)) return node.name.text;
  if (ts.isElementAccessExpression(node) && ts.isIdentifier(node.expression) && ts.isStringLiteral(node.argumentExpression)) return node.argumentExpression.text;
  return undefined;
}

const numericScaleNames = new Set<string>();

function containsNode(node: any, predicate: (value: any) => boolean): boolean {
  let found = false;
  const visit = (current: any): void => {
    if (found || !current) return;
    if (predicate(current)) {
      found = true;
      return;
    }
    ts.forEachChild(current, visit);
  };
  visit(node);
  return found;
}

function collectNumericScaleNames(node: any): void {
  if (ts.isVariableDeclaration(node) && node.initializer && ts.isNumericLiteral(node.initializer)) {
    const value = Number(node.initializer.text.replace(/_/g, ""));
    const name = stateNameFromExpression(node.name);
    if (name && Number.isFinite(value) && value >= 1_000_000) numericScaleNames.add(name);
  }
  for (const child of node.getChildren(sourceFileContext)) collectNumericScaleNames(child);
}

function isRequestOrResponseUse(node: any): boolean {
  if (ts.isPropertyAccessExpression(node)) {
    return ["headers", "url", "method", "statusCode", "writeHead", "write", "end"].includes(node.name.text);
  }
  if (ts.isCallExpression(node)) {
    const expression = node.expression;
    return ts.isIdentifier(expression) && ["readBody", "sendJson", "writeSse", "startSse"].includes(expression.text);
  }
  return false;
}

function analyzeFunction(node: any, kind: FunctionShape["kind"]): FunctionShape {
  const readsState = new Set<string>();
  const mutatesState = new Set<string>();
  const iteratesState = new Set<string>();
  let hasAwait = false;
  let hasLoop = false;
  let hasCatch = false;
  let hasRequestOrResponseUse = false;
  let hasCostArithmetic = false;

  const visit = (current: any): void => {
    if (ts.isAwaitExpression(current)) hasAwait = true;
    if (ts.isForStatement(current) || ts.isForOfStatement(current) || ts.isForInStatement(current) || ts.isWhileStatement(current) || ts.isDoStatement(current)) hasLoop = true;
    if (ts.isCatchClause(current)) hasCatch = true;
    if (isRequestOrResponseUse(current)) hasRequestOrResponseUse = true;

    if (ts.isBinaryExpression(current) && (current.operatorToken.kind === ts.SyntaxKind.AsteriskToken || current.operatorToken.kind === ts.SyntaxKind.SlashToken)) {
      const hasScale = containsNode(current, (value) =>
        (ts.isNumericLiteral(value) && Number(value.text.replace(/_/g, "")) >= 1_000_000) ||
        (ts.isIdentifier(value) && numericScaleNames.has(value.text))
      );
      if (hasScale) hasCostArithmetic = true;
    }

    if (ts.isCallExpression(current)) {
      const state = stateNameFromExpression(current.expression);
      const method = ts.isPropertyAccessExpression(current.expression) ? current.expression.name.text : undefined;
      if (state && method && ["push", "set", "add"].includes(method)) mutatesState.add(state);
      if (state && method && ["filter", "forEach", "entries", "keys", "values", "reduce"].includes(method)) iteratesState.add(state);
      if (state && (method === "get" || method === "has")) readsState.add(state);
    }

    if (ts.isForOfStatement(current)) {
      const state = stateNameFromExpression(current.expression);
      if (state) iteratesState.add(state);
    }
    if (ts.isIdentifier(current)) {
      const parent = current.parent;
      if (ts.isPropertyAccessExpression(parent) && parent.expression === current) readsState.add(current.text);
    }

    ts.forEachChild(current, visit);
  };
  visit(node.body ?? node);

  return {
    name: propertyNameOf(node) ?? "<anonymous>",
    kind,
    hasAwait,
    hasLoop,
    hasCatch,
    hasRequestOrResponseUse,
    hasCostArithmetic,
    readsState: [...readsState],
    mutatesState: [...mutatesState],
    iteratesState: [...iteratesState],
  };
}

function collectFunctions(node: any, result: FunctionShape[] = []): FunctionShape[] {
  if (ts.isFunctionDeclaration(node) && node.body) {
    const shape = analyzeFunction(node, "function");
    result.push(shape);
    return collectFunctions(node.body, result);
  }
  if (ts.isMethodDeclaration(node) && node.body) {
    const shape = analyzeFunction(node, "method");
    result.push(shape);
    return collectFunctions(node.body, result);
  }
  if (ts.isVariableStatement(node)) {
    for (const declaration of node.declarationList.declarations) {
      const initializer = declaration.initializer;
      if (initializer && (ts.isArrowFunction(initializer) || ts.isFunctionExpression(initializer))) {
        result.push(analyzeFunction({ ...initializer, name: declaration.name }, "function"));
      }
    }
  }
  for (const child of node.getChildren(sourceFileContext)) collectFunctions(child, result);
  return result;
}

let sourceFileContext: any;

function collectStateNames(node: any, result = new Set<string>()): Set<string> {
  if (ts.isVariableDeclaration(node)) {
    const name = stateNameFromExpression(node.name);
    if (name && node.initializer && ((ts.isArrayLiteralExpression(node.initializer) && node.initializer.elements.length === 0) || ts.isNewExpression(node.initializer) && ts.isIdentifier(node.initializer.expression) && node.initializer.expression.text === "Map")) {
      result.add(name);
    }
  }
  if (ts.isPropertyDeclaration(node)) {
    const name = propertyNameOf(node);
    if (name && node.initializer && ((ts.isArrayLiteralExpression(node.initializer) && node.initializer.elements.length === 0) || ts.isNewExpression(node.initializer) && ts.isIdentifier(node.initializer.expression) && node.initializer.expression.text === "Map")) {
      result.add(name);
    }
  }
  for (const child of node.getChildren(sourceFileContext)) collectStateNames(child, result);
  return result;
}

async function loadSource(root: string, path: string): Promise<SourceFileShape> {
  const source = ts.createSourceFile(path, await readFile(join(root, path), "utf-8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  sourceFileContext = source;
  collectNumericScaleNames(source);
  const imports: Array<{ specifier: string; symbols: string[] }> = [];
  const stringLiterals = new Set<string>();
  const propertyNames = new Set<string>();
  const identifiers = new Set<string>();
  let hasFetchCall = false;
  let hasProviderSdkImport = false;

  const visit = (node: any): void => {
    if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
      const symbols: string[] = [];
      if (node.importClause?.namedBindings && ts.isNamedImports(node.importClause.namedBindings)) {
        for (const element of node.importClause.namedBindings.elements) symbols.push(element.name.text);
      }
      if (node.importClause?.name) symbols.push(node.importClause.name.text);
      imports.push({ specifier: node.moduleSpecifier.text, symbols });
      if (node.moduleSpecifier.text === "openai" || node.moduleSpecifier.text.startsWith("@anthropic-ai/sdk")) hasProviderSdkImport = true;
    }
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) stringLiterals.add(node.text);
    if (ts.isIdentifier(node)) identifiers.add(node.text);
    if (ts.isPropertyAccessExpression(node) || ts.isPropertyAssignment(node) || ts.isShorthandPropertyAssignment(node) || ts.isMethodDeclaration(node) || ts.isMethodSignature(node)) {
      const name = propertyNameOf(node);
      if (name) propertyNames.add(name);
    }
    if (ts.isCallExpression(node)) {
      const expression = node.expression;
      if ((ts.isIdentifier(expression) && expression.text === "fetch") || (ts.isPropertyAccessExpression(expression) && expression.name.text === "fetch")) hasFetchCall = true;
    }
    ts.forEachChild(node, visit);
  };
  visit(source);

  return {
    path,
    source,
    imports,
    stringLiterals,
    propertyNames,
    identifiers,
    hasFetchCall,
    hasProviderSdkImport,
    functions: collectFunctions(source),
    stateNames: [...collectStateNames(source)],
  };
}

let sources: SourceFileShape[] = [];

function sourceByPath(path: string): SourceFileShape | undefined {
  return sources.find((source) => source.path === path);
}

function resolveRelativeImport(fromPath: string, specifier: string): string | null {
  if (!specifier.startsWith(".")) return null;
  const base = fromPath.split("/").slice(0, -1);
  const normalized: string[] = [];
  for (const part of [...base, ...specifier.split("/")]) {
    if (part === "." || part === "") continue;
    if (part === "..") normalized.pop();
    else normalized.push(part);
  }
  const candidate = normalized.join("/");
  for (const suffix of ["", ".ts", ".tsx", "/index.ts"]) {
    const path = suffix ? `${candidate}${suffix}` : candidate;
    if (sourceByPath(path)) return path;
  }
  return null;
}

function directImports(source: SourceFileShape): SourceFileShape[] {
  const result: SourceFileShape[] = [];
  for (const imported of source.imports) {
    const path = resolveRelativeImport(source.path, imported.specifier);
    const target = path ? sourceByPath(path) : undefined;
    if (target) result.push(target);
  }
  return result;
}

function transitiveImports(start: SourceFileShape): SourceFileShape[] {
  const visited = new Set<string>();
  const queue = [start];
  const result: SourceFileShape[] = [];
  while (queue.length > 0) {
    const current = queue.shift()!;
    if (visited.has(current.path)) continue;
    visited.add(current.path);
    result.push(current);
    for (const target of directImports(current)) {
      if (!visited.has(target.path)) queue.push(target);
    }
  }
  return result;
}

function isServerFile(source: SourceFileShape): boolean {
  return source.stringLiterals.has("/api/chat") || source.stringLiterals.has("/api/usage") || source.identifiers.has("createServer");
}

function isAdapterFile(source: SourceFileShape): boolean {
  if (!source.hasFetchCall) return false;
  return [...source.stringLiterals].some((value) => [
    "/chat/completions",
    "/v1/messages",
    "x-nebula-key",
    "x-api-key",
  ].includes(value));
}

function hasContractLikeDeclaration(source: SourceFileShape): boolean {
  let found = false;
  const visit = (node: any): void => {
    if (found) return;
    if (ts.isInterfaceDeclaration(node) || ts.isClassDeclaration(node) || ts.isTypeAliasDeclaration(node)) {
      let methodCount = 0;
      const count = (member: any): void => {
        if (ts.isMethodSignature(member) || ts.isMethodDeclaration(member) || ts.isPropertySignature(member)) methodCount += 1;
        for (const child of member.getChildren(source.source)) count(child);
      };
      node.members?.forEach(count);
      if (ts.isTypeAliasDeclaration(node) && node.type && ts.isTypeLiteralNode(node.type)) node.type.members.forEach(count);
      if (methodCount >= 1) found = true;
    }
    if (!found) ts.forEachChild(node, visit);
  };
  visit(source.source);
  return found;
}

function hasProviderBranch(source: SourceFileShape): boolean {
  const providerNames = new Set(["openai", "deepseek", "anthropic", "nebula"]);
  let found = false;
  const visit = (node: any): void => {
    if (found) return;
    if (ts.isStringLiteral(node) && providerNames.has(node.text)) {
      const parent = node.parent;
      const isComparison = parent && ts.isBinaryExpression(parent) && (
        parent.operatorToken.kind === ts.SyntaxKind.EqualsEqualsEqualsToken ||
        parent.operatorToken.kind === ts.SyntaxKind.ExclamationEqualsEqualsToken
      );
      const isCaseLabel = parent && ts.isCaseClause(parent);
      if (isComparison || isCaseLabel) found = true;
    }
    if (!found) ts.forEachChild(node, visit);
  };
  visit(source.source);
  return found;
}

function hasRawWireNames(source: SourceFileShape): boolean {
  const rawNames = ["prompt_tokens", "completion_tokens", "input_tokens", "output_tokens", "output_text", "message_start", "content_block_delta"];
  return [...source.stringLiterals].some((value) => rawNames.includes(value)) ||
    [...source.propertyNames].some((name) => rawNames.includes(name));
}

function policyFunction(source: SourceFileShape): FunctionShape | undefined {
  return source.functions.find((fn) =>
    !fn.hasRequestOrResponseUse &&
    fn.hasAwait &&
    fn.hasLoop &&
    fn.hasCatch
  );
}

function ledgerEvidence(source: SourceFileShape): string | undefined {
  const hasRecordWrite = source.functions.some((fn) => fn.mutatesState.includes("push") || fn.mutatesState.includes("set") || fn.mutatesState.includes("add"));
  const hasRecordRead = source.functions.some((fn) => fn.iteratesState.some((name) => fn.readsState.includes(name)));
  const hasPersistence = source.identifiers.has("appendFile") || source.identifiers.has("append");
  return hasRecordWrite && hasRecordRead && hasPersistence ? source.path : undefined;
}

function costEvidence(source: SourceFileShape): string | undefined {
  return source.functions.some((fn) => fn.hasCostArithmetic) ? source.path : undefined;
}

function failuresFor(files: SourceFileShape[]): { failures: string[]; evidence?: string } {
  const failures: string[] = [];
  const server = files.find(isServerFile);
  if (!server) return { failures: ["未找到包含 /api/chat、/api/usage 或 createServer 的 handler 模块"] };

  const boundary = transitiveImports(server).filter((source) => source.path !== server.path && !isAdapterFile(source));
  const adapters = files.filter(isAdapterFile);
  const contract = boundary.find(hasContractLikeDeclaration);
  const policyModule = boundary.find((source) => policyFunction(source) !== undefined);
  const policy = policyModule ? policyFunction(policyModule) : undefined;
  const ledgerPath = boundary.map(ledgerEvidence).find(Boolean);
  const costPath = boundary.map(costEvidence).find(Boolean);

  if (!contract) failures.push("handler 可达边界内未观察到至少两个方法的统一客户端契约");
  if (server.hasFetchCall) failures.push("handler 模块直接调用 HTTP transport（fetch）");
  if ([...server.stringLiterals].some((value) => /^https?:\/\/api\.(openai|anthropic|deepseek)\.com/.test(value))) failures.push("handler 模块包含供应商直连地址");
  if (server.hasProviderSdkImport) failures.push("handler 模块直接依赖供应商 SDK");
  if (adapters.length === 0) failures.push("未观察到持有 fetch 与供应商 wire 协议的独立 transport adapter");
  if (!files.some((source) => !isServerFile(source) && source.stringLiterals.has("x-nebula-key"))) failures.push("未观察到伪兼容供应商的独立 wire 映射边界");

  if (!costPath) failures.push("未观察到 token 用量、单价与 rounding 构成的集中费用数据流");
  else if (adapters.some((source) => source.path === costPath) || server.path === costPath) failures.push("费用换算落在 handler 或 transport adapter 内");

  if (!policyModule || !policy) failures.push("未观察到非 HTTP 函数集中执行 retry/fallback/预算/幂等/计量政策；结构证据要求 await 执行循环、错误分支且不直接操作 request/response");

  if (!ledgerPath) failures.push("未观察到同一非 transport 模块持有跨请求记录状态并承担写入与聚合读取");

  if (hasRawWireNames(server)) failures.push("handler 模块泄漏供应商原始 usage 字段或 wire 事件命名");
  if (hasProviderBranch(server)) failures.push("handler 模块按供应商名称分支选择");

  const evidenceParts = [
    policyModule && policy ? `policy=${policyModule.path}:${policy.name}` : undefined,
    ledgerPath ? `ledger=${ledgerPath}` : undefined,
    contract ? `contract=${contract.path}` : undefined,
    costPath ? `cost=${costPath}` : undefined,
    adapters.length > 0 ? `adapters=${adapters.map((source) => source.path).join(",")}` : undefined,
  ].filter(Boolean);

  return { failures, evidence: evidenceParts.join("; ") };
}

if (!existsSync(sourceRoot)) {
  console.log(JSON.stringify({ practice_observation: "indeterminate", reason: "no-src-directory" }));
  process.exit(0);
}

const sourcePaths = await listTypeScriptFiles(sourceRoot);
if (sourcePaths.length === 0) {
  console.log(JSON.stringify({ practice_observation: "indeterminate", reason: "no-typescript-sources" }));
  process.exit(0);
}

sources = [];
for (const path of sourcePaths) sources.push(await loadSource(sourceRoot, path));

try {
  const result = failuresFor(sources);
  if (result.failures.length === 0) {
    console.log(JSON.stringify({ practice_observation: "observed", evidence: result.evidence }));
  } else {
    console.log(JSON.stringify({ practice_observation: "not-observed", failures: result.failures, evidence: result.evidence }));
  }
} catch (error) {
  console.log(JSON.stringify({ practice_observation: "indeterminate", reason: error instanceof Error ? error.message : String(error) }));
}
