import { spawn } from "node:child_process";
import { createHash, randomInt, randomUUID } from "node:crypto";
import { lstat, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { isAbsolute, join, relative, resolve, sep } from "node:path";
import { snapshotPack } from "./snapshot";

export type BlindReviewItem = {
  id: string;
  starter: string;
  starterSha256: string;
  workspace: string;
  workspaceSha256: string;
};

type ReviewProbe = { id: string; status: "observed" | "not-observed" | "indeterminate"; evidence: string };
const digest = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");
const contains = (parent: string, child: string) => {
  const path = relative(parent, child);
  return path === "" || (path !== ".." && !path.startsWith(`..${sep}`) && !isAbsolute(path));
};

async function diff(stage: string): Promise<Buffer> {
  const inherited = process.env;
  const env: NodeJS.ProcessEnv = { PATH: inherited.PATH, SYSTEMROOT: inherited.SYSTEMROOT, GIT_CONFIG_NOSYSTEM: "1", GIT_CONFIG_GLOBAL: process.platform === "win32" ? "NUL" : "/dev/null", GIT_TERMINAL_PROMPT: "0" };
  const child = spawn("git", ["--no-pager", "-c", "core.quotePath=false", "diff", "--no-index", "--no-ext-diff", "--no-textconv", "--no-color", "--", "starter", "candidate"], { cwd: stage, env, stdio: ["ignore", "pipe", "ignore"], windowsHide: true });
  const chunks: Buffer[] = [];
  let bytes = 0, timedOut = false, overflow = false;
  child.stdout.on("data", (chunk: Buffer) => {
    bytes += chunk.length;
    if (bytes > 8 * 1024 * 1024) { overflow = true; child.kill(); }
    else chunks.push(chunk);
  });
  const finished = Promise.withResolvers<number | null>();
  child.once("error", finished.reject);
  child.once("close", finished.resolve);
  const timer = setTimeout(() => { timedOut = true; child.kill(); }, 30_000);
  try {
    const code = await finished.promise;
    if (timedOut || overflow || (code !== 0 && code !== 1)) throw new Error("Unable to create bounded review diff");
    return Buffer.concat(chunks);
  } finally { clearTimeout(timer); }
}

/** Copy verified workspaces and produce reviewer-only diffs with random IDs.
 * Share only `review/`, never `private/`; source text may itself reveal condition. */
export async function prepareBlindReview(options: { items: readonly BlindReviewItem[]; rubricFile: string; rubricSha256: string; criteria: readonly string[]; outputDirectory: string }): Promise<void> {
  if (!options.items.length || new Set(options.items.map(item => item.id)).size !== options.items.length || options.items.some(item => !item.id)) throw new Error("Invalid review items");
  if (!options.criteria.length || new Set(options.criteria).size !== options.criteria.length || options.criteria.some(id => !/^[a-z0-9][a-z0-9-]*$/.test(id))) throw new Error("Invalid review criteria");
  const root = resolve(options.outputDirectory);
  for (const item of options.items) {
    if (![item.starterSha256, item.workspaceSha256].every(value => /^[a-f0-9]{64}$/.test(value))) throw new Error("Invalid review input digest");
    if ([item.starter, item.workspace].some(path => contains(resolve(path), root) || contains(root, resolve(path)))) throw new Error("Review output and input trees must be disjoint");
  }
  const rubricStat = await lstat(options.rubricFile);
  if (!rubricStat.isFile() || rubricStat.isSymbolicLink() || rubricStat.size > 1_048_576 || contains(root, resolve(options.rubricFile))) throw new Error("Invalid review rubric");
  const rubric = await readFile(options.rubricFile);
  const text = new TextDecoder("utf-8", { fatal: true }).decode(rubric);
  if (!text.trim() || text.includes("\0") || digest(rubric) !== options.rubricSha256) throw new Error("Invalid review rubric or digest");
  await mkdir(root, { mode: 0o700 });
  try {
    const review = join(root, "review"), privateDir = join(root, "private");
    await mkdir(review, { mode: 0o700 });
    await mkdir(privateDir, { mode: 0o700 });
    await writeFile(join(review, "rubric.md"), rubric, { flag: "wx", mode: 0o600 });
    const mapping: { blind_id: string; id: string; starter_sha256: string; workspace_sha256: string; diff_sha256: string }[] = [];
    for (const item of options.items) {
      const stage = await mkdtemp(join(tmpdir(), "lorelum-blind-"));
      try {
        const starter = await snapshotPack(item.starter, join(stage, "starter"));
        const workspace = await snapshotPack(item.workspace, join(stage, "candidate"));
        if (starter !== item.starterSha256 || workspace !== item.workspaceSha256) throw new Error("Review input digest mismatch");
        const patch = await diff(stage);
        const blind_id = randomUUID();
        await writeFile(join(review, `${blind_id}.diff`), patch, { flag: "wx", mode: 0o600 });
        mapping.push({ blind_id, id: item.id, starter_sha256: starter, workspace_sha256: workspace, diff_sha256: digest(patch) });
      } finally { await rm(stage, { recursive: true, force: true }); }
    }
    const blindIds = mapping.map(item => item.blind_id);
    for (let i = blindIds.length - 1; i > 0; i--) { const j = randomInt(i + 1); [blindIds[i], blindIds[j]] = [blindIds[j], blindIds[i]]; }
    const index = Buffer.from(JSON.stringify({ criteria: options.criteria, blind_ids: blindIds }, null, 2) + "\n");
    await writeFile(join(review, "index.json"), index, { flag: "wx", mode: 0o600 });
    await writeFile(join(privateDir, "mapping.json"), JSON.stringify({ rubric_sha256: digest(rubric), index_sha256: digest(index), items: mapping }, null, 2) + "\n", { flag: "wx", mode: 0o600 });
  } catch (error) {
    await rm(root, { recursive: true, force: true });
    throw error;
  }
}

/** Validate a human review without converting subjective evidence into a score. */
export function validateBlindReview(value: unknown, blindId: string, criteria: readonly string[]): { quality: "observed" | "indeterminate"; quality_probes: { id: string; status: ReviewProbe["status"]; points: null; max_points: null }[]; evidence: ReviewProbe[] } {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid blind review");
  const review = value as Record<string, unknown>;
  if (review.blind_id !== blindId || !Array.isArray(review.probes) || review.probes.length !== criteria.length || !criteria.length || new Set(criteria).size !== criteria.length) throw new Error("Blind review does not match its packet");
  const evidence: ReviewProbe[] = [];
  for (const id of criteria) {
    const matches = review.probes.filter(probe => probe && typeof probe === "object" && !Array.isArray(probe) && (probe as Record<string, unknown>).id === id);
    if (matches.length !== 1) throw new Error("Missing or duplicate review criterion");
    const probe = matches[0] as Record<string, unknown>;
    if (!(probe.status === "observed" || probe.status === "not-observed" || probe.status === "indeterminate") || typeof probe.evidence !== "string" || !probe.evidence.trim()) throw new Error("Invalid review evidence");
    evidence.push({ id, status: probe.status, evidence: probe.evidence });
  }
  return { quality: evidence.some(probe => probe.status === "indeterminate") ? "indeterminate" : "observed", quality_probes: evidence.map(probe => ({ id: probe.id, status: probe.status, points: null, max_points: null })), evidence };
}

/** Recover an assessment only if the reviewed packet still matches its private
 * mapping. Evidence stays on the control side and is never an agent input. */
export async function collectBlindReview(outputDirectory: string, value: unknown): Promise<{ id: string; workspaceSha256: string } & ReturnType<typeof validateBlindReview>> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid blind review");
  const blindId = (value as Record<string, unknown>).blind_id;
  if (typeof blindId !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(blindId)) throw new Error("Invalid blind review ID");
  const root = resolve(outputDirectory);
  const readRegular = async (path: string, maximum: number) => {
    const info = await lstat(path);
    if (!info.isFile() || info.isSymbolicLink() || info.size > maximum) throw new Error("Invalid blind review artifact");
    return readFile(path);
  };
  const privateBytes = await readRegular(join(root, "private", "mapping.json"), 8 * 1024 * 1024);
  const indexBytes = await readRegular(join(root, "review", "index.json"), 8 * 1024 * 1024);
  const rubric = await readRegular(join(root, "review", "rubric.md"), 1_048_576);
  const patch = await readRegular(join(root, "review", `${blindId}.diff`), 8 * 1024 * 1024);
  const mapping: unknown = JSON.parse(privateBytes.toString("utf8"));
  const index: unknown = JSON.parse(indexBytes.toString("utf8"));
  if (!mapping || typeof mapping !== "object" || Array.isArray(mapping) || !index || typeof index !== "object" || Array.isArray(index)) throw new Error("Invalid blind review mapping");
  const meta = mapping as Record<string, unknown>, listing = index as Record<string, unknown>;
  if (meta.index_sha256 !== digest(indexBytes) || meta.rubric_sha256 !== digest(rubric) || !Array.isArray(meta.items) || !Array.isArray(listing.criteria) || !Array.isArray(listing.blind_ids) || !listing.blind_ids.includes(blindId)) throw new Error("Blind review packet identity mismatch");
  const matches = meta.items.filter(item => item && typeof item === "object" && !Array.isArray(item) && (item as Record<string, unknown>).blind_id === blindId);
  if (matches.length !== 1) throw new Error("Blind review mapping mismatch");
  const item = matches[0] as Record<string, unknown>;
  if (typeof item.id !== "string" || !item.id || typeof item.workspace_sha256 !== "string" || !/^[a-f0-9]{64}$/.test(item.workspace_sha256) || item.diff_sha256 !== digest(patch) || !listing.criteria.every(id => typeof id === "string" && /^[a-z0-9][a-z0-9-]*$/.test(id))) throw new Error("Blind review packet identity mismatch");
  return { id: item.id, workspaceSha256: item.workspace_sha256, ...validateBlindReview(value, blindId, listing.criteria as string[]) };
}
