# Preserve a stateful issue workbench across renders

`createIssueWorkbench` adapts issue data into rows for a memoized UI. Parent
renders commonly provide a new array even when individual issues are unchanged.
The current model recreates every row and callback, causing avoidable work.

Update `src/issue-workbench.ts` without changing exported interfaces.

- Filtering remains case-insensitive and preserves input order.
- Selection remains correct, and is cleared if its issue disappears.
- Unchanged visible issues reuse their row and action identities across renders,
  including after being filtered out and shown again.
- A changed issue invalidates only its own row; unrelated rows stay stable.
- Each issue ID retains stable `onOpen` and `onSelect` callback identities while
  it remains in the workbench, even when its row is invalidated by selection or
  data changes.
- Callbacks must still open or select the intended issue. Do not add dependencies.
