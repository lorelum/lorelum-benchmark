# PR #211 ai-code-review — round 1 resolution

- Review scope: issue #196 candidate diff after commit `31331438d3a254dce7bfecbbdac7fbb344675218`.
- Review input: the request-changes report supplied with the PR review handoff.
- Resolution head: `eda305f` (`fix(candidate): harden public error projection (#196)`).

## Finding mapping

1. **Persisted filename/state ID binding — resolved.** `ReportStore.read()` validates that the state ID equals the requested report ID and returns `STATE_ID_MISMATCH` before any mutation can use the mismatched state. The HTTP test also verifies that the original bytes remain unchanged.
2. **v2 public-field and error-detail exposure — resolved.** `publicReport()` now emits only the core fields plus the explicitly allowlisted v2 metadata (`writer_version: v2` and known checkpoint metadata). Persisted error summaries are mapped to the stable public vocabulary; unknown codes become `REPORT_ERROR`.
3. **Duplicate caller-supplied ID overwrite — resolved.** Report creation publishes through an exclusive hard-link operation and returns `REPORT_ALREADY_EXISTS` on conflict. Normal update writes remain separate atomic-renames, and the regression test verifies that existing bytes and progress are preserved.
4. **Undeclared treatment delivery form — resolved.** `delivery_form: practice-card-reserved` was removed from candidate metadata because no treatment condition is declared in #196. The candidate snapshot was regenerated and verified.
5. **Concurrent worker read-modify-write — resolved.** Per-report cross-process lock directories serialize pause/resume/advance transitions; the focused test launches concurrent worker processes and verifies that persisted progress reaches completion without loss.
6. **HTTP/CLI process-boundary coverage — resolved.** `report-lifecycle.test.ts` starts `Bun.serve` and launches `src/worker.ts` as separate Bun processes against one data directory rather than calling handlers and worker functions in-process.

The compatibility target remains an intentional baseline failure: v1 writes currently drop v2 extension fields, which is the public repair surface for the staged task and is documented in the candidate PR. It is not treated as a review regression.

## Verification

- `bun run typecheck` in the starter: passed.
- `bun test tests/report-lifecycle.test.ts`: 10 passed.
- `bun test tests/compatibility.test.ts`: 1 expected baseline failure.
- Candidate snapshot write and verification: passed.
- `bun run validate`: passed.
- `openspec validate async-report-lifecycle-candidate --type change --strict --json`: passed.
- `git diff --check`: passed.

No model, calibration, formal record, or suite promotion was performed.