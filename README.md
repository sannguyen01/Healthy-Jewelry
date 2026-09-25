# Healthy Jewelry — brand and encounter website

**Metal that works with your body.** A jewellery brand working in implant-grade titanium,
anodized niobium and 316L surgical steel — biocompatible, designed for people with metal
sensitivities.

- **Brand:** [Healthy Jewelry](https://www.instagram.com/healthyjewellery/)
- **Stack:** Next.js 16 · TypeScript (strict) · Tailwind v4 · Vercel
- **Repository:** `sannguyen01/Healthy-Jewelry`

## Nothing here is for sale, and that is enforced

This site explains the materials, presents the collection, and shows where an encounter with
an ambassador can continue. It does not take orders. There is no cart, no checkout, no
account, no price on any surface, and no commerce platform behind it — the catalogue is 17
reviewed JSON records in `src/content/catalog/`, validated at build time.

That is a **contract**, not a description:
[`COMMERCE-ELIMINATION-CONTRACT.md`](COMMERCE-ELIMINATION-CONTRACT.md) is parsed on every
pull request, and a commerce identifier, package, route or document that is neither classified
there nor owned by a row in [`docs/commerce-dependency-register.md`](docs/commerce-dependency-register.md)
fails the build. The reasoning is
[ADR 036](docs/adr/036-a-prohibition-in-prose-is-not-a-boundary.md); the remaining work is
[`docs/commerce-elimination-masterplan.md`](docs/commerce-elimination-masterplan.md).

Full developer and agent guidelines → **[`CLAUDE.md`](CLAUDE.md)**.

## Development

```bash
pnpm install
pnpm dev                 # http://localhost:3000
```

No credentials are needed to run, build or test this site. If a change introduces one, that is
the change to question.

## Checks

```bash
pnpm lint
pnpm type-check
pnpm exec vitest run            # unit tests
pnpm verify:commerce-contract   # the commerce boundary, scanned
pnpm build                      # production build

pnpm e2e                 # Playwright, desktop + mobile
pnpm e2e:ui              # interactive runner
```

`pnpm e2e` builds and starts a production server for you — the artifact Vercel actually
serves, not a dev server. Testing layers, the CI gating policy and recorded accessibility
exceptions are documented in **[`docs/testing-strategy.md`](docs/testing-strategy.md)**.
