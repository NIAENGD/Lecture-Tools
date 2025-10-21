import { defineConfig } from 'vite';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const currentDir = fileURLToPath(new URL('.', import.meta.url));
const projectRoot = path.resolve(currentDir, 'app/web/static');
const entryFile = path.resolve(projectRoot, 'js/index.ts');

export default defineConfig({
  root: projectRoot,
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    manifest: 'manifest.json',
    rollupOptions: {
      input: {
        main: entryFile,
      },
    },
  },
});
