import { describe, it, expect } from 'vitest'

const { stripYamlComments, secretsReferencedIn, auditSecrets, isShallowClone } = await import(
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

describe('shallow clones', () => {
  it('refuses to report rather than returning a false all-clear', () => {
    // The first CI run of this script printed "No orphaned secrets" and exited 0 while
    // three real orphans sat in repository settings — because `actions/checkout` clones
    // with `fetch-depth: 1` and every commit that deleted a workflow was absent.
    //
    // A security tool that under-reports on a misconfigured checkout is worse than no
    // tool: the green run is read as an all-clear. So the only two honest answers are the
    // real one and "I cannot tell".
    if (isShallowClone()) {
      expect(() => auditSecrets()).toThrow(/shallow/i)
    } else {
      // Full history here, so prove the guard is wired by asking for the shallow path
      // explicitly: `allowShallow` is the only way past it.
      expect(() => auditSecrets({ allowShallow: true })).not.toThrow()
    }
  })
})

describe('auditSecrets against this repository', () => {
  // Deliberately run against real git history rather than a fixture. A fixture written in
  // our own vocabulary asserts only that we agree with ourselves — the failure mode that
  // let `material:steel` mismatch `surgical-steel` on all 22 products while every test
  // stayed green.
  //
  // Skipped on a shallow clone, where the history simply is not present. `ci.yml` sets
  // `fetch-depth: 0` so these run for real there rather than being quietly skipped.
  const shallow = isShallowClone()
  const results = shallow ? [] : (auditSecrets() as AuditEntry[])
  const byName = new Map(results.map((r) => [r.name, r]))
  const itFull = shallow ? it.skip : it

  itFull('finds secrets to classify', () => {
    expect(results.length).toBeGreaterThan(0)
  })

  itFull('classifies the Vercel deploy credentials as orphans', () => {
    // `deploy-production.yml` was deleted 2026-06-29 as redundant; its secrets were never
    // removed, and no document has ever mentioned them.
    for (const name of ['VERCEL_TOKEN', 'VERCEL_ORG_ID', 'VERCEL_PROJECT_ID']) {
      expect(byName.get(name), `${name} should be in the audit`).toBeDefined()
      expect(byName.get(name)?.status, `${name} should be an orphan`).toBe('orphan')
    }
  })

  itFull('does not report the commented anti-pattern example as a secret', () => {
    // `production-smoke.yml` documents `secrets.X` inside a comment.
    expect(byName.has('X')).toBe(false)
  })

  itFull('classifies the smoke-test secrets the workflow still consumes as not orphaned', () => {
    // `production-smoke.yml` references each of these, so they are needed. It has since
    // reached the default branch, which moves them from `pending` to `live` — either is a
    // correct answer to the question this asserts, which is only ever *not an orphan*.
    for (const name of ['PRODUCTION_SITE_URL', 'SHOPIFY_STORE_DOMAIN', 'SHOPIFY_WEBHOOK_SECRET']) {
      const entry = byName.get(name)
      expect(entry, `${name} should be in the audit`).toBeDefined()
      expect(entry?.status, `${name} should not be an orphan`).not.toBe('orphan')
    }
  })

  itFull('classifies the two decommissioned Shopify read tokens as orphans', () => {
    // **This assertion was inverted on 2026-09-21, and the inversion is the finding.**
    //
    // Both names sat in the list above until WS-6 removed the last thing that consumed
    // them: the Storefront and Admin tokens were arguments to `preflight-secrets.mjs` and
    // entries in its `WHERE` map, for live checks that read a store this brand no longer
    // has. `production-smoke.yml` stopped passing them, so no existing workflow references
    // either — which is precisely the definition of `orphan`.
    //
    // The auditor said so on the first run after the merge and this test called it a
    // regression. It was not: the tool was right and the expectation was stale. Two
    // credentials that can read a Shopify store are still configured in repository
    // settings with nothing left to use them, which is the exact condition
    // `scripts/audit-workflow-secrets.mjs` exists to surface.
    //
    // Asserted positively rather than deleted, per
    // [ADR 035](../../../docs/adr/035-a-control-outlives-its-subject.md): dropping the two
    // names would have made the suite green and left the finding unwatched. Written this
    // way it bites in both directions — it fails if a workflow starts referencing them
    // again (a decommissioned credential coming back is a decision, not a diff), and it
    // fails if the audit stops classifying them, which is the shape of a broken auditor.
    //
    // It is expected to fail once more, deliberately: when the tokens are deleted from
    // Settings → Secrets and variables → Actions **and** revoked in Shopify Admin, the
    // last historical reference is still in git history, so they stay orphans here. The
    // row to remove then is in `docs/credential-inventory.md`, which records the console
    // half this script cannot see.
    for (const name of ['SHOPIFY_STOREFRONT_ACCESS_TOKEN', 'SHOPIFY_ADMIN_ACCESS_TOKEN']) {
      const entry = byName.get(name)
      expect(entry, `${name} should be in the audit`).toBeDefined()
      expect(entry?.status, `${name} should be an orphan after WS-6`).toBe('orphan')
      expect(
        entry?.workflows,
        `${name} should name the workflow that last used it`,
      ).toContain('.github/workflows/production-smoke.yml')
    }
  })

  itFull('names the workflow each secret was last seen in', () => {
    // An audit that says "something is unused" without saying what used to use it leaves
    // the reader unable to judge whether deleting it is safe.
    expect(byName.get('VERCEL_TOKEN')?.workflows).toContain(
      '.github/workflows/deploy-production.yml',
    )
  })
})
