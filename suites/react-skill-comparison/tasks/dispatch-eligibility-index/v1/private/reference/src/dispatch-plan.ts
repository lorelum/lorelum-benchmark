export type WorkStatus = "queued" | "active" | "complete";

export interface WorkItem {
  id: string;
  status: WorkStatus;
  assigneeId?: string | null;
}

export type BlockedWorkItem = { id: string; reason: "unassigned" | "ineligible" };
export type DispatchPlan = { dispatchableIds: string[]; blocked: BlockedWorkItem[] };

function validatedId(value: unknown, seen: Set<string>): string {
  if (typeof value !== "string" || value.trim().length === 0 || seen.has(value)) throw new Error("Work item id must be a unique non-empty string");
  seen.add(value);
  return value;
}

export function buildDispatchPlan(items: readonly WorkItem[], eligibleAssigneeIds: readonly string[]): DispatchPlan {
  const seen = new Set<string>();
  for (const item of items) validatedId(item.id, seen);

  const eligible = new Set<string>();
  for (const rosterId of eligibleAssigneeIds) {
    const normalized = rosterId.trim();
    if (normalized) eligible.add(normalized);
  }

  const dispatchableIds: string[] = [];
  const blocked: BlockedWorkItem[] = [];
  for (const item of items) {
    if (item.status !== "queued") continue;
    const assigneeId = typeof item.assigneeId === "string" ? item.assigneeId.trim() : "";
    if (!assigneeId) blocked.push({ id: item.id, reason: "unassigned" });
    else if (!eligible.has(assigneeId)) blocked.push({ id: item.id, reason: "ineligible" });
    else dispatchableIds.push(item.id);
  }
  return { dispatchableIds, blocked };
}
