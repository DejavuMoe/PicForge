import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import wasm from 'vite-plugin-wasm';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const appPackage = JSON.parse(
  readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), 'package.json'), 'utf8'),
);

function isReactVendor(id) {
  return /node_modules\/\.pnpm\/(react|react-dom|scheduler)@/.test(id)
    || /node_modules\/(react|react-dom|scheduler)\//.test(id);
}

export default defineConfig({
  plugins: [react(), wasm()],
  define: {
    __APP_VERSION__: JSON.stringify(appPackage.version),
  },
  worker: {
    format: 'es',
    plugins: () => [wasm()],
  },
  optimizeDeps: {
    exclude: ['@pic-forge/codecs', '@pic-forge/worker'],
  },
  esbuild: {
    target: 'es2020',
  },
  build: {
    target: 'es2020',
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (isReactVendor(id)) return 'vendor';
          return undefined;
        },
      },
    },
  },
});
