import { existsSync } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

/**
 * verify-provider-gateway-v2.ts — responsibility-boundary probe for the
 * llm-provider-gateway-v2 practice candidate.
 *
 * It builds the relative import graph and classifies TypeScript AST nodes
 * (calls, string literals, identifiers, property names, declarations) rather
 * than scanning source text with regular expressions. It accepts
 * responsibility-equivalent implementations regardless of naming or layout.
 */

const appRoot = resolve(Bun.argv[2] ?? "public/starter/app");
const sourceRoot = join(appRoot, "src");
const parserRoot = resolve(Bun.argv[3] ?? appRoot);
const typescriptPath = join(parserRoot, "node_modules", "typescript", "lib", "typescript.js");

if (!existsSync(typescriptPath)) {
  console.error(`缺少 TypeScript 解析器：${typescriptPath}`);
  process.exit(2);
}

const ts = await import(pathToFileURL(typescriptPath).href);

type SourceFile = {
  path: string;
  source: any;
  imports: string[];
  stringLiterals: Set<string>;
  identifiers: Set<string>;
  propertyNames: Set<string>;
  hasFetchCall: boolean;
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

async function loadSources(root: string): Promise<SourceFile[]> {
  const result: SourceFile[] = [];
  for (const file of await listTypeScriptFiles(root)) {
    const source = ts.createSourceFile(file, await readFile(join(root, file), "utf-8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
    result.push(analyzeSource({ path: file, source }));
  }
  return result;
}

function analyzeSource(file: Omit<SourceFile, "imports" | "stringLiterals" | "identifiers" | "propertyNames" | "hasFetchCall">): SourceFile {
  const imports: string[] = [];
  const stringLiterals = new Set<string>();
  const identifiers = new Set<string>();
  const propertyNames = new Set<string>();
  let hasFetchCall = false;

  const visit = (node: any): void => {
    if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) imports.push(node.moduleSpecifier.text);
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) stringLiterals.add(node.text);
    if (ts.isIdentifier(node)) identifiers.add(node.text);
    if ((ts.isPropertyAccessExpression(node) || ts.isPropertyAssignment(node) || ts.isShorthandPropertyAssignment(node) || ts.isMethodDeclaration(node) || ts.isMethodSignature(node))) {
      if (node.name && ts.isIdentifier(node.name)) propertyNames.add(node.name.text);
    }
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === "fetch") hasFetchCall = true;
    ts.forEachChild(node, visit);
  };
  visit(file.source);

  return { ...file, imports, stringLiterals, identifiers, propertyNames, hasFetchCall };
}

function contractMethodCount(node: any): number {
  if (ts.isInterfaceDeclaration(node)) return node.members.filter((member: any) => ts.isMethodSignature(member)).length;
  if (ts.isClassDeclaration(node)) return node.members.filter((member: any) => ts.isMethodDeclaration(member)).length;
  if (ts.isTypeAliasDeclaration(node) && node.type && ts.isTypeLiteralNode(node.type)) {
    return node.type.members.filter((member: any) => ts.isMethodSignature(member)).length;
  }
  return 0;
}

function hasContractLikeDeclaration(source: SourceFile): boolean {
  let found = false;
  const visit = (node: any): void => {
    if (found) return;
    if (ts.isInterfaceDeclaration(node) || ts.isClassDeclaration(node) || ts.isTypeAliasDeclaration(node)) {
      if (contractMethodCount(node) >= 2) found = true;
    }
    ts.forEachChild(node, visit);
  };
  visit(source.source);
  return found;
}

function hasProviderBranch(source: SourceFile): boolean {
  const providerNames = new Set(["openai", "deepseek", "anthropic", "nebula"]);
  let found = false;
  const visit = (node: any): void => {
    if (found) return;
    if (ts.isStringLiteral(node) && providerNames.has(node.text)) {
      const parent = node.parent;
      const isComparison = parent && ts.isBinaryExpression(parent) &&
        (parent.operatorToken.kind === ts.SyntaxKind.EqualsEqualsEqualsToken ||
         parent.operatorToken.kind === ts.SyntaxKind.ExclamationEqualsEqualsToken);
      const isCaseLabel = parent && ts.isCaseClause(parent);
      if (isComparison || isCaseLabel) found = true;
    }
    ts.forEachChild(node, visit);
  };
  visit(source.source);
  return found;
}

function isServerFile(source: SourceFile): boolean {
  return source.stringLiterals.has("/api/chat") || source.identifiers.has("createServer");
}

function isAdapterFile(source: SourceFile): boolean {
  if (!source.hasFetchCall) return false;
  return (
    source.stringLiterals.has("/chat/completions") ||
    source.stringLiterals.has("/v1/messages") ||
    source.stringLiterals.has("x-nebula-key")
  );
}

function hasCostComputation(source: SourceFile): boolean {
  return (
    source.identifiers.has("priceInPerMillion") &&
    source.identifiers.has("priceOutPerMillion") &&
    source.identifiers.has("round")
  );
}

function hasPolicyResponsibilities(source: SourceFile): boolean {
  const markers = ["retryAttempts", "fallbackProviderName", "reserveForTenant", "settleForTenant", "lookupIdempotency", "rememberIdempotency", "resolveProviderChain"];
  return markers.some((marker) => source.identifiers.has(marker));
}

function hasLedgerResponsibilities(source: SourceFile): boolean {
  const markers = ["recordUsage", "usageSnapshot", "remainingBudget", "reserveBudget", "settleBudget", "checkIdempotency", "storeIdempotency", "appendRecord", "snap", "reserve", "settle", "idempotentLookup"];
  return markers.some((marker) => source.identifiers.has(marker));
}

function hasRawWireNames(source: SourceFile): boolean {
  const rawNames = ["prompt_tokens", "completion_tokens", "input_tokens", "output_tokens", "output_text", "message_start", "content_block_delta"];
  return [...source.stringLiterals].some((value) => rawNames.includes(value)) ||
    [...source.propertyNames].some((name) => rawNames.includes(name));
}

function hasProviderSdkImport(source: SourceFile): boolean {
  return source.imports.some((specifier) => !specifier.startsWith(".") && (specifier === "openai" || specifier.startsWith("@anthropic-ai/sdk")));
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
    if (sources.some((source) => source.path === path)) return path;
  }
  return null;
}

let sources: SourceFile[] = [];

function sourceByPath(path: string): SourceFile | undefined {
  return sources.find((source) => source.path === path);
}

function transitiveImports(start: SourceFile): SourceFile[] {
  const visited = new Set<string>();
  const queue = [start];
  const result: SourceFile[] = [];
  while (queue.length > 0) {
    const current = queue.shift()!;
    if (visited.has(current.path)) continue;
    visited.add(current.path);
    result.push(current);
    for (const specifier of current.imports) {
      const resolved = resolveRelativeImport(current.path, specifier);
      if (!resolved || visited.has(resolved)) continue;
      const target = sourceByPath(resolved);
      if (target) queue.push(target);
    }
  }
  return result;
}

function failuresFor(files: SourceFile[]): string[] {
  const failures: string[] = [];
  const server = files.find(isServerFile);
  if (!server) {
    failures.push("未找到网关服务文件（包含 /api/chat 或 createServer 的源文件）");
    return failures;
  }

  if (!files.some(hasContractLikeDeclaration)) {
    failures.push("未观察到统一模型客户端契约（interface/class/type 中至少两个方法的声明）");
  }
  if (server.hasFetchCall) failures.push("网关服务文件直接发起 HTTP 传输（fetch）");
  if ([...server.stringLiterals].some((value) => /^https?:\/\/api\.(openai|anthropic|deepseek)\.com/.test(value))) {
    failures.push("网关服务文件包含供应商直连地址");
  }
  if (hasProviderSdkImport(server)) failures.push("网关服务文件直接依赖供应商 SDK");

  const adapterFiles = files.filter(isAdapterFile);
  if (adapterFiles.length === 0) failures.push("未观察到独立适配器文件（HTTP 传输与供应商线协议未隔离）");
  if (!files.some((source) => !isServerFile(source) && source.stringLiterals.has("nebula") && source.stringLiterals.has("x-nebula-key"))) {
    failures.push("未观察到伪兼容供应商 Nebula 的独立线协议适配器（存在 Nebula 专用鉴权/字段映射）");
  }

  const boundary = transitiveImports(server).filter((source) => source.path !== server.path);
  const costFiles = files.filter(hasCostComputation);
  if (costFiles.length === 0) failures.push("未观察到集中的费用换算模块（单价 × tokens / 1e6 + rounding）");
  if (costFiles.some((source) => isServerFile(source) || isAdapterFile(source))) {
    failures.push("费用换算散落在服务/适配器实现内，未集中在边界模块");
  }
  if (!boundary.some((source) => hasPolicyResponsibilities(source))) {
    failures.push("未观察到 fallback/retry/租户预算/幂等等统一执行政策模块");
  }
  if (!boundary.some((source) => hasLedgerResponsibilities(source))) {
    failures.push("未观察到从边界账本模块统一记录 usage/latency/cost/tenant/trace");
  }

  if (hasRawWireNames(server)) failures.push("网关服务文件泄漏原始供应商 usage 字段命名或上游线协议标记");
  if (hasProviderBranch(server)) failures.push("网关服务文件按供应商名写分支选择");
  return failures;
}

if (!existsSync(sourceRoot)) {
  console.log(JSON.stringify({ practice_observation: "indeterminate", reason: "no-src-directory" }));
  process.exit(0);
}

sources = await loadSources(sourceRoot);
if (sources.length === 0) {
  console.log(JSON.stringify({ practice_observation: "indeterminate", reason: "no-typescript-sources" }));
  process.exit(0);
}

try {
  const failures = failuresFor(sources);
  console.log(JSON.stringify({ practice_observation: failures.length === 0 ? "observed" : "not-observed", failures }));
} catch (error) {
  console.log(JSON.stringify({ practice_observation: "indeterminate", reason: error instanceof Error ? error.message : String(error) }));
}
