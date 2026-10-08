import { defineConfig, devices } from '@playwright/test';

// WebKit, iPhone viewport. Reduce Motion keeps the tests fast and deterministic; motion.spec.ts turns it back on.
const iphone = { ...devices['iPhone 14'], reducedMotion: 'reduce' as const };

export default defineConfig({
  testDir: 'e2e',
  projects: [
    { name: 'app', testMatch: ['workflow.spec.ts', 'report.spec.ts', 'a11y.spec.ts', 'receipt.spec.ts', 'motion.spec.ts'], use: { ...iphone, baseURL: 'http://localhost:5173' } },
    { name: 'sync', testMatch: 'sync.spec.ts', use: { ...iphone, baseURL: 'http://localhost:5173' } },
    { name: 'offline', testMatch: 'offline.spec.ts', use: { ...iphone, baseURL: 'http://localhost:4173' } },
  ],
  webServer: [
    { command: 'npm run dev -- --port 5173 --strictPort', url: 'http://localhost:5173', reuseExistingServer: true },
    // The offline gate runs against the production build, since the service worker only exists there.
    { command: 'npm run build && vite preview --port 4173 --strictPort', url: 'http://localhost:4173', reuseExistingServer: false, timeout: 180_000 },
  ],
});
