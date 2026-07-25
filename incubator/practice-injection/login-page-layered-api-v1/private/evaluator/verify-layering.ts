import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const appRoot = resolve(Bun.argv[2] ?? "public/starter/app");
const parserRoot = resolve(Bun.argv[3] ?? appRoot);
const componentPath = join(appRoot, "src", "LoginPage.tsx");
const apiPath = join(appRoot, "src", "features", "auth", "api", "login.ts");
const typescriptPath = join(parserRoot, "node_modules", "typescript", "lib", "typescript.js");

if (!existsSync(typescriptPath)) {
  console.error(`缺少 TypeScript 解析器：${typescriptPath}`);
  process.exit(2);
}

const ts = await import(pathToFileURL(typescriptPath).href);
const failures: string[] = [];

function sourceFile(path: string, content: string) {
  return ts.createSourceFile(path, content, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
}

function importNames(source: any): Array<{ module: string; names: string[] }> {
  return source.statements.flatMap((statement) => {
    if (!ts.isImportDeclaration(statement) || !ts.isStringLiteral(statement.moduleSpecifier)) return [];
    const clause = statement.importClause;
    const names = clause?.namedBindings && ts.isNamedImports(clause.namedBindings)
      ? clause.namedBindings.elements.map((element) => element.name.text)
      : [];
    return [{ module: statement.moduleSpecifier.text, names }];
  });
}

function calledIdentifiers(source: any): Set<string> {
  const calls = new Set<string>();
  const visit = (node: any) => {
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression)) calls.add(node.expression.text);
    ts.forEachChild(node, visit);
  };
  visit(source);
  return calls;
}

if (!existsSync(componentPath)) failures.push("缺少 LoginPage 组件。");
if (!existsSync(apiPath)) failures.push("缺少指定 feature API：src/features/auth/api/login.ts。");

if (failures.length === 0) {
  const component = sourceFile(componentPath, await readFile(componentPath, "utf8"));
  const imports = importNames(component);
  const apiImport = imports.find((entry) => entry.module === "./features/auth/api/login");
  const unexpectedImports = imports.filter((entry) => entry.module !== "react" && entry.module !== "./features/auth/api/login");
  const calls = calledIdentifiers(component);

  if (!apiImport?.names.includes("login")) failures.push("LoginPage 必须从指定 feature API 导入 login。");
  if (unexpectedImports.length > 0) failures.push(`LoginPage 存在越过 feature API 的导入：${unexpectedImports.map((entry) => entry.module).join(", ")}`);
  for (const name of ["postLogin", "fetch", "axios"]) {
    if (calls.has(name)) failures.push(`LoginPage 不得直接调用 ${name}。`);
  }
  if (/response\.status|response\.body/.test(component.text)) failures.push("LoginPage 不得判断原始响应或读取原始响应体。");

  const api = sourceFile(apiPath, await readFile(apiPath, "utf8"));
  const apiText = api.text;
  const apiImports = importNames(api);
  if (!apiImports.some((entry) => entry.module === "../../../services/http" && entry.names.includes("postLogin"))) failures.push("feature API 必须持有请求适配器调用。");
  for (const required of ["export class AuthError", "function toLoginRequest", "function toLoginResult", "export async function login", "throw new AuthError"]) {
    if (!apiText.includes(required)) failures.push(`feature API 缺少职责标记：${required}`);
  }
  if (!/response\.status\s*===\s*401/.test(apiText)) failures.push("feature API 必须将 401 翻译为 AuthError。");
}

console.log(JSON.stringify({ app_root: appRoot, parser_root: parserRoot, passed: failures.length === 0, failures }, null, 2));
process.exit(failures.length === 0 ? 0 : 1);
