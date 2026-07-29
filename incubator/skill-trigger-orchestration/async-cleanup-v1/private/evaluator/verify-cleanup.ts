import { existsSync } from "node:fs";
import { readFile, readdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const appRoot = resolve(Bun.argv[2] ?? "public/starter/app");
const parserRoot = resolve(Bun.argv[3] ?? appRoot);
const srcRoot = join(appRoot, "src");
const typescriptPath = join(parserRoot, "node_modules", "typescript", "lib", "typescript.js");

if (!existsSync(typescriptPath)) {
  console.error(`缺少 TypeScript 解析器：${typescriptPath}`);
  process.exit(2);
}

const ts = await import(pathToFileURL(typescriptPath).href);
const failures: string[] = [];

async function listTsxFiles(dir: string, acc: string[] = []): Promise<string[]> {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) await listTsxFiles(full, acc);
    else if (entry.isFile() && (entry.name.endsWith(".tsx") || entry.name.endsWith(".ts"))) acc.push(full);
  }
  return acc;
}

function sourceFile(path: string, content: string) {
  return ts.createSourceFile(path, content, ts.ScriptTarget.Latest, true, path.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
}

/** 判断 effect 回调体内是否存在 await 表达式或 .then 调用。 */
function hasAsyncSideEffect(body: any): boolean {
  let found = false;
  const visit = (node: any) => {
    if (found) return;
    if (ts.isAwaitExpression(node)) { found = true; return; }
    if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression) && node.expression.name.text === "then") {
      found = true; return;
    }
    ts.forEachChild(node, visit);
  };
  visit(body);
  return found;
}

/** 判断 useEffect 调用的回调是否返回了一个函数（清理函数）。 */
function returnsCleanup(callback: any): boolean {
  if (!callback) return false;
  const body = callback.body;
  if (!body) return false;
  // 直接返回函数表达式
  if (ts.isBlock(body)) {
    let returnsFunction = false;
    const visit = (node: any) => {
      if (returnsFunction) return;
      if (ts.isReturnStatement(node) && node.expression) {
        if (ts.isArrowFunction(node.expression) || ts.isFunctionExpression(node.expression)) {
          returnsFunction = true; return;
        }
        // 返回一个调用表达式也可能产生清理函数（如 AbortController.abort 绑定）
        if (ts.isCallExpression(node.expression)) { returnsFunction = true; return; }
      }
      ts.forEachChild(node, visit);
    };
    visit(body);
    return returnsFunction;
  }
  // 箭头函数简写体：直接返回表达式
  if (ts.isArrowFunction(callback) && !ts.isBlock(body)) {
    return ts.isArrowFunction(body) || ts.isFunctionExpression(body) || ts.isCallExpression(body);
  }
  return false;
}

/** 查找所有 useEffect 调用节点。 */
function useEffectCalls(source: any): any[] {
  const calls: any[] = [];
  const visit = (node: any) => {
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === "useEffect") {
      calls.push(node);
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return calls;
}

function useEffectCallback(call: any): any | undefined {
  if (call.arguments.length === 0) return undefined;
  const first = call.arguments[0];
  if (ts.isArrowFunction(first) || ts.isFunctionExpression(first)) return first;
  return undefined;
}

const files = existsSync(srcRoot) ? await listTsxFiles(srcRoot) : [];
if (files.length === 0) {
  failures.push("缺少 src 目录或源文件。");
} else {
  for (const file of files) {
    const source = sourceFile(file, await readFile(file, "utf8"));
    const calls = useEffectCalls(source);
    for (const call of calls) {
      const callback = useEffectCallback(call);
      if (!callback) {
        failures.push(`${relative(file)}: useEffect 缺少回调。`);
        continue;
      }
      if (hasAsyncSideEffect(callback.body) && !returnsCleanup(callback)) {
        failures.push(`${relative(file)}: 发起异步副作用的 useEffect 未返回清理函数。`);
      }
    }
  }
}

function relative(path: string): string {
  const r = path.replace(appRoot + "\\", "").replace(appRoot + "/", "");
  return r.startsWith("src") ? r : path;
}

console.log(JSON.stringify({ app_root: appRoot, parser_root: parserRoot, passed: failures.length === 0, failures }, null, 2));
process.exit(failures.length === 0 ? 0 : 1);
