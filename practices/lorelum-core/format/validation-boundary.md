---
id: lorelum.format.validation-boundary
title: Validate Pack Metadata at the Format Boundary
title_zh: 在格式边界校验知识包元数据
domain: format
stage: [project-setup, review]
tech_stack: [typescript, bun]
applies_when: parsing untrusted Practice or pack metadata before it enters Lorelum's retrieval and indexing pipeline
applies_when_zh: 在不可信的 Practice 或知识包元数据进入 Lorelum 检索和索引管道前解析它时
status: draft
related: []
tags: [validation, parser, metadata, typed-errors]
last_reviewed: 2026-07-16
---

# Validate Pack Metadata at the Format Boundary

## When to apply

Apply this at the first code boundary that converts pack-owned input into a
trusted in-memory model. Metadata drives retrieval, filtering, and user-facing
diagnostics, so a partly valid object must not silently enter later stages.

Do not use this as an excuse to validate every semantic relationship in one
function. Parse and shape-check here; keep cross-file and retrieval-specific
integrity rules in their own validators.

## Core guidance

### Accumulate independent input problems

Validate the whole metadata object before throwing. Returning only the first
problem forces pack authors through repeated edit-run cycles and makes an agent
fix one visible field while leaving a broken object behind. Emit one structured
issue per independent field or key.

```ts
export interface ValidationIssue {
  path: string;
  code: 'missing' | 'invalid_type' | 'unknown_field';
  message: string;
}

export class PracticeValidationError extends Error {
  constructor(public readonly issues: ValidationIssue[]) {
    super('Practice metadata is invalid');
  }
}
```

### Reject an unknown key at the trust boundary

Treat metadata as a contract, not an unbounded bag of options. An unknown key
is often a typo that would otherwise make a Practice undiscoverable. Check the
key set explicitly and give the author the offending path; do not silently drop
the value or merge it into the trusted model.

```ts
const allowed = new Set(['id', 'title', 'stage']);

for (const key of Object.keys(input)) {
  if (!allowed.has(key)) {
    issues.push({
      path: key,
      code: 'unknown_field',
      message: `Unknown metadata field: ${key}`,
    });
  }
}
```

### Return only a validated model

Build the return object after validation has succeeded. Do not cast untrusted
input to the target type, return a partially populated result, or replace a
bad value with a plausible default. Callers should either receive a model that
meets the boundary contract or a typed error they can render at the CLI/MCP
boundary.

## Tradeoffs

- **Forward-compatible extension fields:** add an explicit, versioned extension
  mechanism before accepting arbitrary keys. A silent allow-list bypass is not
  forward compatibility.
- **Cross-field rules:** required field type checks belong here; rules such as
  registry references or domain-path agreement should run after this function
  has returned a trusted metadata shape.

## Anti-patterns

- **format.first-error-only** — throwing on the first malformed field and
  hiding the remaining independent problems.
- **format.unknown-field-dropped** — ignoring an unknown key and making a typo
  silently change retrieval behavior.
- **format.untrusted-type-cast** — casting raw input to metadata rather than
  constructing a validated model.
