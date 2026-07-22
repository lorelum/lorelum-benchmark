import type { Dispatch, SetStateAction } from "react";

export type IncidentStatus = "open" | "resolved";
export interface Incident { id: string; title: string; status: IncidentStatus; }
export interface IncidentRow { incident: Incident; isSelected: boolean; select(): void; }

export function useIncidentBoardRows(_incidents: readonly Incident[], _statusFilter: IncidentStatus | "all", _selectedId: string | null, _onSelect: Dispatch<SetStateAction<string | null>>): IncidentRow[] {
  throw new Error("TODO");
}
