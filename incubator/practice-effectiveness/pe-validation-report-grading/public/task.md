# Update the validation result API

The local validation command returns feedback that callers need to present and
act on. Update `src/validation-report.ts` so callers receive a structured
result, can retain actionable feedback, and can determine whether validation
should block the current operation.

Preserve the exported interfaces. Do not add dependencies or perform file,
network, or clock-based operations.
