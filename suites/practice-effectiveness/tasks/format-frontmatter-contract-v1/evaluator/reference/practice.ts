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

const fields = [
  'id',
  'title',
  'title_zh',
  'domain',
  'stage',
  'tech_stack',
  'applies_when',
  'applies_when_zh',
] as const;

type Field = (typeof fields)[number];

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string');
}

export function parsePracticeMetadata(input: Record<string, unknown>): PracticeMetadata {
  const issues: ValidationIssue[] = [];

  for (const key of Object.keys(input)) {
    if (!fields.includes(key as Field)) {
      issues.push({ path: key, code: 'unknown_field', message: `Unknown metadata field: ${key}` });
    }
  }

  for (const field of fields) {
    const value = input[field];
    const valid = field === 'stage' || field === 'tech_stack'
      ? isStringArray(value)
      : typeof value === 'string';
    if (!valid) {
      issues.push({
        path: field,
        code: value === undefined ? 'missing' : 'invalid_type',
        message: `${field} is required and has an invalid value`,
      });
    }
  }

  if (issues.length > 0) throw new PracticeValidationError(issues);

  return {
    id: input.id as string,
    title: input.title as string,
    title_zh: input.title_zh as string,
    domain: input.domain as string,
    stage: input.stage as string[],
    tech_stack: input.tech_stack as string[],
    applies_when: input.applies_when as string,
    applies_when_zh: input.applies_when_zh as string,
  };
}
