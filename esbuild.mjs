import * as esbuild from 'esbuild';

const production = process.argv.includes('--production');
const watch = process.argv.includes('--watch');

/** @type {import('esbuild').BuildOptions} */
const shared = {
  bundle: true,
  minify: production,
  sourcemap: !production,
  logLevel: 'info',
};

const builds = [
  {
    ...shared,
    entryPoints: ['src/extension.ts'],
    outfile: 'dist/extension.js',
    platform: 'node',
    format: 'cjs',
    target: 'node20',
    external: ['vscode'],
  },
  {
    ...shared,
    entryPoints: ['src/webview/main.ts'],
    outfile: 'dist/webview.js',
    platform: 'browser',
    format: 'iife',
    target: 'es2022',
  },
];

if (watch) {
  const contexts = await Promise.all(builds.map((options) => esbuild.context(options)));
  await Promise.all(contexts.map((ctx) => ctx.watch()));
} else {
  await Promise.all(builds.map((options) => esbuild.build(options)));
}
