import { expect, test } from "bun:test";
import { mkdtemp, rm, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { calibrate, copySourceExcludingGenerated, hash, isolate, materialize, registerMaterializer } from "./core/v1/core";
import { materializeReactVite, reactViteKind } from "./materializers";
import { sha256Directory, listFiles } from "../fs";

const norm = (s: string) => s.replaceAll("\\", "/");

registerMaterializer({ kind: reactViteKind, materialize: materializeReactVite });

const fixturePath = join(import.meta.dir, "fixtures", "neutral");

async function makeTempWorkspace(): Promise<string> {
  return mkdtemp(join(tmpdir(), "lorelum-kernel-"));
}

test("materialize copies starter source excluding generated output", async () => {
  const output = await makeTempWorkspace();
  try {
    const result = await materialize({
      candidatePath: fixturePath,
      publicTaskPath: join(fixturePath, "public", "task.md"),
      publicStarterPath: join(fixturePath, "public", "starter"),
      outputPath: output,
      materializerKind: "react-vite",
    });
    expect(result.workspacePath).toBe(output);
    expect(result.installCommand).toBe("bun install");
    const files = (await listFiles(join(output, "public"))).map(norm);
    expect(files).toContain("task.md");
    expect(files).toContain("starter/package.json");
    expect(files).toContain("starter/src/index.ts");
    expect(files.every((f) => !f.includes("node_modules"))).toBe(true);
    expect(files.every((f) => !f.includes("dist"))).toBe(true);
  } finally {
    await rm(output, { force: true, recursive: true });
  }
});

test("materialize refuses nonempty destinations and candidate-owned destinations", async () => {
  const output = await makeTempWorkspace();
  try {
    const sentinel = join(output, "keep.txt");
    await writeFile(sentinel, "must survive");
    const input = {
      candidatePath: fixturePath,
      publicTaskPath: join(fixturePath, "public", "task.md"),
      publicStarterPath: join(fixturePath, "public", "starter"),
      materializerKind: "react-vite",
    } as const;
    await expect(materialize({ ...input, outputPath: output })).rejects.toThrow("must be empty");
    expect(await Bun.file(sentinel).text()).toBe("must survive");
    await expect(materialize({ ...input, outputPath: fixturePath })).rejects.toThrow("must not be written inside the candidate source");
  } finally {
    await rm(output, { force: true, recursive: true });
  }
});

test("kernel CLI requires an explicit output workspace", async () => {
  const kernel = join(import.meta.dir, "kernel.ts");
  const child = Bun.spawn([process.execPath, "run", kernel, "materialize", fixturePath], { stdout: "pipe", stderr: "pipe" });
  expect(await child.exited).toBe(1);
  expect(await new Response(child.stderr).text()).toContain("--output <empty-workspace-path>");
});

test("isolate rejects private path leakage into materialized workspace", async () => {
  const output = await makeTempWorkspace();
  try {
    await materialize({
      candidatePath: fixturePath,
      publicTaskPath: join(fixturePath, "public", "task.md"),
      publicStarterPath: join(fixturePath, "public", "starter"),
      outputPath: output,
      materializerKind: "react-vite",
    });
    await mkdir(join(output, "public", "leaked"), { recursive: true });
    await writeFile(join(output, "public", "leaked", "oracle.yaml"), "secret");
    const privateOracle = join(fixturePath, "private", "oracle.yaml");
    const audit = await isolate({ workspacePath: join(output, "public"), privatePaths: [privateOracle] });
    expect(audit.passed).toBe(false);
    expect(audit.leaked.length).toBeGreaterThan(0);

    await rm(join(output, "public", "leaked"), { force: true, recursive: true });
    const cleanAudit = await isolate({ workspacePath: join(output, "public"), privatePaths: [privateOracle] });
    expect(cleanAudit.passed).toBe(true);
  } finally {
    await rm(output, { force: true, recursive: true });
  }
});

test("hash produces stable resolved hashes that change on source change", async () => {
  const output = await makeTempWorkspace();
  try {
    await materialize({
      candidatePath: fixturePath,
      declarationPath: join(fixturePath, "private", "candidate.yaml"),
      publicTaskPath: join(fixturePath, "public", "task.md"),
      publicStarterPath: join(fixturePath, "public", "starter"),
      outputPath: output,
      materializerKind: "react-vite",
    });
    const coreHash = await sha256Directory(join(import.meta.dir, "core", "v1"));
    const h1 = await hash({
      candidatePath: fixturePath,
      declarationPath: join(fixturePath, "private", "candidate.yaml"),
      publicTaskPath: join(fixturePath, "public", "task.md"),
      publicStarterPath: join(fixturePath, "public", "starter"),
      coreVersion: "v1",
      coreHash,
      profile: "injection-calibration/v1",
      materializerKind: "react-vite",
      workspacePath: output,
    });
    const h2 = await hash({
      candidatePath: fixturePath,
      declarationPath: join(fixturePath, "private", "candidate.yaml"),
      publicTaskPath: join(fixturePath, "public", "task.md"),
      publicStarterPath: join(fixturePath, "public", "starter"),
      coreVersion: "v1",
      coreHash,
      profile: "injection-calibration/v1",
      materializerKind: "react-vite",
      workspacePath: output,
    });
    expect(h1.inputHash).toBe(h2.inputHash);
    expect(h1.materializedOutputHash).toBe(h2.materializedOutputHash);

    await writeFile(join(output, "public", "starter", "src", "index.ts"), "export const meaning = 43;\n");
    const h3 = await hash({
      candidatePath: fixturePath,
      declarationPath: join(fixturePath, "private", "candidate.yaml"),
      publicTaskPath: join(fixturePath, "public", "task.md"),
      publicStarterPath: join(fixturePath, "public", "starter"),
      coreVersion: "v1",
      coreHash,
      profile: "injection-calibration/v1",
      materializerKind: "react-vite",
      workspacePath: output,
    });
    expect(h3.materializedOutputHash).not.toBe(h1.materializedOutputHash);
    expect(h3.inputHash).toBe(h1.inputHash);
  } finally {
    await rm(output, { force: true, recursive: true });
  }
});

test("calibrate runs declared roles and compares to expectations", async () => {
  const output = await makeTempWorkspace();
  try {
    await materialize({
      candidatePath: fixturePath,
      publicTaskPath: join(fixturePath, "public", "task.md"),
      publicStarterPath: join(fixturePath, "public", "starter"),
      outputPath: output,
      materializerKind: "react-vite",
    });
    const results = await calibrate({
      workspacePath: output,
      roles: [
        { id: "pass-role", command: [process.execPath, "-e", "process.exit(0)"], expect: { kind: "pass" } },
        { id: "fail-role", command: [process.execPath, "-e", "process.exit(1)"], expect: { kind: "fail" } },
        { id: "mismatch-role", command: [process.execPath, "-e", "process.exit(0)"], expect: { kind: "fail" } },
      ],
    });
    expect(results[0].passed).toBe(true);
    expect(results[1].passed).toBe(true);
    expect(results[2].passed).toBe(false);
  } finally {
    await rm(output, { force: true, recursive: true });
  }
});

test("calibrate does not interpret domain meaning of roles", async () => {
  const output = await makeTempWorkspace();
  try {
    await materialize({
      candidatePath: fixturePath,
      publicTaskPath: join(fixturePath, "public", "task.md"),
      publicStarterPath: join(fixturePath, "public", "starter"),
      outputPath: output,
      materializerKind: "react-vite",
    });
    const results = await calibrate({
      workspacePath: output,
      roles: [
        { id: "baseline-semantic-check", command: [process.execPath, "-e", "process.exit(0)"], expect: { kind: "pass" } },
        { id: "oracle-quality-probe", command: [process.execPath, "-e", "process.exit(0)"], expect: { kind: "pass" } },
      ],
    });
    expect(results.every((r) => r.passed)).toBe(true);
  } finally {
    await rm(output, { force: true, recursive: true });
  }
});

test("copySourceExcludingGenerated skips node_modules, dist, test-results", async () => {
  const src = await mkdtemp(join(tmpdir(), "lorelum-copy-src-"));
  const dst = await mkdtemp(join(tmpdir(), "lorelum-copy-dst-"));
  try {
    await writeFile(join(src, "package.json"), "{}");
    await mkdir(join(src, "src"), { recursive: true });
    await writeFile(join(src, "src", "index.ts"), "export {}");
    await mkdir(join(src, "node_modules", "pkg"), { recursive: true });
    await writeFile(join(src, "node_modules", "pkg", "index.js"), "");
    await mkdir(join(src, "dist"), { recursive: true });
    await writeFile(join(src, "dist", "out.js"), "");
    await mkdir(join(src, "test-results"), { recursive: true });
    await writeFile(join(src, "test-results", "result.xml"), "");

    await copySourceExcludingGenerated(src, dst);
    const files = (await listFiles(dst)).map(norm);
    expect(files).toContain("package.json");
    expect(files).toContain("src/index.ts");
    expect(files.every((f) => !f.startsWith("node_modules/"))).toBe(true);
    expect(files.every((f) => !f.startsWith("dist/"))).toBe(true);
    expect(files.every((f) => !f.startsWith("test-results/"))).toBe(true);
  } finally {
    await rm(src, { force: true, recursive: true });
    await rm(dst, { force: true, recursive: true });
  }
});

test("isolate rejects a relative private path to prevent path traversal", async () => {
  const output = await makeTempWorkspace();
  try {
    await materialize({
      candidatePath: fixturePath,
      publicTaskPath: join(fixturePath, "public", "task.md"),
      publicStarterPath: join(fixturePath, "public", "starter"),
      outputPath: output,
      materializerKind: "react-vite",
    });
    await expect(isolate({ workspacePath: output, privatePaths: ["../private/oracle.yaml"] })).rejects.toThrow("Private path must be outside");
  } finally {
    await rm(output, { force: true, recursive: true });
  }
});

test("frozen task immutability: core hash is deterministic for unchanged source", async () => {
  const coreDir = join(import.meta.dir, "core", "v1");
  const h1 = await sha256Directory(coreDir);
  const h2 = await sha256Directory(coreDir);
  expect(h1).toBe(h2);
});
