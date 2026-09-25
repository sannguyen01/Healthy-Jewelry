# Commerce Elimination Contract

**Status: in force. Machine-checked on every pull request and on `main`.**
Checked by `scripts/verify-commerce-contract.mjs` · `src/tests/unit/commerce-contract.test.ts` ·
`src/tests/unit/commerce-route-inventory.test.ts` · `e2e/retired-routes.spec.ts`.

Healthy Jewellery is a brand-and-encounter website. It explains three metals, presents nine
geometric forms, carries the travel-memory story, and shows where an encounter with an
ambassador can continue. It does not sell anything, and this document is the enforceable
statement of what that means.

---

## 0. Why a contract and not a commit

Every prohibition in this repository that lived only in prose has been violated at least
once, usually by someone acting in good faith on a different document. `/terms` listed Visa,
Mastercard and PayPal as accepted methods for eleven days after Add to Bag was deleted.
`docs/controls.json` claimed a merge gate that GitHub had never been told about. A pinned API
version was believed for seven months after the vendor retired it.

The generalisation is [ADR 018](docs/adr/018-a-claim-about-a-control-is-not-a-control.md): a
claim about a control is not a control. A decommission is the operation most exposed to it,
because its output is an *absence*, and an absence is exactly the thing nobody notices
returning. A cart component re-added by a future contributor looks like a feature. A Shopify
SDK arriving as a transitive dependency of an image plugin looks like a lockfile churn. A
runbook telling somebody to go and reconnect the storefront looks like documentation.

So this file is parsed rather than read. Every table below is a machine input, addressed by
an HTML anchor so the prose around it can be rewritten without breaking the parse. If the
parser cannot find a section it throws, because a rule enforced against an empty list passes
and checks nothing — this repository's most expensive recurring defect
([ADR 020](docs/adr/020-a-test-that-cannot-fail-is-documentation.md)).

**Classification.** This document is a **specification**, not an agent-facing guide and not a
dated record. It is deliberately outside `EXPLICIT_AGENT_DOCS`, so the numeric-claims sweep
does not read it: every number here is already read by a check, and two mechanisms reconciling
one figure is how the two disagree. Saying so rather than leaving the omission to be found is
[ADR 019](docs/adr/019-an-unclassified-entry-is-an-unverified-one.md)'s rule.

---

## 1. What this website is responsible for

Five things, and it is measured against them:

1. **Explain the materials accurately.** Grade 23 titanium, anodized niobium, 316L surgical
   steel — and only where the claim has supporting documentation behind it.
2. **Present the geometric collection language.** Arc, Halo, Orbit, Facet, Disc, Bar, Cuff,
   Split, Hoop.
3. **Carry the travel-memory story** and show where an ambassador encounter continues.
4. **Offer low-pressure, non-commerce contact paths.** Social profiles, the approved inquiry
   route, ambassador follow-up, location and event information where it exists.
5. **Preserve technical quality.** Mobile performance, accessibility, privacy, SEO, security
   headers, clean deployment, observability, content governance.

## 2. What it is forbidden to be

No Storefront or Admin API traffic at runtime. No catalogue synchronised from a commerce
platform. No cart, checkout, checkout redirect, buy-now control, payment acceleration, order
status, customer account, customer creation, discount code, shipping calculation, tax
calculation, inventory check, transaction webhook, abandoned-cart activity, or conversion
analytics. No purchase-oriented copy that puts the website in competition with an ambassador.
No retention of commerce customer data in application code, environment variables, analytics
destinations, browser storage, exports, build artefacts, logs, caches, issue attachments or CI
artefacts.

**The functional replacement for "Shop" is a Collection or Materials experience.** Item-level
pages may remain as non-transactional editorial records — "Meet the piece" — carrying verified
material, form, care, sizing guidance, imagery and a single gentle follow-up action. They may
not carry stock, price, sale, availability-for-purchase, a purchasing SKU control, a selected
variant, or a fulfilment promise.

---

## 3. Forbidden identifiers

Three scopes, and the distinction is the whole design.

- **`value`** — a credential *value*. A finding in any position, in any file, in any class,
  with no exemption of any kind. Rotate first, then delete.
- **`absolute`** — machinery that cannot exist here at all: carts, checkouts, payments,
  customers, discounts, Storefront and Admin request shapes. No register row excuses one in
  running code.
- **`staged`** — the Shopify name, its hosts and its environment variables. These are still
  present on a declared, shrinking surface, and every file carrying one is named in
  `docs/commerce-dependency-register.md` with an owner and a workstream.

Patterns are JavaScript regular expressions, matched case-insensitively, per line.

<!-- contract:identifiers -->

| ID | Pattern | Scope | Why it is forbidden |
|---|---|---|---|
| `credential-value` | `\bshp(at\|ca\|ss\|pa)_[A-Za-z0-9]{16,}` | value | A token prefix followed by a token body is a live credential, not a credential name. `docs/shopify-decommission-inventory.md` exists so that names can be discussed without values ever being written down. |
| `payment-provider` | `\b(stripe\|paypal\|braintree\|adyen\|klarna\|afterpay\|shop_pay\|shoppay\|vnpay\|zalopay\|momo)\b` | absolute | No payment is taken on this domain. A provider identifier in running code is either a payment path or the beginning of one. |
| `cart-mutation` | `\bcart(Create\|LinesAdd\|LinesUpdate\|LinesRemove\|BuyerIdentityUpdate)\b` | absolute | Cart construction. There is no cart, and a partially rebuilt one is worse than none. |
| `checkout-handoff` | `\b(checkoutUrl\|checkoutCreate\|webUrl)\b` | absolute | The hand-off to a hosted checkout. `/checkout` answers 410 and has no successor. |
| `customer-identity` | `\bcustomerAccessToken\|customerCreate\b` | absolute | Customer accounts were built and never switched on. Reinstating identity reinstates personal data. |
| `discount-machinery` | `\bdiscountCode[A-Z]\|\bpriceRule` | absolute | A discount is a price claim, and this site publishes no prices. |
| `draft-order` | `\bdraftOrder` | absolute | An order of any kind, including one staged on a customer's behalf. |
| `storefront-token-header` | `X-Shopify-Storefront-Access-Token` | absolute | The Storefront API request shape. Its presence means a runtime read path exists. |
| `admin-api-path` | `/admin/api/` | absolute | The Admin API request shape. Highest blast radius of anything here. |
| `graphql-endpoint` | `graphql\.json` | absolute | Both Shopify GraphQL endpoints end in this. A URL is a dependency whether or not a client is installed. |
| `inventory-check` | `\b(availableForSale\|inventoryQuantity\|inventoryLevel)\b` | absolute | Stock. The catalogue's honest answer is `ask-an-ambassador`, which is a statement rather than a reading. |
| `shopify-name` | `shopify` | staged | The vendor name, anywhere in running code. |
| `shopify-host` | `myshopify\.com` | staged | The storefront hostname, including in configuration and tests. |
| `shopify-env` | `\bSHOPIFY_[A-Z0-9_]+` | staged | Environment variable names. Removing the variable without removing the read leaves a silent empty string. |

<!-- /contract:identifiers -->

### The rule that makes this usable

A finding is a function of the identifier **and the position it occupies**, never of the
identifier alone. A flat "fail on `shopify`" scan calls
`src/tests/unit/browse-only-copy.test.tsx` a defect — and that file is the check that forbids
the word. A guardrail that fails on its own guardrails gets exemptions added until it is
quiet, which is the ADR 011 muting pattern pointed at a linter.

So: `code` is a token outside comments in a file that executes; `prose` is a comment or
Markdown. A comment inside a code file is **free**, deliberately. The comment above
`src/app/api/webhooks/shopify/route.ts` explaining why that route is still standing is the
most useful sentence in it, and a rule that deletes it makes the decommission harder to
finish rather than closer to done.

---

## 4. Position classes

Every tracked file has a class. The default is `executable`, which means **a new file is a
defect until somebody classifies it** — unexamined is not a third state. Globs are evaluated
in order and **last match wins**, so the table reads as a rule followed by its exceptions
rather than the reverse.

<!-- contract:positions -->

| Glob | Class | Why |
|---|---|---|
| `pnpm-lock.yaml` | excluded | Machine-generated, 212 KB, and audited by `auditPackages` against a parsed package set rather than by line scanning. |
| `public/**` | excluded | Binary assets. Fonts and photographs have no comment syntax and no commerce semantics. |
| `.gitignore` | excluded | No extension, no comment grammar worth declaring for one file. |
| `.prettierrc` | excluded | JSON without an extension; formatting configuration carries no commerce surface. |
| `docs/adr/**` | historical | An ADR is a dated decision and is never edited to match the present. Seventeen of them mention Shopify correctly. |
| `CHANGELOG.md` | historical | A log of what happened. Rewriting it to match today falsifies the account. |
| `STATE.md` | historical | The engineering record, explicitly historical by construction. |
| `dependency-sweeper-state.md` | historical | A dated sweep record. |
| `docs/browse-only-masterplan.md` | historical | The predecessor plan, self-classified historical in its own header. |
| `docs/headless-launch-inventory.md` | historical | Evidence: what the store contained on 2026-08-12. Banner already present. |
| `docs/shopify-decommission-inventory.md` | historical | The credential ledger. Names credentials, never values, and says so. |
| `docs/credential-inventory.md` | historical | What exists and what it reaches, as measured. |
| `docs/catalog-conventions.md` | superseded | Rules for editing products in Shopify Admin. |
| `docs/go-live-runbook.md` | superseded | Leads to a working checkout that will not exist. |
| `docs/webhooks.md` | superseded | Every subscription in it is scheduled for deletion. |
| `docs/shopify-policies/**` | superseded | Policy drafts to be pasted into Shopify Admin. |
| `SHOPIFY_SETUP.md` | superseded | Describes switching Shopify on. |
| `COMMERCE-ELIMINATION-CONTRACT.md` | specification | This file names every identifier it forbids, and is the input the scanner parses. |
| `docs/commerce-dependency-register.md` | specification | The register names the paths it tracks, and is the scanner's second input. |
| `scripts/lib/commerce-contract.mjs` | negative-control | The scanner. |
| `scripts/verify-commerce-contract.mjs` | negative-control | Its driver. |
| `src/tests/unit/commerce-contract.test.ts` | negative-control | Its tests, including the mutations that prove it can fail. |
| `src/tests/unit/commerce-route-inventory.test.ts` | negative-control | Reconciles §6 and §7 against the filesystem, `next.config.ts` and the E2E spec. It has to name the one handler excluded from the public inventory in order to justify the exclusion. |
| `src/tests/unit/browse-only-copy.test.tsx` | negative-control | Forbids payment-method copy by naming the methods. |
| `src/tests/unit/catalog-content.test.ts` | negative-control | Forbids commerce fields in catalogue JSON by naming them. |
| `src/tests/unit/price-absence-contract.test.tsx` | negative-control | Forbids currency symbols by listing them. |
| `scripts/lib/browse-only.mjs` | negative-control | The live probe that reports `shopify-host-referenced`. It must name the host it looks for. |
| `src/tests/unit/browse-only-smoke.test.ts` | negative-control | Drives that probe against fixtures where the host is present and absent. |
| `scripts/lib/canonical-domain.mjs` | negative-control | Detects the apex resolving into Shopify's redirect chain. |
| `src/tests/unit/canonical-domain-decision.test.ts` | negative-control | Drives it against a chain that ends at `shops.myshopify.com`. |
| `e2e/retired-routes.spec.ts` | negative-control | Asserts, over real HTTP, that the commerce URL space is gone. |
| `src/tests/unit/soft-404-premise.test.ts` | negative-control | Watches a decision whose premise the decommission expires. |
| `src/tests/unit/secret-exposure.test.ts` | negative-control | Walks the client import graph and fails if a secret becomes reachable. |
| `src/tests/unit/decommission-inventory.test.ts` | negative-control | Reconciles the credential ledger against the inventory, in both directions. |
| `src/tests/unit/dependency-scope.test.ts` | negative-control | Rejects dependency scope creep; names `@shopify` as the case it rejects. |

<!-- /contract:positions -->

A `superseded` document must carry a **dated supersession banner in its first 15 lines**. The
class is what exempts the file; the banner is what earns the class. Without it the exemption
is silent, and a silent exemption is how an obsolete runbook reads as current.

A `negative-control` file must contain an assertion. The strongest exemption in this contract
cannot be granted to a file that checks nothing.

A `specification` file must be **named in the code of some other tracked file**. The class
exists because a document that lists every forbidden identifier cannot also assert — it is the
input a check reads, not the check — and an exemption with no earning condition is the one
everybody reaches for. Naming it in a comment is a citation; naming it in an import or a path
constant is a *read*, and only the second breaks when the document changes shape.

Every glob must match at least one tracked file. A glob matching nothing is either a typo —
in which case the files it was meant to cover are silently falling through to `executable` —
or a rule that outlived its subject, which is
[ADR 035](docs/adr/035-a-control-outlives-its-subject.md).

---

## 5. Prohibited packages

No commerce SDK may be a dependency, declared or transitive. The lockfile is checked as well
as the manifest, because a commerce SDK does not usually arrive as a deliberate install: it
arrives inside an image plugin, a form service or an analytics wrapper added for an unrelated
reason.

<!-- contract:packages -->

| Pattern | Why |
|---|---|
| `^@shopify/` | Every Shopify SDK, Hydrogen, the Storefront client, the CLI and the App Bridge. |
| `^shopify` | Community clients published outside the scope. |
| `^@stripe/\|^stripe$` | Payment processing. |
| `^braintree\|^@paypal/\|^paypal-` | Payment processing. |
| `^@adyen/\|^klarna\|^afterpay` | Payment processing. |
| `^@commercetools/\|^@medusajs/\|^swell-js$\|^snipcart` | Alternative commerce backends. Removing one vendor to adopt another is not a decommission. |
| `^use-shopping-cart$\|^react-use-cart$\|^shopping-cart` | Cart state. |
| `^easypost\|^shippo\|^@taxjar/\|^avatax` | Shipping and tax services. |

<!-- /contract:packages -->

---

## 6. Approved public route inventory

Every route the site serves, and the status it must answer. Reconciled against the filesystem
in both directions by `src/tests/unit/commerce-route-inventory.test.ts`: a route on disk and
absent here fails, and a route here and absent on disk fails.

<!-- contract:routes-approved -->

| Route | Kind | Status |
|---|---|---|
| `/` | page | 200 |
| `/about` | page | 200 |
| `/contact` | page | 200 |
| `/faq` | page | 200 |
| `/legal` | page | 200 |
| `/materials` | page | 200 |
| `/privacy` | page | 200 |
| `/products/[handle]` | page | 200 |
| `/search` | page | 200 |
| `/shipping` | page | 200 |
| `/shop` | page | 200 |
| `/shop/[collection]` | page | 200 |
| `/stores` | page | 200 |
| `/terms` | page | 200 |
| `/api/analytics` | route | 200 |
| `/api/contact` | route | 200 |
| `/api/health` | route | 200 |
| `/api/revalidate` | route | 200 |
| `/api/sitemap` | route | 200 |
| `/api/version` | route | 200 |

<!-- /contract:routes-approved -->

**`/api/webhooks/shopify` is deliberately absent from this table.** It answers only to an
HMAC-signed delivery, so it is not a public route; it is in the register instead, retained
under WS-F's ordering and scheduled for deletion rather than for approval.

`/api/revalidate` **is** listed, and that is not an endorsement. It is a route this deployment
currently serves, and the table's job is to be exhaustive about what the site answers — an
inventory that quietly omitted a live endpoint would be worth less than no inventory. It
carries a register row saying it goes.

## 7. Forbidden route inventory

What every retired URL answers, and why that status rather than another. Asserted over real
HTTP with `maxRedirects: 0` in `e2e/retired-routes.spec.ts` — `toHaveURL()` passes on a soft
200 that merely renders the destination, and the word "Gone" on an HTTP 200 is an indexable
page for a capability that does not exist.

<!-- contract:routes-forbidden -->

| Route | Status | Location | Why |
|---|---|---|---|
| `/cart` | 308 | `/shop` | A bag becomes the shelf it was filled from. |
| `/cart/:path*` | 308 | `/shop` | Shopify's `/cart/add` and `/cart/change` endpoints, reachable from any cached page. |
| `/account` | 308 | `/contact` | A login becomes the person who replaces it. |
| `/account/:path*` | 308 | `/contact` | Order history, addresses, saved payment methods. |
| `/checkout` | 410 | — | A withdrawn capability has no successor. 410 is final where 404 invites re-crawling. |
| `/checkouts/:path*` | 410 | — | Shopify's hosted checkout URL space, carried in old emails. |
| `/orders/:path*` | 410 | — | Order status. This site never had one and must not imply it can find one. |
| `/discount/:path*` | 410 | — | A discount link is a price promise on a site that publishes no prices. |
| `/collections` | 308 | `/shop` | Shopify's collection index. |
| `/collections/:path*` | 308 | `/shop` | Indexed collection URLs. A shelf still exists, so this redirects rather than 410s. |
| `/policies/:path*` | 308 | `/legal` | The policy pages Shopify's checkout linked. Real successors exist. |
| `/stones` | 308 | `/` | Pre-repositioning URLs from before the brand was titanium-only. The homepage is the successor because the *category* is gone, not one page of it. |
| `/crystals` | 308 | `/` | As `/stones`: healing-crystal inventory this brand no longer sells and whose copy the PROHIBITED list forbids outright. |
| `/stones/:path*` | 308 | `/` | Every indexed product and collection URL beneath the retired category, none of which has an equivalent piece. |
| `/crystals/:path*` | 308 | `/` | As `/stones/:path*`. A per-item map would imply a titanium successor for each crystal, and there is none. |
| `/api/shopify` | 404 | — | Never a public contract; the proxy existed only for the cart. |
| `/api/auth/login` | 404 | — | Customer OAuth is gone. |
| `/api/auth/logout` | 404 | — | Customer OAuth is gone. |
| `/api/auth/callback` | 404 | — | Customer OAuth is gone. |

<!-- /contract:routes-forbidden -->

**Why `/account` redirects while `/checkout` does not.** The rule is not "redirect is softer
than 410". It is *does a destination exist that answers the visitor's actual question*. A bag
and a login both have one. A checkout does not, and sending somebody to `/shop` after they
clicked Checkout tells them nothing about why they cannot buy.

---

## 8. Permitted content data model

The catalogue record is defined by `src/lib/catalog/schema.ts` and validated through Zod at
module load, so a malformed record fails the build rather than rendering a page with a hole in
it. The fields below are the permitted set. Absence is an explicit, countable state — never a
blank — because `undefined` reads as "no care instructions exist", which is itself a claim.

**Permitted:** `handle`, `title`, `collection`, `material`, `materialLabel`, `description`,
`specification`, `sizes`, `availability`, `badge`, `media`, `careInstructions`, `sku`,
`lastReviewed`, `legacyRedirects`.

**Forbidden outright** — a field that cannot be true of a catalogue nobody can buy from does
not get a nullable column. It is left out, so a page trying to render one fails to compile.

<!-- contract:content-forbidden -->

| Field | Why |
|---|---|
| `price` | Nothing on this site can be bought. |
| `compareAtPrice` | A sale is a comparison between two prices. |
| `currencyCode` | There is no amount for a currency to qualify. |
| `availableForSale` | Stock inherited from an inventory system that will not exist. |
| `inventoryQuantity` | As above, with a number attached. |
| `variants` | A variant exists to be selected for purchase. |
| `defaultVariantId` | As above. |
| `checkoutUrl` | The hand-off itself. |
| `sellingPlan` | Subscription commerce. |
| `taxCode` | Tax applies to a transaction. |
| `shippingClass` | Fulfilment is arranged by a person. |
| `discountEligibility` | A discount is a price claim. |

<!-- /contract:content-forbidden -->

**Claim evidence is mandatory.** A material, corrosion or skin-safety statement renders only
where evidence is referenced. Where it is absent the UI renders a conservative, non-promotional
fallback; it never generates a claim from a material name. "Grade 23 titanium" is a
specification. "Safe for sensitive skin" is a claim, and a claim needs a source.

**The 80/20 split.** Locked core: the naming vocabulary, material statements, approved
photography standards, fixed brand visuals. Localised: regional language, sizing guidance,
locally approved ambassador contact paths, local event and location information. A localised
field may not reintroduce a prohibited commercial statement — which is why the forbidden-copy
check runs against rendered output and not only against source.

---

## 9. Deletion-domain owners

Each domain has one named technical owner. An unassigned escalation is not yet escalated
([ADR 012](docs/adr/012-an-unassigned-escalation-is-not-yet-escalated.md)), and the same is
true of a deletion.

<!-- contract:owners -->

| Domain | Owner | Accountable for |
|---|---|---|
| Application | `WS-A` | Routes, components, API handlers, configuration, client bundles. |
| Content | `WS-B` | The catalogue schema, records, claim evidence, copy, the geometric vocabulary. |
| CI/CD | `WS-C` | Workflows, gates, the scanner, dependency and secret auditing. |
| Infrastructure | `WS-D` | Vercel projects, environment variables, headers, CSP, caches, image configuration. |
| DNS | `WS-E` | Apex and `www` behaviour, the checkout hostname, CAA, TLS, canonical host. |
| Third-party access | `WS-F` | Shopify apps, tokens, webhooks, sales channels, automations, feeds. |
| Analytics and privacy | `WS-G` | Event schema, destinations, consent, retention, cookie and storage keys. |
| Data retention | `WS-H` | Archival, lawful basis, retrieval ownership, account closure evidence. |
| Documentation | `WS-I` | This contract, the register, ADRs, runbooks, the record. |

<!-- /contract:owners -->

---

## 10. Completion conditions

The decommission is complete when every one of these is true and each is demonstrated by the
check beside it — not inferred from a successful deploy.

| # | Condition | Demonstrated by |
|---|---|---|
| 1 | A clean clone installs, builds, tests and deploys with no commerce credential present | `verify` on a fresh checkout with no Shopify variables |
| 2 | No runtime — production, preview or local — calls a commerce, payment, shipping, tax or inventory service | Playwright network log; runtime logs |
| 3 | No visitor can transact, build a cart, start a checkout, see an account, or retrieve a price or stock offer through any URL, cache, API or bundle | `e2e/retired-routes.spec.ts`; the browse-only smoke |
| 4 | Every legacy commerce path has a deliberate, tested outcome | §7, asserted by status code |
| 5 | The scanner reports zero blocking findings with an empty register | `pnpm verify:commerce-contract` |
| 6 | No commerce package is declared or locked | `auditPackages` |
| 7 | No commerce environment variable or CI secret remains | `pnpm audit:secrets`; `vercel env ls` |
| 8 | Material claims render only against referenced evidence | content-schema validation |
| 9 | Every form and analytics event reaches only an approved Company-controlled system | privacy owner's sign-off, recorded |
| 10 | Historical record retention, retrieval ownership and account closure are documented and approved | `docs/shopify-decommission-inventory.md`, every row dated with evidence |

Condition 5 is the one that keeps the rest true. The others are states; this one is a
*ratchet*, and it is the reason the register may only ever shrink.

---

## 11. How to change this contract

Adding a prohibition is ordinary work. **Removing one is not.** A row deleted from §3 or §7
silently re-permits a capability, and the diff that does it looks like tidying.

So: a change that weakens this contract must say, in the pull request body, which capability it
re-permits and who approved it. A change that adds a register row must name the workstream that
will remove it. A change that adds a `superseded` or `negative-control` classification must
carry the banner or the assertion that earns it — the checks will refuse it otherwise, which is
the point.
