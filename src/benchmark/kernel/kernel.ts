import { join, resolve } from "node:path";
import { calibrate, getMaterializer, hash, isolate, materialize, registerMaterializer } from "./core/v1/core";
import { materializeReactVite, reactViteKind } from "./materializers";
import { sha256Directory, workspaceRoot } from "../fs";
import type { CalibrationRole, KernelDeclaration } from "./core/v1/types";

registerMaterializer({ kind: reactViteKind, materialize: materializeReactVite });

const argumentsList = Bun.argv.slice(2);
const subcommand = argumentsList[0];
const candidatePath = argumentsList[1] ? resolve(argumentsList[1]) : undefined;
const outputPathIndex = argumentsList.indexOf("--output");
const outputPath = outputPathIndex >= 0 ? argumentsList[outputPathIndex + 1] : join(candidatePath, ".materialized");

function usage(): never {
  console.error("Usage: kernel <materialize|isolate|hash|calibrate> <candidate-path> [--output <path>]");
  process.exit(1);
}

if (!subcommand || !candidatePath) usage();

async function readKernelDeclaration(candidatePath: string): Promise<KernelDeclaration | null> {
  const manifestPath = join(candidatePath, "private", "candidate.yaml");
  const file = Bun.file(manifestPath);
  if (!(await file.exists())) return null;
  const doc = Bun.YAML.parse(await file.text()) as Record<string, unknown>;
  const kernel = doc.kernel;
  if (!kernel || typeof kernel !== "object") return null;
  const k = kernel as Record<string, unknown>;
  if (k.core !== "v1" || typeof k.profile !== "string" || typeof k.materializer_kind !== "string") return null;
  return { core: "v1", profile: k.profile, materializer_kind: k.materializer_kind };
}

async function readCalibrationRoles(candidatePath: string): Promise<CalibrationRole[]> {
  const manifestPath = join(candidatePath, "private", "candidate.yaml");
  const file = Bun.file(manifestPath);
  if (!(await file.exists())) return [];
  const doc = Bun.YAML.parse(await file.text()) as Record<string, unknown>;
  const roles = Array.isArray(doc.calibration_roles) ? doc.calibration_roles : [];
  return roles.map((role: Record<string, unknown>) => {
    if (!Array.isArray(role.command) || !role.command.every((part) => typeof part === "string")) {
      throw new Error(`Calibration role command must be a string array: ${String(role.id)}`);
    }
    return { id: String(role.id), command: role.command, expect: parseExpectation(role.expect) };
  });
}

function parseExpectation(expect: unknown): CalibrationRole["expect"] {
  if (!expect || typeof expect !== "object") return { kind: "pass" };
  const e = expect as Record<string, unknown>;
  if (e.kind === "fail") return { kind: "fail" };
  if (e.kind === "exit-code" && typeof e.code === "number") return { kind: "exit-code", code: e.code };
  return { kind: "pass" };
}

try {
  const declaration = await readKernelDeclaration(candidatePath);
  if (!declaration) {
    console.error("No valid kernel declaration found in private/candidate.yaml");
    process.exit(1);
  }

  const publicStarterPath = join(candidatePath, "public", "starter");

  switch (subcommand) {
    case "materialize": {
      const result = await materialize({ candidatePath, publicStarterPath, outputPath, materializerKind: declaration.materializer_kind });
      console.log(JSON.stringify(result, null, 2));
      break;
    }
    case "isolate": {
      const result = await isolate({ workspacePath: outputPath, privatePaths: [join(candidatePath, "private")] });
      console.log(JSON.stringify(result, null, 2));
      break;
    }
    case "hash": {
      const coreHash = await sha256Directory(join(workspaceRoot, "src", "benchmark", "kernel", "core", "v1"));
      const result = await hash({
        candidatePath,
        declarationPath: join(candidatePath, "private", "candidate.yaml"),
        publicStarterPath,
        coreVersion: declaration.core,
        coreHash,
        profile: declaration.profile,
        materializerKind: declaration.materializer_kind,
        workspacePath: outputPath,
      });
      console.log(JSON.stringify(result, null, 2));
      break;
    }
    case "calibrate": {
      const roles = await readCalibrationRoles(candidatePath);
      const results = await calibrate({ workspacePath: outputPath, roles });
      console.log(JSON.stringify(results, null, 2));
      const allPassed = results.every((r) => r.passed);
      if (!allPassed) process.exit(1);
      break;
    }
    default:
      usage();
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
