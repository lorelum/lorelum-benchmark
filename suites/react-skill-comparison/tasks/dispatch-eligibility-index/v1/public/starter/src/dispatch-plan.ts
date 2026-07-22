export type WorkStatus = "queued" | "active" | "complete";

export interface WorkItem {
  id: string;
  status: WorkStatus;
  assigneeId?: string | null;
}

export type BlockedWorkItem = { id: string; reason: "unassigned" | "ineligible" };
export type DispatchPlan = { dispatchableIds: string[]; blocked: BlockedWorkItem[] };

export function buildDispatchPlan(_items: readonly WorkItem[], _eligibleAssigneeIds: readonly string[]): DispatchPlan {
  throw new Error("TODO");
}
