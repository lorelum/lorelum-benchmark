export type Capability = "read" | "transform" | "write";

export interface PluginManifest {
  id: string;
  displayName: string;
  apiVersion: "v1";
  entrypoint: string;
  capabilities: Capability[];
}

export interface Diagnostic {
  file: string;
  path: string;
  code: "invalid-root" | "required" | "invalid-type" | "invalid-value" | "unsupported-version" | "unknown-field";
  message: string;
}

export interface BuildResult {
  manifest: PluginManifest | null;
  diagnostics: Diagnostic[];
}

const fields = ["id", "displayName", "apiVersion", "entrypoint", "capabilities"] as const;
const capabilities = new Set<Capability>(["read", "transform", "write"]);

function diagnostic(file: string, path: string, code: Diagnostic["code"], message: string): Diagnostic {
  return { file, path, code, message };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function buildPluginManifest(input: unknown, file: string): BuildResult {
  if (!isRecord(input)) {
    return { manifest: null, diagnostics: [diagnostic(file, "/", "invalid-root", "Plugin metadata must be an object")] };
  }

  const diagnostics: Diagnostic[] = [];
  for (const key of Object.keys(input)) {
    if (!fields.includes(key as (typeof fields)[number])) {
      diagnostics.push(diagnostic(file, `/${key}`, "unknown-field", "Unexpected field"));
    }
  }

  for (const field of fields) {
    if (!(field in input)) diagnostics.push(diagnostic(file, `/${field}`, "required", "Required field is missing"));
  }

  const { id, displayName, apiVersion, entrypoint, capabilities: declaredCapabilities } = input;
  if ("id" in input) {
    if (typeof id !== "string") diagnostics.push(diagnostic(file, "/id", "invalid-type", "Expected a string"));
    else if (!/^[a-z][a-z0-9-]{0,31}$/.test(id)) diagnostics.push(diagnostic(file, "/id", "invalid-value", "Invalid plugin id"));
  }
  if ("displayName" in input) {
    if (typeof displayName !== "string") diagnostics.push(diagnostic(file, "/displayName", "invalid-type", "Expected a string"));
    else if (displayName.trim().length === 0 || displayName.length > 64) diagnostics.push(diagnostic(file, "/displayName", "invalid-value", "Display name is out of range"));
  }
  if ("apiVersion" in input) {
    if (typeof apiVersion !== "string") diagnostics.push(diagnostic(file, "/apiVersion", "invalid-type", "Expected a string"));
    else if (apiVersion !== "v1") diagnostics.push(diagnostic(file, "/apiVersion", "unsupported-version", "Unsupported API version"));
  }
  if ("entrypoint" in input) {
    if (typeof entrypoint !== "string") diagnostics.push(diagnostic(file, "/entrypoint", "invalid-type", "Expected a string"));
    else if (!entrypoint.startsWith("./") || entrypoint.split("/").includes("..")) diagnostics.push(diagnostic(file, "/entrypoint", "invalid-value", "Entrypoint must remain inside the plugin"));
  }
  if ("capabilities" in input) {
    if (!Array.isArray(declaredCapabilities)) diagnostics.push(diagnostic(file, "/capabilities", "invalid-type", "Expected an array"));
    else if (!declaredCapabilities.every((capability) => typeof capability === "string" && capabilities.has(capability as Capability)) || new Set(declaredCapabilities).size !== declaredCapabilities.length) {
      diagnostics.push(diagnostic(file, "/capabilities", "invalid-value", "Capabilities must be unique supported values"));
    }
  }

  diagnostics.sort((left, right) => left.path.localeCompare(right.path) || left.code.localeCompare(right.code));
  if (diagnostics.length > 0) return { manifest: null, diagnostics };

  return {
    manifest: {
      id: id as string,
      displayName: displayName as string,
      apiVersion: apiVersion as "v1",
      entrypoint: entrypoint as string,
      capabilities: declaredCapabilities as Capability[],
    },
    diagnostics,
  };
}
