import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { copyDirectory } from "../files";
import type { EvaluatorIdentity } from "../identity";

export type MaterializedFixture = {
  root: string;
  appRoot: string;
  dispose: () => Promise<void>;
};

function parentChain(identity: EvaluatorIdentity, id: string): string[] {
  const chain: string[] = [];
  let current: string | null = id;
  while (current) {
    if (chain.includes(current)) throw new Error(`fixture parent cycle: ${id}`);
    const fixture = identity.fixtures.fixtures[current];
    if (!fixture) throw new Error(`fixture is missing: ${current}`);
    chain.unshift(current);
    current = fixture.parent;
  }
  return chain;
}

export async function materializeFixture(identity: EvaluatorIdentity, id: string): Promise<MaterializedFixture> {
  const root = await mkdtemp(join(tmpdir(), "async-report-fixture-"));
  const appRoot = join(root, "app");
  try {
    await copyDirectory(identity.baseAppRoot, appRoot);
    for (const fixtureId of parentChain(identity, id).filter((value) => value !== "public-starter")) {
      const fixture = identity.fixtures.fixtures[fixtureId];
      if (!fixture.overlay) continue;
      const overlayRoot = resolve(identity.root, fixture.overlay);
      for (const file of Object.keys(fixture.files)) {
        const source = join(overlayRoot, file);
        const destination = join(appRoot, file);
        await mkdir(dirname(destination), { recursive: true });
        await writeFile(destination, await readFile(source));
      }
    }
  } catch (error) {
    await rm(root, { recursive: true, force: true });
    throw error;
  }
  return {
    root,
    appRoot,
    dispose: async () => {
      await rm(root, { recursive: true, force: true });
    },
  };
}
