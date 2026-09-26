# Runbook — WS-F read-only inventory of the Shopify store

**Owner:** the repository owner (`sannguyen01`). **Workstream:** WS-F. **Status:** blocked — the
connector needs re-authentication. **Delete this runbook when WS-F completes.**

WS-F removes everything whose deletion order is set by Shopify rather than by this repository:
webhook subscriptions, app installations, sales channels, tokens. Every one of those steps is
irreversible or expensive to reverse, and the ordering constraint in
`docs/commerce-dependency-register.md` outranks everything else in the decommission. So the
first thing that happens after the connector comes back is **a read-only inventory, never a
deletion** — what exists, measured, dated, before anybody decides what goes.

## Step 0 — reconnect, and nothing else

The Shopify connector reads `needs_reconnect`. Re-authenticate it in **claude.ai → Settings →
Connectors → Shopify → Reconnect**, signed in as the store owner. That is a human action; an
agent cannot perform it and must not try to work around it.

After reconnecting, an agent may run the queries below **and only those**. Every one is a
`query`. No `mutation` is part of this runbook, and a request to run one is out of scope until
this inventory is recorded and reviewed.

## Step 1 — the queries

Run each through the connector's GraphQL *query* tool, not a mutation tool.

**Which store is this?**

```graphql
query ShopIdentity {
  shop {
    name
    myshopifyDomain
    plan { displayName partnerDevelopment shopifyPlus }
  }
}
```

**Which webhooks will keep firing at `/api/webhooks/shopify`?** This lists only subscriptions
owned by the querying app; ones created in *Settings → Notifications* are invisible to it, so
an empty list is not proof there are none — check that screen by eye too.

```graphql
query WebhookSubscriptions {
  webhookSubscriptions(first: 50) {
    nodes {
      id
      topic
      createdAt
      endpoint {
        __typename
        ... on WebhookHttpEndpoint { callbackUrl }
      }
    }
  }
}
```

**Which apps hold access?**

```graphql
query Apps {
  currentAppInstallation { app { title handle } accessScopes { handle } }
  appInstallations(first: 50) { nodes { app { title handle } } }
}
```

**Which sales channels publish the catalogue?** The headless channel issued the storefront and
customer-account credentials.

```graphql
query Publications {
  publications(first: 20) { nodes { id name } }
}
```

**How much is there, and is any of it personal?**

```graphql
query Counts {
  productsCount { count }
  ordersCount { count }
  customersCount { count }
}
```

`ordersCount` and `customersCount` decide whether WS-H has a retention question at all. The
ledger's `ordersCount: 0` was recorded against the 2026-08-12 compilation; re-measure it here
rather than trusting it.

## Step 2 — reconcile 22 against 17 before any token is revoked

The store held **22** products; the repository's catalogue holds **17**
(`src/content/catalog/products/`). The storefront token is the only credential that can read
product data, and `docs/shopify-decommission-inventory.md` revokes it **last** for exactly this
reason. So before it goes, account for all five:

```graphql
query ProductHandles {
  products(first: 50, sortKey: TITLE) {
    nodes { handle title status }
  }
}
```

Compare the handles against the catalogue filenames:

```sh
ls src/content/catalog/products | sed 's/\.json$//' | sort
```

Each of the five must be written down as either *deliberately not carried* (with the reason —
retired stone or crystal inventory, a duplicate, a draft) or *to be exported* (and exported,
through the catalogue's reviewed-JSON path, before revocation). An unexplained delta is not
"probably fine"; it is a product nobody decided about.

## Step 3 — record, then decide

Write the answers into the table below and into `docs/shopify-decommission-inventory.md`'s
ledger, following that file's rules: **credential names, never values** — not a prefix, not a
masked form; evidence as a dated observation in words, not a screenshot link; weak evidence
labelled as weak. Only after the record is reviewed does the deletion sequence in the register
begin, in its order: subscriptions deleted in Shopify first, the route removed second.

## Evidence

Filled in only when observed. An empty cell is the honest state.

| Question | Answer (in words) | Query | Date | By |
|---|---|---|---|---|
| Connector re-authenticated | | — | | |
| Store identity (`myshopifyDomain`, plan) | | ShopIdentity | | |
| App-owned webhook subscriptions (topics, callback hosts) | | WebhookSubscriptions | | |
| Admin-UI webhooks (Settings → Notifications, by eye) | | — | | |
| Apps with access (titles, scopes) | | Apps | | |
| Publications (sales channels) | | Publications | | |
| `productsCount` | | Counts | | |
| `ordersCount` | | Counts | | |
| `customersCount` | | Counts | | |
| The five products not in the catalogue, each classified | | ProductHandles | | |
