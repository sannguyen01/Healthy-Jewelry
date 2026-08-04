import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import {
  SITE_URL,
  SITE_DOMAIN,
  CONTACT_EMAIL,
  SUPPORT_EMAIL,
  PRIVACY_EMAIL,
  LEGAL_EMAIL,
  SENDER_EMAIL,
  SOCIAL_LINKS,
  SEO_DEFAULTS,
} from '@/config/site'

/**
 * The single-L "healthyjewelry.com" is not owned by this brand — it is
 * parked for resale on Afternic/GoDaddy with a null MX record — yet it was
 * hardcoded as the canonical domain in ~20 files (metadata, sitemap,
 * contact/legal emails, JSON-LD) before this test existed. Every check here
 * guards a specific place that regressed once already.
 */
describe('canonical domain consistency', () => {
  it('SITE_URL and SITE_DOMAIN use the correct (double-L) domain', () => {
    expect(SITE_URL).toContain('healthyjewellery.com')
    expect(SITE_DOMAIN).toBe('healthyjewellery.com')
  })

  it('every contact mailbox is on the correct domain', () => {
    for (const email of [CONTACT_EMAIL, SUPPORT_EMAIL, PRIVACY_EMAIL, LEGAL_EMAIL, SENDER_EMAIL]) {
      expect(email).toMatch(/@healthyjewellery\.com$/)
    }
  })

  it('every social link uses the correct handle', () => {
    for (const url of Object.values(SOCIAL_LINKS)) {
      expect(url).toContain('healthyjewellery')
    }
  })

  it('Twitter/X site handle uses the correct domain', () => {
    expect(SEO_DEFAULTS.twitter.site).toBe('@healthyjewellery')
  })

  it('no file under src/, public/, or docs/ hardcodes the wrong (single-L) domain', () => {
    // Structural enforcement: re-walks the same directories that held ~20
    // stray literals originally, in pure Node (no shell, no `grep` — the
    // original bash-based version broke on any machine without a Unix
    // shell in PATH, and shelling out to a string-built command was flagged
    // as a command-injection smell even though nothing here is user input).
    // If a future edit pastes the wrong domain into a new file, this fails
    // CI before it ever reaches production DNS.
    const wrongDomain = 'healthyjewelry.com'
    const scanExtensions = new Set(['.ts', '.tsx', '.md', '.json', '.txt'])
    const skipDirs = new Set(['node_modules', '.next', '.git'])
    // Three files legitimately reference the wrong domain:
    // - config/site.ts: guard clause + error message that detects it
    // - domain-consistency.test.ts: this file, searching for it
    // - docs/dns-domain-setup.md: explains WHY the single-L is wrong
    const allowedFiles = new Set([
      join('src', 'config', 'site.ts'),
      join('src', 'tests', 'unit', 'domain-consistency.test.ts'),
      join('docs', 'dns-domain-setup.md'),
    ])

    const offendingLines: string[] = []

    function walk(dir: string): void {
      for (const entry of readdirSync(dir)) {
        if (skipDirs.has(entry)) continue
        const fullPath = join(dir, entry)
        const stat = statSync(fullPath)
        if (stat.isDirectory()) {
          walk(fullPath)
          continue
        }
        const relPath = relative(process.cwd(), fullPath)
        if (allowedFiles.has(relPath)) continue
        const ext = entry.slice(entry.lastIndexOf('.'))
        if (!scanExtensions.has(ext)) continue

        const lines = readFileSync(fullPath, 'utf-8').split('\n')
        lines.forEach((line, index) => {
          if (line.includes(wrongDomain)) {
            offendingLines.push(`${relPath}:${index + 1}: ${line.trim()}`)
          }
        })
      }
    }

    for (const root of ['src', 'public', 'docs']) {
      try {
        walk(root)
      } catch {
        // Directory doesn't exist in this checkout — nothing to scan.
      }
    }

    expect(offendingLines).toEqual([])
  })
})
