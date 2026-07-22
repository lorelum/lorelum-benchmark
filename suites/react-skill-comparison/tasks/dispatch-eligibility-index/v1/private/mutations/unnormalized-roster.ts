export type WorkStatus = "queued" | "active" | "complete";
export interface WorkItem { id: string; status: WorkStatus; assigneeId?: string | null; }
export type BlockedWorkItem = { id: string; reason: "unassigned" | "ineligible" };
export type DispatchPlan = { dispatchableIds: string[]; blocked: BlockedWorkItem[] };

export function buildDispatchPlan(items: readonly WorkItem[], eligibleAssigneeIds: readonly string[]): DispatchPlan {
  const seen = new Set<string>();
  for (const item of items) {
    if (typeof item.id !== "string" || item.id.trim().length === 0 || seen.has(item.id)) throw new Error("Work item id must be a unique non-empty string");
    seen.add(item.id);
  }
  const eligible = new Set(eligibleAssigneeIds);
  const dispatchableIds: string[] = [];
  const blocked: BlockedWorkItem[] = [];
  for (const item of items) {
    if (item.status !== "queued") continue;
    const assignee = typeof item.assigneeId === "string" ? item.assigneeId.trim() : "";
    if (!assignee) blocked.push({ id: item.id, reason: "unassigned" });
    else if (eligible.has(assignee)) dispatchableIds.push(item.id);
    else blocked.push({ id: item.id, reason: "ineligible" });
  }
  return { dispatchableIds, blocked };
}
