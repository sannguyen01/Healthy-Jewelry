import { describe, it, expect } from 'vitest'

const { stripYamlComments, secretsReferencedIn, auditSecrets } = await import(
  '../../../scripts/audit-workflow-secrets.mjs'
)

/**
 * The audit exists to answer one question: *which credentials are still configured but no
 * longer used by anything?*
 *
 * Deleting a workflow does not delete its secrets. GitHub keeps them forever, with no
 * reference to what needed them and nothing marking them unused, so an orphan is invisible
 * unless someone remembers. This repo had three, from a `deploy-production.yml` removed in
 * June 2026 and never mentioned in a document before or since.
 *
 * The failure mode worth guarding is a **false positive**, not a false negative. A tool
 * that reports a secret which was only ever written inside a comment teaches its reader to
 * skim the output, and a skimmed audit is not an audit. That is not hypothetical: the
 * first grep-based pass over this repository reported a secret named `X`, which comes from
 * a comment in `production-smoke.yml` documenting the anti-pattern
 * `run: echo ${'$'}{{ secrets.X }}`.
 */

interface AuditEntry {
  name: string
  status: 'live' | 'pending' | 'orphan'
  workflows: string[]
}

describe('stripYamlComments', () => {
  it('removes a whole-line comment', () => {
    expect(stripYamlComments('# just a comment').trim()).toBe('')
  })

  it('removes a trailing comment', () => {
    expect(stripYamlComments('run: node x.mjs # do the thing')).toBe('run: node x.mjs ')
  })

  it('keeps a # that is inside a quoted string', () => {
    // A colour token or a URL fragment is not a comment. Getting this wrong would
    // silently truncate real workflow content and under-report secrets.
    const line = `run: echo "colour #F7F5F1"`
    expect(stripYamlComments(line)).toBe(line)
  })

  it('keeps a # that is not preceded by whitespace', () => {
    expect(stripYamlComments('run: curl http://x/a#b')).toBe('run: curl http://x/a#b')
  })
})

describe('secretsReferencedIn', () => {
  it('finds real references', () => {
    const yaml = `
      env:
        TOKEN: \${{ secrets.SHOPIFY_ADMIN_ACCESS_TOKEN }}
        URL: \${{ secrets.PRODUCTION_SITE_URL }}
    `
    expect([...secretsReferencedIn(yaml)].sort()).toEqual([
      'PRODUCTION_SITE_URL',
      'SHOPIFY_ADMIN_ACCESS_TOKEN',
    ])
  })

  it('ignores a reference that only appears in a comment', () => {
    // The exact shape of the false positive this audit hit in its own repository.
    const yaml = `
      # Never do this — \${{ secrets.X }} interpolated into a run: string bypasses
      # the runner's log masking.
      env:
        REAL: \${{ secrets.PRODUCTION_SITE_URL }}
    `
    const found = secretsReferencedIn(yaml)

    expect(found.has('X')).toBe(false)
    expect(found.has('PRODUCTION_SITE_URL')).toBe(true)
  })

  it('a naive grep would report the commented reference', () => {
    // Pins *why* the comment stripping exists. If someone simplifies
    // `secretsReferencedIn` back to a bare regex over the raw text, the assertion above
    // starts failing and this one explains what changed.
    const yaml = `# \${{ secrets.X }}`
    const naive = [...yaml.matchAll(/secrets\.([A-Z_][A-Z0-9_]*)/g)].map((m) => m[1])

    expect(naive).toEqual(['X'])
    expect([...secretsReferencedIn(yaml)]).toEqual([])
  })
})

describe('auditSecrets against this repository', () => {
  // Deliberately run against real git history rather than a fixture. A fixture written in
  // our own vocabulary asserts only that we agree with ourselves — the failure mode that
  // let `material:steel` mismatch `surgical-steel` on all 22 products while every test
  // stayed green.
  const results = auditSecrets() as AuditEntry[]
  const byName = new Map(results.map((r) => [r.name, r]))

  it('finds secrets to classify', () => {
    expect(results.length).toBeGreaterThan(0)
  })

  it('classifies the Vercel deploy credentials as orphans', () => {
    // `deploy-production.yml` was deleted 2026-06-29 as redundant; its secrets were never
    // removed, and no document has ever mentioned them.
    for (const name of ['VERCEL_TOKEN', 'VERCEL_ORG_ID', 'VERCEL_PROJECT_ID']) {
      expect(byName.get(name), `${name} should be in the audit`).toBeDefined()
      expect(byName.get(name)?.status, `${name} should be an orphan`).toBe('orphan')
    }
  })

  it('does not report the commented anti-pattern example as a secret', () => {
    // `production-smoke.yml` documents `secrets.X` inside a comment.
    expect(byName.has('X')).toBe(false)
  })

  it('classifies the smoke-test secrets as pending, not orphaned', () => {
    // They are referenced by a workflow that exists but has not reached the default
    // branch, so they are needed — they just cannot do anything yet.
    for (const name of [
      'PRODUCTION_SITE_URL',
      'SHOPIFY_STORE_DOMAIN',
      'SHOPIFY_STOREFRONT_ACCESS_TOKEN',
      'SHOPIFY_ADMIN_ACCESS_TOKEN',
      'SHOPIFY_WEBHOOK_SECRET',
    ]) {
      const entry = byName.get(name)
      expect(entry, `${name} should be in the audit`).toBeDefined()
      expect(entry?.status, `${name} should not be an orphan`).not.toBe('orphan')
    }
  })

  it('names the workflow each secret was last seen in', () => {
    // An audit that says "something is unused" without saying what used to use it leaves
    // the reader unable to judge whether deleting it is safe.
    expect(byName.get('VERCEL_TOKEN')?.workflows).toContain(
      '.github/workflows/deploy-production.yml',
    )
  })
})
