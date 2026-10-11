import { describe, expect, it } from 'vitest';
import { withoutDotenvAssociations } from '../../src/shared/associations';

const VIEW_TYPE = 'dotenvManager.editor';
const FILES = ['.env', '.env.local'];

describe('withoutDotenvAssociations', () => {
  it('removes every entry that makes Dotenv Manager the default', () => {
    expect(withoutDotenvAssociations({ '.env': VIEW_TYPE, '.env.staging': VIEW_TYPE }, VIEW_TYPE, FILES)).toEqual({});
  });

  it('removes the text-editor entries earlier versions wrote for .env names', () => {
    const written = { '.env': 'default', '.env.local': 'default', '.env.*': 'default', '*.env': 'default' };
    expect(withoutDotenvAssociations(written, VIEW_TYPE, FILES)).toEqual({});
  });

  it('keeps unrelated associations', () => {
    const current = { '*.hex': 'hexEditor.hexedit', '*.md': 'default', '.env': VIEW_TYPE };
    expect(withoutDotenvAssociations(current, VIEW_TYPE, FILES)).toEqual({ '*.hex': 'hexEditor.hexedit', '*.md': 'default' });
  });

  it('returns undefined when there is nothing to remove', () => {
    expect(withoutDotenvAssociations(undefined, VIEW_TYPE, FILES)).toBeUndefined();
    expect(withoutDotenvAssociations({ '*.hex': 'x' }, VIEW_TYPE, FILES)).toBeUndefined();
  });
});
