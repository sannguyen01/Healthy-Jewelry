# 003 — Client-safe config is a separate module from secrets

## Context

`src/config/shopify.ts` carries the Storefront token, the Admin token and the revalidation
secret. The cart store is a client module and imported that whole module for one field —
the store domain — dragging three server-only getters into the client module graph.

Nothing leaked. Next inlines non-`NEXT_PUBLIC_` env vars as `undefined` in the client
bundle, so those getters returned `''` in a browser. But "nothing leaked" was a property of
what Next happens to do with an env var name, not something the code stated or enforced.

The test that was supposed to cover this asserted `typeof value === 'string'` — which `''`
passes. Covered-looking and worthless.

## Decision

- `src/config/shopify-public.ts` carries only browser-safe values.
- `src/config/shopify.ts` keeps the secrets and delegates its public field to the public
  module rather than duplicating it.
- `src/tests/unit/secret-exposure.test.ts` **walks the real client import graph** from every
  client entry point and fails if any server secret is reachable.

The guardrail deliberately does not check for a `'use client'` directive, which is easy to
forget and easy to add without meaning it. It follows imports.

## Consequences

- "This file is safe to import from a browser" is a fact that can be stated, not inferred.
- The test asserts its graph is **non-empty before checking it**, so a broken module
  resolver cannot make the whole suite vacuously green. This mattered immediately: the
  first run caught `config/site.ts`, a module nobody had traced by hand, which exported
  three Shopify secrets and was transitively reachable through `ContactForm.tsx`.

Referenced by: `src/config/shopify-public.ts`, `src/config/shopify.ts`,
`src/tests/unit/secret-exposure.test.ts`, `STATE.md`.
