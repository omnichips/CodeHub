// Browser tests for QSendr only. Run from this folder:  npx playwright test
//   laptop: the laptop page, served by qsendr.py, in WebKit with an iPhone-sized phone for the guests.
//   phone:  the installable phone app (WebRTC, so Chromium); needs internet, or set PEER_SERVER=localhost:9000 with a local PeerJS server.
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: 'e2e',
  timeout: 90_000,
  projects: [
    { name: 'laptop', testMatch: 'laptop.spec.js', use: { ...devices['Desktop Safari'], acceptDownloads: true } },
    { name: 'phone', testMatch: 'phone.spec.js', use: { ...devices['Desktop Chrome'], acceptDownloads: true } },
  ],
  webServer: [
    { command: 'py e2e/server.py', url: 'http://127.0.0.1:4196/c/SECRET/', reuseExistingServer: false },
    { command: 'node ../../scripts/serve.mjs . 4300', url: 'http://localhost:4300/', reuseExistingServer: false },
  ],
});
