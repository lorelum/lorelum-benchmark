import { mkdir, readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

const stage = Number(process.argv[2]);
const workspace = process.argv[3];
if (stage !== 1 && stage !== 2) throw new Error("stage must be 1 or 2");
if (!workspace) throw new Error("workspace is required");

async function walk(root: string): Promise<string[]> {
  const entries = await readdir(root, { withFileTypes: true });
  const output: string[] = [];
  for (const entry of entries) {
    if (entry.name === "node_modules" || entry.name === ".git") continue;
    const path = join(root, entry.name);
    if (entry.isDirectory()) output.push(...await walk(path));
    else output.push(await readFile(path, "utf8"));
  }
  return output;
}

const text = (await walk(workspace)).join("\n").toLowerCase();
if (stage === 1) {
  for (const term of ["halo", "stage 2", "second provider", "deterministic", "structure", "oracle", "scoring"]) {
    if (text.includes(term)) throw new Error(`stage 1 semantic leakage: ${term}`);
  }
}
for (const term of stage === 1 ? ["first-provider", "withretry", "recordbilling", "chat"] : ["first-provider", "withretry", "recordbilling", "chat", "halo-provider"]) {
  if (!text.includes(term)) throw new Error(`stage ${stage} semantic input missing: ${term}`);
}
const test = Bun.spawnSync(["bun", "test"], { cwd: workspace, stdout: "pipe", stderr: "pipe" });
if (test.exitCode !== 0) throw new Error(`stage ${stage} public tests failed`);
console.log(JSON.stringify({ stage, semantic: "pass" }));
