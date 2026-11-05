import { defineConfig } from 'vite';
import { readFileSync } from 'node:fs';

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'));

export default defineConfig({
  base: './',
  define: { 'import.meta.env.VITE_APP_VERSION': JSON.stringify(pkg.version) },
  build: { outDir: 'dist', emptyOutDir: true, target: 'es2020' },
  server: { port: 5173 },
});
