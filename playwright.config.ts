import { defineConfig, devices } from "@playwright/test";
const appEnv = {
  NEXT_TEST_BUILD: "true",
  MONGODB_URI: "mongodb://127.0.0.1:27028/ags_test_e2e?replicaSet=ags-local",
  APP_ORIGIN: "http://127.0.0.1:3002",
  AUTH_SECRET: "e2e-local-only-secret-repeated-000000000",
  MOCK_OTP: "true",
  MOCK_OTP_CODE: "246810",
};
export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 120000,
  expect: { timeout: 15000 },
  fullyParallel: false,
  workers: 1,
  reporter: "list",
  use: { baseURL: "http://127.0.0.1:3002", trace: "retain-on-failure" },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile", use: { ...devices["Pixel 7"] } },
  ],
  webServer: [
    {
      command: "npm run dev -- --port 3002",
      url: "http://127.0.0.1:3002/login",
      reuseExistingServer: false,
      env: appEnv,
      timeout: 120000, // a cold .next-e2e compile after large edits can take over a minute
    },
  ],
});
