export type IncidentStatus = "open" | "resolved";
export interface Incident { id: string; title: string; status: IncidentStatus; }
export interface IncidentRow extends Incident { isSelected: boolean; select(): void; }
export interface IncidentBoard { select(id: string | null): void; render(incidents: Incident[], filter: { status: IncidentStatus | "all" }): IncidentRow[]; getDerivationCount(): number; }
export function createIncidentBoard(): IncidentBoard { let selected: string | null = null; let derivations = 0; return { select(id) { selected = id; }, getDerivationCount() { return derivations; }, render(incidents, filter) { if (selected && !incidents.some((incident) => incident.id === selected)) selected = null; return incidents.filter((incident) => filter.status === "all" || incident.status === filter.status).map((incident) => { derivations++; return { ...incident, isSelected: incident.id === selected, select: () => { selected = incident.id; } }; }); } }; }
