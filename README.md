# Healthy Jewelry — E-Commerce Storefront

**Pure Steel, Pure Style.** A boutique jewelry brand specialising in implant-grade titanium, anodized niobium, and 316L surgical steel — engineered for biocompatibility, built for everyday life.

- **Brand:** [Healthy Jewelry](https://www.instagram.com/healthyjewellery/)
- **Stack:** Next.js 14 · TypeScript · Tailwind v4 · Shopify Storefront API · Vercel
- **Repository:** `sannguyen01/Healthy-Jewelry`

Full documentation → see `CLAUDE.md` for AI assistant and developer guidelines.

See repository files for complete setup instructions, environment variables, Shopify configuration, design system, and deployment guide.

## Development

```bash
pnpm install
pnpm dev                 # http://localhost:3000
```

## Checks

```bash
pnpm lint
pnpm type-check
pnpm exec vitest run     # unit tests
pnpm build               # production build

pnpm e2e                 # Playwright, desktop + mobile
pnpm e2e:ui              # interactive runner
```

`pnpm e2e` builds and starts a production server for you — the artifact Vercel actually serves, not a
dev server. Testing layers, the CI gating policy, and recorded accessibility exceptions are documented
in **[`docs/testing-strategy.md`](docs/testing-strategy.md)**.