import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  target: 'node20',
  outDir: 'dist',
  clean: true,
  sourcemap: true,
  banner: {
    js: '#!/usr/bin/env node',
  },
  external: [
    'better-sqlite3',
    'ink',
    'react',
    'react-devtools-core',
    'ink-text-input',
    'readline/promises',
    '@anthropic-ai/claude-agent-sdk',
    'ink-spinner',
  ],
});
