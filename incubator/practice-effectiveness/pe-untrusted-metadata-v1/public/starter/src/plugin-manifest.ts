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

export function buildPluginManifest(input: unknown, file: string): BuildResult {
  return {
    manifest: input as PluginManifest,
    diagnostics: [],
  };
}
