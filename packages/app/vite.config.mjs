import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import wasm from 'vite-plugin-wasm';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { staticCodecUrls } from './scripts/static-codecs.mjs';

const appPackage = JSON.parse(
  readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), 'package.json'), 'utf8'),
);

function isReactVendor(id) {
  return (
    /node_modules\/\.pnpm\/(react|react-dom|scheduler)@/.test(id) ||
    /node_modules\/(react|react-dom|scheduler)\//.test(id)
  );
}

/**
 * Production Content Security Policy. Media never leaves the device, and this
 * makes the browser enforce that: fetch/XHR/WebSocket/beacons, images, media,
 * fonts, styles, frames and forms may only use this origin (plus local blob:/data:
 * previews). script-src is left open for broad WebAssembly compatibility:
 * browsers without 'wasm-unsafe-eval' would otherwise refuse to compile codecs.
 * Injected only into built HTML because the dev server relies on inline scripts.
 */
export const CONTENT_SECURITY_POLICY = [
  // blob:/data: are local object URLs, never network destinations.
  "connect-src 'self' blob: data:",
  "img-src 'self' blob: data:",
  "media-src 'self' blob:",
  "font-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "worker-src 'self'",
  "manifest-src 'self'",
  "frame-src 'none'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'none'",
].join('; ');

const isolationHeaders = {
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Embedder-Policy': 'require-corp',
};

function preserveIsolationHeaders(server, headers) {
  // Vite's cached-transform 304 fast path bypasses server.headers. WebKit
  // requires COEP on these revalidated Worker imports as well as on 200s.
  server.middlewares.use((_request, response, next) => {
    for (const name of Object.keys(isolationHeaders)) {
      if (headers?.[name] !== undefined) response.setHeader(name, headers[name]);
    }
    next();
  });
}

export default defineConfig({
  plugins: [
    react(),
    wasm(),
    staticCodecUrls(),
    {
      name: 'picforge-isolation-revalidation',
      configureServer(server) {
        preserveIsolationHeaders(server, server.config.server.headers);
      },
      configurePreviewServer(server) {
        preserveIsolationHeaders(server, server.config.preview.headers);
      },
    },
    {
      name: 'picforge-content-security-policy',
      apply: 'build',
      transformIndexHtml: {
        order: 'pre',
        handler: () => [
          {
            tag: 'meta',
            attrs: { 'http-equiv': 'Content-Security-Policy', content: CONTENT_SECURITY_POLICY },
            injectTo: 'head-prepend',
          },
        ],
      },
    },
    {
      name: 'picforge-precache',
      generateBundle(_options, bundle) {
        this.emitFile({
          type: 'asset',
          fileName: 'precache.json',
          source: JSON.stringify(
            Object.keys(bundle)
              .filter((name) => /\.(js|css|svg|png|jpe?g|webp|avif|woff2)$/.test(name))
              .map((name) => `/${name}`),
          ),
        });
      },
    },
  ],
  define: {
    __APP_VERSION__: JSON.stringify(appPackage.version),
  },
  server: {
    host: '127.0.0.1',
    headers: isolationHeaders,
  },
  preview: {
    host: '127.0.0.1',
    headers: isolationHeaders,
  },
  worker: {
    format: 'es',
    plugins: () => [wasm(), staticCodecUrls()],
  },
  optimizeDeps: {
    exclude: ['@pic-forge/codecs', '@pic-forge/worker', '@ffmpeg/ffmpeg'],
  },
  oxc: {
    target: 'es2020',
  },
  build: {
    target: 'es2020',
    rolldownOptions: {
      output: {
        codeSplitting: {
          groups: [{ name: 'vendor', test: isReactVendor }],
        },
      },
    },
  },
});
