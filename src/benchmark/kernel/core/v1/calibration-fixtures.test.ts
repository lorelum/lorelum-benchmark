import { expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { resolveCalibrationSets, stageCalibrationSets } from "./calibration-fixtures";
import { sha256DirectoryExcludingGenerated } from "./core";
import { listFiles } from "../../../fs";

type FixtureWorkspace = {
  root: string;
  candidate: string;
  base: string;
  overlay: string;
};

async function makeWorkspace(): Promise<FixtureWorkspace> {
  const root = await mkdtemp(join(tmpdir(), "lorelum-calibration-overlay-"));
  const base = join(root, "incubator", "calibration-bases", "injection-calibration", "v1", "react-vite", "app-shell", "v1", "source");
  const candidate = join(root, "incubator", "practice-injection", "candidate-v1");
  const overlay = join(candidate, "private", "calibration", "sets", "quality-probe", "v1", "fixture");
  await mkdir(join(base, "src"), { recursive: true });
  await mkdir(join(overlay, "src"), { recursive: true });
  await writeFile(join(base, "package.json"), "{\"name\":\"fixture\"}\n");
  await writeFile(join(base, "src", "entry.ts"), "export const source = 'base';\n");
  await writeFile(join(base, "..", "base.yaml"), "profile: injection-calibration/v1\nmaterializer_kind: react-vite\nsource: source\n");
  await writeFile(join(overlay, "src", "entry.ts"), "export const source = 'overlay';\n");
  await writeFile(join(overlay, "src", "only-overlay.ts"), "export const onlyOverlay = true;\n");
  await mkdir(join(candidate, "public", "starter", "node_modules", "generated"), { recursive: true });
  await writeFile(join(candidate, "public", "starter", "package.json"), "{\"name\":\"public-starter\"}\n");
  await writeFile(join(candidate, "public", "starter", "node_modules", "generated", "index.js"), "generated\n");
  await writeFile(join(candidate, "private", "candidate.yaml"), "kernel:\n  profile: injection-calibration/v1\n  materializer_kind: react-vite\ncalibration_sets:\n  manifest: private/calibration/sets.yaml\n");
  return { root, candidate, base, overlay };
}

function manifest(baseDigest: string, overlayDigest: string, options: { baseRef?: string; overlayPath?: string; cycle?: boolean } = {}): string {
  const baseRef = options.baseRef ?? "incubator/calibration-bases/injection-calibration/v1/react-vite/app-shell/v1/source";
  const overlayPath = options.overlayPath ?? "private/calibration/sets/quality-probe/v1/fixture";
  if (options.cycle) {
    return [
      "version: 1", "sets:", "  - id: quality-probe", "    version: v1", "    trees:",
      "      first: { extends: second }", "      second: { extends: first }", "    fixtures:", "      fixture: first", "",
    ].join("\n");
  }
  return [
    "version: 1", "sets:", "  - id: quality-probe", "    version: v1", "    trees:",
    `      shell: { base: { ref: \"${baseRef}\", sha256: \"${baseDigest}\" } }`,
    `      fixture: { extends: shell, overlay: { path: \"${overlayPath}\", sha256: \"${overlayDigest}\" } }`,
    "    fixtures:", "      fixture: fixture", "",
  ].join("\n");
}

async function writeManifest(workspace: FixtureWorkspace, text: string): Promise<void> {
  const path = join(workspace.candidate, "private", "calibration", "sets.yaml");
  await mkdir(join(workspace.candidate, "private", "calibration"), { recursive: true });
  await writeFile(path, text);
}

async function configuredWorkspace(): Promise<FixtureWorkspace> {
  const workspace = await makeWorkspace();
  await writeManifest(workspace, manifest(await sha256DirectoryExcludingGenerated(workspace.base), await sha256DirectoryExcludingGenerated(workspace.overlay)));
  return workspace;
}

test("resolves deterministic base plus replacement overlay and stages a private tree", async () => {
  const workspace = await configuredWorkspace();
  const staging = await mkdtemp(join(tmpdir(), "lorelum-calibration-stage-"));
  try {
    const first = await resolveCalibrationSets(workspace.candidate, { repositoryRoot: workspace.root });
    const second = await resolveCalibrationSets(workspace.candidate, { repositoryRoot: workspace.root });
    expect(first).not.toBeNull();
    expect(first!.calibrationSetsHash).toBe(second!.calibrationSetsHash);
    const fixture = first!.sets["quality-probe/v1"].fixtures.fixture;
    expect(await Bun.file(fixture.files["src/entry.ts"].sourcePath).text()).toContain("overlay");
    expect(Object.keys(fixture.files)).toEqual(["package.json", "src/entry.ts", "src/only-overlay.ts"]);

    const staged = await stageCalibrationSets(first!, staging, { publicStarterPath: join(workspace.candidate, "public", "starter") });
    expect(await Bun.file(staged.manifestPath).json()).toMatchObject({ calibration_sets_hash: first!.calibrationSetsHash });
    expect(await Bun.file(join(staging, "private", "calibration", "sets", "quality-probe", "v1", "fixture", "src", "entry.ts")).text()).toContain("overlay");
    expect(staged.publicStarterPath).toBe(join(staging, "private", "calibration", "public-starter"));
    expect(await Bun.file(join(staged.publicStarterPath!, "package.json")).exists()).toBe(true);
    expect(await Bun.file(join(staged.publicStarterPath!, "node_modules", "generated", "index.js")).exists()).toBe(false);
    expect((await listFiles(join(staging, "private"))).every((path) => !path.includes("practices"))).toBe(true);
  } finally {
    await rm(workspace.root, { force: true, recursive: true });
    await rm(staging, { force: true, recursive: true });
  }
});

test("rejects missing base, digest mismatch, illegal paths, and cycles", async () => {
  const workspace = await configuredWorkspace();
  try {
    const baseDigest = await sha256DirectoryExcludingGenerated(workspace.base);
    const overlayDigest = await sha256DirectoryExcludingGenerated(workspace.overlay);
    await writeManifest(workspace, manifest(baseDigest, overlayDigest, { baseRef: "incubator/calibration-bases/injection-calibration/v1/react-vite/missing/v1/source" }));
    await expect(resolveCalibrationSets(workspace.candidate, { repositoryRoot: workspace.root })).rejects.toThrow("base metadata is missing or invalid");

    await writeManifest(workspace, manifest("0".repeat(64), overlayDigest));
    await expect(resolveCalibrationSets(workspace.candidate, { repositoryRoot: workspace.root })).rejects.toThrow("base digest does not match");

    await writeFile(join(workspace.base, "..", "base.yaml"), "profile: injection-calibration/v1\nmaterializer_kind: other\nsource: source\n");
    await writeManifest(workspace, manifest(baseDigest, overlayDigest));
    await expect(resolveCalibrationSets(workspace.candidate, { repositoryRoot: workspace.root })).rejects.toThrow("base is incompatible");
    await writeFile(join(workspace.base, "..", "base.yaml"), "profile: injection-calibration/v1\nmaterializer_kind: react-vite\nsource: source\n");

    await writeManifest(workspace, manifest(baseDigest, overlayDigest, { overlayPath: "private/calibration/../practices/secret" }));
    await expect(resolveCalibrationSets(workspace.candidate, { repositoryRoot: workspace.root })).rejects.toThrow("must be normalized");

    await writeManifest(workspace, manifest(baseDigest, overlayDigest, { overlayPath: "private/calibration/sets/quality-probe/v1/node_modules" }));
    await expect(resolveCalibrationSets(workspace.candidate, { repositoryRoot: workspace.root })).rejects.toThrow("generated-output directory");

    await writeManifest(workspace, manifest(baseDigest, overlayDigest, { cycle: true }));
    await expect(resolveCalibrationSets(workspace.candidate, { repositoryRoot: workspace.root })).rejects.toThrow("tree inheritance cycle");
  } finally {
    await rm(workspace.root, { force: true, recursive: true });
  }
});

test("rejects symbolic links and invalidates identities when base or overlay changes", async () => {
  const workspace = await configuredWorkspace();
  try {
    const original = await resolveCalibrationSets(workspace.candidate, { repositoryRoot: workspace.root });
    await writeFile(join(workspace.overlay, "src", "only-overlay.ts"), "export const onlyOverlay = false;\n");
    await expect(resolveCalibrationSets(workspace.candidate, { repositoryRoot: workspace.root })).rejects.toThrow("overlay digest does not match");

    const updatedOverlayDigest = await sha256DirectoryExcludingGenerated(workspace.overlay);
    await writeManifest(workspace, manifest(await sha256DirectoryExcludingGenerated(workspace.base), updatedOverlayDigest));
    const changedOverlay = await resolveCalibrationSets(workspace.candidate, { repositoryRoot: workspace.root });
    expect(changedOverlay!.calibrationSetsHash).not.toBe(original!.calibrationSetsHash);

    await writeFile(join(workspace.base, "src", "entry.ts"), "export const source = 'changed-base';\n");
    await expect(resolveCalibrationSets(workspace.candidate, { repositoryRoot: workspace.root })).rejects.toThrow("base digest does not match");

    const linkPath = join(workspace.overlay, "src", "linked.ts");
    try {
      await symlink(join(workspace.overlay, "src", "entry.ts"), linkPath);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "EPERM") return;
      throw error;
    }
    await writeManifest(workspace, manifest(await sha256DirectoryExcludingGenerated(workspace.base), updatedOverlayDigest));
    await expect(resolveCalibrationSets(workspace.candidate, { repositoryRoot: workspace.root })).rejects.toThrow("symbolic link is not allowed");
  } finally {
    await rm(workspace.root, { force: true, recursive: true });
  }
});
