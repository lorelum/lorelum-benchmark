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

function runtimeImports(source: any): Array<{ module: string; names: Array<{ imported: string; local: string }> }> {
  return source.statements.flatMap((statement) => {
    if (!ts.isImportDeclaration(statement) || !ts.isStringLiteral(statement.moduleSpecifier)) return [];
    const clause = statement.importClause;
    if (!clause || clause.isTypeOnly) return [];
    const names = clause.namedBindings && ts.isNamedImports(clause.namedBindings)
      ? clause.namedBindings.elements
        .filter((element) => !element.isTypeOnly)
        .map((element) => ({ imported: element.propertyName?.text ?? element.name.text, local: element.name.text }))
      : [];
    return [{ module: statement.moduleSpecifier.text, names }];
  });
}

function submitHandlers(source: any): any[] {
  const handlers: any[] = [];
  const visit = (node: any) => {
    if (ts.isJsxOpeningElement(node) && ts.isIdentifier(node.tagName) && node.tagName.text === "form") {
      for (const property of node.attributes.properties) {
        if (!ts.isJsxAttribute(property) || property.name.text !== "onSubmit" || !property.initializer || !ts.isJsxExpression(property.initializer)) continue;
        if (property.initializer.expression) handlers.push(property.initializer.expression);
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return handlers;
}

function functionForHandler(source: any, handler: any): any | undefined {
  if (ts.isArrowFunction(handler) || ts.isFunctionExpression(handler)) return handler;
  if (!ts.isIdentifier(handler)) return undefined;

  let match: any | undefined;
  const visit = (node: any) => {
    if (match) return;
    if (ts.isFunctionDeclaration(node) && node.name?.text === handler.text) {
      match = node;
      return;
    }
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.name.text === handler.text
      && node.initializer && (ts.isArrowFunction(node.initializer) || ts.isFunctionExpression(node.initializer))) {
      match = node.initializer;
      return;
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return match;
}

function hasAwaitedBindingCall(handler: any, localName: string): boolean {
  let found = false;
  const visit = (node: any) => {
    if (found || (node !== handler && ts.isFunctionLike(node))) return;
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === localName
      && ts.isAwaitExpression(node.parent)) {
      found = true;
      return;
    }
    ts.forEachChild(node, visit);
  };
  visit(handler.body);
  return found;
}

function directAdapterCalls(source: any): Set<string> {
  const calls = new Set<string>();
  const visit = (node: any) => {
    if (ts.isCallExpression(node)) {
      if (ts.isIdentifier(node.expression) && ["postLogin", "fetch", "axios"].includes(node.expression.text)) calls.add(node.expression.text);
      if (ts.isPropertyAccessExpression(node.expression) && ["fetch", "postLogin"].includes(node.expression.name.text)) calls.add(node.expression.name.text);
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return calls;
}

if (!existsSync(componentPath)) failures.push("缺少 LoginPage 组件。");
if (!existsSync(apiPath)) failures.push("缺少指定 feature API：src/features/auth/api/login.ts。");

if (failures.length === 0) {
  const component = sourceFile(componentPath, await readFile(componentPath, "utf8"));
  const imports = runtimeImports(component);
  const apiImport = imports.find((entry) => entry.module === "./features/auth/api/login");
  const unexpectedImports = imports.filter((entry) => entry.module !== "react" && entry.module !== "./features/auth/api/login");
  const loginBinding = apiImport?.names.find((binding) => binding.imported === "login");
  const handlers = submitHandlers(component).map((handler) => functionForHandler(component, handler));
  const adapterCalls = directAdapterCalls(component);

  if (!loginBinding) failures.push("LoginPage 必须从指定 feature API 导入 login 绑定。");
  if (unexpectedImports.length > 0) failures.push(`LoginPage 存在越过 feature API 的导入：${unexpectedImports.map((entry) => entry.module).join(", ")}`);
  if (handlers.length === 0 || handlers.some((handler) => !handler || !loginBinding || !hasAwaitedBindingCall(handler, loginBinding.local))) {
    failures.push("LoginPage 必须在每个表单提交路径 await 指定 feature API 的 login 绑定。");
  }
  for (const name of adapterCalls) {
    failures.push(`LoginPage 不得直接调用 ${name}。`);
  }
  if (/response\.status|response\.body/.test(component.text)) failures.push("LoginPage 不得判断原始响应或读取原始响应体。");

  const api = sourceFile(apiPath, await readFile(apiPath, "utf8"));
  const apiText = api.text;
  const apiImports = runtimeImports(api);
  if (!apiImports.some((entry) => entry.module === "../../../services/http" && entry.names.some((binding) => binding.imported === "postLogin"))) failures.push("feature API 必须持有请求适配器调用。");
  for (const required of ["export class AuthError", "function toLoginRequest", "function toLoginResult", "export async function login", "throw new AuthError"]) {
    if (!apiText.includes(required)) failures.push(`feature API 缺少职责标记：${required}`);
  }
  if (!/response\.status\s*===\s*401/.test(apiText)) failures.push("feature API 必须将 401 翻译为 AuthError。");
}

console.log(JSON.stringify({ app_root: appRoot, parser_root: parserRoot, passed: failures.length === 0, failures }, null, 2));
process.exit(failures.length === 0 ? 0 : 1);
