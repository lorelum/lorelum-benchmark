import { join, resolve } from "node:path";

const appRoot = resolve(Bun.argv[2] ?? "public/starter/app");
const evaluatorRoot = resolve(import.meta.dirname);
const run = async (command: string[], cwd: string) => await Bun.spawn(command, { cwd, stdout: "inherit", stderr: "inherit" }).exited;
const semantic = await run(["bun", "run", "test"], appRoot);
const quality = await run([process.execPath, "run", join(evaluatorRoot, "verify-resource-state.ts"), appRoot, appRoot], process.cwd());
console.log(JSON.stringify({ semantic: semantic === 0 ? "pass" : "fail", practice_probe: quality === 0 ? "pass" : "fail" }));
process.exit(semantic === 0 && quality === 0 ? 0 : 1);
