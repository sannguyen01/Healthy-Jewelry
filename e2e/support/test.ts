import { test as base, expect } from '@playwright/test'
import { formatEgressFindings, judgeEgress } from '../../scripts/lib/egress.mjs'
import { egressPolicy } from './contract'

export { expect }
export type { APIRequestContext, APIResponse, BrowserContext, Locator, Page, Response } from '@playwright/test'

/**
 * **Every E2E test is also an egress test, whether or not it knows it.**
 *
 * Contract condition 2 — no runtime calls a commerce, payment, shipping, tax or inventory
 * service — was "demonstrated by the Playwright network log", and no spec read the network
 * log. `page.route` appeared once in the suite, to stub the contact form. So the one
 * condition that is only observable in a running browser was the one nothing observed.
 *
 * This fixture is `auto`, so it runs on every test that imports `test` from here, and
 * `e2e-fixture-boundary.test.ts` fails any spec that imports it from anywhere else. A
 * fixture a spec has to opt into is a fixture the next spec forgets.
 *
 * ## What it records, and why two things
 *
 * - **Every request** any page in the test's browser context makes, judged in teardown
 *   against contract §12 (browser side: the site itself, and nothing else) and §13 through
 *   `scripts/lib/egress.mjs` — the module the server harness and the CSP test share.
 * - **Every Content-Security-Policy violation**, from the `securitypolicyviolation` event
 *   and from the console line Chromium writes for it. The CSP in `next.config.ts` blocks a
 *   cross-origin fetch *before* it becomes a request, so a request log alone would go quiet
 *   exactly when the header is doing its job — and would stay quiet if a regression then
 *   loosened the header. A violation is how a blocked attempt stays visible.
 *
 * Either kind fails the test in teardown, with every finding listed.
 *
 * ## Proving it can fail
 *
 * `e2e/egress-canary.spec.ts` drives a real request to a §13 host and a real CSP-blocked
 * fetch, and declares each with `boundary.expectFinding(kind)`: teardown then fails if the
 * declared kind was **not** seen, and still fails on any kind that was not declared. A
 * canary that merely expected *some* failure would pass on a typo; this one passes only if
 * the recorder saw exactly what the canary did.
 */

export type BoundaryKind = 'forbidden-origin' | 'unapproved-origin' | 'unparseable-url' | 'csp-violation'

export interface BoundaryFinding {
  kind: BoundaryKind
  detail: string
}

interface CspViolation {
  directive: string
  blockedURI: string
  sourceFile: string
  line: number
}

declare global {
  interface Window {
    __cspViolations?: CspViolation[]
    __hjReportCspViolation?: (v: CspViolation) => void
  }
}

export class Boundary {
  readonly requests: string[] = []
  readonly violations: CspViolation[] = []
  readonly cspConsole: string[] = []
  private readonly expected = new Set<BoundaryKind>()

  constructor(private readonly siteOrigin: string) {}

  /**
   * Declare that this test deliberately produces findings of these kinds.
   *
   * Teardown then **requires** each of them and still refuses every other kind. For the
   * canary only; a spec reaching for this to quiet a real finding is changing the contract,
   * and belongs in §12 instead.
   */
  expectFinding(...kinds: BoundaryKind[]): void {
    for (const k of kinds) this.expected.add(k)
  }

  findings(): BoundaryFinding[] {
    const egress = judgeEgress(this.requests, {
      siteOrigin: this.siteOrigin,
      allowed: egressPolicy.allowed,
      forbidden: egressPolicy.forbidden,
      side: 'browser',
    }) as { code: BoundaryKind }[]
    const lines = formatEgressFindings(egress, 'browser') as string[]
    const out: BoundaryFinding[] = egress.map((f, i) => ({ kind: f.code, detail: lines[i].trim() }))

    const seen = new Set<string>()
    for (const v of this.violations) {
      const key = `${v.directive} ${v.blockedURI} ${v.sourceFile}:${v.line}`
      if (seen.has(key)) continue
      seen.add(key)
      out.push({ kind: 'csp-violation', detail: `event: ${v.directive} blocked ${v.blockedURI || '(inline)'} at ${v.sourceFile || '?'}:${v.line}` })
    }
    for (const text of new Set(this.cspConsole)) {
      out.push({ kind: 'csp-violation', detail: `console: ${text.slice(0, 300)}` })
    }
    return out
  }

  /** The teardown verdict: what should not have happened, and what should have. */
  verdict(): { unexpected: BoundaryFinding[]; missing: BoundaryKind[] } {
    const all = this.findings()
    return {
      unexpected: all.filter((f) => !this.expected.has(f.kind)),
      missing: [...this.expected].filter((k) => !all.some((f) => f.kind === k)),
    }
  }
}

export const test = base.extend<{ boundary: Boundary }>({
  boundary: [
    async ({ context, baseURL }, use) => {
      const boundary = new Boundary(new URL(baseURL ?? 'http://localhost:3000').origin)

      context.on('request', (request) => boundary.requests.push(request.url()))
      context.on('console', (message) => {
        if (/Content Security Policy/i.test(message.text())) boundary.cspConsole.push(message.text())
      })
      // The binding survives navigation; `window.__cspViolations` does not. Both are kept:
      // the binding is what reaches teardown, and the array is what a person debugging a
      // page in the inspector can read.
      await context.exposeBinding('__hjReportCspViolation', (_source, v: CspViolation) => {
        boundary.violations.push(v)
      })
      await context.addInitScript(() => {
        window.__cspViolations = []
        document.addEventListener(
          'securitypolicyviolation',
          (e) => {
            const v = {
              directive: e.effectiveDirective || e.violatedDirective,
              blockedURI: e.blockedURI,
              sourceFile: e.sourceFile,
              line: e.lineNumber,
            }
            window.__cspViolations?.push(v)
            void window.__hjReportCspViolation?.(v)
          },
          true
        )
      })

      await use(boundary)

      // Late events: a violation raised just before the test body returned may still be in
      // flight through the binding, so each open page's own list is read and merged too.
      for (const page of context.pages()) {
        const pending = await page.evaluate(() => window.__cspViolations ?? []).catch(() => [])
        boundary.violations.push(...pending)
      }

      const { unexpected, missing } = boundary.verdict()
      if (unexpected.length === 0 && missing.length === 0) return

      const parts: string[] = []
      if (unexpected.length) {
        parts.push(
          `The page reached outside contract §12, or tripped the Content-Security-Policy:\n` +
            unexpected.map((f) => `  [${f.kind}] ${f.detail}`).join('\n') +
            `\n\nA §13 host is never permitted. Anything else needs a §12 row — a reviewed ` +
            `decision in COMMERCE-ELIMINATION-CONTRACT.md — and, for the browser, a matching ` +
            `source in the CSP in next.config.ts.`
        )
      }
      if (missing.length) {
        parts.push(
          `This test declared it would produce ${missing.join(', ')} and the boundary saw ` +
            `none. The recorder has stopped recording, which makes every other test's green ` +
            `meaningless.`
        )
      }
      throw new Error(parts.join('\n\n'))
    },
    { auto: true },
  ],
})
