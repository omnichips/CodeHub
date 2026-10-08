import { defineConfig, devices } from '@playwright/test';

const iphone = devices['iPhone 14']; // WebKit, iPhone viewport
const fixture = { HUB_REGISTRY: 'test/fixtures/apps.json', HUB_OUT: 'dist-test' };

export default defineConfig({
  testDir: 'e2e',
  projects: [
    // The real site: FairShare built into /fairshare/.
    { name: 'real', testMatch: 'hub.spec.js', use: { ...iphone, baseURL: 'http://localhost:4180' } },
    // A made-up registry with several apps, to prove more can be added by editing one file.
    { name: 'fixture', testMatch: 'fixture.spec.js', use: { ...iphone, baseURL: 'http://localhost:4181' } },
    { name: 'desktop', testMatch: 'desktop.spec.js', use: { ...devices['Desktop Safari'], baseURL: 'http://localhost:4181' } },
  ],
  webServer: [
    { command: 'node scripts/build.mjs && node scripts/serve.mjs dist 4180', url: 'http://localhost:4180/', timeout: 240_000, reuseExistingServer: false },
    { command: 'node scripts/build.mjs && node scripts/serve.mjs dist-test 4181', env: fixture, url: 'http://localhost:4181/', timeout: 240_000, reuseExistingServer: false },
  ],
});
