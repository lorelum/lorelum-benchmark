import { expect, test } from "bun:test";
import { join, resolve } from "node:path";
const root = resolve(import.meta.dirname, "..", ".."); const probe = join(root, "private/evaluator/verify-resource-state.ts"); const parser = join(root, "public/starter/app");
async function run(path: string) { return await Bun.spawn([process.execPath, "run", probe, join(root, path), parser]).exited; }
test("calibrates explicit resource states", async () => { expect(await run("public/starter/app")).toBe(1); expect(await run("private/calibration/fixtures/anti-pattern")).toBe(1); expect(await run("private/calibration/reference")).toBe(0); expect(await run("private/calibration/fixtures/equivalent")).toBe(0); }, 30_000);
