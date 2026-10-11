import { describe, expect, it } from 'vitest';
import {
  fileChoices,
  countVariables,
  pickerEntries,
  sortEnvFiles,
  statusBarText,
  statusBarTooltip,
  type EnvFile,
} from '../../src/core/envFileList';

const file = (relativePath: string, folder = 'app', folderIndex = 0): EnvFile => ({
  uri: `file:///ws/${folder}/${relativePath}`,
  folder,
  folderIndex,
  relativePath,
});

describe('sortEnvFiles', () => {
  it('orders by workspace folder, then depth, with .env first, then by name', () => {
    const sorted = sortEnvFiles([
      file('apps/api/.env'),
      file('.env.production'),
      file('.env'),
      file('local.env'),
      file('.env.example'),
      file('.env', 'other', 1),
      file('apps/api/.env.local'),
    ]);
    expect(sorted.map((f) => `${f.folder}:${f.relativePath}`)).toEqual([
      'app:.env',
      'app:.env.example',
      'app:.env.production',
      'app:local.env',
      'app:apps/api/.env',
      'app:apps/api/.env.local',
      'other:.env',
    ]);
  });
});

describe('statusBarText', () => {
  it('shows the name with the file count, or without a count while scanning', () => {
    expect(statusBarText(3)).toBe('$(symbol-variable) Dotenv Manager (3)');
    expect(statusBarText(undefined)).toBe('$(symbol-variable) Dotenv Manager');
  });

  it('marks a truncated scan with +', () => {
    expect(statusBarText(1000, true)).toBe('$(symbol-variable) Dotenv Manager (1000+)');
  });
});

describe('statusBarTooltip', () => {
  it('lists the files and how to open the selector', () => {
    const tooltip = statusBarTooltip([file('.env'), file('apps/api/.env.local')], false);
    expect(tooltip).toContain('- \\.env');
    expect(tooltip).toContain('- apps/api/\\.env\\.local');
    expect(tooltip).toContain('Click to select a .env file');
  });

  it('prefixes the workspace folder in multi-root workspaces and truncates long lists', () => {
    const many = Array.from({ length: 13 }, (_, i) => file(`d${i}/.env`, 'web'));
    const tooltip = statusBarTooltip(many, true, 10);
    expect(tooltip).toContain('- web/d0/\\.env');
    expect(tooltip).not.toContain('d12/');
    expect(tooltip).toContain('…and 3 more');
  });

  it('escapes Markdown in file and folder names', () => {
    const tooltip = statusBarTooltip([file('a`[x](https://evil)`.env', 'f*o')], true);
    expect(tooltip).not.toMatch(/\]\(https/);
    expect(tooltip).toContain('\\[x\\]\\(https://evil\\)');
    expect(tooltip).toContain('f\\*o/');
  });

  it('says when no files were found', () => {
    expect(statusBarTooltip([], false)).toContain('No .env files found in this workspace');
  });
});

describe('pickerEntries', () => {
  it('lists files with their folder and marks the active one', () => {
    expect(pickerEntries([file('.env'), file('apps/api/.env.local')], 'file:///ws/app/.env', false)).toEqual([
      { kind: 'file', label: '.env', description: 'current', uri: 'file:///ws/app/.env', current: true },
      { kind: 'file', label: '.env.local', description: 'apps/api', uri: 'file:///ws/app/apps/api/.env.local', current: false },
    ]);
  });

  it('adds a separator per workspace folder in multi-root workspaces', () => {
    const entries = pickerEntries([file('.env'), file('.env', 'other', 1)], undefined, true);
    expect(entries.map((e) => (e.kind === 'separator' ? `-- ${e.label}` : e.label))).toEqual([
      '-- app',
      '.env',
      '-- other',
      '.env',
    ]);
  });
});

describe('countVariables', () => {
  it('counts variable definitions, ignoring comments and blank lines', () => {
    expect(countVariables('# c\nA=1\n\nexport B="x"\n# === G ===\nC=3\n')).toBe(3);
    expect(countVariables('')).toBe(0);
  });
});

describe('fileChoices', () => {
  const files = [
    { uri: 'file:///w/app/.env', folder: 'app', folderIndex: 0, relativePath: '.env' },
    { uri: 'file:///w/app/apps/api/.env.local', folder: 'app', folderIndex: 0, relativePath: 'apps/api/.env.local' },
  ];

  it('labels files with their workspace folder and path, with the absolute path for the tooltip', () => {
    expect(fileChoices(files, (uri) => uri.replace('file://', ''))).toEqual([
      { uri: 'file:///w/app/.env', label: 'app/.env', path: '/w/app/.env' },
      { uri: 'file:///w/app/apps/api/.env.local', label: 'app/apps/api/.env.local', path: '/w/app/apps/api/.env.local' },
    ]);
  });
});
