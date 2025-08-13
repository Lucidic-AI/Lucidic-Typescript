import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['cjs', 'esm'],
  dts: true,
  splitting: false,
  sourcemap: true,
  clean: true,
  target: 'node18',
  outExtension({ format }) {
    return format === 'cjs' ? { js: '.cjs' } : { js: '.mjs' };
  },
});

