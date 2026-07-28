import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const appRoot = resolve(Bun.argv[2] ?? "public/starter/app");
const parserRoot = resolve(Bun.argv[3] ?? appRoot);
const componentPath = resolve(appRoot, "src/LoginPage.tsx");
const typescriptPath = resolve(parserRoot, "node_modules/typescript/lib/typescript.js");
if (!existsSync(typescriptPath)) throw new Error(`缺少 TypeScript 解析器：${typescriptPath}`);
const ts = await import(pathToFileURL(typescriptPath).href);

type Binding = { name: string; module: string };
const sourceFile = (path: string, text: string) => ts.createSourceFile(path, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const componentText = await readFile(componentPath, "utf8");
const component = sourceFile(componentPath, componentText);
const failures: string[] = [];
const bindings: Binding[] = [];
const calls = new Set<string>();
let readsTransportDetail = false;

function visit(node: any): void {
  if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier) && node.importClause?.namedBindings && ts.isNamedImports(node.importClause.namedBindings)) {
    for (const item of node.importClause.namedBindings.elements) bindings.push({ name: item.name.text, module: node.moduleSpecifier.text });
  }
  if (ts.isCallExpression(node) && ts.isIdentifier(node.expression)) calls.add(node.expression.text);
  if (ts.isPropertyAccessExpression(node) && ["status", "body"].includes(node.name.text)) readsTransportDetail = true;
  ts.forEachChild(node, visit);
}
visit(component);

if (bindings.some((binding) => binding.module.includes("services/http"))) failures.push("组件不得直接依赖 HTTP adapter。");
if (readsTransportDetail) failures.push("组件不得读取原始 response 的 status 或 body。");

async function boundarySource(binding: Binding): Promise<string | undefined> {
  if (!binding.module.startsWith(".")) return undefined;
  const base = resolve(dirname(componentPath), binding.module);
  for (const path of [`${base}.ts`, `${base}.tsx`, resolve(base, "index.ts")]) if (existsSync(path)) return await readFile(path, "utf8");
  return undefined;
}

const sources = await Promise.all(bindings.filter((binding) => calls.has(binding.name)).map(boundarySource));
const boundary = sources.find((text): text is string => Boolean(text) && /services\/http/.test(text) && /\.status/.test(text));
if (!boundary) failures.push("保存路径必须 await 组件外的命令/API 边界，并由该边界处理 transport。");
else {
  if (!/(name-taken|duplicate|conflict)/.test(boundary)) failures.push("边界必须将名称冲突转换为领域结果。");
  if (/return\s+(response|reply)\s*[;}]/.test(boundary)) failures.push("边界不得将原始 transport response 返回组件。");
}

console.log(JSON.stringify({ app_root: appRoot, passed: failures.length === 0, failures }, null, 2));
process.exit(failures.length === 0 ? 0 : 1);
