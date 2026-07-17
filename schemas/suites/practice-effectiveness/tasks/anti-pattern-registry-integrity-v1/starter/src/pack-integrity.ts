export interface RegistryEntry { id: string; path: string; }
export interface PracticeFile { path: string; antiPatternIds: string[]; }
export interface PackInput { registry: RegistryEntry[]; practices: PracticeFile[]; }

export interface IntegrityIssue {
  code: 'duplicate_registry_id' | 'unresolved_reference';
  path: string;
  id: string;
}

export class PackIntegrityError extends Error {
  constructor(public readonly issues: IntegrityIssue[]) {
    super('Pack integrity validation failed');
    this.name = 'PackIntegrityError';
  }
}

export function validatePackIntegrity(_input: PackInput): void {
  throw new Error('TODO: validate registry and Practice references');
}
