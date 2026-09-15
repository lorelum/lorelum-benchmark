import { mkdir } from "node:fs/promises";

await mkdir("test-results", { recursive: true });
const child = Bun.spawn([
  process.execPath,
  "test",
  "--timeout",
  "60000",
  "--reporter=junit",
  "--reporter-outfile=test-results/runner-contracts.xml",
  "src/benchmark/runner/pi/v2"
], { stdin: "inherit", stdout: "inherit", stderr: "inherit" });
process.exit(await child.exited);
