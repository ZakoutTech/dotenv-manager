import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/unit/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/extension.ts', 'src/editor/DotenvEditorProvider.ts', 'src/webview/**'],
    },
  },
});
