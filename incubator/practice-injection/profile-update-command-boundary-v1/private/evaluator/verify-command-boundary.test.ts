import { expect, test } from "bun:test";
import { join, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..", "..");
const probe = join(root, "private/evaluator/verify-command-boundary.ts");
const parserRoot = join(root, "public/starter/app");

async function run(relative: string): Promise<number> {
  const child = Bun.spawn([process.execPath, "run", probe, join(root, relative), parserRoot], { stdout: "pipe", stderr: "pipe" });
  return await child.exited;
}

test("calibrates profile command responsibilities", async () => {
  expect(await run("public/starter/app")).toBe(1);
  expect(await run("private/calibration/fixtures/anti-pattern")).toBe(1);
  expect(await run("private/calibration/reference")).toBe(0);
  expect(await run("private/calibration/fixtures/equivalent")).toBe(0);
}, 30_000);
