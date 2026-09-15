export type CiChangeFlags = {
  runner: boolean;
  formal: boolean;
  realistic: boolean;
};

const runnerPaths = [
  /^(src\/benchmark\/(runner|evaluator)\/)/,
  /^src\/benchmark\/(fs|snapshot|task-discovery)\.ts$/,
  /^scripts\/run-runner-contracts\.ts$/,
  /^scripts\/ci-change-classifier\.ts$/,
  /^\.github\/workflows\/validate\.yml$/,
  /^schemas\//,
  /^environments\//,
  /^policies\//,
  /^treatments\//,
  /^package\.json$/,
  /^bun\.lock$/,
];

const formalPaths = [
  /^scripts\/ci-change-classifier\.ts$/,
  /^Dockerfile\.formal-pi$/,
  /^package\.json$/,
  /^bun\.lock$/,
  /^environments\//,
  /^src\/benchmark\/runner\//,
  /^policies\//,
  /^\.github\/workflows\/(validate|publish-formal-pi-image)\.yml$/,
];

const realisticPaths = [
  /^scripts\/ci-change-classifier\.ts$/,
  /^src\/benchmark\/(calibrate-realistic-suite|evaluate|snapshot|fs|task-discovery)\.ts$/,
  /^src\/benchmark\/evaluator\//,
  /^src\/benchmark\/kernel\//,
  /^suites\/realistic-react-skill-comparison\//,
  /^incubator\/calibration-bases\//,
  /^package\.json$/,
  /^bun\.lock$/,
  /^\.github\/workflows\/validate\.yml$/,
];

function matches(paths: readonly RegExp[], changedPath: string): boolean {
  return paths.some((pattern) => pattern.test(changedPath.replaceAll("\\", "/")));
}

export function classifyChangedPaths(changedPaths: readonly string[]): CiChangeFlags {
  return {
    runner: changedPaths.some((path) => matches(runnerPaths, path)),
    formal: changedPaths.some((path) => matches(formalPaths, path)),
    realistic: changedPaths.some((path) => matches(realisticPaths, path)),
  };
}

if (import.meta.main) {
  const input = await new Response(Bun.stdin).text();
  const changedPaths = input.split(/\r?\n/).filter(Boolean);
  const flags = classifyChangedPaths(changedPaths);
  for (const [key, value] of Object.entries(flags)) console.log(`${key}=${value}`);
}
