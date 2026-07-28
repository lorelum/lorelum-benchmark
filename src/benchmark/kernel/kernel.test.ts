import { expect, test } from "bun:test";
import { mkdtemp, rm, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
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

test("isolate permits public-equivalent calibration files and rejects private-only content", async () => {
  const candidate = await makeTempWorkspace();
  const workspace = await makeTempWorkspace();
  try {
    const publicRoot = join(candidate, "public");
    const privateRoot = join(candidate, "private");
    await mkdir(join(publicRoot, "starter", "src"), { recursive: true });
    await mkdir(join(privateRoot, "calibration", "reference", "src"), { recursive: true });
    await mkdir(join(privateRoot, "practices"), { recursive: true });
    await mkdir(join(privateRoot, "evaluator"), { recursive: true });
    await mkdir(join(workspace, "starter", "src"), { recursive: true });
    await writeFile(join(publicRoot, "starter", "src", "shared.ts"), "export const shared = true;\n");
    await writeFile(join(privateRoot, "calibration", "reference", "src", "shared.ts"), "export const shared = true;\n");
    await writeFile(join(workspace, "starter", "src", "shared.ts"), "export const shared = true;\n");

    const withoutPublicSource = await isolate({ workspacePath: workspace, privatePaths: [privateRoot] });
    expect(withoutPublicSource.passed).toBe(false);
    expect(withoutPublicSource.leaked.map(norm)).toContain("starter/src/shared.ts");

    await expect(isolate({ workspacePath: workspace, privatePaths: [privateRoot], publicSourcePaths: [workspace] })).rejects.toThrow("must be independent");

    const cleanAudit = await isolate({ workspacePath: workspace, privatePaths: [privateRoot], publicSourcePaths: [publicRoot] });
    expect(cleanAudit.passed).toBe(true);

    await mkdir(join(privateRoot, "evaluator", "private", "calibration"), { recursive: true });
    await writeFile(join(privateRoot, "evaluator", "private", "calibration", "secret.ts"), "export const shared = true;\n");
    const nestedCalibrationAudit = await isolate({ workspacePath: workspace, privatePaths: [privateRoot], publicSourcePaths: [publicRoot] });
    expect(nestedCalibrationAudit.passed).toBe(false);
    expect(nestedCalibrationAudit.leaked.map(norm)).toContain("starter/src/shared.ts");
    await rm(join(privateRoot, "evaluator", "private"), { force: true, recursive: true });

    await writeFile(join(privateRoot, "oracle.yaml"), "export const shared = true;\n");
    const mixedHashAudit = await isolate({ workspacePath: workspace, privatePaths: [privateRoot], publicSourcePaths: [publicRoot] });
    expect(mixedHashAudit.passed).toBe(false);
    expect(mixedHashAudit.leaked.map(norm)).toContain("starter/src/shared.ts");

    await writeFile(join(privateRoot, "conditions.yaml"), "condition-secret\n");
    await writeFile(join(privateRoot, "oracle.yaml"), "oracle-secret\n");
    await writeFile(join(privateRoot, "practices", "card.md"), "practice-secret\n");
    await writeFile(join(privateRoot, "evaluator", "check.ts"), "evaluator-secret\n");
    await writeFile(join(privateRoot, "calibration", "reference", "private-only.ts"), "calibration-secret\n");
    await mkdir(join(workspace, "copied"), { recursive: true });
    const leakedFiles = [
      ["conditions-copy.ts", "condition-secret\n"],
      ["oracle-copy.ts", "oracle-secret\n"],
      ["practice-copy.ts", "practice-secret\n"],
      ["evaluator-copy.ts", "evaluator-secret\n"],
      ["calibration-copy.ts", "calibration-secret\n"],
    ];
    for (const [file, content] of leakedFiles) await writeFile(join(workspace, "copied", file), content);

    const leakedAudit = await isolate({ workspacePath: workspace, privatePaths: [privateRoot], publicSourcePaths: [publicRoot] });
    expect(leakedAudit.passed).toBe(false);
    expect(leakedAudit.leaked.map(norm)).toEqual(leakedFiles.map(([file]) => `copied/${file}`).sort());
  } finally {
    await rm(candidate, { force: true, recursive: true });
    await rm(workspace, { force: true, recursive: true });
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


test("concurrent calibrate invocations start distinct Vite servers without EADDRINUSE", async () => {
  const output = await makeTempWorkspace();
  try {
    await materialize({
      candidatePath: fixturePath,
      publicTaskPath: join(fixturePath, "public", "task.md"),
      publicStarterPath: join(fixturePath, "public", "starter"),
      outputPath: output,
      materializerKind: "react-vite",
    });
    const appPath = resolve(import.meta.dir, "..", "..", "..", "incubator", "practice-injection", "profile-update-command-boundary-v1", "public", "starter", "app");
    const fileA = join(output, "port-a.txt");
    const fileB = join(output, "port-b.txt");
    const viteModulePath = join(appPath, "node_modules", "vite", "dist", "node", "index.js");
    const roleScript = (file: string) => `
      const { writeFileSync } = require("node:fs");
      const { pathToFileURL } = require("node:url");
      const { createServer: createHttpServer } = require("node:http");
      const vite = await import(pathToFileURL(${JSON.stringify(viteModulePath)}).href);
      const httpServer = createHttpServer();
      const server = await vite.createServer({ root: ${JSON.stringify(appPath)}, server: { host: "127.0.0.1", hmr: false, middlewareMode: { server: httpServer } } });
      httpServer.on("request", server.middlewares);
      try {
        await new Promise((resolve, reject) => { httpServer.once("error", reject); httpServer.listen(0, "127.0.0.1", resolve); });
        const address = httpServer.address();
        if (!address || typeof address === "string") throw new Error("Vite did not expose a TCP port");
        const baseUrl = "http://127.0.0.1:" + address.port;
        const response = await fetch(baseUrl, { signal: AbortSignal.timeout(10_000) });
        if (!response.ok) throw new Error("Vite readiness check failed: " + response.status);
        writeFileSync(${JSON.stringify(file)}, baseUrl);
      } finally {
        await server.close();
        if (httpServer.listening) await new Promise((resolve, reject) => httpServer.close((error) => error ? reject(error) : resolve()));
      }
    `;
    const runOne = (file: string) =>
      calibrate({
        workspacePath: output,
        roles: [
          {
            id: "vite-port-zero",
            command: [process.execPath, "-e", roleScript(file)],
            expect: { kind: "pass" },
          },
        ],
      });
    const [resA, resB] = await Promise.all([runOne(fileA), runOne(fileB)]);
    if (!resA[0].passed || !resB[0].passed) {
      throw new Error(`Vite calibration role failed: ${resA[0].output ?? ""}${resB[0].output ?? ""}`);
    }
    expect(resA[0].passed).toBe(true);
    expect(resB[0].passed).toBe(true);
    const urlA = await Bun.file(fileA).text();
    const urlB = await Bun.file(fileB).text();
    expect(urlA).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/);
    expect(urlB).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/);
    expect(urlA).not.toBe(urlB);
  } finally {
    await rm(output, { force: true, recursive: true });
  }
});
