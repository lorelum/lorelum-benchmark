import { resolve } from "node:path";

const incubatorRoot = resolve(import.meta.dir, "..", "..", "..");
const appRoot = resolve(incubatorRoot, "public", "starter", "app");
const calibration = resolve(import.meta.dir, "calibrate.ts");
const commands = [
  ["run", "test:functional"],
  ["run", "build"],
  ["run", "test:e2e"],
] as const;

for (const command of commands) {
  const child = Bun.spawn([process.execPath, ...command], { cwd: appRoot, stdin: "inherit", stdout: "inherit", stderr: "inherit" });
  if (await child.exited !== 0) process.exit(1);
}

const calibrationRun = Bun.spawn([process.execPath, "run", calibration], { cwd: incubatorRoot, stdin: "inherit", stdout: "inherit", stderr: "inherit" });
process.exit(await calibrationRun.exited);
