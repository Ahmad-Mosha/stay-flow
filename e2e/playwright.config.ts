import { defineConfig, devices } from '@playwright/test';

/**
 * Runs against the whole stack, started the way a reviewer would start it:
 *   docker compose --profile full up -d --build --wait
 * Every test makes its own guests and hosts, so the suite can run again on the same database.
 */
export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: process.env.BASE_URL ?? 'http://localhost:8080',
    // The demo hotel is in Cairo, and the app writes dates the British way.
    locale: 'en-GB',
    timezoneId: 'Africa/Cairo',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'setup', testMatch: /\.setup\.ts$/ },
    { name: 'desktop', use: devices['Desktop Chrome'], dependencies: ['setup'] },
    // Most guests book on a phone.
    { name: 'phone', use: devices['Pixel 7'], testMatch: /guest-booking/ },
  ],
});
