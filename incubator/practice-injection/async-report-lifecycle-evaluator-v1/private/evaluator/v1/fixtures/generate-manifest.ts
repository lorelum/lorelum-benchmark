import { readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { listRelativeFiles } from "../files";
import { sha256File } from "../identity";

type Fixture = {
  parent: string | null;
  overlay: string | null;
  files: Record<string, string>;
};

type Manifest = {
  version: 1;
  base: Record<string, string>;
  fixtures: Record<string, Fixture>;
};

const evaluatorRoot = resolve(import.meta.dirname, "..");
const manifestPath = join(import.meta.dirname, "manifest.yaml");
const manifest = Bun.YAML.parse(await readFile(manifestPath, "utf8")) as Manifest;
for (const fixture of Object.values(manifest.fixtures)) {
  if (!fixture.overlay) {
    fixture.files = {};
    continue;
  }
  const overlayRoot = resolve(evaluatorRoot, fixture.overlay);
  const files = await listRelativeFiles(overlayRoot);
  fixture.files = Object.fromEntries(await Promise.all(files.map(async (file) => [file, await sha256File(join(overlayRoot, file))] as const)));
}
// Bun's YAML stringifier leaves trailing spaces after empty mapping keys.
const yaml = Bun.YAML.stringify(manifest, null, 2)
  .replace(/:\s+$/gm, ":")
  .trimEnd();
await writeFile(manifestPath, `${yaml}\n`, "utf8");
console.log("Fixture manifest written.");
