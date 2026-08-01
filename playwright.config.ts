import { defineConfig, devices } from '@playwright/test'

/**
 * Point at a Chromium binary that is already on the machine instead of the one
 * Playwright downloads. Sandboxed CI images and dev containers often ship a
 * pinned browser under a fixed path (e.g. PLAYWRIGHT_BROWSERS_PATH) whose build
 * number does not match this package version. Unset in normal use.
 */
const chromiumExecutablePath = process.env.PLAYWRIGHT_CHROMIUM_PATH

const launchOptions = chromiumExecutablePath
  ? { launchOptions: { executablePath: chromiumExecutablePath } }
  : {}

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  // One retry absorbs genuine flake. Two used to triple the wall-clock cost of
  // every real failure — a 30 s timeout became 90 s before the run even
  // reported it.
  retries: process.env.CI ? 1 : 0,
  // GitHub-hosted runners are 4-vCPU; the suite is `fullyParallel` already, and
  // the server under test is a production build rather than a dev server, so it
  // serves concurrent requests without compiling.
  workers: process.env.CI ? 2 : undefined,
  // The HTML report is what `actions/upload-artifact` publishes; without it the
  // upload step warns "No files were found with the provided path".
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : [['html']],
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'], ...launchOptions },
    },
    {
      // Chromium-based mobile emulation, not an iPhone descriptor — CI only
      // installs chromium (.github/workflows/ci.yml), and iPhone devices
      // launch WebKit, which isn't installed there, so every mobile test
      // failed at browser launch rather than reporting a real result.
      name: 'mobile',
      use: { ...devices['Pixel 7'], ...launchOptions },
    },
  ],
  webServer: {
    // A production build, not `pnpm dev`. Two reasons, in order of importance:
    //
    //   1. Correctness — Vercel serves `next build` output. A dev server has
    //      different static-generation, RSC and image-optimisation behaviour, so
    //      the old config tested a target that is never deployed.
    //   2. Speed — Turbopack compiles each route on first request. With ~12
    //      routes across two projects that dominated the run; the suite took
    //      24 minutes, nearly all of it waiting on compiles rather than testing.
    //
    // In CI the `verify` job has already produced and uploaded `.next`, and the
    // e2e job restores it, so rebuilding would burn a minute reproducing a
    // known-good artifact — PLAYWRIGHT_SKIP_BUILD says "the build you need is
    // already on disk". It is opt-in rather than an `existsSync('.next')`
    // check, because locally a stale `.next` from an earlier branch would then
    // silently test the wrong code.
    command: process.env.PLAYWRIGHT_SKIP_BUILD ? 'pnpm start' : 'pnpm build && pnpm start',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
    // Covers a cold `next build` on a shared runner as well as server startup.
    timeout: 180_000,
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
