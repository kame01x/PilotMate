# Subscriptions, Free Trial & Stripe Test Mode

PilotMate subscriptions run entirely through **Stripe Checkout / Billing in
TEST mode**. Access to paid student AI features requires either a valid
subscription (active/trialing) or an administrator-granted **free beta
entitlement**.

## How the trial works

- New students sign up publicly (no invite required) and are offered a free
  trial from the student Billing page after logging in (Stripe Checkout
  collects the card; the card is **not charged today**). The trial-start
  endpoint (`/billing/checkout-at-signup`) is authorized by the student's
  JWT — the server derives the student identity from the verified token, so
  a caller can only start checkout for themselves.
- The trial length comes from `STRIPE_TRIAL_DAYS` (default **7**), passed to
  Stripe as `subscription_data.trial_period_days`. Stripe charges
  automatically only when the trial ends.
- The first billing date is displayed on the Billing page and the success
  page (server-side estimate = now + `STRIPE_TRIAL_DAYS`, exact date comes
  from the webhook-verified `trial_end`).
- **Cancel during the trial → no charge.** The app's cancel button issues an
  immediate Stripe cancellation while `trialing`, and Stripe never invoices a
  canceled trial. (Configure the Billing Portal to "cancel immediately" as
  well if you expose the portal during a trial.)
- The success redirect is **never** trusted as proof of payment; access is
  granted only from verified `checkout.session.completed` /
  `customer.subscription.*` webhook events.
- A **beta entitlement** (`is_beta_tester`) is separate: it needs no payment
  details, is never created automatically, and does not expire with the trial.

## Environment variables (Render → service `pilotmate-api-staging` → Environment)

| Variable | Required | Example / notes |
|---|---|---|
| `STRIPE_SECRET_KEY` | yes | `sk_test_...` — live keys rejected unless `STRIPE_ALLOW_LIVE=true` |
| `STRIPE_PUBLISHABLE_KEY` | yes | `pk_test_...` (safe to expose; returned by `/billing/config`) |
| `STRIPE_WEBHOOK_SECRET` | yes | `whsec_...` from the webhook endpoint Stripe shows you |
| `STRIPE_PRICE_ID_MONTHLY` | for monthly plan | `price_...` created in Stripe **test mode** |
| `STRIPE_PRICE_ID_YEARLY` | optional | `price_...` for the yearly plan |
| `STRIPE_PLAN_MONTHLY_NAME` | optional | display name (default `Monthly`) |
| `STRIPE_PLAN_YEARLY_NAME` | optional | display name (default `Yearly`) |
| `STRIPE_TRIAL_DAYS` | optional | default `7`; change any time (affects new checkouts only) |
| `STRIPE_BILLING_PORTAL_CONFIGURATION_ID` | optional | `bpc_...` if you configure a custom Billing Portal; otherwise the account default is used |
| `STRIPE_ALLOW_LIVE` | optional | default `false` — **do not set `true` without explicit approval** |
| `FRONTEND_BASE_URL` | yes on Render | e.g. `https://pilotmate-frontend-staging.onrender.com` (Checkout return URLs) |
| `SUBSCRIPTION_ENFORCE` | optional | `auto` (default: enforced whenever `ENVIRONMENT != development`), `on`/`true`, `off`/`false`/`0` |

If Stripe is not configured, the app does not crash: `/billing/config`
returns `configured: false` with a setup message, checkout endpoints return a
clear 403, and beta/subscription-independent features keep working.

**Prices are never hardcoded in PilotMate.** Prices, currencies and billing
intervals are defined by the Stripe Price objects; the backend reads them
from Stripe for display only.

## Stripe test-mode setup

1. In the [Stripe dashboard](https://dashboard.stripe.com/test) (Test mode):
   **Product catalog → Create product** (e.g. "PilotMate Monthly"), add a
   **price** — this is the price you approve; copy the `price_...` id.
2. Repeat for a yearly price if wanted.
3. **Developers → API keys**: copy the test `Publishable key` and
   `Secret key`.
4. Add all values above to the Render backend environment.

## Configuring the webhook on Render

1. Stripe dashboard (test mode) → **Developers → Webhooks → Add endpoint**.
2. Endpoint URL: `https://pilotmate-api-staging.onrender.com/webhooks/stripe`
3. Select events:
   - `checkout.session.completed`
   - `customer.subscription.created`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
   - `invoice.payment_failed`
   - `invoice.paid`
4. Copy the endpoint's **Signing secret** (`whsec_test_...`) into
   `STRIPE_WEBHOOK_SECRET` on Render and redeploy the backend.
5. Local development: `stripe listen --forward-to localhost:8000/webhooks/stripe`
   (Stripe CLI) and set `STRIPE_WEBHOOK_SECRET` to the CLI's printed secret.

Webhook processing verifies the `stripe-signature` header, is idempotent
(`stripe_events` ledger keyed by event id + idempotent upserts), and records
subscription state transitions: creation/renewal (`active`/`trialing`),
cancellation (`canceled`, `ended_during_trial` when it happened inside the
trial), payment failure (`past_due`), and trial/period boundaries.

## Creating your administrator account

```powershell
uv run python scripts/create_admin.py
```

Run locally (prompts for email, name, password — never committed). Then open
the frontend → **Log in → Admin** tab (or `/login?role=admin`). Admin routes
and APIs are enforced backend-side (`_require_admin`); students and
instructors receive 403 on every `/admin/*` endpoint.

## Granting free beta access to a tester

1. Log in as Admin → **Users** tab.
2. Find the student (search by name/email/ID).
3. Click **Grant beta** (revoke restores the normal subscription requirement
   unless they also have a valid paid subscription).

Backend enforcement: `POST /admin/beta` is admin-only and audited
(`beta_grant` / `beta_revoke` in the audit log). Students cannot grant
themselves beta or admin — covered by `scripts/test_subscriptions.py`.

## Safe deployment & migration steps

1. Run all tests locally (see below) and `npm run build` in `frontend/`.
2. Commit/push when you approve the work — Render auto-deploys from `main`.
3. Migration (idempotent, additive):
   ```powershell
   uv run python scripts/migrate.py   # local SQLite
   ```
   This ensures the `subscriptions` / `stripe_events` tables and adds
   `students.is_beta_tester` + `students.stripe_customer_id`.
4. **Verify the DB target before any remote run** (see docs/15): run the
   migration against the Render Postgres only when explicitly approved, e.g.
   `DATABASE_URL="postgresql+psycopg://<user>:<pass>@<host>/pilotmate-staging-db" uv run python scripts/migrate.py`
   after confirming the host/db name. Nothing in this change runs remotely
   automatically.
5. **Rollback (reversible)**:
   ```sql
   DROP TABLE IF EXISTS stripe_events;
   DROP TABLE IF EXISTS subscriptions;
   ALTER TABLE students DROP COLUMN IF EXISTS is_beta_tester;
   ALTER TABLE students DROP COLUMN IF EXISTS stripe_customer_id;
   ```
   (Works on PostgreSQL and SQLite ≥ 3.35; removes only the new objects.)

The existing staging Basic Auth gate (`frontend/src/proxy.ts`), JWT auth, and
optional admin-issued invite codes are unchanged. Public signup no longer
requires an invite, and trial checkout is authorized by the student JWT.

## Access policy (server-side, `backend/access.py`)

| Situation | Paid AI features |
|---|---|
| Beta entitlement (granted by admin) | allowed — never expires, no Stripe needed |
| Subscription `trialing` (trial not ended) | allowed |
| Subscription `active` (period not ended) | allowed |
| `past_due` / `unpaid` | denied — "payment failed, update payment method" |
| `canceled` / `expired` | denied — "subscription has ended" |
| No subscription | denied — "subscription required… start your free trial" |

`SUBSCRIPTION_ENFORCE=auto` (default) applies this whenever
`ENVIRONMENT != development`, so local dev stays friction-free while staging
enforces. Enforcement covers `/student/chat`, `/student/technical`,
`/student/debrief`, `/student/preflight`, `/preflight/stream`,
`/preflight/follow-up`, `/preflight/suggest-route`.

## Tests

```powershell
uv run python scripts/test_subscriptions.py   # admin/beta/trial/webhook/checkout guards
uv run python scripts/test_security.py        # + existing suites (sequential)
uv run python scripts/test_lifecycle.py
uv run python scripts/test_rate_limit.py
uv run python scripts/test_api.py
uv run python scripts/test_mass_balance.py
cd frontend; npm run build
```

Manual test-mode verification (needs real test keys): sign up as a student,
log in, start the trial from the Billing page, complete Checkout with card
`4242 4242 4242 4242`, confirm the success page shows price + first billing
date, confirm `/admin/subscriptions` shows `trialing`, then cancel during
trial and confirm **no charge** in the Stripe test dashboard.
