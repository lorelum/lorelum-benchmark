# Kernel calibration evidence (2026-08-22)

Command:

```powershell
$out = Join-Path $env:TEMP ("lorelum-v3-calib-" + [guid]::NewGuid().ToString("N"))
New-Item -ItemType Directory -Path $out | Out-Null
bun run src/benchmark/kernel/kernel.ts calibrate incubator/practice-injection/llm-provider-gateway-v3 --output $out
```

Result:

- `calibration-matrix`: exit code `0`, `passed: true`.
- The calibration script asserted all 14 cases: public starter plus 13 private fixtures.
- Expected matrix: public starter `fail / not-observed`; structural-positive fixtures `pass / observed`; anti-pattern, docs-present, naming collision, unused boundary, and policy-scatter controls `pass / not-observed`.
- No candidate model call, real provider network call, formal record, or suite revision was made. Local fixture tests used the declared local HTTP stubs only.
Post-realism-neutralization rerun (2026-08-22): the same kernel calibration command exited `0` with `calibration-matrix: passed: true` after the public stub comment, private calibration foundation copy, configured git-history messages, and snapshot were updated. This rerun made no candidate model call or real provider network call.
