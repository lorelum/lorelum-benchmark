# login-page-auth-flow-diagnostic-pilot

Three-condition diagnostic pilot for the login-page candidate (issue #137): frozen execution plan, clean workspace, semantic + JudgeAgent per attempt, redacted summary in ignored scratch.

v1 pilot (v5/v6) is historical. The v2 retest (after #145/#146/#148) runs the three-condition diagnostic on `login-page-auth-flow-v2` via the shared runner with the `practice-layered-api/v2` judge provider; see design.md "v2 复测".

v2 retest:
- headroom validation run (2026-08-05, task WITHOUT layering hint, bound to source_commit 24c99b1 / snapshot 809b16…): baseline joint_pass 0, oracle 2/6, irrelevant 0; judge baseline all 0, oracle 100x2/0x4. Scratch: `scratch/profile-diagnostics/login-v2-three-condition-retest`.
- corrected run (2026-08-06, task WITH layering requirement, plan `login-page-auth-flow-v2-three-condition-retest-v2`, repetitions=6, bound to f10d672 / 1519423…): oracle joint_pass 3/5 (judge median 100) > baseline 1/5 (median 0), irrelevant 2/6 (median 45); directional signal, overall_conclusion_grade diagnostic-only. Scratch: `scratch/profile-diagnostics/login-v2-three-condition-retest-v2`.
- cost-reduced variant `login-page-auth-flow-v2-three-condition-retest-v3` (repetitions=3) is NOT executed.
