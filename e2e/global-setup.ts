import type { FullConfig } from '@playwright/test'
import { primeImageVariants } from './support/imageVariants'

/**
 * Runs once, after the web server is up and before any test.
 *
 * It warms the image optimiser serially so that no test is the first to ask for a photograph
 * and none asks beside another. If the server will not answer one, the run stops here and
 * names it. The reasoning, the evidence and what this does not prove are in
 * `support/imageVariants.ts` and `docs/adr/049-a-wait-that-names-what-it-waits-for.md`.
 *
 * The pages are the ones that carry the site's photographs or tiles, so every `<img>` the suite
 * measures on a cold server is covered. A page that is not there is skipped and logged; a server
 * that is not there stops the run.
 */
const PAGES = [
  '/',
  '/shop',
  '/shop/rings',
  '/shop/necklaces',
  '/shop/earrings',
  '/shop/bracelets',
  '/shop/charms',
  '/products/arc-hoops-titanium',
  '/about',
  '/materials',
  '/stores',
]

export default async function globalSetup(config: FullConfig): Promise<void> {
  const origin = config.projects[0]?.use.baseURL ?? 'http://localhost:3000'
  await primeImageVariants({ origin, pages: PAGES, log: (line) => console.log(line) })
}
