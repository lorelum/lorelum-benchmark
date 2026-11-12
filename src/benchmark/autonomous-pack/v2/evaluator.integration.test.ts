import { expect, test } from "bun:test";
import { chmod, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { evaluateSemantic } from "./evaluator";
import { sha256SnapshotDirectory } from "../v1/snapshot";

// Opt in only with a locally built immutable image containing Node and Python.
// These tests execute candidate code in Docker, not on the host.
const imageId = process.env.LORELUM_TEST_CODING_IMAGE ?? "";
const integration = test.skipIf(!/^sha256:[a-f0-9]{64}$/.test(imageId));

integration("isolated Node and Python verifiers accept reasonable solutions and reject defects", async () => {
  const output = await mkdtemp(join(tmpdir(), "coding-verifier-integration-"));
  try {
    for (const [task, valid, defect] of [
      ["config-migration-v2", "valid-spread", "defect-precedence"],
      ["csv-import-v3", "valid-iterator", "defect-duplicates"],
    ]) {
      const root = resolve("incubator/autonomous-pack", task, "private"), evaluatorRoot = join(root, "evaluator");
      const evaluatorSha256 = await sha256SnapshotDirectory(evaluatorRoot);
      for (const [name, expected] of [[valid, "pass"], [defect, "fail"]]) {
        const result = await evaluateSemantic({ workspace: join(root, "calibration", name), evaluatorRoot, evaluatorSha256, imageId, outputDirectory: join(output, `${task}-${name}`) });
        expect(result.health).toBe("evaluated");
        expect(result.semantic).toBe(expected);
      }
    }
  } finally { await rm(output, { recursive: true, force: true }); }
}, 120_000);

integration("a verdict cannot hide candidate exit or bypass candidate execution", async () => {
  const root = await mkdtemp(join(tmpdir(), "coding-verifier-exit-"));
  try {
    const workspace = join(root, "workspace"), evaluatorRoot = join(root, "verifier");
    await mkdir(workspace); await mkdir(evaluatorRoot);
    await chmod(workspace, 0o755);
    await writeFile(join(workspace, "candidate.mjs"), `process.stdin.once('data', () => { process.stdout.write('{}\\n'); setTimeout(() => process.exit(3), 50); });\n`);
    await writeFile(join(evaluatorRoot, "contract.json"), JSON.stringify({ schema_version: "coding-verifier/v1", driver: ["/usr/local/bin/node", "/verifier/driver.mjs"], candidate: ["/usr/local/bin/node", "/workspace/candidate.mjs"], timeout_ms: 15000 }));
    const driver = join(evaluatorRoot, "driver.mjs");
    await writeFile(driver, `import {createInterface} from 'node:readline';const r=createInterface({input:process.stdin});console.log(JSON.stringify({type:'call',id:'1',input:{}}));r.once('line',()=>{console.log(JSON.stringify({type:'result',semantic:'pass'}));r.close();});\n`);
    let evaluatorSha256 = await sha256SnapshotDirectory(evaluatorRoot);
    const crashed = await evaluateSemantic({ workspace, evaluatorRoot, evaluatorSha256, imageId, outputDirectory: join(root, "crashed"), timeoutMs: 15000 });
    expect(crashed.health).not.toBe("evaluated");
    expect(crashed.semantic).toBe("not-run");
    await writeFile(driver, `console.log(JSON.stringify({type:'result',semantic:'pass'}));\n`);
    evaluatorSha256 = await sha256SnapshotDirectory(evaluatorRoot);
    const noCall = await evaluateSemantic({ workspace, evaluatorRoot, evaluatorSha256, imageId, outputDirectory: join(root, "no-call"), timeoutMs: 15000 });
    expect(noCall.health).not.toBe("evaluated");
    expect(noCall.semantic).toBe("not-run");
  } finally { await rm(root, { recursive: true, force: true }); }
}, 60_000);

integration("candidate cannot read verifier files, Docker socket or host sentinel", async () => {
  const root = await mkdtemp(join(tmpdir(), "coding-verifier-boundary-"));
  const previous = process.env.LORELUM_PRIVATE_SENTINEL;
  process.env.LORELUM_PRIVATE_SENTINEL = "synthetic-host-only";
  try {
    const workspace = join(root, "workspace"), evaluatorRoot = join(root, "verifier");
    await mkdir(workspace); await mkdir(evaluatorRoot); await chmod(workspace, 0o755);
    await writeFile(join(workspace, "candidate.mjs"), `import fs from 'node:fs';import {createInterface} from 'node:readline';for await(const line of createInterface({input:process.stdin})){console.log(JSON.stringify({privateFile:fs.existsSync('/verifier/driver.mjs'),dockerSocket:fs.existsSync('/var/run/docker.sock'),sentinel:!!process.env.LORELUM_PRIVATE_SENTINEL}));}\n`);
    await writeFile(join(evaluatorRoot, "contract.json"), JSON.stringify({ schema_version: "coding-verifier/v1", driver: ["/usr/local/bin/node", "/verifier/driver.mjs"], candidate: ["/usr/local/bin/node", "/workspace/candidate.mjs"], timeout_ms: 15000 }));
    await writeFile(join(evaluatorRoot, "driver.mjs"), `import {createInterface} from 'node:readline';const r=createInterface({input:process.stdin});const lines=r[Symbol.asyncIterator]();console.log(JSON.stringify({type:'call',id:'1',input:{}}));const {value}=await lines.next();const {output}=JSON.parse(value);const ok=output.privateFile===false&&output.dockerSocket===false&&output.sentinel===false;console.log(JSON.stringify({type:'result',semantic:ok?'pass':'fail'}));r.close();\n`);
    const result = await evaluateSemantic({ workspace, evaluatorRoot, evaluatorSha256: await sha256SnapshotDirectory(evaluatorRoot), imageId, outputDirectory: join(root, "result"), timeoutMs: 15000 });
    expect(result).toEqual({ health: "evaluated", semantic: "pass", quality: "not-run", quality_probes: [], failure_reasons: [] });
  } finally {
    if (previous === undefined) delete process.env.LORELUM_PRIVATE_SENTINEL; else process.env.LORELUM_PRIVATE_SENTINEL = previous;
    await rm(root, { recursive: true, force: true });
  }
}, 60_000);
