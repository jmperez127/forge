import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright configuration for FORGE E2E tests.
 *
 * Tests run against the real helpdesk application with:
 * - Zero-config embedded PostgreSQL (via FORGE_ENV=test)
 * - FORGE runtime server with auto-migration
 * - Vite dev server for the frontend
 *
 * No external database setup required!
 */
export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: [
    ['list'],
    ['html', { open: 'never' }],
  ],
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'on-first-retry',
  },
  timeout: 30000,
  expect: {
    timeout: 10000,
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'firefox',
      use: { ...devices['Desktop Firefox'] },
    },
    {
      name: 'webkit',
      use: { ...devices['Desktop Safari'] },
    },
  ],
  globalSetup: './global-setup.ts',
  globalTeardown: './global-teardown.ts',
  webServer: [
    {
      // Backend API server with zero-config embedded PostgreSQL
      // FORGE_ENV=test uses ephemeral database that auto-cleans up
      command: 'cd ../projects/helpdesk && ../../bin/forge-runtime -port 8080',
      port: 8080,
      reuseExistingServer: !process.env.CI,
      timeout: 60000, // Allow time for embedded PostgreSQL to start
      env: {
        FORGE_ENV: 'test',
        LOG_LEVEL: 'debug',
        // No DATABASE_URL needed - uses embedded PostgreSQL from forge.runtime.toml
      },
    },
    {
      // Frontend dev server
      command: 'cd ../projects/helpdesk/web && npm run dev',
      port: 3000,
      reuseExistingServer: !process.env.CI,
      timeout: 30000,
      env: {
        VITE_API_URL: 'http://localhost:8080',
      },
    },
  ],
});
