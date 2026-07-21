export interface Incident { id: string; status: "open" | "closed"; title: string; }
export interface IncidentBoard { rows(): unknown[]; select(id: string): void; replace(incident: Incident): void; getDerivationCount(): number; }
export function createIncidentBoard(incidents: readonly Incident[], status: Incident["status"]): IncidentBoard { throw new Error("TODO"); }
