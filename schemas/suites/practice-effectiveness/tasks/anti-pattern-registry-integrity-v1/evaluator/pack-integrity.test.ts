import { describe, expect, test } from 'bun:test';
import { pathToFileURL } from 'node:url';

const candidatePath = process.env.CANDIDATE_PATH ?? new URL('../starter/src/pack-integrity.ts', import.meta.url).pathname;
const candidate = await import(`${pathToFileURL(candidatePath).href}?run=${Date.now()}`);

function issuesFor(input: unknown) {
  try { candidate.validatePackIntegrity(input); throw new Error('Expected integrity failure'); }
  catch (error) {
    expect(error).toBeInstanceOf(candidate.PackIntegrityError);
    return error.issues;
  }
}

describe('anti-pattern-registry-integrity-v1', () => {
  test('accepts a fully resolved pack', () => {
    expect(() => candidate.validatePackIntegrity({
      registry: [{ id: 'api.swallow-error', path: 'anti-patterns/index.yaml' }],
      practices: [{ path: 'practices/api/errors.md', antiPatternIds: ['api.swallow-error'] }],
    })).not.toThrow();
  });

  test('collects every duplicate and unresolved reference in deterministic source order', () => {
    const input = {
      registry: [
        { id: 'state.derived', path: 'registry/z.yaml' },
        { id: 'api.swallow', path: 'registry/c.yaml' },
        { id: 'state.derived', path: 'registry/a.yaml' },
        { id: 'state.derived', path: 'registry/b.yaml' },
      ],
      practices: [
        { path: 'practices/z.md', antiPatternIds: ['missing.z'] },
        { path: 'practices/a.md', antiPatternIds: ['missing.a', 'api.swallow'] },
      ],
    };
    expect(issuesFor(input)).toEqual([
      { code: 'unresolved_reference', path: 'practices/a.md', id: 'missing.a' },
      { code: 'unresolved_reference', path: 'practices/z.md', id: 'missing.z' },
      { code: 'duplicate_registry_id', path: 'registry/a.yaml', id: 'state.derived' },
      { code: 'duplicate_registry_id', path: 'registry/b.yaml', id: 'state.derived' },
    ]);
  });
});
