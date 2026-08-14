import { rmSync } from "node:fs";
import { mkdtemp, readFile } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";

type EnvLike = Record<string, string | undefined>;

export type LocalPiCatalogOverride = {
  directory: string;
  cleanup: () => void;
};

function normalizedBaseUrl(value: string | undefined): string | undefined {
  const trimmed = value?.trim().replace(/\/+$/, "");
  if (!trimmed) return undefined;
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    throw new Error(`Invalid local Pi model base URL: ${trimmed}`);
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new Error(`Local Pi model base URL must use http or https: ${trimmed}`);
  }
  return `${url.origin}${url.pathname}`;
}

export function localPiModelBaseUrl(env: EnvLike = Bun.env): string | undefined {
  return normalizedBaseUrl(env.LORELUM_PI_BASE_URL) ?? normalizedBaseUrl(env.LORELUM_JUDGE_BASE_URL);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function modelCatalogWithDeepSeekBaseUrl(value: unknown, baseUrl: string): unknown {
  if (!isRecord(value)) throw new Error("Pi model catalog must be a JSON object");
  const catalog = structuredClone(value) as Record<string, unknown>;
  for (const provider of Object.values(catalog)) {
    if (!isRecord(provider) || !Array.isArray(provider.models)) continue;
    for (const model of provider.models) {
      if (isRecord(model) && model.provider === "deepseek") model.baseUrl = baseUrl;
    }
  }
  return catalog;
}

function userModelStorePath(env: EnvLike): string {
  const root = env.PI_CODING_AGENT_DIR?.trim() || join(homedir(), ".pi", "agent");
  return join(root, "models-store.json");
}

export async function configureLocalPiModelCatalog(
  env: EnvLike = Bun.env,
): Promise<LocalPiCatalogOverride | undefined> {
  const baseUrl = localPiModelBaseUrl(env);
  if (!baseUrl) return undefined;

  const sourcePath = userModelStorePath(env);
  let catalog: unknown;
  try {
    catalog = JSON.parse(await readFile(sourcePath, "utf8"));
  } catch (error) {
    throw new Error(`Unable to read local Pi model catalog ${sourcePath}: ${error instanceof Error ? error.message : String(error)}`);
  }

  const directory = await mkdtemp(join(tmpdir(), "lorelum-local-pi-catalog-"));
  await Bun.write(
    join(directory, "models-store.json"),
    `${JSON.stringify(modelCatalogWithDeepSeekBaseUrl(catalog, baseUrl), null, 2)}\n`,
  );

  return {
    directory,
    cleanup: () => rmSync(directory, { recursive: true, force: true }),
  };
}
