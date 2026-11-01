import { defineConfig } from 'vitest/config';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import browserslist from 'browserslist';
import { browserslistToTargets } from 'lightningcss';

/**
 * Lowest common denominator of the engines we ship on:
 *  - WKWebView  (macOS 12+, iOS 15+)   -> Safari 15
 *  - WebView2   (Windows 10/11)        -> Chromium 105+
 *  - WebKitGTK  (Linux, 2.36+)         -> roughly Safari 15
 *  - Android System WebView            -> Chromium 105+
 *  plus current desktop browsers for the web build.
 */
const BROWSERS = ['safari >= 15', 'ios_saf >= 15', 'chrome >= 105', 'edge >= 105', 'firefox >= 115'];

const tauriHost = process.env.TAURI_DEV_HOST;

export default defineConfig({
  plugins: [svelte()],
  // Relative asset URLs work for Tauri's custom protocol and for sub-path web hosting alike.
  base: './',
  clearScreen: false,
  envPrefix: ['VITE_', 'TAURI_ENV_'],
  server: {
    port: 5173,
    strictPort: true,
    host: tauriHost || false,
    hmr: tauriHost ? { protocol: 'ws', host: tauriHost, port: 5174 } : undefined,
    watch: { ignored: ['**/src-tauri/**'] },
  },
  css: {
    transformer: 'lightningcss',
    lightningcss: { targets: browserslistToTargets(browserslist(BROWSERS)) },
  },
  // Same CSP as the Tauri app (src-tauri/tauri.conf.json), so e2e tests catch violations.
  preview: {
    headers: {
      'Content-Security-Policy':
        "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'",
    },
  },
  build: {
    // JS syntax is lowered to what Safari 15 / Chromium 105 understand.
    target: ['es2021', 'safari15', 'chrome105', 'firefox115'],
    cssMinify: 'lightningcss',
    sourcemap: !!process.env.TAURI_ENV_DEBUG,
  },
  test: {
    include: ['src/**/*.test.ts'],
  },
});
