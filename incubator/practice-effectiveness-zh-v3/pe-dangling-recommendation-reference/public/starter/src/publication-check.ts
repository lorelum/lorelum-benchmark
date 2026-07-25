export interface GuidanceEntry {
  id: string;
}

export interface DecisionBranch {
  label: string;
  targets: string[];
}

export interface DecisionConfig {
  id: string;
  branches: DecisionBranch[];
}

export interface PublicationCheck {
  valid: boolean;
  errors: string[];
}

export function checkPublication(entries: GuidanceEntry[], decisions: DecisionConfig[]): PublicationCheck {
  const errors: string[] = [];
  for (const entry of entries) if (!entry.id) errors.push("entry id is required");
  for (const decision of decisions) if (!decision.id) errors.push("decision id is required");
  return { valid: errors.length === 0, errors };
}
