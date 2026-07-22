import { useMemo, useRef } from "react";
import type { Dispatch, SetStateAction } from "react";

export type IncidentStatus = "open" | "resolved";
export interface Incident { id: string; title: string; status: IncidentStatus; }
export interface IncidentRow { incident: Incident; isSelected: boolean; select(): void; }

type Cached = { incident: Incident; selected: boolean; row: IncidentRow };

export function useIncidentBoardRows(incidents: readonly Incident[], statusFilter: IncidentStatus | "all", selectedId: string | null, onSelect: Dispatch<SetStateAction<string | null>>): IncidentRow[] {
  const callback = useRef(onSelect);
  callback.current = onSelect;
  const callbacks = useRef(new Map<string, () => void>());
  const cache = useRef(new Map<string, Cached>());
  return useMemo(() => {
    const visible = incidents.filter((incident) => statusFilter === "all" || incident.status === statusFilter);
    const next = new Map<string, Cached>();
    const rows = visible.map((incident) => {
      const selected = incident.id === selectedId;
      const cached = cache.current.get(incident.id);
      if (cached?.incident === incident && cached.selected === selected) {
        next.set(incident.id, cached);
        return cached.row;
      }
      let select = callbacks.current.get(incident.id);
      if (!select) {
        select = () => callback.current(incident.id);
        callbacks.current.set(incident.id, select);
      }
      const value = { incident, isSelected: selected, select };
      const entry = { incident, selected, row: value };
      next.set(incident.id, entry);
      return value;
    });
    cache.current = next;
    return rows;
  }, [incidents, statusFilter, selectedId]);
}
