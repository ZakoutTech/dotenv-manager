// `npm run preview`: serve the webview GUI in a browser with a fake extension host.
import * as esbuild from 'esbuild';

const port = Number(process.env.PORT ?? 5178);

const ctx = await esbuild.context({
  entryPoints: ['preview/main.ts'],
  outdir: 'preview/dist',
  bundle: true,
  sourcemap: true,
  platform: 'browser',
  format: 'iife',
  target: 'es2022',
  logLevel: 'info',
});

await ctx.watch();
const { port: actualPort } = await ctx.serve({ servedir: 'preview', host: '127.0.0.1', port });
console.log(`\n  Dotenv Manager preview: http://127.0.0.1:${actualPort}/\n  Edits to src/ rebuild and reload the page. Ctrl+C to stop.\n`);
