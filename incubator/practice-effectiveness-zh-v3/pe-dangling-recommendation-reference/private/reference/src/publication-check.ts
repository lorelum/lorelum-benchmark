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
  const entryIds = new Set(entries.map((entry) => entry.id));
  for (const entry of entries) if (!entry.id) errors.push("entry id is required");
  for (const decision of decisions) {
    if (!decision.id) errors.push("decision id is required");
    for (const branch of decision.branches) {
      for (const target of branch.targets) {
        if (!entryIds.has(target)) errors.push(`unavailable entry: ${target}`);
      }
    }
  }
  return { valid: errors.length === 0, errors };
}
