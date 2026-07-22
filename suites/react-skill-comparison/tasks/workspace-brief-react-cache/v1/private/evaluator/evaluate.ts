const candidatePath = Bun.env.CANDIDATE_PATH;
if (!candidatePath) throw new Error("CANDIDATE_PATH is required");
const evaluatorPath = `${import.meta.dir}/react-server-evaluate.ts`;
const child = Bun.spawn([process.execPath, "--conditions=react-server", "run", evaluatorPath, candidatePath], { cwd: process.cwd(), stdout: "pipe", stderr: "pipe" });
const [stdout, stderr, exitCode] = await Promise.all([new Response(child.stdout).text(), new Response(child.stderr).text(), child.exited]);
if (exitCode !== 0) throw new Error(stderr || stdout);
export const evaluateCandidate = async () => JSON.parse(stdout.trim());
