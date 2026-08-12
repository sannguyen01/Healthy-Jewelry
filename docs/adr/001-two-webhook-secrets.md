# 001 — Two webhook signing secrets, and the trap between them

## Context

Shopify signs webhook deliveries with one of **two different secrets**, and which one
depends entirely on how the webhook was created:

- a webhook created in **Settings → Notifications** is signed with the **signing secret
  shown on that page**;
- a webhook created **by an app** (Admin API `webhookSubscriptionCreate`) is signed with
  that **app's client secret**.

They are not interchangeable, and nothing in either interface says so. Configuring the
wrong one produces a permanent stream of 401s with no diagnostic signal anywhere: the
deliveries fail, Shopify retries, the retries fail, and the storefront never learns an
order happened.

Two things make it worse than an ordinary misconfiguration:

1. **A wrong secret and a forged request are cryptographically indistinguishable.** The
   route cannot answer differently without telling an attacker which of the two it holds.
2. **The Admin API cannot tell you whether webhooks exist.** `webhookSubscriptions`
   returns only webhooks owned by the *querying app*, so Admin-UI webhooks are invisible
   to it. An empty result is not evidence of absence — a previous session concluded "zero
   webhooks" from exactly that signal and was wrong.

## Decision

The response stays a bare `401`. Only the **log line** names the trap, and only for
requests carrying a plausibly-shaped signature header.

The secret is verified **before** any real order, by `scripts/verify-webhook-secret.mjs`,
which signs a synthetic `products/update` payload and reads the route's status contract
back: `200` correct, `202` correct-but-unhandled-topic, `401` wrong secret, `503` unset.

`products/update` is chosen deliberately — it is a *handled* topic, so a correct secret
returns 200 rather than 202, and its only effect is cache revalidation against a sentinel
handle no product uses.

## Consequences

- The question "is the secret right?" is answerable for free and repeatably. It used to
  cost a real order, and its only signal was an ephemeral Vercel log line someone had to
  be watching for.
- `src/tests/unit/webhook-signature-script.test.ts` feeds the script's own bytes into the
  real `POST()` handler rather than a fixture, so script and route cannot drift.
- The 401 stays uninformative to callers on purpose. Operators get the diagnosis from
  logs; attackers get nothing.

Referenced by: `src/app/api/webhooks/shopify/route.ts`, `docs/webhooks.md`,
`docs/go-live-runbook.md`, `STATE.md`.
