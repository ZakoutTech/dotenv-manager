import { describe, expect, it } from 'vitest';
import { nextAssociations } from '../../src/shared/associations';

const VIEW_TYPE = 'dotenvManager.editor';
const FILES = ['.env', '.env.local'];

describe('nextAssociations', () => {
  it('maps every listed name to Dotenv Manager for "visual"', () => {
    expect(nextAssociations(undefined, 'visual', VIEW_TYPE, FILES)).toEqual({ '.env': VIEW_TYPE, '.env.local': VIEW_TYPE });
  });

  it('maps every listed name to the text editor for "text"', () => {
    expect(nextAssociations({ '.env': VIEW_TYPE }, 'text', VIEW_TYPE, FILES)).toEqual({ '.env': 'default', '.env.local': 'default' });
  });

  it('keeps unrelated associations', () => {
    expect(nextAssociations({ '*.hex': 'hexEditor.hexedit' }, 'visual', VIEW_TYPE, FILES)).toEqual({
      '*.hex': 'hexEditor.hexedit',
      '.env': VIEW_TYPE,
      '.env.local': VIEW_TYPE,
    });
  });

  it('removes Dotenv Manager entries for names no longer listed', () => {
    const current = { '.env': VIEW_TYPE, '.env.staging': VIEW_TYPE, '.env.qa': 'default' };
    expect(nextAssociations(current, 'visual', VIEW_TYPE, ['.env'])).toEqual({ '.env': VIEW_TYPE, '.env.qa': 'default' });
  });

  it('drops the broad patterns written by earlier versions, so .env.ts keeps its own editor', () => {
    const legacy = { '.env': 'default', '*.env': 'default', '.env.*': VIEW_TYPE };
    expect(nextAssociations(legacy, 'visual', VIEW_TYPE, FILES)).toEqual({ '.env': VIEW_TYPE, '.env.local': VIEW_TYPE });
  });

  it('returns undefined when nothing needs to change', () => {
    expect(nextAssociations({ '.env': VIEW_TYPE, '.env.local': VIEW_TYPE }, 'visual', VIEW_TYPE, FILES)).toBeUndefined();
    expect(nextAssociations({}, 'visual', VIEW_TYPE, [])).toBeUndefined();
  });
});
