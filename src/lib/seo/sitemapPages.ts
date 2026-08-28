import { hjCollections } from '@/lib/data/hj-data'

/**
 * Routes that exist and are deliberately **not** in the sitemap, each with the reason.
 *
 * This is not documentation. `src/tests/unit/sitemap-completeness.test.ts` walks
 * `src/app/**` and requires every route it finds to be in `STATIC_PAGES` or here — with
 * no third option, because a third option is exactly how `/contact` went missing.
 *
 * A page absent from the sitemap is not visibly broken. It renders, it links, it ranks
 * eventually or it does not, and nothing anywhere distinguishes *excluded on purpose*
 * from *forgotten*. `/contact` — a real marketing route with a working form — was absent
 * from this list until 2026-08-28, sitting beside `/cart` and `/checkout`, which are
 * absent correctly. Four omissions, three of them right, and no way to tell which.
 *
 * See docs/adr/019-an-unclassified-entry-is-an-unverified-one.md.
 */
export const SITEMAP_EXCLUDED: Record<string, string> = {
  '/cart': 'Transactional and per-visitor. Nothing to index; no two crawls see the same page.',
  '/checkout':
    'A hand-off to Shopify-hosted checkout. Indexing it would land searchers on a step that ' +
    'only makes sense with a cart already built.',
  '/account':
    'Authenticated. Renders a sign-in prompt to anyone who is not the account holder, which ' +
    'is not a page worth ranking.',
}

/**
 * The public routes this site publishes, with their crawl hints.
 *
 * Exported so the completeness test can read the real list rather than a copy of it —
 * the same reason `design-tokens-contrast.test.ts` parses `globals.css` instead of
 * restating the palette.
 *
 * The five collection paths used to be written out here by hand, one line each,
 * duplicating `hjCollections`. They are derived now: a collection added to the catalogue
 * appears in the sitemap without anyone remembering this file. Reconciling two lists is
 * the fallback; having one list is the fix.
 */
export const STATIC_PAGES = [
  { loc: '/', changefreq: 'weekly', priority: '1.0' },
  { loc: '/shop', changefreq: 'daily', priority: '0.9' },
  ...hjCollections.map((collection) => ({
    loc: `/shop/${collection.handle}`,
    changefreq: 'daily',
    priority: '0.8',
  })),
  { loc: '/about', changefreq: 'monthly', priority: '0.6' },
  { loc: '/materials', changefreq: 'monthly', priority: '0.7' },
  { loc: '/contact', changefreq: 'monthly', priority: '0.6' },
  { loc: '/search', changefreq: 'monthly', priority: '0.5' },
  { loc: '/privacy', changefreq: 'yearly', priority: '0.3' },
  { loc: '/terms', changefreq: 'yearly', priority: '0.3' },
  { loc: '/shipping', changefreq: 'monthly', priority: '0.4' },
  { loc: '/faq', changefreq: 'monthly', priority: '0.5' },
  { loc: '/stores', changefreq: 'monthly', priority: '0.3' },
  { loc: '/legal', changefreq: 'yearly', priority: '0.2' },
] as const satisfies ReadonlyArray<{ loc: string; changefreq: string; priority: string }>
