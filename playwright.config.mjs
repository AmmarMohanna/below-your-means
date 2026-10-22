import { defineConfig, devices } from '@playwright/test';

// Isolated local server and dummy credentials. API reads/writes are intercepted
// by the browser tests; these checks never require OpenAI or a database.
export default defineConfig({
  testDir: './tests',
  testMatch: '**/*.spec.mjs',
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: 0,
  workers: 2,
  reporter: 'list',
  use: {
    baseURL: 'http://127.0.0.1:4308',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'webkit', use: { ...devices['iPhone 13'] } },
  ],
  webServer: {
    command: 'npm run dev -- --hostname 127.0.0.1 --port 4308',
    url: 'http://127.0.0.1:4308/login',
    reuseExistingServer: false,
    timeout: 120_000,
    env: {
      APP_PASSWORD: 'voice-tests-only',
      SESSION_SECRET: 'voice-tests-only-session-secret',
      SECURE_COOKIES: 'false',
      OPENAI_API_KEY: '',
      NEXT_TELEMETRY_DISABLED: '1',
    },
  },
});
