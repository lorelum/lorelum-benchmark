import { expect, test } from "bun:test";
import validPlugin from "../fixtures/plugins/valid-plugin.json";
import { buildPluginManifest } from "./plugin-manifest.ts";

test("keeps a valid plugin manifest loadable", () => {
  expect(buildPluginManifest(validPlugin, "fixtures/plugins/valid-plugin.json")).toEqual({
    manifest: validPlugin,
    diagnostics: [],
  });
});
