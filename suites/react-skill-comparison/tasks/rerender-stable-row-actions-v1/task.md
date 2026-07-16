# Keep memoized issue rows stable across unrelated renders

The issue list is adapted into props for memoized row components. A parent
update can rebuild the list even when the same issues remain visible, and the
row components should not lose memoization solely because their open actions
changed identity.

Update `src/issue-list.ts` so unchanged visible issues retain stable row
actions across repeated renders. Filtering and opening an issue must keep their
current behavior. Do not add dependencies or change the exported interfaces.
