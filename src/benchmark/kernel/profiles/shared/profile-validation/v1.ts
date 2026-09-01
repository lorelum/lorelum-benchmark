import { isAbsolute, relative, resolve } from "node:path";

export type ProfileValidator = {
  fail(message: string): never;
  record(value: unknown, label: string): Record<string, unknown>;
  text(value: unknown, label: string): string;
  number(value: unknown, label: string): number;
  stringArray(value: unknown, label: string): string[];
  readYaml<T>(path: string, label: string): Promise<T>;
  relativeInside(root: string, declared: string, label: string): string;
};

/** Versioned validation vocabulary shared by new profile runtimes. */
export function profileValidator(profile: string): ProfileValidator {
  function fail(message: string): never {
    throw new Error(`Invalid ${profile} profile: ${message}`);
  }
  function record(value: unknown, label: string): Record<string, unknown> {
    if (!value || typeof value !== "object" || Array.isArray(value)) fail(`${label} must be an object`);
    return value as Record<string, unknown>;
  }
  function text(value: unknown, label: string): string {
    if (typeof value !== "string" || value.trim().length === 0) fail(`${label} must be a non-empty string`);
    return value;
  }
  function number(value: unknown, label: string): number {
    if (typeof value !== "number" || !Number.isFinite(value)) fail(`${label} must be a finite number`);
    return value;
  }
  function stringArray(value: unknown, label: string): string[] {
    if (!Array.isArray(value) || value.some((item) => typeof item !== "string" || item.length === 0)) fail(`${label} must be a string array`);
    return value as string[];
  }
  async function readYaml<T>(path: string, label: string): Promise<T> {
    const file = Bun.file(path);
    if (!(await file.exists())) fail(`${label} is missing`);
    try {
      return Bun.YAML.parse(await file.text()) as T;
    } catch (error) {
      fail(`${label} is invalid YAML: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  function relativeInside(root: string, declared: string, label: string): string {
    if (isAbsolute(declared) || declared.includes("\\")) fail(`${label} must be a relative POSIX path`);
    const resolvedPath = resolve(root, declared);
    const pathRelative = relative(root, resolvedPath);
    if (!pathRelative || pathRelative.startsWith("..") || isAbsolute(pathRelative)) fail(`${label} escapes its permitted root`);
    return resolvedPath;
  }
  return { fail, record, text, number, stringArray, readYaml, relativeInside };
}
