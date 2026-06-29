import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? 'github' : 'html',
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'mobile',
      use: { ...devices['iPhone 14'] },
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
