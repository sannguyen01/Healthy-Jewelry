import { existsSync } from 'fs'
import { defineConfig, devices } from '@playwright/test'

// Some CI images ship a single pre-installed Chromium rather than the exact
// browser build this Playwright version pins. Point at it when it's there so
// the suite runs without re-downloading a browser; fall back to Playwright's
// own resolution everywhere else (including local machines).
const PREINSTALLED_CHROMIUM = '/opt/pw-browsers/chromium'
const browserExecutable = existsSync(PREINSTALLED_CHROMIUM)
  ? { launchOptions: { executablePath: PREINSTALLED_CHROMIUM } }
  : {}

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  // Unbounded workers spawn one browser per core against a single dev server;
  // past about four they start losing the race for memory and fail to launch
  // at all ("Target page, context or browser has been closed").
  workers: process.env.CI ? 1 : 4,
  reporter: process.env.CI ? 'github' : 'html',
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'], ...browserExecutable },
    },
    {
      name: 'mobile',
      // The iPhone 14 descriptor defaults to WebKit, so this project silently
      // required a browser the project never installs — every mobile test
      // failed at launch rather than reporting a real result. The viewport,
      // touch and device-scale emulation is what this project is for, so it
      // keeps the descriptor and pins the engine to the one that is installed.
      use: {
        ...devices['iPhone 14'],
        browserName: 'chromium',
        ...browserExecutable,
      },
    },
  ],
  webServer: {
    command: 'pnpm dev',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: {
      NEXT_PUBLIC_SHOPIFY_STORE_DOMAIN:
        process.env.NEXT_PUBLIC_SHOPIFY_STORE_DOMAIN || 'placeholder.myshopify.com',
      SHOPIFY_STOREFRONT_ACCESS_TOKEN:
        process.env.SHOPIFY_STOREFRONT_ACCESS_TOKEN || 'placeholder-token',
      NEXT_PUBLIC_SITE_URL: 'http://localhost:3000',
      SHOPIFY_WEBHOOK_SECRET: process.env.SHOPIFY_WEBHOOK_SECRET || 'placeholder-secret',
    },
  },
})
