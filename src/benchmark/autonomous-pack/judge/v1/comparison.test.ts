import { expect, test } from "bun:test";
import { comparePair } from "./comparison";

const check = { executable: "/work/support/node", args: ["--check", "src/migrate.js"], cwd: "." };
const completed = (semantic: "pass" | "fail") => ({ judgeStatus: "completed", semantic: { health: "evaluated", semantic }, adjustments: ["preserve CLI"], checks: [check], readPaths: ["src/migrate.js"], writePaths: ["src/migrate.js"] });

test("permits a functional comparison despite different semantic outcomes", () => {
  expect(comparePair([completed("pass"), completed("fail")])).toEqual({ status: "eligible", reasons: [] });
});

test("excludes incomplete verifier results and differing human adjustments", () => {
  const missing = { ...completed("pass"), semantic: { health: "indeterminate", semantic: "not-run" }, adjustments: ["different request"] };
  const result = comparePair([completed("pass"), missing]);
  expect(result.status).toBe("excluded");
  expect(result.reasons).toContain("Both independent functional evaluations must be conclusive");
  expect(result.reasons).toContain("User plan adjustments differ between conditions");
});

test("excludes a missing run or a different user-selected check", () => {
  expect(comparePair([completed("pass")]).status).toBe("excluded");
  const other = { ...completed("pass"), checks: [{ ...check, args: ["--check", "src/cli.js"] }] };
  expect(comparePair([completed("pass"), other]).reasons).toContain("User-selected check commands differ between conditions");
});

test("excludes differently authorized file paths", () => {
  const other = { ...completed("pass"), writePaths: ["src/migrate.js", "src/new.js"] };
  expect(comparePair([completed("pass"), other]).reasons).toContain("User-approved file permissions differ between conditions");
});

test("does not claim different permissions when a run was declined", () => {
  const declined = { ...completed("pass"), judgeStatus: "declined", semantic: { health: "indeterminate", semantic: "not-run" }, checks: [], readPaths: [], writePaths: [] };
  expect(comparePair([completed("pass"), declined]).reasons).toEqual([
    "Both Judge executions must complete",
    "Both independent functional evaluations must be conclusive",
  ]);
});
