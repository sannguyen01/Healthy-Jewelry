import { describe, it, expect } from 'vitest'
import { fingerprint, buildStamp, BUILD_INFO } from '@/config/build-info'

const {
  staleBundleVerdict,
  environmentVerdict,
  freshnessVerdict,
  catalogueSourceVerdict,
  summarise,
} = await import('../../../scripts/lib/deployment-verdict.mjs')

/**
 * **Every verdict here fires only on a broken deployment.**
 *
 * A stale bundle, a frozen alias, an unconfigured preview — none of these states
 * exists on a healthy site, so none can be observed by pointing the diagnostic at
 * one. They are, by construction, the branches that never run while you are
 * looking, which is the shape of bug this project has already shipped: the
 * completed-order branch of the cart could not be exercised in development and
 * was the half that broke (ADR 002).
 *
 * So the decisions are pure, and every branch is exercised here. A diagnostic
 * that has only ever been seen saying "fine" is not a diagnostic.
 */

interface Verdict {
  id: string
  level: 'ok' | 'warn' | 'fail'
  title: string
  detail: string
  action?: string
}

type Payload = Parameters<typeof staleBundleVerdict>[0]

const HEAD = 'a'.repeat(40)
const OLDER = 'b'.repeat(40)

function payload(overrides: Record<string, unknown> = {}): Payload {
  const base = {
    build: {
      commit: HEAD,
      shortCommit: HEAD.slice(0, 7),
      vercelEnv: 'production',
      vercelUrl: 'hj-abc123.vercel.app',
      branch: 'main',
      builtAt: '2026-08-12T10:00:00.000Z',
      configFingerprint: 'deadbeef',
      storeDomainInlined: true,
    },
    runtime: {
      vercelEnv: 'production',
      configFingerprint: 'deadbeef',
      storeDomainSet: true,
    },
    shopify: { configured: true, pinnedApiVersion: '2026-07' },
    bundleIsStale: false,
  }
  return { ...base, ...overrides } as Payload
}

// ── Segment 3 — the cached build ────────────────────────────────────────────

describe('staleBundleVerdict — a redeploy reused the build cache', () => {
  it('passes when the bundle and the environment fingerprint identically', () => {
    const v = staleBundleVerdict(payload()) as Verdict
    expect(v.level).toBe('ok')
  })

  /**
   * The case with no other symptom anywhere. Same commit, same environment,
   * page renders correctly — and the inlined values are the old ones.
   */
  it('fails when the inlined config differs from the live environment', () => {
    const v = staleBundleVerdict(
      payload({ runtime: { vercelEnv: 'production', configFingerprint: 'cafe1234', storeDomainSet: true } })
    ) as Verdict

    expect(v.level).toBe('fail')
    expect(v.detail).toContain('deadbeef')
    expect(v.detail).toContain('cafe1234')
  })

  /**
   * The action is the deliverable. "Your build is stale" without "uncheck the
   * cache box" leaves the reader exactly where they started — and this project's
   * history is full of sessions that redeployed normally and reproduced the
   * symptom.
   */
  it('names the cache checkbox, not just the diagnosis', () => {
    const v = staleBundleVerdict(
      payload({ runtime: { vercelEnv: 'production', configFingerprint: 'other', storeDomainSet: true } })
    ) as Verdict

    expect(v.action).toMatch(/Build Cache/i)
    expect(v.action).toMatch(/UNCHECKED/i)
  })
})

// ── Segment 4 — which environment ───────────────────────────────────────────

describe('environmentVerdict — Vercel scopes variables per environment', () => {
  it('confirms Production', () => {
    expect((environmentVerdict(payload()) as Verdict).level).toBe('ok')
  })

  it('flags a Preview deployment as worth knowing about', () => {
    const v = environmentVerdict(
      payload({ runtime: { vercelEnv: 'preview', configFingerprint: 'deadbeef', storeDomainSet: true } })
    ) as Verdict

    expect(v.level).toBe('warn')
    expect(v.title).toContain('preview')
  })

  /**
   * A warning by default, a failure only when Production was the point. Testing
   * a preview deliberately is normal, and a check that cries wolf over normal
   * usage is one people learn to ignore — which is how the 24-minute E2E suite
   * became noise.
   */
  it('escalates a Preview to a failure only under --expect-production', () => {
    const preview = payload({
      runtime: { vercelEnv: 'preview', configFingerprint: 'deadbeef', storeDomainSet: true },
    })
    expect((environmentVerdict(preview) as Verdict).level).toBe('warn')
    expect((environmentVerdict(preview, { expectProduction: true }) as Verdict).level).toBe('fail')
  })

  it('says so when the target is not a Vercel deployment at all', () => {
    const v = environmentVerdict(
      payload({
        build: { ...payload().build, vercelEnv: null },
        runtime: { vercelEnv: null, configFingerprint: 'deadbeef', storeDomainSet: true },
      })
    ) as Verdict

    expect(v.level).toBe('warn')
    expect(v.title).toContain('Not a Vercel deployment')
  })

  /** Runtime is the authority; the build stamp is a fallback for older deploys. */
  it('prefers the runtime environment over the one baked into the build', () => {
    const v = environmentVerdict(
      payload({
        build: { ...payload().build, vercelEnv: 'production' },
        runtime: { vercelEnv: 'preview', configFingerprint: 'deadbeef', storeDomainSet: true },
      })
    ) as Verdict

    expect(v.title).toContain('preview')
  })
})

// ── Segment 5 — the orphaned alias ──────────────────────────────────────────

describe('freshnessVerdict — the dead end that looks alive', () => {
  const local = { headCommit: HEAD, headCommittedAt: '2026-08-12T09:50:00.000Z' }

  it('passes when the deployment serves the default branch tip', () => {
    expect((freshnessVerdict(payload(), local) as Verdict).level).toBe('ok')
  })

  /**
   * Both signals required. An old commit *and* a build predating the branch tip
   * is a frozen alias; either alone is routine.
   */
  it('fails when an old commit was built before the branch tip existed', () => {
    const v = freshnessVerdict(
      payload({
        build: { ...payload().build, commit: OLDER, builtAt: '2026-08-11T08:00:00.000Z' },
      }),
      local
    ) as Verdict

    expect(v.level).toBe('fail')
    expect(v.title).toContain('Frozen alias')
    expect(v.action).toMatch(/never a hashed preview alias/i)
  })

  it('only warns when a different commit is NEWER — a deploy in flight, not an orphan', () => {
    const v = freshnessVerdict(
      payload({
        build: { ...payload().build, commit: OLDER, builtAt: '2026-08-12T11:00:00.000Z' },
      }),
      local
    ) as Verdict

    expect(v.level).toBe('warn')
  })

  /**
   * The false positive that would matter most. A fresh clone or a worktree has a
   * stale local `main`, and deciding "frozen alias" from that would send someone
   * chasing a deployment problem that does not exist. Reporting undecidability is
   * the honest answer.
   */
  it('declines to decide when the local branch tip is unknown', () => {
    const v = freshnessVerdict(payload(), {
      headCommit: null,
      headCommittedAt: null,
    }) as Verdict

    expect(v.level).toBe('warn')
    expect(v.detail).toContain('undecidable')
  })

  it('declines to decide when timestamps are unparseable rather than guessing', () => {
    const v = freshnessVerdict(
      payload({ build: { ...payload().build, commit: OLDER, builtAt: 'not-a-date' } }),
      local
    ) as Verdict

    expect(v.level).toBe('warn')
  })

  it('reports a deployment too old to carry a build stamp', () => {
    const v = freshnessVerdict(
      payload({ build: { ...payload().build, commit: null } }),
      local
    ) as Verdict

    expect(v.level).toBe('warn')
    expect(v.title).toContain('does not report a commit')
  })
})

/*
 * `shopifyConfigVerdict` stood here with four tests, and both it and they are gone.
 *
 * It returned **fail** with the title "Shopify is NOT configured on this deployment"
 * whenever the store domain or the Storefront token was absent, because that state meant
 * every fetcher fell back to a bundled catalogue whose placeholder variant IDs Shopify
 * rejected — the site rendered perfectly and checkout could not start. Its build-time and
 * runtime halves were reported separately because they are fixed in different consoles,
 * which was a good distinction and is now a distinction about nothing.
 *
 * After ADR 034 an unconfigured deployment is the *target* state. A verdict that reports
 * the intended configuration as a failure is worse than no verdict: it is a red that
 * teaches its reader to ignore reds (ADR 011). Retired rather than inverted, because
 * "Shopify is correctly absent" is not a question anybody runs a deployment diagnostic to
 * ask. See ADR 035.
 */

// ── What the page is actually serving ───────────────────────────────────────

/**
 * The surviving half of the pair, with its premise turned over.
 *
 * It used to take two hand-maintained handle lists — `FALLBACK_ONLY_HANDLES` and
 * `SHOPIFY_ONLY_HANDLES` — and fail on finding a bundled-only handle, because that meant
 * the page was serving products "that have never existed in Shopify, so nothing on this
 * page can be bought". There is one catalogue now, so the discriminator has nothing to
 * discriminate: the question becomes whether `/shop` links to products *this build holds*.
 */
describe('catalogueSourceVerdict', () => {
  const known = ['arc-band-titanium', 'disc-studs-titanium', 'cable-cuff-titanium']

  it("confirms the page is serving this build's catalogue", () => {
    const v = catalogueSourceVerdict('<a href="/products/arc-band-titanium">', known) as Verdict
    expect(v.level).toBe('ok')
    expect(v.detail).toContain('1 of 3')
  })

  it('counts every known handle it finds, not just the first', () => {
    const html = '<a href="/products/arc-band-titanium"><a href="/products/cable-cuff-titanium">'
    expect((catalogueSourceVerdict(html, known) as Verdict).detail).toContain('2 of 3')
  })

  /**
   * A shelf with nothing on it. The page rendered, so this is not a deploy failure — and
   * that distinction is the reason it is reported at all rather than inferred from a 200.
   */
  it('fails on a page carrying none of them rather than passing by default', () => {
    const v = catalogueSourceVerdict('<html><body>nothing here</body></html>', known) as Verdict
    expect(v.level).toBe('fail')
    expect(v.detail).toContain('nothing on it')
  })

  it('matches on the product path, not on the bare handle', () => {
    // A handle appearing in prose — a description, a heading, an alt attribute — is not a
    // link to the product. The old version matched `html.includes(handle)` and would have
    // counted any of those as evidence the page was serving it.
    const prose = '<p>The arc-band-titanium is our bestseller.</p>'
    expect((catalogueSourceVerdict(prose, known) as Verdict).level).toBe('fail')
  })

  it('is not fooled by a handle this build does not hold', () => {
    const v = catalogueSourceVerdict('<a href="/products/dome-ring-titanium">', known) as Verdict
    expect(v.level).toBe('fail')
  })
})

// ── Exit code ───────────────────────────────────────────────────────────────

describe('summarise', () => {
  const v = (level: Verdict['level'], id: string): Verdict => ({ id, level, title: id, detail: '' })

  it('exits 0 when everything passes', () => {
    expect(summarise([v('ok', 'a'), v('ok', 'b')]).exitCode).toBe(0)
  })

  it('exits 0 on warnings — a preview under test is not a failure', () => {
    expect(summarise([v('ok', 'a'), v('warn', 'b')]).exitCode).toBe(0)
  })

  it('exits 1 on any failure', () => {
    expect(summarise([v('ok', 'a'), v('fail', 'b')]).exitCode).toBe(1)
  })

  it('names the failing checks so a CI log tail is enough', () => {
    expect(summarise([v('fail', 'stale-bundle'), v('fail', 'freshness')]).summary).toContain(
      'stale-bundle, freshness'
    )
  })
})

// ── The fingerprint the whole stale-bundle detector rests on ────────────────

describe('fingerprint', () => {
  it('is stable across calls', () => {
    expect(fingerprint({ A: '1' })).toBe(fingerprint({ A: '1' }))
  })

  /** Key order must never change the answer, or a rebuild could "drift" for nothing. */
  it('is independent of key order', () => {
    expect(fingerprint({ A: '1', B: '2' })).toBe(fingerprint({ B: '2', A: '1' }))
  })

  it('changes when any value changes', () => {
    expect(fingerprint({ A: '1' })).not.toBe(fingerprint({ A: '2' }))
  })

  /**
   * The case the detector is actually for: a store domain set for one environment
   * and not another has to produce different fingerprints, including when the
   * difference is "empty vs. set".
   */
  it('distinguishes an unset value from a set one', () => {
    expect(fingerprint({ NEXT_PUBLIC_SHOPIFY_STORE_DOMAIN: '' })).not.toBe(
      fingerprint({ NEXT_PUBLIC_SHOPIFY_STORE_DOMAIN: 'y0k9ve-q1.myshopify.com' })
    )
  })

  /**
   * A separator, not concatenation. Without one, `{A:'x', B:'y'}` and
   * `{A:'xB=y', B:''}` would collide — contrived, but a fingerprint that can
   * collide on adjacent fields is a detector that can silently miss.
   */
  it('does not collide when values are shifted across the key boundary', () => {
    expect(fingerprint({ A: 'x', B: 'y' })).not.toBe(fingerprint({ A: 'x\nB=y', B: '' }))
  })

  it('is always eight lowercase hex characters', () => {
    for (const value of ['', 'a', 'y0k9ve-q1.myshopify.com', 'x'.repeat(500)]) {
      expect(fingerprint({ K: value })).toMatch(/^[0-9a-f]{8}$/)
    }
  })
})

describe('buildStamp', () => {
  it('carries all four facts in one greppable line', () => {
    const stamp = buildStamp({
      commit: HEAD,
      shortCommit: HEAD.slice(0, 7),
      vercelEnv: 'production',
      vercelUrl: null,
      branch: 'main',
      builtAt: '2026-08-12T10:00:00.000Z',
      configFingerprint: 'deadbeef',
      storeDomainInlined: true,
    })

    expect(stamp).toContain(`commit=${HEAD.slice(0, 7)}`)
    expect(stamp).toContain('env=production')
    expect(stamp).toContain('built=2026-08-12T10:00:00.000Z')
    expect(stamp).toContain('config=deadbeef')
  })

  /**
   * A local build has no Vercel variables. The stamp must still render — a page
   * that cannot be served in development because it cannot name its deployment
   * would be a self-inflicted outage.
   */
  it('degrades to readable placeholders off Vercel', () => {
    const stamp = buildStamp({
      commit: null,
      shortCommit: null,
      vercelEnv: null,
      vercelUrl: null,
      branch: null,
      builtAt: null,
      configFingerprint: '00000000',
      storeDomainInlined: false,
    })

    expect(stamp).toContain('commit=unknown')
    expect(stamp).toContain('env=local')
  })

  it('renders for the real BUILD_INFO of this process', () => {
    expect(buildStamp(BUILD_INFO)).toMatch(/^commit=\S+ env=\S+ built=\S+ config=[0-9a-f]{8}$/)
  })
})
