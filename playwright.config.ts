import { defineConfig, devices } from '@playwright/test';

/**
 * Smoke tests against the production build in the engines our targets embed:
 * WebKit ≈ WKWebView (macOS/iOS) and WebKitGTK (Linux); Chromium ≈ WebView2 (Windows) and Android WebView.
 */
export default defineConfig({
  testDir: 'e2e',
  fullyParallel: true,
  reporter: 'list',
  use: { baseURL: 'http://localhost:4173', trace: 'retain-on-failure' },
  webServer: {
    command: 'npm run build && npx vite preview --port 4173 --strictPort',
    url: 'http://localhost:4173',
    reuseExistingServer: !process.env.CI,
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'webkit', use: { ...devices['Desktop Safari'] } },
    { name: 'mobile-webkit', use: { ...devices['iPhone 13'] } },
    { name: 'mobile-chromium', use: { ...devices['Pixel 7'] } },
  ],
});
