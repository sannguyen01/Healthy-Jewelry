import { NextResponse } from 'next/server'
import { getProducts } from '@/lib/shopify'
import { SITE_URL } from '@/config/site'

export async function GET(): Promise<NextResponse> {
  const products = await getProducts()

  const staticPages = [
    { loc: '/', changefreq: 'weekly', priority: '1.0' },
    { loc: '/shop', changefreq: 'daily', priority: '0.9' },
    { loc: '/shop/rings', changefreq: 'daily', priority: '0.8' },
    { loc: '/shop/necklaces', changefreq: 'daily', priority: '0.8' },
    { loc: '/shop/earrings', changefreq: 'daily', priority: '0.8' },
    { loc: '/shop/bracelets', changefreq: 'daily', priority: '0.8' },
    { loc: '/shop/charms', changefreq: 'daily', priority: '0.8' },
    { loc: '/about', changefreq: 'monthly', priority: '0.6' },
    { loc: '/materials', changefreq: 'monthly', priority: '0.7' },
    { loc: '/search', changefreq: 'monthly', priority: '0.5' },
    { loc: '/privacy', changefreq: 'yearly', priority: '0.3' },
    { loc: '/terms', changefreq: 'yearly', priority: '0.3' },
    { loc: '/shipping', changefreq: 'monthly', priority: '0.4' },
    { loc: '/faq', changefreq: 'monthly', priority: '0.5' },
    { loc: '/stores', changefreq: 'monthly', priority: '0.3' },
    { loc: '/legal', changefreq: 'yearly', priority: '0.2' },
  ] as const

  const productPages = products.map((p) => ({
    loc: `/products/${p.handle}`,
    changefreq: 'weekly' as const,
    priority: '0.7',
  }))

  const allPages = [...staticPages, ...productPages]

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
