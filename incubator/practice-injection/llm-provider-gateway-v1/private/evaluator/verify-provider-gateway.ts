import { existsSync } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

/**
 * verify-provider-gateway.ts — responsibility-boundary probe for the
 * llm-provider-gateway practice candidate.
 *
 * It accepts responsibility-equivalent implementations regardless of naming or
 * directory layout (interface / class / type-based contracts all qualify). It
 * reports observed / not-observed / indeterminate only; it never judges
 * semantics (the public test suite owns that).
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

type SourceFile = { path: string; text: string; source: any };

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
  const files = await listTypeScriptFiles(root);
  const sources: SourceFile[] = [];
  for (const file of files) {
    const text = await readFile(join(root, file), "utf-8");
    sources.push({ path: file, text, source: ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS) });
  }
  return sources;
}

function importedModulePaths(source: SourceFile): string[] {
  const paths: string[] = [];
  const visit = (node: any): void => {
    if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) paths.push(node.moduleSpecifier.text);
    ts.forEachChild(node, visit);
  };
  visit(source.source);
  return paths;
}

/**
 * R1: a unified model client contract. Accepted forms are interface, class, or
 * type-literal declarations exposing at least two method signatures — the
 * practice only requires "a unified client contract", not a specific keyword.
 */
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

function isServerFile(source: SourceFile): boolean {
  return source.text.includes("/api/chat") || source.text.includes("createServer");
}

function isAdapterFile(source: SourceFile): boolean {
  return source.text.includes("chat/completions") || source.text.includes("/v1/messages");
}

function hasCostComputation(source: SourceFile): boolean {
  const priceMarker = /price_?in|price_?out|PRICE_IN|PRICE_OUT/i.test(source.text);
  const perMillion = /1_?000_?000|1e6|1000000/i.test(source.text);
  const rounding = /Math\.round|round6|round\(/i.test(source.text);
  return priceMarker && perMillion && rounding;
}

/**
 * R3: OpenAI-compatible providers must not get a hardcoded branch / separate
 * request path. A bare "deepseek" string literal in config or docs is fine; we
 * only reject branch/switch/fetch-argument forms that actually wire up a
 * provider-specific path.
 */
function hasDeepseekBranch(source: SourceFile): boolean {
  let found = false;
  const visit = (node: any): void => {
    if (found) return;
    if (ts.isStringLiteral(node) && node.text === "deepseek") {
      const parent = node.parent;
      const isComparison = parent && ts.isBinaryExpression(parent) &&
        (parent.operatorToken.kind === ts.SyntaxKind.EqualsEqualsEqualsToken ||
         parent.operatorToken.kind === ts.SyntaxKind.ExclamationEqualsEqualsToken);
      const isCaseLabel = parent && ts.isCaseClause(parent);
      const isFetchArgument = parent && ts.isCallExpression(parent) &&
        parent.expression && ts.isIdentifier(parent.expression) && parent.expression.text === "fetch";
      if (isComparison || isCaseLabel || isFetchArgument) found = true;
    }
    ts.forEachChild(node, visit);
  };
  visit(source.source);
  return found;
}

function failuresFor(sources: SourceFile[]): string[] {
  const failures: string[] = [];
  const server = sources.find(isServerFile);
  if (!server) {
    failures.push("未找到网关服务文件（包含 /api/chat 或 createServer 的源文件）");
    return failures;
  }

  // R1: unified model client contract (interface / class / type, >= 2 methods).
  if (!sources.some(hasContractLikeDeclaration)) {
    failures.push("未观察到统一模型客户端契约（interface/class/type 中至少两个方法的声明）");
  }

  // R2: no direct transport in the api/server layer.
  if (server.text.includes("fetch(")) failures.push("网关服务文件直接发起 HTTP 传输（fetch）");
  if (/api\.(openai|anthropic|deepseek)\.com/.test(server.text)) failures.push("网关服务文件包含供应商直连地址");
  const sdkImports = importedModulePaths(server).filter((path) => !path.startsWith(".") && /(^|\/)(openai|@anthropic-ai\/sdk)(\/|$)/.test(path));
  if (sdkImports.length > 0) failures.push("网关服务文件直接依赖供应商 SDK");

  // R3: OpenAI-compatible providers are not given a separate hardcoded path.
  const requestPathFiles = sources.filter((source) => isServerFile(source) || isAdapterFile(source) || source.text.includes("fetch("));
  if (requestPathFiles.some(hasDeepseekBranch)) {
    failures.push("出现按 deepseek 名称硬编码的分支或独立请求路径（OpenAI 兼容供应商应复用同一适配器，只靠配置区分）");
  }

  // R4: cost computation centralized outside server/adapters.
  const costFiles = sources.filter(hasCostComputation);
  if (costFiles.length === 0) failures.push("未观察到集中的费用换算模块（单价 × tokens / 1e6 + rounding）");
  if (costFiles.some((source) => isServerFile(source) || isAdapterFile(source))) {
    failures.push("费用换算散落在服务/适配器实现内，未集中在边界模块");
  }

  // R5: raw provider usage field names are not leaked into the api layer.
  if (/(prompt_tokens|completion_tokens|input_tokens|output_tokens)/.test(server.text)) {
    failures.push("网关服务文件泄漏原始供应商 usage 字段命名");
  }

  // R6: provider selection is config/registry driven, no name branches in the api layer.
  if (/\=\=\=\s*"(openai|deepseek|anthropic)"/.test(server.text)) {
    failures.push("网关服务文件按供应商名写分支选择");
  }

  // R7: observability is emitted through a boundary usage/telemetry module.
  const usageImports = importedModulePaths(server).filter((path) => /usage|telemetry|metrics|observability|log/i.test(path));
  if (usageImports.length === 0) failures.push("未观察到从边界观测模块（usage/telemetry）导入并记录请求");

  return failures;
}

if (!existsSync(sourceRoot)) {
  console.log(JSON.stringify({ practice_observation: "indeterminate", reason: "no-src-directory" }));
  process.exit(0);
}

const sources = await loadSources(sourceRoot);
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