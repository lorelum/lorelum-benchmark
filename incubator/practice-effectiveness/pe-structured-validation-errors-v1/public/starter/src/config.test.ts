import { expect, test } from "bun:test";
import valid from "../fixtures/valid.json";
import { validateConfig } from "./config.ts";
test("keeps a valid configuration compatible", () => expect(validateConfig(valid)).toEqual({ config: valid, diagnostics: [] }));
