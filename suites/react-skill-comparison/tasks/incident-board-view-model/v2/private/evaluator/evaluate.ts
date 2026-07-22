import { join, resolve } from "node:path";

const candidatePath = Bun.env.CANDIDATE_PATH;
if (!candidatePath) throw new Error("CANDIDATE_PATH is required");
const runtime = join(import.meta.dir, "../../../../../../../incubator/react-skill-comparison/react-server-runtime");
const child = Bun.spawn([process.execPath, "run", join(runtime, "evaluate-incident-board-client.ts"), resolve(process.cwd(), candidatePath)], { cwd: runtime, stdout: "pipe", stderr: "pipe" });
const [stdout, stderr, exitCode] = await Promise.all([new Response(child.stdout).text(), new Response(child.stderr).text(), child.exited]);
if (exitCode !== 0) throw new Error(stderr || stdout);
export const evaluateCandidate = async () => JSON.parse(stdout.trim());
