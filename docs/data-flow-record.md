# Data flow record

**Compiled 2026-09-25 by WS-G from the code at that commit. Not reviewed by a privacy owner
yet, and the sign-off table at the end says so.**

This record lists every flow of visitor data this website starts, one table per flow, with
the facts a privacy review needs. It is the evidence for completion condition 9 of
`COMMERCE-ELIMINATION-CONTRACT.md` §10: *every form and analytics event reaches only an
approved Company-controlled system*. It sits beside the privacy page (`/privacy`), which
tells visitors the same facts in plain language, and `docs/analytics.md`, which covers the
event schema in depth.

## How to read the cells

- A fact the code establishes cites the file that establishes it.
- A fact that only a provider console or a contract can establish, such as who holds an
  account, how long a platform keeps a log, or what a plan's terms say, reads **not yet
  decided — WS-G/WS-H**. The repository cannot know it, and an invented period is worse than
  a blank one: it reads as a decision somebody made.
- Every lawful basis reads **pending adviser review**. WS-H puts the whole record to a
  qualified adviser. A basis chosen by whoever wrote the table is not a legal position.
- An empty sign-off cell is the honest state. The credential ledger follows the same rule: a
  row is closed by a date and a piece of evidence, never by a cell someone filled in to make
  the table look finished.

## 1. Contact form

| | |
|---|---|
| Fields collected | Name, email address, subject and message, as typed into `/contact` (`src/components/contact/ContactForm.tsx`). Validated and bounded server-side (`src/lib/utils/contactValidation.ts`, 8 KB body cap in `src/app/api/contact/route.ts`) |
| Purpose | To let a visitor reach the Company without a commerce path. Replies go to the visitor's own address |
| Provider | Resend (email delivery), called from `POST /api/contact` |
| Storage location | Not stored by this website. It is delivered as one email to the Company inbox (`CONTACT_EMAIL`, `src/config/site.ts`), with the visitor's address as `replyTo`. What Resend keeps of a sent message, and for how long: not yet decided — WS-G/WS-H |
| Logs | Failures only, as `{ name, statusCode }` or an error class name, in Vercel function logs. No name, address, subject or message. `src/tests/unit/api-contact-route.test.ts` sweeps every failure path for them. Successful sends are not logged |
| Access roles | Whoever reads the Company inbox, and whoever holds the Resend account: not yet decided — WS-G/WS-H |
| Deletion procedure | Delete the email from the Company inbox, and the message record in Resend if it keeps one. No procedure is written down: not yet decided — WS-G/WS-H |
| Retention period | Not yet decided — WS-G/WS-H |
| Lawful basis | Pending adviser review |

## 2. Analytics events

| | |
|---|---|
| Fields collected | Only after the visitor chooses Allow. `product_viewed` carries handle, collection and material. `collection_viewed` carries collection and product count. `search_performed` carries the result count and the collections or metals the query named (`searchFacets()`) — never the query, since 2026-09-27. Every value is validated against the catalogue and anything else drops the whole event. No identifier, cookie, IP address, user agent or referrer is in the record (`src/lib/analytics/events.ts`, `src/app/api/analytics/route.ts`) |
| Purpose | To learn which pieces, collections and searches draw attention. There is no conversion to measure (`docs/analytics.md`) |
| Provider | Vercel, as the host of the function that writes the log line. There is no analytics vendor |
| Storage location | One `[analytics] {json}` line per event in Vercel function logs, and nowhere else. The consent answer itself is one `localStorage` entry, `hj-analytics-consent`, in the visitor's own browser. It is never sent to the server |
| Logs | The log line *is* the storage. Separately, the hosting platform's request logs record every URL served, including `/search?q=…`; that is platform logging outside this pipeline, listed so it is not mistaken for absent |
| Withdrawal | "Measurement preferences" in the footer of every page and on `/privacy` reopens the consent prompt; Decline stops the next event. Records already written are not deleted by it |
| Access roles | Members of the Vercel project with log access: not yet decided — WS-G/WS-H |
| Deletion procedure | None exists from this repository. Because a record carries no identifier, no record can be found for a particular person who asks. That is a consequence of the design, not a procedure |
| Retention period | Vercel's function-log retention for the plan in use: not yet decided — WS-G/WS-H |
| Lawful basis | Pending adviser review. The collection is consent-gated in code: default off, and every ambiguous state reads as no (`src/lib/analytics/consent.ts`) |

## 3. Rate limiting

| | |
|---|---|
| Fields collected | The client IP address, read from `x-forwarded-for` or `x-real-ip` (`clientIp` in `src/lib/utils/rateLimit.ts`), on `/api/contact`, `/api/analytics`, `/api/health` and `/search` |
| Purpose | To stop abuse of a paid email API and of public endpoints |
| Provider | Upstash (Redis), where `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` are set. Otherwise, the memory of the server instance that handled the request |
| Storage location | A counter keyed by a **derived** key, never by the address. The key is HMAC-SHA256 under `RATE_LIMIT_KEY_SECRET` when that is set to 32 characters or more (`keyed`), and otherwise SHA-256 of a fixed, versioned prefix and the IP (`unkeyed`). The second is pseudonymous, not anonymous, because the prefix is public and the IPv4 space can be enumerated. `/api/health` reports which mode is live as `ipKeying` |
| Logs | A limiter that cannot reach Upstash logs its prefix and posture, with the client error, at error level in Vercel function logs. The IP is not in that line |
| Access roles | Holders of the Upstash account and of its REST token, which lives in the Vercel environment: not yet decided — WS-G/WS-H |
| Deletion procedure | Mechanical expiry (below). No manual procedure exists or is needed while the expiry holds |
| Retention period | Mechanical, from the code. Upstash's sliding-window script sets each key to expire after twice the window plus one second: just over two hours for `/api/contact` (a one-hour window) and just over two minutes for the others (one-minute windows). Without Upstash, a counter lives in instance memory until it is swept or the instance is recycled. Whether that satisfies policy: not yet decided — WS-G/WS-H |
| Lawful basis | Pending adviser review |

## 4. Hosting logs

| | |
|---|---|
| Fields collected | What the host records when it serves any request. This includes the IP address, the requested path, the time and the user-agent. The platform's exact field list is not verified from this repository. The function-log lines this code writes are listed in flows 1 to 3, plus the retained commerce webhook route's order-event summaries (register, WS-F), which carry no customer name, email or address |
| Purpose | Serving the site, and operating it: errors, diagnostics, the analytics lines above |
| Provider | Vercel |
| Storage location | Vercel's platform request logs and function logs |
| Logs | The flow *is* the logs |
| Access roles | Members of the Vercel project: not yet decided — WS-G/WS-H |
| Deletion procedure | Not yet decided — WS-G/WS-H |
| Retention period | Vercel's retention for the plan in use: not yet decided — WS-G/WS-H |
| Lawful basis | Pending adviser review |

## What would change this record

Any of the following changes this file, the privacy page and `docs/analytics.md` in the
same commit:

- a new event, or a new field on an existing one;
- a new destination for any flow;
- a new form;
- a change to how the IP is derived.

A flow this record does not list is a flow nobody approved.

## Sign-off

| Flow | Privacy owner | Date | Evidence |
|---|---|---|---|
| 1. Contact form | | | |
| 2. Analytics events | | | |
| 3. Rate limiting | | | |
| 4. Hosting logs | | | |
