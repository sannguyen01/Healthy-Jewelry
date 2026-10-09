import { describe, expect, it } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import path from 'node:path'

/**
 * Every page has one `<main>`, and it is the skip link's target (WCAG 2.4.1, ADR 053).
 *
 * The skip link in `layout.tsx` points at `#main`, so each route's own `<main>` carries `id="main"`. That is
 * a fact about sixteen files that nothing else holds from source, and the first draft broke it two ways at
 * once: the `/search` Suspense fallback was *also* a `<main id="main">`, so while the results streamed the
 * document had two main landmarks and two ids. `e2e/a11y.spec.ts` sees that only if it scans in the window;
 * this sees it every time.
 */

const APP = path.resolve(__dirname, '../../app')

function routeFiles(dir: string, found: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry)
    if (statSync(full).isDirectory()) routeFiles(full, found)
    else if (/^(page|not-found|error)\.tsx$/.test(entry)) found.push(full)
  }
  return found
}

describe('landmarks', () => {
  const files = routeFiles(APP)

  it('finds the routes it judges', () => {
    expect(files.length).toBeGreaterThan(12)
  })

  it.each(files.map((f) => [path.relative(APP, f), f]))('%s has exactly one <main>, and it is #main', (_rel, file) => {
    // Comments are prose: one of them says "not a <main>" and is not a second landmark.
    const source = readFileSync(file, 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/(^|[^:])\/\/.*$/gm, '$1')
    const mains = [...source.matchAll(/<main\b[^>]*>?/g)]
    expect(mains, 'a page is one main landmark; a Suspense fallback is a status region, not a second main').toHaveLength(1)
    // `id="main"` may sit on a later line of the opening tag.
    const tag = source.slice(mains[0].index, source.indexOf('>', (mains[0].index ?? 0) + 1) + 1)
    expect(tag).toContain('id="main"')
    expect(tag).toContain('tabIndex={-1}')
  })

  it('has a skip link in the layout that points at it', () => {
    const layout = readFileSync(path.join(APP, 'layout.tsx'), 'utf8')
    expect(layout).toMatch(/href="#main"/)
    expect(layout).toContain('Skip to content')
  })
})
