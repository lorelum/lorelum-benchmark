# Lorelum Benchmark

Reproducible task fixtures for two complementary evaluation tracks:

- Practice effectiveness: baseline, Oracle Practice, Lorelum retrieval, and an
  unrelated-Practice control.
- Performance Skill comparison: baseline, Vercel's official React Best
  Practices Skill, and Lorelum retrieval.

The shared task-card, evaluator, and run-record contract is defined in
`BENCHMARK_PROTOCOL.md`.

## Layout

- `suites/practice-effectiveness/` holds real Lorelum tasks used for the
  baseline / Oracle / retrieval / irrelevant-context experiment.
- `suites/react-skill-comparison/` holds performance tasks used for the
  baseline / Vercel Skill / Lorelum retrieval comparison.
- `schemas/` and `BENCHMARK_PROTOCOL.md` are shared by both suites.

The first smoke fixtures are `async-dashboard-v1` and
`bundle-advanced-panel-v1`. Their starter code intentionally serializes
independent dashboard requests or eagerly loads a conditional module. The
evaluator is kept separate from the task materials so the same task can be run
under every condition.

## Run the first evaluator

Requires Bun 1.1 or newer:

```powershell
bun run test:async-dashboard
```

The starter is expected to fail the concurrency assertion. A candidate solution
passes when its `src/dashboard.ts` path is supplied through `CANDIDATE_PATH`:

```powershell
$env:CANDIDATE_PATH = 'D:\path\to\candidate\src\dashboard.ts'
bun run test:async-dashboard
```

Run the conditional bundle evaluator with the path to a candidate
`src/settings.ts` file:

```powershell
$env:CANDIDATE_PATH = 'D:\path\to\candidate\src\settings.ts'
bun run test:bundle-advanced-panel
```
