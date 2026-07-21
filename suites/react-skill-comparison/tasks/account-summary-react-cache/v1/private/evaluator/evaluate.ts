const candidatePath = Bun.env.CANDIDATE_PATH; if (!candidatePath) throw new Error("CANDIDATE_PATH is required");
const child = Bun.spawn([process.execPath, "--conditions=react-server", "run", "incubator/react-skill-comparison/react-server-runtime/evaluate-account-summary.ts", candidatePath], { cwd: process.cwd(), stdout: "pipe", stderr: "pipe" });
const [stdout, stderr, exitCode] = await Promise.all([new Response(child.stdout).text(), new Response(child.stderr).text(), child.exited]);
if (exitCode !== 0) throw new Error(stderr || stdout); export const evaluateCandidate = async () => JSON.parse(stdout.trim());
