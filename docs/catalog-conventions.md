# Catalog Conventions

Rules for adding or editing products in Shopify Admin so they render correctly on the
site. `src/lib/shopify/index.ts` (`mapShopifyProduct`) is the authoritative mapping —
this doc explains what it expects and what happens when a product doesn't provide it.

## `svg:` tag (illustration)

The site has no product photography for most SKUs — it renders a hand-drawn SVG
(`src/components/svg/JewelrySVG.tsx`) keyed by `HJSvgType`. Set it explicitly with a
Shopify product tag:

```
svg:ring-dome
svg:necklace-drop
svg:bracelet-cuff
```

Valid values are the `HJSvgType` union in `src/lib/shopify/types.ts`: `ring-arc`,
`ring-dome`, `ring-flat`, `ring-split`, `necklace-disc`, `necklace-bar`, `necklace-drop`,
`necklace-chain`, `earring-stud`, `earring-hoop`, `earring-drop`, `earring-cone`,
`bracelet-cuff`, `bracelet-bangle`, `bracelet-link`, `charm-classic`, `charm-disc`.

**If the tag is missing**, `mapShopifyProduct` falls back to substring-matching the
product handle (`necklace`/`pendant` → `necklace-drop`, `earring`/`stud` →
`earring-hoop`, `bracelet`/`cuff` → `bracelet-cuff`), and if that also fails to match,
silently defaults to `ring-arc` — the wrong illustration renders with no error anywhere.
A `console.warn` fires server-side (`[shopify] product missing svg: tag`), but nothing
surfaces to Shopify Admin. Tag every product explicitly; don't rely on the fallback.

## Collection

Every product needs a Shopify collection matching one of the five `HJCollectionHandle`
values: `rings`, `necklaces`, `earrings`, `bracelets`, `charms`. A product in none of
these defaults to `rings` with a `console.warn` naming the collections it could not use —
same silent-failure shape as the SVG tag.

**A product may sit in more than one collection, and order does not matter.**
`parseCollection` takes the first handle that is genuinely one of the five and ignores
everything else, so `frontpage` + `rings` resolves to `rings`.

> This paragraph described the intended behaviour for months before the code did it.
> `mapShopifyProduct` used to take Shopify's **first** collection and cast it —
> `edges[0].node.handle as HJCollectionHandle` — with no check that the value was one of
> the five. `arc-band-titanium` is in Shopify's built-in `frontpage` collection as well as
> `rings`, and Shopify returns `frontpage` first, so its `product.collection` became
> `'frontpage'`: a breadcrumb reading `frontpage`, linked to `/shop/frontpage`, which
> `dynamicParams = false` answers with a **hard 404** — on the site's only `bestseller`.
> The `warn` fired only when a product had *zero* collections, which never happens.

**Do not put a product only in `frontpage`.** Shopify's built-ins are skipped deliberately
(nobody chose to put the product there), so a product with no other collection falls back
to `rings` regardless of what it is.

### `collection:` tags do nothing

Five products carry a `collection:spectrum` tag. Nothing reads it — collections come from
Shopify's real collection membership, not from tags. It is harmless, but it is also not
doing what its name suggests. Either create a real collection or drop the tag.

## Material tag

One of `titanium`, `niobium`, `surgical-steel` as a product tag. Defaults to `titanium`
if none match — no warning fires for this one, so it's worth double-checking manually.

## Badge tags

`bestseller` and `new` tags drive the `Bestseller` / `New` badges directly — there is no
separate "newest" field derived from `createdAt` or any date. If neither tag is present
but the product has an active compare-at price, it gets a `Sale` badge automatically.
Otherwise no badge. (The shop page's "Newest" sort option groups products carrying the
`new` tag first — it reads the same tag, not a separate signal, so the two cannot drift
out of sync with each other. It also isn't a true chronological sort; it's a grouping.)

## Handle naming

No hard requirement, but the SVG-tag fallback above pattern-matches on substrings like
`necklace`, `pendant`, `earring`, `stud`, `bracelet`, `cuff` — a handle containing one of
these words as a coincidence (not the product's actual category) will silently pick the
wrong fallback illustration if the `svg:` tag is also missing. Another reason to always
set the tag explicitly.

## Variant / pricing rules

All variants of a given product (all ring sizes, all bracelet sizes) are expected to
share **one price** — this catalog does not support per-size pricing. The shop grid
intentionally shows a single flat price per product rather than a "from $X" range,
because every variant genuinely has the same price by design, not because the grid only
reads the first variant.

`availableForSale` is per-variant. When every variant of a product is unavailable, the
product card and detail page show a "Sold Out" state and disable Add to Bag — see
`src/components/product/ProductCard.tsx` and `ProductDetail.tsx`.

## Currency

Set once at the store level in Shopify Admin. The site reads
`priceRange.minVariantPrice.currencyCode` from every product fetch and renders whatever
that is (see `src/lib/utils/formatPrice.ts`) — there is no per-product currency override
in this codebase. Confirm the store's currency matches intent before launch; see
`SHOPIFY_SETUP.md`.
