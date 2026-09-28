import { join } from "node:path";
import { coreFileHashes, coreHash } from "./runner";
import { sha256Text } from "../../../fs";
import { systemPrompt } from "./prompt";

export type FrozenManifest = {
  schema_version: "offline-judge-freeze/v1";
  created_at: string;
  core_hash: string;
  system_prompt_hash: string;
  core_files: Record<string, string>;
  hidden_files: Record<string, string>;
};

export async function buildFrozenManifest(now = new Date()): Promise<FrozenManifest> {
  return {
    schema_version: "offline-judge-freeze/v1",
    created_at: now.toISOString(),
    core_hash: await coreHash(),
    system_prompt_hash: await sha256Text(systemPrompt()),
    core_files: await coreFileHashes(),
    hidden_files: {},
  };
}

export function compareFrozenCore(before: FrozenManifest, after: FrozenManifest): {
  passed: boolean;
  changed_core_files: string[];
  prompt_changed: boolean;
} {
  const names = new Set([...Object.keys(before.core_files), ...Object.keys(after.core_files)]);
  const changed = [...names].filter((name) => before.core_files[name] !== after.core_files[name]).sort();
  return {
    passed: changed.length === 0 && before.system_prompt_hash === after.system_prompt_hash,
    changed_core_files: changed,
    prompt_changed: before.system_prompt_hash !== after.system_prompt_hash,
  };
}

if (import.meta.main) {
  const output = Bun.argv[2];
  const manifest = await buildFrozenManifest();
  const text = JSON.stringify(manifest, null, 2);
  if (output) await Bun.write(join(process.cwd(), output), `${text}\n`);
  else console.log(text);
}
