---
name: validate-untrusted-metadata-boundaries
description: Validate externally supplied metadata before it becomes trusted application state.
metadata:
  version: v1
  source: contract-derived-seed
---

# Validate untrusted metadata at the loading boundary

## Intent

Treat metadata as untrusted until it has crossed one explicit validation boundary. A
successful result means the complete accepted shape is safe for the next component to
consume; a rejected result is a stable, actionable description of every independent
problem found in that input.

## Apply when

- Reading JSON, configuration files, manifests, plugin declarations, or generated metadata.
- Converting `unknown` values into a typed object used by later application code.
- Returning diagnostics that another tool, editor, or release check will consume.

## Procedure

1. Define the accepted object shape at the boundary, including required fields and whether additional fields are allowed.
2. Validate the root value before reading nested properties. Check each present field’s kind before applying its value constraints.
3. Check domain constraints that protect downstream consumers, such as supported revisions, bounded labels, relative locations, and allowed collection members.
4. Accumulate independent violations instead of stopping at the first one. Every diagnostic identifies the input file, field location, category, and a safe human explanation.
5. Make diagnostic ordering explicit and independent of property enumeration or filesystem order.
6. Return no trusted output when any validation diagnostic exists. Do not mutate the parsed input while validating it.

## Verification

- A valid manifest round-trips to the expected trusted output.
- A single input with several unrelated malformed fields returns all applicable diagnostics and no loadable output.
- Reordering equivalent input properties preserves the normalized diagnostics.
- Invalid input cannot expose internal paths, stack traces, secrets, or partially built artifacts.

## Avoid

- Trusting type assertions, casts, or a happy-path fixture as validation.
- Silently discarding unknown fields when the receiving contract does not permit them.
- Letting the first encountered error determine the only result or relying on incidental object order.
- Building or publishing a partial object after a validation failure.
