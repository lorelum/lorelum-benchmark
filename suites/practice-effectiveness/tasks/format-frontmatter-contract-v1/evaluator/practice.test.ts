import { describe, expect, test } from 'bun:test';
import { pathToFileURL } from 'node:url';

const candidatePath = process.env.CANDIDATE_PATH
  ?? new URL('../starter/src/practice.ts', import.meta.url).pathname;
const candidate = await import(`${pathToFileURL(candidatePath).href}?run=${Date.now()}`);

const required = {
  id: 'lorelum.format.validation-boundary',
  title: 'Validate Pack Metadata at the Format Boundary',
  title_zh: '在格式边界校验知识包元数据',
  domain: 'format',
  stage: ['project-setup'],
  tech_stack: ['typescript', 'bun'],
  applies_when: 'parsing pack metadata',
  applies_when_zh: '解析知识包元数据',
};

describe('format-frontmatter-contract-v1', () => {
  test('returns a trusted metadata model for valid input', () => {
    expect(candidate.parsePracticeMetadata(required)).toEqual(required);
  });

  test('reports all independent missing fields as typed issues', () => {
    try {
      candidate.parsePracticeMetadata({
        id: required.id,
        title: 42,
        stage: 'project-setup',
      });
      throw new Error('Expected metadata validation to throw');
    } catch (error) {
      expect(error).toBeInstanceOf(candidate.PracticeValidationError);
      const issues = error.issues;
      expect(issues).toEqual(expect.any(Array));
      expect(issues.map((issue: { path: string }) => issue.path)).toEqual(
        expect.arrayContaining([
          'title',
          'title_zh',
          'domain',
          'stage',
          'tech_stack',
          'applies_when',
          'applies_when_zh',
        ]),
      );
      expect(issues.every((issue: { code: string }) => typeof issue.code === 'string')).toBe(true);
    }
  });

  test('rejects an unknown key instead of silently returning it', () => {
    try {
      candidate.parsePracticeMetadata({ ...required, owner: 'someone' });
      throw new Error('Expected unknown metadata field to throw');
    } catch (error) {
      expect(error).toBeInstanceOf(candidate.PracticeValidationError);
      expect(error.issues).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ path: 'owner', code: 'unknown_field' }),
        ]),
      );
    }
  });

});
