export const workspaceRoot = Bun.cwd;

export function joinPath(...parts: string[]): string {
  return parts
    .filter((part) => part.length > 0)
    .map((part, index) => (index === 0 ? part.replace(/\/+$/, "") : part.replace(/^\/+|\/+$/g, "")))
    .join("/");
}

export function relativePath(path: string): string {
  const prefix = `${workspaceRoot}/`;
  return path.startsWith(prefix) ? path.slice(prefix.length) : path;
}

export async function directoryExists(path: string): Promise<boolean> {
  try {
    await Array.fromAsync(new Bun.Glob("*").scan({ cwd: path, onlyFiles: false }));
    return true;
  } catch {
    return false;
  }
}

export async function pathExists(path: string): Promise<boolean> {
  return (await Bun.file(path).exists()) || (await directoryExists(path));
}

export async function listDirectories(path: string): Promise<string[]> {
  if (!(await directoryExists(path))) return [];
  const entries = await Array.fromAsync(new Bun.Glob("*").scan({ cwd: path, onlyFiles: false }));
  const directories: string[] = [];
  for (const entry of entries) {
    if (!(await Bun.file(joinPath(path, entry)).exists())) directories.push(entry);
  }
  return directories.sort();
}

export async function listFiles(path: string): Promise<string[]> {
  if (!(await directoryExists(path))) return [];
  return (await Array.fromAsync(new Bun.Glob("**/*").scan({ cwd: path, onlyFiles: true }))).sort();
}

export async function sha256File(path: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", await Bun.file(path).arrayBuffer());
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function sha256Text(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}
