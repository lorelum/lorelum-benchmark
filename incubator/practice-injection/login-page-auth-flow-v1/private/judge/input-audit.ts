import { join, resolve } from "node:path";
import { buildJudgeInput, isAllowedPublicPath, looksPrivate, type PublicRunMaterial } from "../../../../../src/benchmark/judge/input";
import { loadRubric, assertNoPathBinding } from "./rubric";

const repositoryRoot = resolve(import.meta.dirname, "..", "..", "..", "..", "..");
const candidateRelative = "incubator/practice-injection/login-page-auth-flow-v1";

async function readText(path: string): Promise<string> {
  return Bun.file(path).text();
}

export async function runAudit(): Promise<Record<string, unknown>> {
  const { text: rubricText, doc } = await loadRubric();
  assertNoPathBinding(rubricText);
  const candidate = join(repositoryRoot, candidateRelative);
  const publicRoot = join(candidate, "public");

  const taskMd = await readText(join(publicRoot, "task.md"));
  const starterFiles = [
    "src/LoginPage.tsx",
    "src/api/http.ts",
    "src/api/session.ts",
  ];
  const candidateDiff = (await Promise.all(
    starterFiles.map(async (file) => {
      const content = await readText(join(publicRoot, "starter", "app", file));
      return `${file}\0${content}`;
    }),
  )).join("\n");

  const material: PublicRunMaterial[] = [
    { path: `${candidateRelative}/public/task.md`, kind: "public/task.md" },
    { path: `${candidateRelative}/public/starter/app/src/LoginPage.tsx`, kind: "public/starter" },
    { path: `${candidateRelative}/public/starter/app/src/api/session.ts`, kind: "public/starter" },
  ];

  const input = await buildJudgeInput({ task_md: taskMd, candidate_diff: candidateDiff, rubric: rubricText, material });

  const audit: Record<string, unknown> = {
    candidate: candidateRelative,
    rubric: { id: doc.id, version: doc.version, rubric_hash: input.rubric_hash },
    input_hash: input.input_hash,
    task_md_private_markers: looksPrivate(taskMd),
    candidate_diff_private_markers: looksPrivate(candidateDiff),
    rubric_private_markers: looksPrivate(rubricText),
    material_paths: material.map((entry) => ({ path: entry.path, kind: entry.kind, allowed: isAllowedPublicPath(entry.path).allowed })),
    material_count: input.material.length,
  };

  if (audit.task_md_private_markers || audit.candidate_diff_private_markers || audit.rubric_private_markers) {
    throw new Error("judge input redaction audit failed: private markers present in public-only input");
  }
  if (audit.material_paths.some((entry: { allowed: boolean }) => !entry.allowed)) {
    throw new Error("judge input redaction audit failed: material path outside public root");
  }
  if (!/^[a-f0-9]{64}$/.test(input.input_hash)) {
    throw new Error("judge input redaction audit failed: input hash missing");
  }

  // Fail-closed negative checks: private-marked strings and non-public material must be rejected.
  const negative: string[] = [];
  const badStrings = [
    "private/evaluator/evaluate.ts",
    "condition_id: oracle-practice",
    "practice payload: layered design",
    "private/practices/react.api.layered-design.v1.md",
  ];
  for (const bad of badStrings) {
    try {
      await buildJudgeInput({ task_md: taskMd, candidate_diff: bad, rubric: rubricText });
      negative.push(`accepted private-marked candidate_diff: ${bad}`);
    } catch (error) {
      if (!(error instanceof Error) || !error.message.includes("judge input rejected")) {
        negative.push(`unexpected error for ${bad}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  }
  for (const badPath of ["private/evaluator", "../../private/oracle.yaml"]) {
    try {
      await buildJudgeInput({
        task_md: taskMd,
        candidate_diff: candidateDiff,
        rubric: rubricText,
        material: [{ path: badPath, kind: "declared-public" }],
      });
      negative.push(`accepted non-public material path: ${badPath}`);
    } catch (error) {
      if (!(error instanceof Error) || !error.message.includes("judge input rejected")) {
        negative.push(`unexpected error for ${badPath}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  }
  audit.fail_closed_negative_checks = negative;
  if (negative.length > 0) {
    throw new Error(`judge input redaction audit failed: ${negative.join("; ")}`);
  }
  return audit;
}

if (import.meta.main) {
  try {
    const audit = await runAudit();
    console.log(JSON.stringify({ audit }, null, 2));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}
