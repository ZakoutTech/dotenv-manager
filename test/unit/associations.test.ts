import { describe, expect, it } from 'vitest';
import { ENV_FILE_PATTERNS, nextAssociations } from '../../src/shared/associations';

const VIEW_TYPE = 'dotenvManager.editor';

describe('nextAssociations', () => {
  it('maps every .env pattern to the text editor for "text"', () => {
    expect(nextAssociations(undefined, 'text', VIEW_TYPE)).toEqual(
      Object.fromEntries(ENV_FILE_PATTERNS.map((p) => [p, 'default'])),
    );
  });

  it('maps every .env pattern to Dotenv Manager for "visual"', () => {
    expect(nextAssociations({ '.env': 'default' }, 'visual', VIEW_TYPE)).toEqual(
      Object.fromEntries(ENV_FILE_PATTERNS.map((p) => [p, VIEW_TYPE])),
    );
  });

  it('keeps unrelated associations', () => {
    expect(nextAssociations({ '*.hex': 'hexEditor.hexedit' }, 'text', VIEW_TYPE)).toMatchObject({
      '*.hex': 'hexEditor.hexedit',
      '.env': 'default',
    });
  });

  it('returns undefined when nothing needs to change', () => {
    const current = Object.fromEntries(ENV_FILE_PATTERNS.map((p) => [p, 'default']));
    expect(nextAssociations(current, 'text', VIEW_TYPE)).toBeUndefined();
  });

  it('returns undefined for "visual" when no associations exist (the contributed default already applies)', () => {
    expect(nextAssociations(undefined, 'visual', VIEW_TYPE)).toBeUndefined();
    expect(nextAssociations({ '*.hex': 'x' }, 'visual', VIEW_TYPE)).toBeUndefined();
  });
});
