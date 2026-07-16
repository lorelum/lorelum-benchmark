---
id: lorelum.format.cross-reference-integrity
title: Validate Cross-References in Two Passes
title_zh: 用两阶段校验跨文件引用完整性
domain: format
stage: [project-setup, review]
tech_stack: [typescript, bun]
applies_when: validating a knowledge pack where multiple Practice files reference ids owned by a central registry
applies_when_zh: 校验多个 Practice 文件引用中央登记表 id 的知识包时
status: draft
related: []
tags: [validation, pack, registry, cross-reference, diagnostics]
last_reviewed: 2026-07-16
---

# Validate Cross-References in Two Passes

## When to apply

Use this when a pack has files that refer to ids defined elsewhere: anti-pattern
registries, decision nodes, templates, or other globally named resources. The
result must tell an author about every independent broken relationship before
the pack reaches indexing or retrieval.

## Core guidance

### Build the authority index first

First scan the authoritative registry and collect duplicate definitions. Only
after that index exists should validation resolve references from Practice
files. A one-pass lookup makes duplicate ownership and missing references
depend on incidental file order.

```ts
const owners = new Map<string, string>();

for (const entry of registry) {
  const firstOwner = owners.get(entry.id);
  if (firstOwner) issues.push(duplicateIssue(entry, firstOwner));
  else owners.set(entry.id, entry.path);
}
```

### Resolve every reference and accumulate diagnostics

Continue after every duplicate or missing target. A pack author needs the
Practice path and referenced id for each dangling link; do not return a boolean,
silently discard the reference, or stop at the first exception.

```ts
for (const practice of practices) {
  for (const id of practice.antiPatternIds) {
    if (!owners.has(id)) {
      issues.push({ code: 'unresolved_reference', path: practice.path, id });
    }
  }
}
```

### Make diagnostic order a contract

Sort diagnostics by stable source path, then id and code before returning them.
This keeps CLI output, tests, and agent repairs reproducible even when file
enumeration order changes. Sorting diagnostics is not the same as changing pack
semantics; it only makes failures observable consistently.

```ts
issues.sort((left, right) =>
  left.path.localeCompare(right.path) || left.id.localeCompare(right.id) ||
  left.code.localeCompare(right.code),
);
```

## Tradeoffs

- **Large packs:** use maps and one registry scan; do not repeatedly search the
  registry for every reference.
- **Optional references:** model optionality explicitly in the input contract.
  Never infer it by ignoring an unresolved id.
- **Parser failures:** resolve cross-file references only after each individual
  file has passed its local shape validation.

## Anti-patterns

- **format.first-error-only** — returning after the first invalid relation.
- **format.reference-checked-before-index** — resolving while authority entries
  are still being scanned.
- **format.nondeterministic-diagnostics** — exposing filesystem-dependent error
  order.
