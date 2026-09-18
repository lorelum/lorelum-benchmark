import { resolve } from "node:path";
import { checks } from "./checks";
import { SemanticFailure, type CheckDefinition } from "./checks/types";
import { HarnessError, TestApp } from "./harness";
import { loadEvaluatorIdentity, type EvaluatorIdentity } from "./identity";
import {
  buildEvaluatorResult,
  CHECK_IDS,
  exitCodeForStatus,
  indeterminateResult,
  type EvaluatorCheckResult,
  type EvaluatorResult,
} from "./result";

function validateRegistry(registry: CheckDefinition[]): void {
  if (registry.length !== CHECK_IDS.length) throw new Error("evaluator check registry is incomplete");
  for (const [index, check] of registry.entries()) {
    if (check.id !== CHECK_IDS[index]) throw new Error(`evaluator check registry order is invalid: ${check.id}`);
  }
}

export async function runCheck(
  check: CheckDefinition,
  appRoot: string,
  failureReason: string,
): Promise<EvaluatorCheckResult> {
  let app: TestApp | undefined;
  try {
    app = await TestApp.create(appRoot);
    await check.run(app);
    return { id: check.id, status: "pass" };
  } catch (error) {
    if (error instanceof SemanticFailure) return { id: check.id, status: "fail", reason: failureReason };
    if (error instanceof HarnessError) return { id: check.id, status: "indeterminate", reason: error.reason };
    return { id: check.id, status: "indeterminate", reason: "unexpected-evaluator-error" };
  } finally {
    await app?.dispose();
  }
}

export async function evaluateApp(appRoot: string, evaluatorRoot = import.meta.dirname): Promise<EvaluatorResult> {
  let identity: EvaluatorIdentity;
  try {
    identity = await loadEvaluatorIdentity(evaluatorRoot);
    validateRegistry(checks);
  } catch {
    return indeterminateResult("identity-invalid");
  }
  const results: EvaluatorCheckResult[] = [];
  for (const check of checks) {
    results.push(await runCheck(check, resolve(appRoot), identity.oracle.checks[check.id].failure_reason));
  }
  return buildEvaluatorResult(results);
}

if (import.meta.main) {
  const args = Bun.argv.slice(2);
  const result = args.length === 1
    ? await evaluateApp(args[0])
    : indeterminateResult("invalid-arguments");
  console.log(JSON.stringify(result));
  process.exit(exitCodeForStatus(result.status));
}
