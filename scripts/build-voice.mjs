import { build } from 'esbuild';
await build({
  entryPoints: ['src/kokoro-entry.js'],
  outfile: 'public/vendor/kokoro-engine.js',
  bundle: true,
  format: 'esm',
  platform: 'browser',
  target: ['safari16.4', 'chrome110'],
  mainFields: ['browser', 'module', 'main'],
  conditions: ['browser', 'import', 'default'],
  legalComments: 'none',
  logLevel: 'info',
});
