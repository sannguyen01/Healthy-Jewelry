import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'

/**
 * Two documents name the same credentials, so something has to reconcile them.
 *
 * `docs/credential-inventory.md` answers *what exists and what it reaches*.
 * `docs/shopify-decommission-inventory.md` answers *what happens to it and how we know*.
 * They share the credential name as a key and nothing else, which is deliberate — but it is
 * exactly the shape that drifts, and a reader trusts whichever they found first (ADR 018).
 *
 * The failure this refuses is specific and has a cost: a credential that exists, is revoked,
 * and appears in neither ledger is an orphan nobody can see. `docs/credential-inventory.md`
 * exists because GitHub has no "unused secret" view; this test exists because two hand-written
 * lists are one edit away from disagreeing about which secrets there are.
 *
 * Both directions, per this repository's usual rule. A ledger missing a real credential is an
 * unowned token; a ledger naming one that does not exist is a revocation nobody can perform.
 */

const ROOT = path.resolve(import.meta.dirname, '../../..')
const INVENTORY = 'docs/credential-inventory.md'
const LEDGER = 'docs/shopify-decommission-inventory.md'

const read = (rel: string) => readFileSync(path.join(ROOT, rel), 'utf8')

/**
 * Credential-shaped names, as this project writes them: SCREAMING_SNAKE, backticked.
 *
 * Anchored on the backticks rather than scanning bare words, because both documents discuss
 * these names in prose and a looser pattern would collect sentence fragments. Per ADR 007 a
 * pattern has unknown coverage, so the sets are asserted non-empty below — a regex that
 * silently matched nothing would make every comparison trivially true, which is the way this
 * kind of check fails.
 */
function credentialNames(source: string): Set<string> {
  const names = new Set<string>()
  for (const [, name] of source.matchAll(/`([A-Z][A-Z0-9_]{5,})`/g)) {
    if (name.startsWith('SHOPIFY_') || name.startsWith('VERCEL_')) names.add(name)
  }
  return names
}

/** Names the ledger deliberately carries that are not credentials of this repository's own. */
const NOT_A_REPOSITORY_CREDENTIAL = new Set([
  // Inlined into the client bundle; public by construction and discussed as such.
  'NEXT_PUBLIC_SHOPIFY_STORE_DOMAIN',
])

describe('the decommission ledger and the credential inventory agree', () => {
  const inventory = credentialNames(read(INVENTORY))
  const ledger = credentialNames(read(LEDGER))

  it('finds credentials in both documents', () => {
    // The guard on the guard. If either pattern stops matching, every assertion below
    // passes vacuously and this file becomes documentation (ADR 020).
    expect(inventory.size, `no credential names found in ${INVENTORY}`).toBeGreaterThan(3)
    expect(ledger.size, `no credential names found in ${LEDGER}`).toBeGreaterThan(3)
  })

  it('every Shopify and Vercel credential in the inventory has a ledger row', () => {
    const missing = [...inventory].filter(
      (name) => !ledger.has(name) && !NOT_A_REPOSITORY_CREDENTIAL.has(name)
    )
    expect(
      missing,
      `These credentials are in ${INVENTORY} and have no row in ${LEDGER}:\n  ` +
        `${missing.join('\n  ')}\n\n` +
        `A credential with no revocation row is one nobody has decided the fate of. Add a ` +
        `row — an empty Revoked cell is the honest state for something not yet revoked.`
    ).toEqual([])
  })

  it('every credential the ledger names is one the inventory knows about', () => {
    const unknown = [...ledger].filter(
      (name) => !inventory.has(name) && !NOT_A_REPOSITORY_CREDENTIAL.has(name)
    )
    expect(
      unknown,
      `These credentials are in ${LEDGER} and appear nowhere in ${INVENTORY}:\n  ` +
        `${unknown.join('\n  ')}\n\n` +
        `Either the inventory is missing something real, or the ledger names a credential ` +
        `that does not exist. Both are worth knowing; neither should be guessed at.`
    ).toEqual([])
  })
})

describe('the ledger keeps its own rule', () => {
  const source = read(LEDGER)

  it('states the names-never-values rule', () => {
    expect(source).toMatch(/never a credential value/i)
  })

  it('carries no Shopify token literal', () => {
    // Shopify's token prefixes are fixed and documented: shpat_ (Admin), shpca_ (custom app),
    // shppa_ (private app), shpss_ (shared secret). Built by concatenation so this assertion
    // does not itself put a matchable literal in the repository.
    const prefixes = ['shpat', 'shpca', 'shppa', 'shpss'].map((p) => `${p}_`)
    for (const prefix of prefixes) {
      const real = new RegExp(`${prefix}[A-Za-z0-9]{8,}`)
      expect(
        real.test(source),
        `${LEDGER} contains something shaped like a live ${prefix} token. This file is in a ` +
          `public repository: a value written here is a value published.`
      ).toBe(false)
    }
  })

  it('does not claim a revocation it has no evidence for', () => {
    // Paired columns: a row saying it was revoked must say what showed that. The check is
    // deliberately crude — it counts, it does not parse — because the real protection is the
    // stated rule and a reviewer reading it. What it catches is the careless case: someone
    // dating a revocation and leaving the evidence cell blank.
    const rows = source.split('\n').filter((line) => /^\| \d+ \|/.test(line))
    expect(rows.length, 'no numbered ledger rows found — has the table shape changed?').toBeGreaterThan(3)

    for (const row of rows) {
      const cells = row.split('|').map((c) => c.trim())
      const [revoked, evidence] = cells.slice(-3, -1)
      if (revoked) {
        expect(
          evidence,
          `A ledger row records a revocation date and no evidence:\n  ${row.slice(0, 90)}…\n\n` +
            `"Revoked" without "Evidence" is a claim about a control, which is the thing this ` +
            `repository keeps learning not to write down (ADR 018).`
        ).toBeTruthy()
      }
    }
  })
})
