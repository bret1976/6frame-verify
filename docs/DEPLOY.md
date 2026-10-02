# Deploy notes

## Required secrets (Railway)
```
DATABASE_URL
REDIS_URL
APP_BASE_URL
ADMIN_TOKEN
API_ENCRYPTION_KEY
REPORT_SIGNING_PRIVATE_KEY   # optional RSA PEM; falls back to HMAC with API_ENCRYPTION_KEY
STRIPE_SECRET_KEY            # Bret fills after Stripe reconnect (sk_live_...)
STRIPE_WEBHOOK_SECRET        # whsec_...
STRIPE_PUBLISHABLE_KEY
DATABASE_SSL=true            # usually for Railway Postgres
EVIDENCE_DIR=/data/evidence
```

## Stripe webhook endpoint
`POST https://<HOST>/v1/webhooks/stripe`
Events: `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `payment_intent.succeeded`, `charge.refunded`

## Hard rules
- Do not set fake Stripe events in production.
- Without STRIPE_* secrets, `/v1/orders` returns 503 and unpaid jobs return 402.
