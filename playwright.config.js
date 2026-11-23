// Playwright setup for the Lift app.
//   npm test                         -> tests your local index.html
//   BASE_URL=https://ahmedbalani.github.io/ahmed/ npm test   -> tests the live site
const { defineConfig, devices } = require('@playwright/test');

const live = !!process.env.BASE_URL;
const useSystemChrome = !!process.env.PW_CHROME; // only for machines that can't download browsers

module.exports = defineConfig({
  testDir: './tests',
  timeout: 30_000,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: process.env.BASE_URL || 'http://localhost:8080/',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    // Safari engine on an iPhone-sized screen: closest thing to your real phone.
    ...(useSystemChrome ? [] : [{ name: 'iphone-safari', use: { ...devices['iPhone 15'] } }]),
    // Chrome on the same iPhone-sized screen.
    {
      name: 'iphone-chrome',
      use: {
        ...devices['iPhone 15'],
        browserName: 'chromium',
        ...(useSystemChrome ? { channel: 'chrome' } : {}),
      },
    },
  ],
  webServer: live ? undefined : {
    command: 'python3 -m http.server 8080',
    url: 'http://localhost:8080/',
    reuseExistingServer: !process.env.CI,
  },
});
