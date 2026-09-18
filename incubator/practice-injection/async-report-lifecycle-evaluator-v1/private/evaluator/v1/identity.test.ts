import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { afterEach, describe, expect, test } from "bun:test";
import { loadEvaluatorIdentity, verifyEvaluatorSourceSnapshot, writeEvaluatorSnapshot } from "./identity";

const roots: string[] = [];
afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function cloneIdentityTree(): Promise<string> {
  const parent = await mkdtemp(join(tmpdir(), "async-report-evaluator-tree-"));
  roots.push(parent);
  const root = join(parent, "async-report-lifecycle-evaluator-v1", "private", "evaluator", "v1");
  await mkdir(dirname(root), { recursive: true });
  await cp(import.meta.dirname, root, { recursive: true });
  await cp(
    resolve(import.meta.dirname, "../../../../async-report-lifecycle-v1"),
    join(parent, "async-report-lifecycle-v1"),
    { recursive: true },
  );
  return root;
}

describe("async report evaluator identity", () => {
  test("loads the frozen evaluator, candidate, fixture, and oracle anchors", async () => {
    const identity = await loadEvaluatorIdentity();
    expect(identity.baseAppRoot.replaceAll("\\", "/")).toEndWith(
      "incubator/practice-injection/async-report-lifecycle-v1/public/starter/app",
    );
    expect(Object.keys(identity.fixtures.fixtures)).toContain("public-starter");
    expect(Object.keys(identity.fixtures.fixtures)).toContain("reference");
    expect(Object.keys(identity.fixtures.fixtures)).toContain("equivalent");
    for (const id of Object.keys(identity.oracle.checks)) {
      expect(Object.keys(identity.fixtures.fixtures)).toContain(`negative/${id}`);
    }
  });

  test("rejects evaluator source drift against snapshot.json", async () => {
    const root = await mkdtemp(join(tmpdir(), "async-report-evaluator-identity-"));
    roots.push(root);
    await cp(import.meta.dirname, root, { recursive: true });
    const resultPath = join(root, "result.ts");
    await writeFile(resultPath, `${await readFile(resultPath, "utf8")}\n// drift\n`, "utf8");
    await expect(verifyEvaluatorSourceSnapshot(root)).rejects.toThrow("snapshot leaf");
  });

  test("rejects oracle drift after the evaluator source snapshot is refrozen", async () => {
    const root = await cloneIdentityTree();
    await writeFile(join(root, "oracle.yaml"), "version: 2\nchecks: {}\nfixtures: {}\n", "utf8");
    await writeEvaluatorSnapshot(root);
    await expect(loadEvaluatorIdentity(root)).rejects.toThrow("oracle");
  });

  test("rejects fixture overlay drift after the evaluator source snapshot is refrozen", async () => {
    const root = await cloneIdentityTree();
    const overlay = join(root, "fixtures", "reference", "src", "report-service.ts");
    await writeFile(overlay, `${await readFile(overlay, "utf8")}\n// drift\n`, "utf8");
    await writeEvaluatorSnapshot(root);
    await expect(loadEvaluatorIdentity(root)).rejects.toThrow("fixture overlay leaf");
  });
});
