import { advanceReport, toPublicReport } from "./report-service";
import { ReportStore, ReportStoreError } from "./store";
import type { ApiVersion } from "./types";

function usage(): never {
  console.error("usage: bun run src/worker.ts --report <id> (--step [--fail-at-segment <n>] | --retry) [--api-version 1|2] [--data-dir <path>]");
  process.exit(2);
}

function valueAfter(args: string[], flag: string): string | undefined {
  const index = args.indexOf(flag);
  return index >= 0 ? args[index + 1] : undefined;
}

export async function runWorker(args: string[]): Promise<Record<string, unknown>> {
  const id = valueAfter(args, "--report");
  const dataDir = valueAfter(args, "--data-dir") ?? process.env.REPORT_DATA_DIR ?? `${process.cwd()}/.data/reports`;
  const versionValue = Number(valueAfter(args, "--api-version") ?? "1");
  const apiVersion = versionValue === 2 ? 2 : versionValue === 1 ? 1 : usage();
  const retry = args.includes("--retry");
  const step = args.includes("--step");
  if (!id || retry === step) usage();
  const failValue = valueAfter(args, "--fail-at-segment");
  const failAtSegment = failValue === undefined ? undefined : Number(failValue);
  const state = await advanceReport({ store: new ReportStore(dataDir), apiVersion: apiVersion as ApiVersion, id, retry, failAtSegment });
  return toPublicReport(state, apiVersion as ApiVersion);
}

if (import.meta.main) {
  try {
    console.log(JSON.stringify(await runWorker(process.argv.slice(2))));
  } catch (caught) {
    const error = caught instanceof ReportStoreError ? caught : new ReportStoreError("INTERNAL_ERROR", "worker could not complete", 500);
    console.error(JSON.stringify({ error: { code: error.code, summary: error.message } }));
    process.exit(error.httpStatus >= 500 ? 1 : 2);
  }
}
