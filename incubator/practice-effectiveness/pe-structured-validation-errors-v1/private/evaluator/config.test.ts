import { expect, test } from "bun:test";
import { join } from "node:path";

interface Result { config: unknown | null; diagnostics: Array<{ path: string; code: string; message: string }>; }
interface Candidate { validateConfig(input: unknown): Result; }
const candidatePath = Bun.env.CANDIDATE_PATH ?? join(import.meta.dir, "..", "..", "public", "starter", "src", "config.ts");
const { validateConfig } = (await import(`${Bun.pathToFileURL(candidatePath).href}?candidate=${Date.now()}`)) as Candidate;
const codes = (result: Result) => result.diagnostics.map((entry) => [entry.path, entry.code]);

test("preserves a valid configuration", () => {
  const input = { name: "release-summary", revision: "v1", output: "summary", modes: ["safe"] };
  expect(validateConfig(input)).toEqual({ config: input, diagnostics: [] });
});

test("accumulates independent structured violations in path order", () => {
  const result = validateConfig({ name: "", revision: "v2", output: "debug", modes: ["safe", "safe"], debug: true });
  expect(result.config).toBeNull();
  expect(codes(result)).toEqual([["/debug", "unknown-field"], ["/modes", "invalid-value"], ["/name", "invalid-value"], ["/output", "invalid-value"], ["/revision", "invalid-value"]]);
  expect(result.diagnostics.every((entry) => entry.message.length > 0 && !entry.message.includes("/home/"))).toBe(true);
});

test("accumulates all missing fields without returning a partial configuration", () => {
  const result = validateConfig({});
  expect(result.config).toBeNull();
  expect(codes(result)).toEqual([["/modes", "required"], ["/name", "required"], ["/output", "required"], ["/revision", "required"]]);
});

test("does not depend on property order or mutate input", () => {
  const first = { name: "", revision: "v2", output: "debug", modes: ["safe", "safe"] };
  const second = { modes: ["safe", "safe"], output: "debug", revision: "v2", name: "" };
  const before = structuredClone(first);
  expect(codes(validateConfig(first))).toEqual(codes(validateConfig(second)));
  expect(first).toEqual(before);
});
