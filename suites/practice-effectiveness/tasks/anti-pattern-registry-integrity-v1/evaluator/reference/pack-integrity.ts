import {
  PackIntegrityError,
  type IntegrityIssue,
  type PackInput,
} from '../../starter/src/pack-integrity.js';

export { PackIntegrityError };

function compareIssues(left: IntegrityIssue, right: IntegrityIssue): number {
  return (
    left.path.localeCompare(right.path) ||
    left.id.localeCompare(right.id) ||
    left.code.localeCompare(right.code)
  );
}

export function validatePackIntegrity(input: PackInput): void {
  const issues: IntegrityIssue[] = [];
  const registryIds = new Set<string>();

  for (const entry of input.registry) {
    if (registryIds.has(entry.id)) {
      issues.push({
        code: 'duplicate_registry_id',
        path: entry.path,
        id: entry.id,
      });
      continue;
    }

    registryIds.add(entry.id);
  }

  for (const practice of input.practices) {
    for (const id of practice.antiPatternIds) {
      if (!registryIds.has(id)) {
        issues.push({
          code: 'unresolved_reference',
          path: practice.path,
          id,
        });
      }
    }
  }

  if (issues.length > 0) {
    throw new PackIntegrityError(issues.sort(compareIssues));
  }
}
