/**
 * core/v1 — track-agnostic benchmark candidate workspace kernel types.
 *
 * The core provides materialization, public/private isolation, path safety,
 * hash fixation and declarative-role calibration orchestration. It MUST NOT
 * interpret any domain-specific fields of a candidate or task.
 */

/** A materializer kind selectable from a kernel declaration. */
export type MaterializerKind = string;

/** A profile kind selectable from a kernel declaration. */
export type ProfileKind = string;

/** Immutable kernel declaration carried by every kernel-backed candidate/task. */
export type KernelDeclaration = {
  core: "v1";
  profile: ProfileKind;
  materializer_kind: MaterializerKind;
};

/** A calibration role declared by a candidate/task. */
export type CalibrationRole = {
  id: string;
  command: string[];
  expect: CalibrationExpectation;
};

/** Declared expectation for a calibration role's command output. */
export type CalibrationExpectation =
  | { kind: "pass" }
  | { kind: "fail" }
  | { kind: "exit-code"; code: number };

/** Observed result of running a calibration role's command. */
export type CalibrationResult = {
  role: string;
  exitCode: number;
  passed: boolean;
};

/** Result of materializing a candidate workspace. */
export type MaterializationResult = {
  workspacePath: string;
  publicPath: string;
  /** Declared install command the materializer would run (not executed by core). */
  installCommand: string | null;
};

/** Result of auditing a materialized workspace for private leakage. */
export type IsolationAudit = {
  leaked: string[];
  passed: boolean;
};

/** Computed hashes binding a resolved candidate input. */
export type ResolvedHashes = {
  coreVersion: string;
  coreHash: string;
  profile: string;
  materializerKind: string;
  inputHash: string;
  materializedOutputHash: string;
};

/** The materialize contract: produce a runnable workspace from declared source. */
export type MaterializeFn = (input: MaterializeInput) => Promise<MaterializationResult>;

export type MaterializeInput = {
  candidatePath: string;
  publicTaskPath: string;
  publicStarterPath: string;
  outputPath: string;
  materializerKind: MaterializerKind;
};

/** The isolate contract: audit a materialized workspace for private leakage. */
export type IsolateFn = (input: IsolateInput) => Promise<IsolationAudit>;

export type IsolateInput = {
  workspacePath: string;
  privatePaths: string[];
};

/** The hash contract: compute resolved hashes for a candidate input. */
export type HashFn = (input: HashInput) => Promise<ResolvedHashes>;

export type HashInput = {
  candidatePath: string;
  declarationPath: string;
  publicTaskPath: string;
  publicStarterPath: string;
  coreVersion: string;
  coreHash: string;
  profile: string;
  materializerKind: MaterializerKind;
  workspacePath: string;
};

/** The calibrate contract: run declared roles and compare to expectations. */
export type CalibrateFn = (input: CalibrateInput) => Promise<CalibrationResult[]>;

export type CalibrateInput = {
  workspacePath: string;
  roles: CalibrationRole[];
};

/** Registered materializer implementing the materialize contract for a kind. */
export type Materializer = {
  kind: MaterializerKind;
  materialize: MaterializeFn;
};

/** Generated-output directory names excluded from snapshots and repo starters. */
export const GENERATED_OUTPUT_DIRS = ["node_modules", "dist", "test-results", "playwright-report", ".vite", ".materialized", ".practice-runtime", ".run-workspaces", "logs"] as const;

/** Returns true if a relative path segment list enters a generated-output dir. */
export function isGeneratedOutput(segments: string[]): boolean {
  return GENERATED_OUTPUT_DIRS.some((dir) => segments.includes(dir));
}
