import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "bun:test";
import { profileValidator } from "./v1";

test("profile validator reports the owning profile and validates primitive shapes", async () => {
  const validator = profileValidator("test-profile/v1");
  expect(() => validator.record([], "input")).toThrow("Invalid test-profile/v1 profile: input must be an object");
  expect(validator.record({ value: 1 }, "input")).toEqual({ value: 1 });
  expect(() => validator.text("", "name")).toThrow("name must be a non-empty string");
  expect(validator.text("name", "name")).toBe("name");
  expect(() => validator.number("1", "count")).toThrow("count must be a finite number");
  expect(validator.number(2, "count")).toBe(2);
  expect(() => validator.stringArray(["ok", ""], "paths")).toThrow("paths must be a string array");
  expect(validator.stringArray(["ok"], "paths")).toEqual(["ok"]);

  const root = await mkdtemp(join(tmpdir(), "profile-validator-"));
  await writeFile(join(root, "fixture.yaml"), "value: yes\n");
  expect(await validator.readYaml<{ value: boolean }>(join(root, "fixture.yaml"), "fixture")).toEqual({ value: true });
  await expect(validator.readYaml(join(root, "missing.yaml"), "fixture")).rejects.toThrow("fixture is missing");
});

test("relative paths must stay inside the permitted root", () => {
  const validator = profileValidator("test-profile/v1");
  expect(validator.relativeInside("/tmp", "child/file", "path")).toContain("child");
  expect(() => validator.relativeInside("/tmp", "../outside", "path")).toThrow("escapes its permitted root");
  expect(() => validator.relativeInside("/tmp", "\\child", "path")).toThrow("relative POSIX path");
});
