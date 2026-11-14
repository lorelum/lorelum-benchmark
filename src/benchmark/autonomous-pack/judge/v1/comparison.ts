type Run = {
  judgeStatus: string;
  semantic: { health: string; semantic: string };
  adjustments: string[];
  checks: { executable: string; args: string[]; cwd: string }[];
  readPaths: string[];
  writePaths: string[];
};

/** A complete retrieval trace is not required for a functional comparison. */
export function comparePair(runs: Run[]): { status: "eligible" | "excluded"; reasons: string[] } {
  const reasons: string[] = [];
  const completed = runs.length === 2 && runs.every(run => run.judgeStatus === "completed");
  if (!completed) reasons.push("Both Judge executions must complete");
  if (runs.length !== 2 || runs.some(run => run.semantic.health !== "evaluated" || !["pass", "fail"].includes(run.semantic.semantic))) reasons.push("Both independent functional evaluations must be conclusive");
  if (completed && JSON.stringify(runs[0]!.adjustments) !== JSON.stringify(runs[1]!.adjustments)) reasons.push("User plan adjustments differ between conditions");
  if (completed && JSON.stringify(runs[0]!.checks) !== JSON.stringify(runs[1]!.checks)) reasons.push("User-selected check commands differ between conditions");
  if (completed && (JSON.stringify([...runs[0]!.readPaths].sort()) !== JSON.stringify([...runs[1]!.readPaths].sort()) || JSON.stringify([...runs[0]!.writePaths].sort()) !== JSON.stringify([...runs[1]!.writePaths].sort()))) reasons.push("User-approved file permissions differ between conditions");
  return { status: reasons.length ? "excluded" : "eligible", reasons };
}
