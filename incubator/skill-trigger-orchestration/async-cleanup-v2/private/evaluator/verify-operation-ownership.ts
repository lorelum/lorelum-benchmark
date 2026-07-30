import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const appRoot = resolve(Bun.argv[2] ?? "public/starter/app");
const parserRoot = resolve(Bun.argv[3] ?? appRoot);
const dashboardPath = join(appRoot, "src", "Dashboard.tsx");
const typescriptPath = join(parserRoot, "node_modules", "typescript", "lib", "typescript.js");

if (!existsSync(typescriptPath)) {
  console.error(`缺少 TypeScript 解析器：${typescriptPath}`);
  process.exit(2);
}

if (!existsSync(dashboardPath)) {
  console.error(JSON.stringify({ app_root: appRoot, passed: false, failures: ["缺少 src/Dashboard.tsx。"] }, null, 2));
  process.exit(1);
}

const ts = await import(pathToFileURL(typescriptPath).href);
const source = ts.createSourceFile(dashboardPath, await readFile(dashboardPath, "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
let startsProjectLoad = false;
let hasOwnershipMechanism = false;
let hasTerminalGuard = false;

function blockReturns(node: any): boolean {
  let returned = false;
  const visit = (child: any) => {
    if (returned) return;
    if (ts.isReturnStatement(child)) { returned = true; return; }
    ts.forEachChild(child, visit);
  };
  visit(node);
  return returned;
}

const visit = (node: any) => {
  if (ts.isCallExpression(node) && ts.isIdentifier(node.expression)) {
    if (node.expression.text === "fetchProjects") startsProjectLoad = true;
    if (node.expression.text === "useRef") hasOwnershipMechanism = true;
  }
  if (ts.isNewExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === "AbortController") {
    hasOwnershipMechanism = true;
  }
  if (ts.isIfStatement(node) && blockReturns(node.thenStatement)) {
    hasTerminalGuard = true;
  }
  ts.forEachChild(node, visit);
};
visit(source);

const failures: string[] = [];
if (!startsProjectLoad) failures.push("Dashboard 未发起项目加载。");
if (!hasOwnershipMechanism && !hasTerminalGuard) {
  failures.push("项目加载缺少可见的操作归属保护。");
}

console.log(JSON.stringify({ app_root: appRoot, parser_root: parserRoot, passed: failures.length === 0, failures }, null, 2));
process.exit(failures.length === 0 ? 0 : 1);
