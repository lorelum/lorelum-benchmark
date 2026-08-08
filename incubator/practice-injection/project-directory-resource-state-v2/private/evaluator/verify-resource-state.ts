import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";

type Observation = "observed" | "not-observed" | "indeterminate";
type Binding = { name: string; module: string };
type Resolution = { path?: string; reason?: string };

const appRoot = resolve(Bun.argv[2] ?? "public/starter/app");
const parserRoot = resolve(Bun.argv[3] ?? appRoot);
const componentPath = resolve(appRoot, "src/LoginPage.tsx");
const adapterPath = resolve(appRoot, "src/services/http.ts");
const typescriptPath = resolve(parserRoot, "node_modules/typescript/lib/typescript.js");
if (!existsSync(typescriptPath)) {
  console.log(JSON.stringify({ practice_observation: "indeterminate", observation_reason: "missing-typescript-parser" }));
  process.exit(2);
}
const ts = await import(pathToFileURL(typescriptPath).href);

const sourceFile = (path: string, text: string, kind = ts.ScriptKind.TSX) => ts.createSourceFile(path, text, ts.ScriptTarget.Latest, true, kind);

async function resolveRelativeModule(importer: string, specifier: string): Promise<Resolution> {
  if (!specifier.startsWith(".")) return {};
  const base = resolve(dirname(importer), specifier);
  for (const path of [`${base}.ts`, `${base}.tsx`, `${base}.mts`, resolve(base, "index.ts"), resolve(base, "index.tsx")]) {
    if (existsSync(path)) return { path: resolve(path) };
  }
  return { reason: "unresolved-relative-import" };
}

async function importsAdapter(importer: string, text: string): Promise<Resolution & { importsAdapter: boolean }> {
  const source = sourceFile(importer, text, importer.endsWith(".ts") ? ts.ScriptKind.TS : ts.ScriptKind.TSX);
  for (const statement of source.statements) {
    if (!ts.isImportDeclaration(statement) || !ts.isStringLiteral(statement.moduleSpecifier)) continue;
    const resolved = await resolveRelativeModule(importer, statement.moduleSpecifier.text);
    if (resolved.reason) return { ...resolved, importsAdapter: false };
    if (resolved.path === adapterPath) return { importsAdapter: true };
  }
  return { importsAdapter: false };
}

function emit(practice_observation: Observation, observation_reason?: string): never {
  console.log(JSON.stringify({ practice_observation, ...(observation_reason ? { observation_reason } : {}) }));
  process.exit(practice_observation === "observed" ? 0 : practice_observation === "not-observed" ? 1 : 2);
}

const componentText = await readFile(componentPath, "utf8").catch(() => emit("indeterminate", "missing-component-source"));
const component = sourceFile(componentPath, componentText);
const bindings: Binding[] = [];
const calls = new Set<string>();
let readsTransportDetail = false;
let componentImportsAdapter = false;

async function inspectComponent(): Promise<string | undefined> {
  for (const statement of component.statements) {
    if (!ts.isImportDeclaration(statement) || !ts.isStringLiteral(statement.moduleSpecifier)) continue;
    const resolved = await resolveRelativeModule(componentPath, statement.moduleSpecifier.text);
    if (resolved.reason) return resolved.reason;
    if (resolved.path === adapterPath) componentImportsAdapter = true;
    if (statement.importClause?.namedBindings && ts.isNamedImports(statement.importClause.namedBindings)) {
      for (const item of statement.importClause.namedBindings.elements) bindings.push({ name: item.name.text, module: statement.moduleSpecifier.text });
    }
  }
}

function visit(node: any): void {
  if (ts.isCallExpression(node) && ts.isIdentifier(node.expression)) calls.add(node.expression.text);
  if (ts.isPropertyAccessExpression(node) && ["status", "body"].includes(node.name.text)) readsTransportDetail = true;
  ts.forEachChild(node, visit);
}

const componentResolutionError = await inspectComponent();
if (componentResolutionError) emit("indeterminate", componentResolutionError);
visit(component);
if (componentImportsAdapter) emit("not-observed", "component-direct-adapter");
if (readsTransportDetail) emit("not-observed", "component-reads-transport-detail");

const boundaries: string[] = [];
for (const binding of bindings.filter((binding) => calls.has(binding.name) && binding.module.startsWith("."))) {
  const resolved = await resolveRelativeModule(componentPath, binding.module);
  if (resolved.reason || !resolved.path) emit("indeterminate", resolved.reason ?? "missing-boundary-module");
  const text = await readFile(resolved.path, "utf8");
  const adapter = await importsAdapter(resolved.path, text);
  if (adapter.reason) emit("indeterminate", adapter.reason);
  if (adapter.importsAdapter) boundaries.push(text);
}

const boundary = boundaries.find((text) => /\.status/.test(text));
if (!boundary) emit("not-observed", "no-transport-boundary");
if (!/\b(kind|state):\s*["'](ready|empty|failed)["']/.test(boundary)) emit("not-observed", "missing-resource-state");
emit("observed");
