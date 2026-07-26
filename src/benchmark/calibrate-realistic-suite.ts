import { cp, mkdir, mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { workspaceRoot } from "./fs";

type CalibrationCase = {
  task: string;
  label: string;
  expectedScore: number;
  expectedSemantic?: boolean;
  overlay?: string;
  destination?: string;
  remove?: string;
  createDirectory?: string;
  overlays?: Array<{ source: string; destination: string }>;
};

const suite = "realistic-react-skill-comparison";
const taskRoot = join(workspaceRoot, "suites", suite, "tasks");
const cases: CalibrationCase[] = [
  { task: "workspace-dashboard-rsc/v2", label: "starter", expectedScore: 0 },
  { task: "workspace-dashboard-rsc/v2", label: "reference", expectedScore: 100, overlay: "reference/dashboard-runtime.ts", destination: "lib/dashboard-runtime.ts" },
  { task: "workspace-dashboard-rsc/v2", label: "duplicate-workspace-read", expectedScore: 66, overlay: "mutations/duplicate-workspace-read.ts", destination: "lib/dashboard-runtime.ts" },
  { task: "workspace-dashboard-rsc/v2", label: "quota-after-workspace", expectedScore: 67, overlay: "mutations/quota-after-workspace.ts", destination: "lib/dashboard-runtime.ts" },
  { task: "workspace-dashboard-rsc/v2", label: "projects-after-quota", expectedScore: 67, overlay: "mutations/projects-after-quota.ts", destination: "lib/dashboard-runtime.ts" },
  { task: "workspace-dashboard-rsc/v2", label: "removed-unauthorized-file", expectedScore: 0, expectedSemantic: false, remove: "app/layout.tsx" },
  { task: "team-directory-rsc-payload/v3", label: "starter", expectedScore: 0 },
  { task: "team-directory-rsc-payload/v3", label: "reference", expectedScore: 100, overlay: "reference/app/team/page.tsx", destination: "app/team/page.tsx" },
  { task: "team-directory-rsc-payload/v3", label: "serialization-leak", expectedScore: 50, overlay: "mutations/serialization-leak/app/team/page.tsx", destination: "app/team/page.tsx" },
  { task: "team-directory-rsc-payload/v3", label: "duplicate-props", expectedScore: 50, overlay: "mutations/duplicate-props/app/team/page.tsx", destination: "app/team/page.tsx" },
  { task: "team-directory-rsc-payload/v3", label: "removed-unauthorized-file", expectedScore: 0, expectedSemantic: false, remove: "app/layout.tsx" },
  { task: "workspace-invitation-reconciliation/v2", label: "starter", expectedScore: 0 },
  { task: "workspace-invitation-reconciliation/v2", label: "incomplete-next-install", expectedScore: 0, createDirectory: "node_modules/next" },
  { task: "workspace-invitation-reconciliation/v2", label: "reference", expectedScore: 100, overlay: "reference/invitation-resolution-runtime.ts", destination: "lib/invitation-resolution-runtime.ts" },
  { task: "workspace-invitation-reconciliation/v2", label: "eager-policy-read", expectedScore: 60, overlay: "mutations/eager-policy-read/invitation-resolution-runtime.ts", destination: "lib/invitation-resolution-runtime.ts" },
  { task: "workspace-invitation-reconciliation/v2", label: "unfiltered-selection", expectedScore: 80, overlay: "mutations/unfiltered-selection/invitation-resolution-runtime.ts", destination: "lib/invitation-resolution-runtime.ts" },
  { task: "workspace-invitation-reconciliation/v2", label: "await-activity-record", expectedScore: 80, overlay: "mutations/await-activity-record/invitation-resolution-runtime.ts", destination: "lib/invitation-resolution-runtime.ts" },
  { task: "workspace-invitation-reconciliation/v2", label: "record-without-change", expectedScore: 80, overlay: "mutations/record-without-change/invitation-resolution-runtime.ts", destination: "lib/invitation-resolution-runtime.ts" },
  { task: "workspace-invitation-reconciliation/v2", label: "removed-unauthorized-file", expectedScore: 0, expectedSemantic: false, remove: "app/layout.tsx" }
];

function evaluatorResult(stdout: string, stderr: string): { semantic: { passed: boolean }; quality: { score: number } } {
  for (const line of stdout.split(/\r?\n/).reverse()) {
    try {
      const parsed = JSON.parse(line) as { schema_version?: unknown; semantic?: unknown; quality?: unknown };
      if (parsed.schema_version === "evaluator-result/v2" && parsed.semantic && parsed.quality) return parsed as { semantic: { passed: boolean }; quality: { score: number } };
    } catch { }
  }
  throw new Error(`Structured evaluator result was not emitted:\n${stdout}\n${stderr}`);
}

for (const calibration of cases) {
  const source = join(taskRoot, calibration.task);
  const temporaryRoot = await mkdtemp(join(tmpdir(), "lorelum-realistic-suite-"));
  const candidateRoot = join(temporaryRoot, "app");
  try {
    await cp(join(source, "public", "starter", "app"), candidateRoot, { recursive: true });
    if (calibration.overlay && calibration.destination) {
      await cp(join(source, "private", calibration.overlay), join(candidateRoot, calibration.destination));
    }
    for (const overlay of calibration.overlays ?? []) {
      await cp(join(source, "private", overlay.source), join(candidateRoot, overlay.destination));
    }
    if (calibration.createDirectory) await mkdir(join(candidateRoot, calibration.createDirectory), { recursive: true });
    if (calibration.remove) await rm(join(candidateRoot, calibration.remove), { force: true });
    const child = Bun.spawn([process.execPath, "run", "src/benchmark/evaluate.ts", suite, calibration.task], {
      cwd: workspaceRoot,
      env: { ...Bun.env, CANDIDATE_PATH: join(candidateRoot, "package.json") },
      stdout: "pipe",
      stderr: "pipe"
    });
    const [exitCode, stdout, stderr] = await Promise.all([child.exited, new Response(child.stdout).text(), new Response(child.stderr).text()]);
    const result = evaluatorResult(stdout, stderr);
    const expectedSemantic = calibration.expectedSemantic ?? true;
    if (exitCode !== (expectedSemantic ? 0 : 1) || result.semantic.passed !== expectedSemantic || result.quality.score !== calibration.expectedScore) {
      throw new Error(`${calibration.task} ${calibration.label}: expected semantic ${expectedSemantic ? "pass" : "failure"} and ${calibration.expectedScore}/100, received ${stdout}\n${stderr}`);
    }
    console.log(`${calibration.task} ${calibration.label}: ${result.quality.score}/100`);
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
  }
}

console.log("Realistic React suite starter, reference, and mutation calibration passed.");
