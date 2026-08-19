import { expect, test } from "bun:test";
import { access, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  configureLocalPiModelCatalog,
  localPiApiKey,
  localPiModelBaseUrl,
  modelCatalogWithDeepSeekBaseUrl,
} from "./local-pi-model-catalog";

test("local Pi base URL prefers the explicit variable and falls back to judge config", () => {
  expect(localPiModelBaseUrl({})).toBeUndefined();
  expect(localPiModelBaseUrl({
    LORELUM_JUDGE_BASE_URL: "https://judge.example/v1/",
  })).toBe("https://judge.example/v1");
  expect(localPiModelBaseUrl({
    LORELUM_JUDGE_BASE_URL: "https://judge.example/v1/",
    LORELUM_PI_BASE_URL: "https://pi.example/v1/",
  })).toBe("https://pi.example/v1");
});

test("catalog override changes only DeepSeek model base URLs", () => {
  const catalog = {
    deepseek: {
      models: [
        { id: "flash", provider: "deepseek", baseUrl: "https://old.example" },
        { id: "other", provider: "not-deepseek", baseUrl: "https://other.example" },
      ],
    },
  };
  const result = modelCatalogWithDeepSeekBaseUrl(catalog, "https://new.example/v1") as typeof catalog;
  expect(result.deepseek.models[0].baseUrl).toBe("https://new.example/v1");
  expect(result.deepseek.models[1].baseUrl).toBe("https://other.example");
});


test("local Pi API key prefers the explicit variable and falls back to judge/deepseek config", () => {
  expect(localPiApiKey({})).toBeUndefined();
  expect(localPiApiKey({ LORELUM_PI_API_KEY: "pi-key" })).toBe("pi-key");
  expect(localPiApiKey({ LORELUM_PI_API_KEY: "  pi-key  " })).toBe("pi-key");
  expect(localPiApiKey({ LORELUM_JUDGE_API_KEY: "judge-key" })).toBe("judge-key");
  expect(localPiApiKey({ LORELUM_JUDGE_API_KEY: "judge-key", LORELUM_PI_API_KEY: "pi-key" })).toBe("pi-key");
  expect(localPiApiKey({ DEEPSEEK_API_KEY: "deepseek-key" })).toBe("deepseek-key");
});

test("temporary local catalog is isolated and cleanup removes it", async () => {
  const sourceRoot = await mkdtemp(join(tmpdir(), "lorelum-local-pi-source-"));
  const sourcePath = join(sourceRoot, "models-store.json");
  await writeFile(sourcePath, JSON.stringify({
    deepseek: { models: [{ id: "deepseek-v4-flash", provider: "deepseek", baseUrl: "https://api.deepseek.com" }] },
  }));

  const override = await configureLocalPiModelCatalog({
    LORELUM_JUDGE_BASE_URL: "https://judge.example/v1",
    PI_CODING_AGENT_DIR: sourceRoot,
  });
  expect(override).toBeDefined();
  expect(await readFile(join(override!.directory, "models-store.json"), "utf8")).toContain("https://judge.example/v1");
  override!.cleanup();
  await expect(access(override!.directory)).rejects.toThrow();
});
