import { expect, test } from "bun:test";
import registry from "../fixtures/registry.json";
import gettingStarted from "../fixtures/entries/getting-started.json";
import releaseNotes from "../fixtures/entries/release-notes.json";
import { buildRegistryIndex } from "./registry-check.ts";

test("builds the compatible index for valid local relationships", () => {
  expect(buildRegistryIndex(registry, "fixtures/registry.json", [
    { file: "entries/getting-started.json", value: gettingStarted },
    { file: "entries/release-notes.json", value: releaseNotes },
  ])).toEqual({
    index: {
      entries: [
        { id: "getting-started", kind: "guide", file: "entries/getting-started.json" },
        { id: "release-notes", kind: "note", file: "entries/release-notes.json" },
      ],
    },
    diagnostics: [],
  });
});
