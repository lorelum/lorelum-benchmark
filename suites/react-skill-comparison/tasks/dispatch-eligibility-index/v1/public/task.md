# Build a dispatch eligibility plan

Implement `buildDispatchPlan(items, eligibleAssigneeIds)`. It prepares a
dispatch plan from an ordered work queue and an operator roster.

Consider only items whose `status` is `"queued"`. For each queued item, in
input order:

- a missing or whitespace-only assignee becomes `{ id, reason: "unassigned" }`;
- an assignee that is not in the trimmed operator roster becomes
  `{ id, reason: "ineligible" }`; and
- an eligible assignee contributes the original item ID to `dispatchableIds`.

Trim roster and assignee identifiers. Blank roster values and duplicate roster
entries have no additional effect. Do not mutate either input. Reject a queue
containing a blank, duplicated, or non-string work-item ID before returning a
plan. Non-queued items are ignored. Do not add dependencies or change exported
interfaces.
