import { readFile } from "node:fs/promises";

const generatedPurpose = /^TBD - created by archiving change\b[\s\S]*$/;

export type StableSpecSource = {
  path: string;
  content: string;
};

function readPurpose(content: string): string | null {
  const heading = /^## Purpose\s*$/m.exec(content);
  if (!heading || heading.index === undefined) return null;

  const afterHeading = content.slice(heading.index + heading[0].length).replace(/^\r?\n/, "");
  const nextHeading = afterHeading.search(/^##\s+/m);
  return (nextHeading === -1 ? afterHeading : afterHeading.slice(0, nextHeading)).trim();
}

export function purposeFailures(specs: Iterable<StableSpecSource>): string[] {
  const failures: string[] = [];
  for (const spec of specs) {
    const purpose = readPurpose(spec.content);
    if (!purpose) {
      failures.push(`${spec.path}: missing or empty ## Purpose section`);
      continue;
    }
    if (generatedPurpose.test(purpose)) failures.push(`${spec.path}: Purpose still uses the generated archive placeholder`);
  }
  return failures;
}

function changedStableSpecPaths(baseRevision: string): string[] {
  const result = Bun.spawnSync([
    "git",
    "diff",
    "--name-only",
    "--diff-filter=ACMR",
    `${baseRevision}...HEAD`,
    "--",
    "openspec/specs"
  ], { stdout: "pipe", stderr: "pipe" });

  if (result.exitCode !== 0) {
    const detail = new TextDecoder().decode(result.stderr).trim();
    throw new Error(`Could not list changed stable specs from ${baseRevision}: ${detail || "git diff failed"}`);
  }

  return new TextDecoder()
    .decode(result.stdout)
    .split(/\r?\n/)
    .filter((path) => /^openspec\/specs\/[^/]+\/spec\.md$/.test(path));
}

async function main(): Promise<void> {
  const baseRevision = process.argv[2];
  if (!baseRevision) {
    console.error("Usage: bun run check:openspec-purpose -- <base-git-revision>");
    process.exitCode = 2;
    return;
  }

  const paths = changedStableSpecPaths(baseRevision);
  const specs = await Promise.all(paths.map(async (path) => ({ path, content: await readFile(path, "utf8") })));
  const failures = purposeFailures(specs);
  if (failures.length === 0) {
    console.log(`OpenSpec Purpose guard passed for ${paths.length} changed stable spec(s).`);
    return;
  }

  console.error("OpenSpec Purpose guard failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exitCode = 1;
}

if (import.meta.main) await main();
