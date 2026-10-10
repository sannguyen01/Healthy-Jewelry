#!/usr/bin/env node
/**
 * Captures the screenshot matrix a human reviews before a hero or header change merges
 * (ADR 054), with the identity of everything it was captured against.
 *
 * It is an artefact generator, not an assertion: the specs under `e2e/` decide pass or fail.
 * A screenshot with no commit, viewport, device scale or load state beside it cannot be
 * compared against another one, which is how an unidentified preview or a warm browser cache
 * ends up "confirming" a layout it never rendered.
 *
 *   pnpm build
 *   PLAYWRIGHT_CHROMIUM_PATH=/opt/pw-browsers/chromium \
 *     node scripts/capture-hero-evidence.mjs --label before
 *
 * Options:
 *   --label <name>      subdirectory suffix, e.g. before / after            (default: capture)
 *   --out <dir>         output root                                  (default: artifacts/hero-evidence)
 *   --port <n>          port for the production server it starts             (default: 3100)
 *   --base-url <url>    use a server that is already running instead of starting one
 *   --banner            leave the consent notice unanswered (default: pre-denied, as the specs do)
 *   --built-from <sha>  the commit the served build was made from, when it is not HEAD (a baseline taken
 *                       from an older build while the working tree has moved on); recorded verbatim
 *   --only <a,b>        restrict to some route keys (home,contact,shop,collection,piece,missing)
 *   --widths <a,b>      restrict to some viewport widths
 *
 * Output: <out>/<short sha>-<label>/manifest.json and one PNG per entry. The directory is
 * git-ignored. `deployment` is null locally and says why; read a deployment's id from the
 * platform, never from this script.
 */
import { spawn, execFileSync } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { setTimeout as sleep } from 'node:timers/promises'
import { chromium } from '@playwright/test'

const CONSENT_KEY = 'hj-analytics-consent'

/** The eleven widths of ADR 054, with the device scale each stands for. */
const VIEWPORTS = [
  { width: 320, height: 568, dpr: 2 },
  { width: 360, height: 640, dpr: 3 },
  { width: 375, height: 667, dpr: 2 },
  { width: 390, height: 844, dpr: 3 },
  { width: 430, height: 932, dpr: 3 },
  { width: 768, height: 1024, dpr: 2 },
  { width: 900, height: 900, dpr: 1 },
  { width: 901, height: 900, dpr: 1 },
  { width: 1024, height: 768, dpr: 1 },
  { width: 1280, height: 900, dpr: 1 },
  { width: 1440, height: 900, dpr: 1 },
]

/** Route keys. The home page is captured in every state; the rest at the top and, once, at the foot. */
const ROUTES = {
  home: { path: '/', states: ['top', 'scrolled', 'menu-open'] },
  contact: { path: '/contact', states: ['top'] },
  shop: { path: '/shop', states: ['top'] },
  collection: { path: '/shop/earrings', states: ['top'] },
  piece: { path: '/products/arc-hoops-titanium', states: ['top', 'footer'] },
  missing: { path: '/this-page-does-not-exist', states: ['top'] },
}

function parseArgs(argv) {
  const args = { label: 'capture', out: 'artifacts/hero-evidence', port: 3100, banner: false }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--banner') args.banner = true
    else if (a.startsWith('--')) args[a.slice(2)] = argv[++i]
  }
  args.port = Number(args.port)
  return args
}

const git = (...a) => execFileSync('git', a, { encoding: 'utf8' }).trim()

async function responds(url) {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(2000) })
    return res.status < 500
  } catch {
    return false
  }
}

async function startServer(port) {
  const child = spawn(
    process.execPath,
    [resolve('node_modules/next/dist/bin/next'), 'start', '-p', String(port)],
    { stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, NEXT_PUBLIC_SITE_URL: `http://localhost:${port}` } },
  )
  child.stderr.on('data', () => {})
  const url = `http://localhost:${port}`
  for (let i = 0; i < 60; i++) {
    if (await responds(url)) return { url, stop: () => child.kill('SIGTERM') }
    await sleep(500)
  }
  child.kill('SIGTERM')
  throw new Error(`next start did not answer on ${url} within 30s (did you run pnpm build?)`)
}

/**
 * An image a visitor can see in the first screen. Lazy images below the fold never load until scrolled
 * to, so waiting for *every* image would wait forever; the picture only has to be true of what is on it.
 */
const IN_VIEWPORT = `(img) => {
  const r = img.getBoundingClientRect()
  return r.width > 0 && r.height > 0 && r.bottom > 0 && r.top < window.innerHeight
}`

/** Everything a reviewer needs to trust the picture: fonts settled, every visible image decoded. */
async function settle(page) {
  await page.waitForLoadState('load')
  await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {})
  await page.evaluate(
    async (inViewport) => {
      const visible = new Function(`return ${inViewport}`)()
      await document.fonts.ready
      const pending = [...document.images]
        .filter(visible)
        .filter((img) => !img.complete)
        .map((img) => new Promise((r) => { img.onload = img.onerror = r }))
      // A ceiling, not a wait: an image that never answers is reported by `imagesLoaded: false`, not hung on.
      await Promise.race([Promise.all(pending), new Promise((r) => setTimeout(r, 10000))])
    },
    IN_VIEWPORT,
  )
  await page.evaluate(
    () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))),
  )
}

const loadState = (page) =>
  page.evaluate((inViewport) => {
    const visible = new Function(`return ${inViewport}`)()
    return {
      fontsLoaded: document.fonts.status === 'loaded',
      imagesLoaded: [...document.images].filter(visible).every((i) => i.complete && i.naturalWidth > 0),
      headerState: document.querySelector('.hj-header')?.getAttribute('data-state') ?? null,
      headerTone: document.querySelector('.hj-header')?.getAttribute('data-tone') ?? null,
      scrollY: Math.round(window.scrollY),
    }
  }, IN_VIEWPORT)

async function main() {
  const args = parseArgs(process.argv.slice(2))
  const only = args.only?.split(',')
  const widths = args.widths?.split(',').map(Number)
  const commit = git('rev-parse', 'HEAD')
  const dirty = git('status', '--porcelain') !== ''
  const dir = resolve(args.out, `${commit.slice(0, 7)}-${args.label}${dirty ? '-dirty' : ''}`)
  mkdirSync(dir, { recursive: true })

  const server = args['base-url']
    ? { url: args['base-url'].replace(/\/$/, ''), stop: () => {} }
    : await startServer(args.port)

  const browser = await chromium.launch(
    process.env.PLAYWRIGHT_CHROMIUM_PATH ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH } : {},
  )
  const manifest = {
    commit,
    tree: git('rev-parse', 'HEAD^{tree}'),
    dirtyWorkingTree: dirty,
    servedBuildCommit: args['built-from'] ?? commit,
    label: args.label,
    deployment: null,
    deploymentNote: 'captured against a local production build; a deployment id is read from the platform, not from here',
    browser: `chromium ${browser.version()}`,
    node: process.version,
    consentNotice: args.banner ? 'unanswered' : 'pre-denied',
    startedAt: new Date().toISOString(),
    entries: [],
  }

  try {
    for (const vp of VIEWPORTS) {
      if (widths && !widths.includes(vp.width)) continue
      const context = await browser.newContext({
        viewport: { width: vp.width, height: vp.height },
        deviceScaleFactor: vp.dpr,
        reducedMotion: 'reduce',
      })
      if (!args.banner) {
        await context.addInitScript(
          ([key]) => { try { localStorage.setItem(key, 'denied') } catch {} },
          [CONSENT_KEY],
        )
      }
      const page = await context.newPage()
      for (const [key, route] of Object.entries(ROUTES)) {
        if (only && !only.includes(key)) continue
        for (const state of route.states) {
          await page.goto(server.url + route.path, { waitUntil: 'load' })
          await settle(page)
          if (state === 'scrolled') await page.evaluate(() => window.scrollTo(0, window.innerHeight))
          if (state === 'footer') await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight))
          if (state === 'menu-open') {
            await page.locator('.hj-menu-btn').click()
            await page.locator('.hj-menu-drawer[data-state="menu-open"]').waitFor()
          }
          await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))))
          const file = `${key}-${state}-${vp.width}x${vp.height}.png`
          await page.screenshot({ path: join(dir, file) })
          manifest.entries.push({
            file,
            route: route.path,
            state,
            viewport: { width: vp.width, height: vp.height },
            deviceScaleFactor: vp.dpr,
            reducedMotion: 'reduce',
            ...(await loadState(page)),
            timestamp: new Date().toISOString(),
          })
        }
      }
      await context.close()
    }
  } finally {
    manifest.finishedAt = new Date().toISOString()
    writeFileSync(join(dir, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n')
    await browser.close()
    server.stop()
  }

  const unsettled = manifest.entries.filter((e) => !e.fontsLoaded || !e.imagesLoaded)
  console.log(`${manifest.entries.length} captures -> ${dir}`)
  if (unsettled.length) {
    console.error(`${unsettled.length} capture(s) taken before fonts or images settled:`)
    for (const e of unsettled) console.error(`  ${e.file} fonts=${e.fontsLoaded} images=${e.imagesLoaded}`)
    process.exitCode = 1
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
