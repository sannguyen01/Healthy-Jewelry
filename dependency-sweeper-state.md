# Dependency Sweeper State — Healthy-Jewelry

Last run: never
Status: report-only (L1, week 1)

## Watched manifests
- package.json + pnpm-lock.yaml (root — Next.js 15 app, pnpm package manager)

## In-flight / recent

<!-- Example entries the loop will maintain -->
- (none yet — first run will populate)

## Human decisions & denylist (edit these)

Denylist (do not auto-touch, and always escalate rather than propose):
- next / react / react-dom (major bumps)
- @shopify/* packages (major bumps — Shopify Storefront API is version-pinned
  in production; a bump needs a human to check the API version string too)
- zustand (cart persistence relies on its current storage format)

Human overrides:
- (none)
