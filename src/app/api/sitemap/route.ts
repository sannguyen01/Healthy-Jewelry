import { NextResponse } from 'next/server'
import { getProducts } from '@/lib/shopify'
import { STATIC_PAGES } from '@/lib/seo/sitemapPages'
import { SITE_URL } from '@/config/site'

/**
 * The page list lives in `@/lib/seo/sitemapPages`, not here.
 *
 * A Next route module may only export the HTTP methods and a fixed set of config keys —
 * `next build` rejects anything else with a type error against `{ [x: string]: never }`.
 * So `STATIC_PAGES` and `SITEMAP_EXCLUDED` cannot live in this file *and* be readable by
 * `src/tests/unit/sitemap-completeness.test.ts`, which has to read the real list rather
 * than a copy of it — the same reason `design-tokens-contrast.test.ts` parses
 * `globals.css` instead of restating the palette.
 */
export async function GET(): Promise<NextResponse> {
  const products = await getProducts()

  const productPages = products.map((p) => ({
    loc: `/products/${p.handle}`,
    changefreq: 'weekly' as const,
    priority: '0.7',
  }))

  const allPages = [...STATIC_PAGES, ...productPages]

  const urlEntries = allPages
    .map(
      (page) => `
  <url>
    <loc>${SITE_URL}${page.loc}</loc>
    <changefreq>${page.changefreq}</changefreq>
    <priority>${page.priority}</priority>
  </url>`
    )
    .join('')

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urlEntries}
</urlset>`

  return new NextResponse(xml, {
    status: 200,
    headers: {
      'Content-Type': 'application/xml',
      'Cache-Control': 'public, max-age=3600, stale-while-revalidate=86400',
    },
  })
}
