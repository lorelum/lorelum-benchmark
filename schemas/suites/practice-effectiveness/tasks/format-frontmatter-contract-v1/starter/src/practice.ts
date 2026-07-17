export interface PracticeMetadata {
  id: string;
  title: string;
  title_zh: string;
  domain: string;
  stage: string[];
  tech_stack: string[];
  applies_when: string;
  applies_when_zh: string;
}

export interface ValidationIssue {
  path: string;
  code: 'missing' | 'invalid_type' | 'unknown_field';
  message: string;
}

export class PracticeValidationError extends Error {
  constructor(public readonly issues: ValidationIssue[]) {
    super('Practice metadata is invalid');
    this.name = 'PracticeValidationError';
  }
}

export function parsePracticeMetadata(input: Record<string, unknown>): PracticeMetadata {
  throw new Error('TODO: validate Practice metadata');
}
