# login-page-auth-flow-diagnostic-pilot

Three-condition diagnostic pilot for the login-page candidate (issue #137): frozen execution plan, clean workspace, semantic + JudgeAgent per attempt, redacted summary in ignored scratch.

v1 pilot (v5/v6) is historical. The v2 retest (after #145/#146/#148) runs the three-condition diagnostic on `login-page-auth-flow-v2` via the shared runner with the `practice-layered-api/v2` judge provider; see design.md "v2 复测".

v2 retest (2026-08-05): 18 attempts (6 per condition), judge all observed (v2 rubric hash 3d4d719b…), oracle-practice joint_pass 2/6 strictly greater than baseline 0/4 and irrelevant-practice 0/6 -> directional signal, but overall_conclusion_grade diagnostic-only (single candidate + baseline health incomplete). Scratch: `scratch/profile-diagnostics/login-v2-three-condition-retest`.
