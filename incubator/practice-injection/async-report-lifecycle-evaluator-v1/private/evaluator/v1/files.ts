import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, relative } from "node:path";

export async function listRelativeFiles(root: string): Promise<string[]> {
  const files: string[] = [];
  for (const entry of await readdir(root, { withFileTypes: true })) {
    const path = join(root, entry.name);
    if (entry.isDirectory()) {
      for (const nested of await listRelativeFiles(path)) files.push(`${entry.name}/${nested}`);
    } else if (entry.isFile()) {
      files.push(entry.name);
    }
  }
  return files.sort();
}

export async function copyDirectory(
  source: string,
  destination: string,
  skip: (name: string) => boolean = () => false,
): Promise<void> {
  await mkdir(destination, { recursive: true });
  for (const entry of await readdir(source, { withFileTypes: true })) {
    if (skip(entry.name)) continue;
    const sourcePath = join(source, entry.name);
    const destinationPath = join(destination, entry.name);
    if (entry.isDirectory()) {
      await copyDirectory(sourcePath, destinationPath, skip);
    } else if (entry.isFile()) {
      await mkdir(dirname(destinationPath), { recursive: true });
      await writeFile(destinationPath, await readFile(sourcePath));
    }
  }
}
