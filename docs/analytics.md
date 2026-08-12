# Analytics

What the storefront measures, why it is first-party, and what is deliberately not here.

## The gap this fills

The site had no analytics of any kind. That matters more for a headless storefront
than for a themed one:

**Shopify's built-in analytics observes the hosted checkout only.** Everything before
the hand-off — every product view, every add-to-bag, every source of traffic — happens
on Vercel, where Shopify cannot see it. Conversion rate was therefore not a number
anyone could compute: the numerator lived in Shopify and the denominator lived nowhere.

## The shape

```
component  →  track(event)  →  consent gate  →  sendBeacon  →  /api/analytics  →  log
```

- **`src/lib/analytics/events.ts`** — a closed union of seven event names with typed
  payloads. Not strings: a typo'd event name is a metric that silently does not exist,
  and nothing anywhere reports its absence. That is this project's signature failure
  shape, the same one behind `material:steel`, the orphaned cache tag and the retired
  API version.
- **`src/lib/analytics/consent.ts`** — pure functions over a stored choice. Default off.
- **`src/lib/analytics/index.ts`** — `track()`. One gate, one sink, one place to change.
- **`src/app/api/analytics/route.ts`** — same-origin sink. Validates against the event
  union, copies an allowlist of fields, rate-limits, and logs structured JSON.

### The seven events

| Event | Fired from | Answers |
|---|---|---|
| `product_viewed` | `ProductDetail` | The denominator. Which pieces get looked at. |
| `collection_viewed` | `/shop/[collection]` | Which categories pull. |
| `search_performed` | `/search` | What people ask for — and whether they find it. |
| `add_to_bag` | `cart.addItem` | Intent. |
| `remove_from_bag` | `cart.removeItem` | Second thoughts, and on what. |
| `checkout_started` | `cart.beginCheckout` | The hand-off Shopify's own analytics picks up from. |
| `checkout_failed` | `cart.failCheckout` | **The one that started this.** |

`checkout_failed` carries the typed `CheckoutError` discriminant. Until now the only
evidence a customer had hit *"Online checkout is temporarily unavailable"* was them
emailing to say so — and `not-configured` (this deployment cannot sell anything) renders
identical copy to `lines-unavailable` (one piece sold out) while being a completely
different problem. All five refusal paths in the cart store go through `failCheckout`,
so the error cannot be shown without also being counted.

## Consent

**The default is off, and nothing is recorded until someone answers.**

The store ships to 29 countries, fourteen of them in the EU (Germany, France, Ireland,
Italy, Spain, the Netherlands, Poland, Portugal, Sweden, Denmark, Finland, Austria,
Belgium, Czechia). A gate that fails open is not a preference question.

Every ambiguous state resolves to *do not track* — unset, corrupted, hand-edited, or
storage entirely unavailable. "We could not tell" has to mean no, which is the same
failure-direction rule that makes an absent `X-Shopify-API-Version` count as drift
([ADR 009](adr/009-api-version-must-be-asserted-not-declared.md)).

The banner sets **no cookie** and says so. The choice lives in `localStorage`, because a
cookie would travel with every request and change how the edge cache treats it. Both
buttons are real buttons of equal weight: a "reject" hidden behind a link is a dark
pattern whatever the copy says.

`e2e/analytics.spec.ts` asserts that a full browsing session — product page, size,
add-to-bag — puts **nothing** on the wire before the visitor answers, and nothing after
Decline. It also asserts the gate *opens* after Allow, because a consent gate only ever
observed saying no is not a gate, it is a feature that does not work.

## What is deliberately not collected

No cookies, no identifiers, no IP address, no user agent, no referrer, no session.
Nothing recorded can be joined back to a person.

The payload is a fixed allowlist rather than a spread of the request body — an open bag
is how PII arrives by accident. `clientIp` is read for rate limiting and never written.

Search queries are the one free-text field, because "what are people searching for" is
the most actionable question a small catalogue can ask of itself. They are lower-cased
and truncated to 64 characters, at the client *and* again at the route: people paste
order numbers and email addresses into search boxes, and a route that trusts its client
for the one free-text field is not validating anything.

## Why first-party, and no third-party tag

Nothing to load, nothing that can block rendering, nothing an extension can break,
nothing leaving the origin the customer is already talking to. It also means the
storefront never changes when the destination does — the client posts to
`/api/analytics`, and that route decides.

Today "decides" means a structured log line, which on Vercel is queryable and retained.
That is enough to answer the questions this store currently cannot answer at all. Piping
the same events onward to a warehouse is a change to one file.

## Not wired: Shopify's own storefront analytics

Sending storefront events into **Shopify Admin's** analytics — so they sit beside the
checkout data rather than in a separate place — is possible, and is not done here.

It requires `sendShopifyAnalytics` from `@shopify/hydrogen-react`, plus a
`storefrontId`, plus Shopify's Customer Privacy API for consent. Three reasons it is a
separate decision rather than part of this change:

1. **A new runtime dependency.** `@shopify/hydrogen-react` is a substantial package to
   add for one function, in a project whose dependency list is currently ten entries.
2. **`storefrontId` is a Hydrogen sales-channel concept.** This store sells through the
   Headless channel (`Healthy Jewellery Store`), and the mapping needs confirming
   against the real store rather than assuming.
3. **Consent would then be answered twice** — once by the banner here and once by
   Shopify's Customer Privacy API. Two consent mechanisms disagreeing is worse than one.

Worth doing. Worth doing on purpose, with the storefront ID in hand.

## Reading the data

```bash
vercel logs <deployment-url> | grep '\[analytics\]'
```

Each line is `[analytics] {json}`, one event, already validated and field-limited.
