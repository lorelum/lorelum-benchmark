import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const appRoot = resolve(Bun.argv[2] ?? "public/starter/app");
const parserRoot = resolve(Bun.argv[3] ?? appRoot);
const componentPath = join(appRoot, "src", "LoginPage.tsx");
const typescriptPath = join(parserRoot, "node_modules", "typescript", "lib", "typescript.js");

if (!existsSync(typescriptPath)) {
  console.error(`缺少 TypeScript 解析器：${typescriptPath}`);
  process.exit(2);
}

const ts = await import(pathToFileURL(typescriptPath).href);
const failures: string[] = [];

type RuntimeImport = { module: string; names: Array<{ imported: string; local: string }> };

function sourceFile(path: string, content: string) {
  return ts.createSourceFile(path, content, ts.ScriptTarget.Latest, true, path.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
}

function runtimeImports(source: any): RuntimeImport[] {
  return source.statements.flatMap((statement: any) => {
    if (!ts.isImportDeclaration(statement) || !ts.isStringLiteral(statement.moduleSpecifier)) return [];
    const clause = statement.importClause;
    if (!clause || clause.isTypeOnly) return [];
    const names: Array<{ imported: string; local: string }> = [];
    if (clause.name) names.push({ imported: "default", local: clause.name.text });
    if (clause.namedBindings && ts.isNamedImports(clause.namedBindings)) {
      names.push(...clause.namedBindings.elements
        .filter((element: any) => !element.isTypeOnly)
        .map((element: any) => ({ imported: element.propertyName?.text ?? element.name.text, local: element.name.text })));
    }
    if (clause.namedBindings && ts.isNamespaceImport(clause.namedBindings)) {
      names.push({ imported: "*", local: clause.namedBindings.name.text });
    }
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
    if (ts.isCallExpression(node) && ts.isAwaitExpression(node.parent)) {
      const directCall = ts.isIdentifier(node.expression) && node.expression.text === localName;
      const namespaceCall = ts.isPropertyAccessExpression(node.expression)
        && ts.isIdentifier(node.expression.expression)
        && node.expression.expression.text === localName;
      if (directCall || namespaceCall) {
        found = true;
        return;
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(handler.body);
  return found;
}

function directTransportCalls(source: any): Set<string> {
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

function resolveLocalModule(importerPath: string, moduleSpecifier: string): string | undefined {
  if (!moduleSpecifier.startsWith(".")) return undefined;
  const base = resolve(dirname(importerPath), moduleSpecifier);
  const candidates = [`${base}.ts`, `${base}.tsx`, join(base, "index.ts"), join(base, "index.tsx")];
  return candidates.find((candidate) => existsSync(candidate));
}

function checkedStatus(node: any): Set<string> {
  let hasStatus = false;
  const values = new Set<string>();
  const visit = (child: any) => {
    if (ts.isPropertyAccessExpression(child) && child.name.text === "status") hasStatus = true;
    if (ts.isNumericLiteral(child)) values.add(child.text);
    ts.forEachChild(child, visit);
  };
  visit(node);
  return hasStatus ? values : new Set<string>();
}

function blockTranslatesToDomainValue(node: any): boolean {
  let translated = false;
  const visit = (child: any) => {
    if (ts.isThrowStatement(child)) translated = true;
    if (ts.isReturnStatement(child) && child.expression && !isRawTransportValue(child.expression)) translated = true;
    ts.forEachChild(child, visit);
  };
  visit(node);
  return translated;
}

function followingStatementsTranslate(node: any): boolean {
  if (!node.parent || !ts.isBlock(node.parent)) return false;
  const index = node.parent.statements.indexOf(node);
  return index >= 0 && node.parent.statements.slice(index + 1).some((statement: any) => blockTranslatesToDomainValue(statement));
}

function translatesExpectedAuthFailure(source: any): boolean {
  let translated = false;
  const visit = (node: any) => {
    if (translated) return;
    if (ts.isIfStatement(node)) {
      const statuses = checkedStatus(node.expression);
      if (statuses.has("401") && blockTranslatesToDomainValue(node.thenStatement)) {
        translated = true;
        return;
      }
      if (statuses.has("200") && ((node.elseStatement && blockTranslatesToDomainValue(node.elseStatement)) || followingStatementsTranslate(node))) {
        translated = true;
        return;
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return translated;
}

function isRawTransportValue(expression: any): boolean {
  if (ts.isIdentifier(expression)) return expression.text === "response";
  return ts.isPropertyAccessExpression(expression)
    && ts.isIdentifier(expression.expression)
    && expression.expression.text === "response"
    && expression.name.text === "body";
}

function returnsRawTransport(source: any): boolean {
  let raw = false;
  const visit = (node: any) => {
    if (ts.isReturnStatement(node) && node.expression && isRawTransportValue(node.expression)) raw = true;
    ts.forEachChild(node, visit);
  };
  visit(source);
  return raw;
}

if (!existsSync(componentPath)) {
  failures.push("缺少 LoginPage 组件。");
} else {
  const component = sourceFile(componentPath, await readFile(componentPath, "utf8"));
  const imports = runtimeImports(component);
  const handlers = submitHandlers(component).map((handler) => functionForHandler(component, handler));
  const transportImports = imports.filter((entry) => /(?:^|\/)services\/http$/.test(entry.module));
  const adapterCalls = directTransportCalls(component);

  if (transportImports.length > 0) failures.push("LoginPage 不得直接导入 HTTP adapter。");
  for (const name of adapterCalls) failures.push(`LoginPage 不得直接调用 ${name}。`);
  if (/response\.status|response\.body/.test(component.text)) failures.push("LoginPage 不得判断原始响应或读取原始响应体。");

  const invokedImports = imports.flatMap((entry) => entry.names
    .filter((binding) => handlers.length > 0 && handlers.every((handler) => handler && hasAwaitedBindingCall(handler, binding.local)))
    .map((binding) => ({ ...binding, module: entry.module })));
  if (handlers.length === 0 || invokedImports.length === 0) {
    failures.push("每个表单提交路径必须 await 一个组件外的领域操作。");
  } else {
    const boundaries = await Promise.all(invokedImports.map(async (binding) => {
      const path = resolveLocalModule(componentPath, binding.module);
      return path ? { binding, path, source: sourceFile(path, await readFile(path, "utf8")) } : undefined;
    }));
    const boundary = boundaries.filter((item): item is NonNullable<typeof item> => Boolean(item))
      .find((item) => directTransportCalls(item.source).size > 0);
    if (!boundary) {
      failures.push("提交路径调用的边界模块必须负责实际 transport 请求。");
    } else {
      if (!translatesExpectedAuthFailure(boundary.source)) failures.push("边界模块必须将 401 转换为领域错误或领域结果。");
      if (returnsRawTransport(boundary.source)) failures.push("边界模块不得把原始 response 或 response.body 返回给组件。");
    }
  }
}

console.log(JSON.stringify({ app_root: appRoot, parser_root: parserRoot, passed: failures.length === 0, failures }, null, 2));
process.exit(failures.length === 0 ? 0 : 1);
