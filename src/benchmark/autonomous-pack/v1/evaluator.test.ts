import { afterEach, expect, test } from "bun:test";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { sha256SnapshotDirectory } from "./snapshot";
import { classifySemanticTap, evaluateSemantic, evaluatorEnvironment } from "./evaluator";

const roots: string[] = [];
afterEach(async () => { for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true }); });

function tap(failed: boolean, diagnostic = "code: 'ERR_ASSERTION'", total = 7) {
  return `TAP version 13\n${failed ? `not ok 1 - check\n  ---\n  ${diagnostic}\n  ...` : "ok 1 - check"}\n${Array.from({ length: total - 1 }, (_, i) => `ok ${i + 2} - check`).join("\n")}\n1..${total}\n# tests ${total}\n# pass ${failed ? total - 1 : total}\n# fail ${failed ? 1 : 0}\n# cancelled 0\n# skipped 0\n# todo 0\n`;
}

test("semantic assertions are distinct from incomplete and transport failures", () => {
  expect(classifySemanticTap(tap(false), 0).semantic).toBe("pass");
  expect(classifySemanticTap(tap(true), 1).semantic).toBe("fail");
  expect(classifySemanticTap(tap(true, "code: 'INSUFFICIENT_BALANCE'\n  name: 'CandidateError'"), 1).semantic).toBe("fail");
  expect(classifySemanticTap(tap(true, "code: 'ECONNRESET'\n  name: 'CandidateError'"), 1).semantic).toBe("not-run");
  expect(classifySemanticTap(tap(true, "code: 'ERR_ASSERTION'\n  message: Evaluator container exited (1)"), 1).semantic).toBe("not-run");
  expect(classifySemanticTap(tap(true, "code: 'ERR_TEST_FAILURE'"), 1).health).toBe("indeterminate");
  expect(classifySemanticTap(tap(false).replace("# tests 7", "# tests 6"), 0).semantic).toBe("not-run");
  expect(classifySemanticTap(tap(false), 1).semantic).toBe("not-run");
  expect(classifySemanticTap(tap(false, undefined, 3), 0).semantic).toBe("pass");
  expect(classifySemanticTap(tap(false).replace("ok 4 -", "ok 5 -"), 0).semantic).toBe("not-run");
  expect(classifySemanticTap(tap(false).replace("1..7", "1..6"), 0).semantic).toBe("not-run");
  expect(classifySemanticTap(tap(false), 0).quality).toBe("not-run");
});

test("subprocess environment excludes credentials and ambient runtime configuration", () => {
  const env = evaluatorEnvironment({ PATH: "/bin", OPENAI_API_KEY: "secret", NODE_OPTIONS: "--require secret", DOCKER_HOST: "tcp://remote", HOME: "/private" }, "/isolated");
  expect(env).toEqual({ PATH: "/bin", HOME: "/isolated", USERPROFILE: "/isolated", DOCKER_CONFIG: "/isolated" });
});

test("rejects overlapping inputs and does not overwrite an existing output", async () => {
  const root = await mkdtemp(join(tmpdir(), "evaluator-"));
  roots.push(root);
  const workspace = join(root, "workspace"), evaluatorRoot = join(root, "evaluator"), outputDirectory = join(root, "output");
  await mkdir(workspace);
  await mkdir(evaluatorRoot);
  await mkdir(outputDirectory);
  await writeFile(join(evaluatorRoot, "bridge.mjs"), "bridge");
  await writeFile(join(evaluatorRoot, "semantic.test.mjs"), "semantic");
  await writeFile(join(outputDirectory, "result.json"), "original");
  const evaluatorSha256 = await sha256SnapshotDirectory(evaluatorRoot);
  const options = { workspace, evaluatorRoot, evaluatorSha256, imageId: `sha256:${"a".repeat(64)}`, outputDirectory };
  expect((await evaluateSemantic(options)).semantic).toBe("not-run");
  expect(await readFile(join(outputDirectory, "result.json"), "utf8")).toBe("original");
  expect((await evaluateSemantic({ ...options, outputDirectory: join(workspace, "output") })).health).toBe("execution-failed");
  expect((await evaluateSemantic({ ...options, workspace: root })).semantic).toBe("not-run");
  expect((await evaluateSemantic({ ...options, imageId: "mutable:tag" })).semantic).toBe("not-run");
});
