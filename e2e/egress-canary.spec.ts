import { test, expect } from './support/test'
import { egressPolicy } from './support/contract'

/**
 * **The egress boundary, shown a known violation.**
 *
 * `e2e/support/test.ts` fails any test whose pages reach outside contract §12 or trip the
 * Content-Security-Policy. On a correct site it never fires, so on its own it is a check
 * that has only ever been observed passing ([ADR 020](../docs/adr/020-a-test-that-cannot-fail-is-documentation.md)).
 * These tests make it fire, on purpose, on every run.
 *
 * Each one declares what it is about to cause with `boundary.expectFinding(kind)`. Teardown
 * then fails if that kind is **absent** — the recorder went deaf — and still fails on any
 * kind that was not declared. That is stricter than `test.fail()`, which passes on any
 * failure at all, including a typo in the canary. The last test uses `test.fail()` anyway,
 * because it asks a different question: does a teardown throw fail a test at all?
 *
 * The target is whatever §13 lists first, read from the contract, so the canary cannot aim
 * at a host the table has since dropped. Every request to it is fulfilled locally by
 * `page.route`; nothing leaves the machine.
 */

const FORBIDDEN = egressPolicy.forbidden[0].host as string
const TARGET = `https://${FORBIDDEN}`

test.describe('the egress boundary can fail', () => {
  test.beforeEach(async ({ context }) => {
    await context.route(`${TARGET}/**`, (route) =>
      route.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><p>canary</p>' })
    )
  })

  test('a navigation to a §13 host is recorded as forbidden-origin', async ({ page, boundary }) => {
    boundary.expectFinding('forbidden-origin')
    await page.goto(`${TARGET}/canary`)
    await expect(page.getByText('canary')).toBeVisible()
    expect(boundary.requests.some((u) => u.startsWith(TARGET))).toBe(true)
  })

  test('a fetch the CSP blocks is recorded as csp-violation', async ({ page, boundary }) => {
    boundary.expectFinding('csp-violation')
    await page.goto('/')
    const outcome = await page.evaluate(
      (url) => fetch(url, { mode: 'no-cors' }).then(() => 'sent', () => 'refused'),
      `${TARGET}/beacon`
    )
    // `connect-src 'self'` refuses it before it is a request. If this ever reads `sent`,
    // the header has lost connect-src — csp-contract.test.ts should already be red.
    expect(outcome).toBe('refused')
    await expect.poll(() => boundary.violations.length).toBeGreaterThan(0)
  })

  test('an undeclared finding fails the test that caused it', async ({ page }) => {
    // Nothing declared, so the forbidden-origin finding is unexpected and teardown throws.
    // The body itself cannot throw — the goto is fulfilled locally — so if this test ever
    // *passes*, test.fail() turns that into the red it should be.
    test.fail()
    await page.goto(`${TARGET}/undeclared`).catch(() => {})
  })
})
