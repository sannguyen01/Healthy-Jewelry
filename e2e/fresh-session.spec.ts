import { test, expect, type BrowserContext, type Page, type Response } from './support/test'
import { approvedRoutes } from './support/contract'
import { getAllCollections, getAllProducts } from '../src/lib/catalog'

/**
 * **A visitor who looks at everything leaves with nothing.**
 *
 * CLAUDE.md says the site holds no client state across a navigation, and calls that "a
 * property worth keeping rather than an absence to fill". Until this file nothing kept it.
 * The bag went on 2026-09-20 with its Zustand store and its `localStorage` key; the next
 * thing to write one — a wishlist, a "recently viewed", a vendor widget that sets a cookie
 * on load, a service worker somebody adds for offline support — would have shipped as
 * silently as the bag did, because no test ever read a browser's storage (finding 17 of the
 * decommission plan).
 *
 * So this tours every approved page in a brand-new context, scrolls each one to the bottom
 * so every lazy component mounts, opens the mobile menu where there is one, and then reads
 * back every place a browser can keep something for a site:
 *
 * | Store | Allowed |
 * |---|---|
 * | cookies (any domain) | none |
 * | `localStorage` | at most `hj-analytics-consent`, and only once the banner is answered |
 * | `sessionStorage` | none |
 * | service-worker registrations | none |
 * | Cache Storage | none |
 * | IndexedDB | none |
 *
 * The consent key is the one exception, and it is exact: the banner answer is the visitor's
 * own decision, kept in `localStorage` rather than a cookie precisely so it is never sent
 * with a request (`src/lib/analytics/consent.ts`).
 *
 * ## Why the empty result is trusted
 *
 * An assertion that storage is empty passes just as well when the reader is broken. Three
 * positive controls are what make the empty tour mean something: a canary writes each store
 * directly and the reader must name every one; answering the banner must produce
 * **exactly** the consent key (so the site's own write is seen, at the right origin); and
 * the contact form must still submit (so the tour is walking a site that works, not a shell
 * that never hydrated and therefore never had the chance to write).
 */

/**
 * The static page routes of contract §6, as literals.
 *
 * Literal rather than generated because `spec-anchor-contract.test.ts` resolves every
 * `goto` argument from source, and a path computed at runtime is one it cannot see. The
 * list is reconciled against §6 below in both directions, so it cannot drift from the
 * contract without a failure naming the route. (No `as const`: the resolver reads a bare
 * array literal, and an assertion expression hides it.)
 */
const STATIC_PAGES = [
  { path: '/' },
  { path: '/about' },
  { path: '/contact' },
  { path: '/faq' },
  { path: '/legal' },
  { path: '/materials' },
  { path: '/privacy' },
  { path: '/search' },
  { path: '/shipping' },
  { path: '/shop' },
  { path: '/stores' },
  { path: '/terms' },
]

/**
 * Concrete values for the two dynamic §6 routes, from the catalogue reader.
 *
 * Every collection, and one product from each — the product template branches on its
 * collection (ring and bracelet size pickers, earring layouts), so one product per
 * collection is one visit per branch.
 */
const COLLECTION_HANDLES = getAllCollections().map((c) => c.handle)
const PRODUCT_HANDLES = COLLECTION_HANDLES.map(
  (collection) => getAllProducts().find((p) => p.collection === collection)?.handle
).filter((h): h is string => Boolean(h))

/** The §6 dynamic routes this file knows how to fill. A new one fails the reconciliation. */
const DYNAMIC_ROUTES = ['/products/[handle]', '/shop/[collection]']

const CONSENT_KEY = 'hj-analytics-consent'

interface Residue {
  cookies: string[]
  localStorage: string[]
  sessionStorage: string[]
  serviceWorkers: string[]
  caches: string[]
  indexedDB: string[]
}

/** Everything the browser is keeping for this site, by store, as names only. */
async function readResidue(page: Page, context: BrowserContext): Promise<Residue> {
  const cookies = (await context.cookies()).map((c) => `${c.domain}${c.path} ${c.name}`)
  const inPage = await page.evaluate(async () => {
    const keys = (s: Storage) => Array.from({ length: s.length }, (_, i) => s.key(i) ?? '')
    const registrations = navigator.serviceWorker ? await navigator.serviceWorker.getRegistrations() : []
    return {
      localStorage: keys(window.localStorage),
      sessionStorage: keys(window.sessionStorage),
      serviceWorkers: registrations.map((r) => r.scope),
      caches: 'caches' in window ? await caches.keys() : ['<Cache Storage unavailable>'],
      indexedDB: (await indexedDB.databases()).map((d) => `${d.name}@${d.version}`),
    }
  })
  return { cookies, ...inPage }
}

const CLEAN: Residue = {
  cookies: [],
  localStorage: [],
  sessionStorage: [],
  serviceWorkers: [],
  caches: [],
  indexedDB: [],
}

/**
 * Assert a page served, then scroll it to the bottom in viewport steps so every lazy part
 * mounts. Takes the navigation's response rather than a path so each call site writes its
 * own `page.goto(...)` — the form `spec-anchor-contract.test.ts` can resolve from source.
 */
async function scrollThrough(page: Page, response: Response | null) {
  expect(response?.status(), `${page.url()} did not serve`).toBe(200)
  await page.evaluate(async () => {
    const frame = () => new Promise((resolve) => requestAnimationFrame(() => resolve(null)))
    for (let y = 0; y < document.documentElement.scrollHeight; y += window.innerHeight * 0.8) {
      window.scrollTo(0, y)
      await frame()
      await frame()
    }
    window.scrollTo(0, document.documentElement.scrollHeight)
    await frame()
  })
  await page.waitForLoadState('networkidle')
}

test.describe('A fresh session leaves nothing behind', () => {
  test('the tour below visits every page route in contract §6', () => {
    const pages = approvedRoutes.filter((r) => r.kind === 'page').map((r) => r.route)
    const visited = [...STATIC_PAGES.map((p) => p.path), ...DYNAMIC_ROUTES]
    expect(visited.sort(), 'the tour and §6 disagree about which pages exist').toEqual([...pages].sort())
    // A catalogue that read as empty would turn the dynamic half of the tour into nothing.
    expect(COLLECTION_HANDLES.length).toBeGreaterThanOrEqual(5)
    expect(PRODUCT_HANDLES).toHaveLength(COLLECTION_HANDLES.length)
  })

  test('every approved page, scrolled through, stores nothing', async ({ page, context }, testInfo) => {
    // Twenty-two pages, each scrolled end to end, on a production build.
    test.setTimeout(120_000)

    for (const { path } of STATIC_PAGES) {
      await scrollThrough(page, await page.goto(path))
      expect(await readResidue(page, context), `after ${path}`).toEqual(CLEAN)
    }
    for (const handle of PRODUCT_HANDLES) {
      await scrollThrough(page, await page.goto(`/products/${handle}`))
      expect(await readResidue(page, context), `after /products/${handle}`).toEqual(CLEAN)
    }
    for (const handle of COLLECTION_HANDLES) {
      await scrollThrough(page, await page.goto(`/shop/${handle}`))
      expect(await readResidue(page, context), `after /shop/${handle}`).toEqual(CLEAN)
    }

    if (testInfo.project.name === 'mobile') {
      // The overlay is the one piece of client UI with open/closed state. Opening and
      // closing it is exactly when a "remember the menu" key would be written.
      await page.getByRole('button', { name: /open menu/i }).click()
      await expect(page.getByRole('dialog', { name: /mobile navigation/i })).toBeVisible()
      await page.getByRole('button', { name: /close menu/i }).click()
      await expect(page.getByRole('dialog', { name: /mobile navigation/i })).not.toBeVisible()
    }

    // The banner was never answered, so even the one permitted key must be absent.
    await expect(page.getByRole('dialog', { name: /analytics consent/i })).toBeVisible()
    expect(await readResidue(page, context), 'after the whole tour').toEqual(CLEAN)
  })

  test('the reader sees every store it checks when something is in it', async ({ page, context }) => {
    // The canary for readResidue itself (ADR 020): an empty result from a reader that cannot
    // see a store is indistinguishable from an empty store. Each store is written directly,
    // in this test's own throwaway context, and must come back by name. Service workers are
    // the exception — registering one needs a worker script served from this origin, which
    // the site does not have — so that one store is read but not proven readable.
    await scrollThrough(page, await page.goto('/'))
    await context.addCookies([{ name: 'hj-probe', value: '1', url: page.url() }])
    await page.evaluate(async () => {
      localStorage.setItem('hj-probe', '1')
      sessionStorage.setItem('hj-probe', '1')
      await caches.open('hj-probe')
      await new Promise((resolve, reject) => {
        const request = indexedDB.open('hj-probe', 1)
        request.onsuccess = () => {
          request.result.close()
          resolve(null)
        }
        request.onerror = () => reject(request.error)
      })
    })

    const residue = await readResidue(page, context)
    expect(residue.cookies).toEqual([expect.stringMatching(/ hj-probe$/)])
    expect(residue.localStorage).toEqual(['hj-probe'])
    expect(residue.sessionStorage).toEqual(['hj-probe'])
    expect(residue.caches).toEqual(['hj-probe'])
    expect(residue.indexedDB).toEqual(['hj-probe@1'])
  })

  for (const answer of ['Decline', 'Allow'] as const) {
    test(`answering the banner with ${answer} writes exactly the consent key`, async ({ page, context }) => {
      // Positive control: proves the reader sees `localStorage` at this origin, so the
      // empty result above is a measurement and not a blind spot.
      await scrollThrough(page, await page.goto('/'))
      expect(await readResidue(page, context)).toEqual(CLEAN)

      const banner = page.getByRole('dialog', { name: /analytics consent/i })
      await banner.getByRole('button', { name: answer, exact: true }).click()
      await expect(banner).toHaveCount(0)

      expect(await readResidue(page, context)).toEqual({ ...CLEAN, localStorage: [CONSENT_KEY] })
      expect(await page.evaluate((k) => localStorage.getItem(k), CONSENT_KEY)).toBe(
        answer === 'Allow' ? 'granted' : 'denied'
      )

      // And it is remembered without anything else being added to remember it with.
      await scrollThrough(page, await page.goto('/shop'))
      await expect(banner).toHaveCount(0)
      expect(await readResidue(page, context)).toEqual({ ...CLEAN, localStorage: [CONSENT_KEY] })
    })
  }

  test('the contact form still submits, and stores nothing either', async ({ page, context }) => {
    // Positive control: the one form on the site works in the same fresh context. Stubbed
    // exactly as contact.spec.ts stubs it — delivery is the route handler's business and
    // is covered at unit level; this is about what the browser keeps.
    await page.route('**/api/contact', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true }) })
    )
    await scrollThrough(page, await page.goto('/contact'))

    await page.getByLabel(/^name$/i).fill('San Nguyen')
    await page.getByLabel(/^email$/i).fill('san@example.com')
    await page.getByLabel(/^message$/i).fill('Hello, I have a question about titanium rings and sizing.')
    const sent = page.waitForRequest((r) => r.url().endsWith('/api/contact') && r.method() === 'POST')
    await page.getByRole('button', { name: /send message/i }).click()
    await sent

    await expect(page.getByText(/message sent/i)).toBeVisible({ timeout: 8000 })
    // A draft saved "in case the send fails", or a "you already wrote to us" flag, would be
    // exactly the kind of state this file exists to catch.
    expect(await readResidue(page, context)).toEqual(CLEAN)
  })
})
