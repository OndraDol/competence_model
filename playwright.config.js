const { defineConfig } = require('@playwright/test');
const os = require('os');
const path = require('path');

const chromeExecutablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE;

module.exports = defineConfig({
  testDir: './tests/browser',
  timeout: 60000,
  fullyParallel: true,
  outputDir: path.join(os.tmpdir(), 'aures-competence-model-playwright-artifacts'),
  use: {
    baseURL: 'http://127.0.0.1:4173',
    trace: 'on-first-retry'
  },
  projects: [
    {
      name: 'chrome',
      use: {
        browserName: 'chromium',
        launchOptions: chromeExecutablePath ? { executablePath: chromeExecutablePath } : {}
      }
    }
  ],
  webServer: {
    command: 'python -m http.server 4173',
    url: 'http://127.0.0.1:4173/index.html',
    reuseExistingServer: true,
    timeout: 60000
  }
});
