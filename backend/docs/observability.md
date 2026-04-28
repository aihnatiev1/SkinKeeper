# Observability — SkinKeeper Backend

## Sentry Setup

### Account & project

1. Create a Sentry account at sentry.io (free tier covers ~5K errors/month).
2. Create a new project: Platform = Node.js.
3. Go to Project Settings → Client Keys (DSN). Copy the DSN value.

### Environment variables

Set these on the VPS (edit `/etc/environment` or PM2 ecosystem config):

```
SENTRY_DSN=https://<key>@o<org>.ingest.sentry.io/<project-id>
SENTRY_RELEASE=<git-commit-sha>   # CI sets this automatically
```

If `SENTRY_DSN` is unset:
- In development: Sentry is silently disabled. No events sent, no errors thrown.
- In production: a `console.error` is logged at boot warning that error tracking is disabled.

### Release tagging (CI)

Every deploy should set `SENTRY_RELEASE` to the git SHA so Sentry can link errors to specific commits:

```bash
export SENTRY_RELEASE=$(git rev-parse HEAD)
pm2 restart skinkeeper-api
```

Or in your deploy script:

```bash
SENTRY_RELEASE=$(git rev-parse HEAD) pm2 reload ecosystem.config.cjs
```

---

## Viewing errors in production

1. Open sentry.io → your project → Issues.
2. Filter by `component` tag to narrow scope:
   - `component:autoSell` — auto-sell engine errors
   - `component:iap` — in-app purchase errors
   - `component:priceJob` — cron job failures
   - `component:migration` — boot-blocking migration failures (level: fatal)
3. Click any issue to see the full stack trace, request context, and the linked user id.

---

## Alerts

### Recommended alert rules (set up in Sentry → Alerts → Create Alert)

**Alert 1: Auto-sell errors spike**
- Condition: `tags[component] = autoSell` AND `count() > 5` in 15 minutes
- Action: Send to Slack `#skinkeeper-ops`
- Why: Auto-sell fires every 15 min across all users. A spike means the engine is failing per-rule, likely a DB or Steam session issue.

**Alert 2: IAP activation failure**
- Condition: `tags[component] = iap AND tags[flow] = activation` AND `count() > 1` in 1 hour
- Action: Page immediately (PagerDuty or email)
- Why: A user paid but may not have received Premium. Every occurrence is a potential support ticket.

**Alert 3: Fatal migration failure**
- Condition: `level = fatal AND tags[component] = migration`
- Action: Page immediately
- Why: If this fires, the process could not start and the API is down.

**Alert 4: Any new issue (error volume)**
- Condition: New issue with `level = error` appears
- Action: Slack notification
- Why: Catches regressions on deploy.

---

## Dashboard: auto-sell health

In Sentry → Dashboards → Create Dashboard, add these widgets:

| Widget | Query | Chart |
|---|---|---|
| Auto-sell errors (7d) | `tags[component]:autoSell` | Line chart, count |
| IAP errors (7d) | `tags[component]:iap` | Line chart, count |
| Price job failures (7d) | `tags[component]:priceJob` | Bar chart |
| Errors by phase | `tags[component]:autoSell group:tags[phase]` | Table |
| Affected users (autoSell) | `tags[component]:autoSell` | Count unique users |

---

## What each capture point means

| Location | Sentry tag | Severity | Runbook note |
|---|---|---|---|
| `autoSellEngine.evaluateRules` per-rule catch | `autoSell / evaluate` | error | Rule evaluation failed; check DB connectivity and Steam session for the affected account |
| `autoSellEngine.executeListing` catch | `autoSell / execute` | error | Listing failed after cancel window; user's item was NOT sold; check sellOperations logs |
| `autoSellEngine.registerAutoSellCron` cron catch | `autoSell / cron` | error | Full cron cycle failed; no rules evaluated this tick |
| `purchases.verifyAppleReceipt` | `iap / apple` | error | Unexpected exception during Apple receipt parse |
| `purchases.activatePremium` | `iap / activation` | error | DB write failed after verified purchase — user paid but may not have Premium |
| `priceJob` cron catches | `priceJob / <source>` | error | Individual cron job failed; price data may be stale |
| `migrationRunner` apply failure | `migration` | fatal | Boot-blocking; API will not start; fix migration SQL and redeploy |

---

## Validating Sentry is working in production

After setting `SENTRY_DSN` and deploying:

1. Trigger a test error via the Node.js REPL or a temporary route:

```bash
# SSH to VPS, then:
node -e "
const Sentry = require('@sentry/node');
Sentry.init({ dsn: process.env.SENTRY_DSN });
Sentry.captureException(new Error('test from prod validation'));
setTimeout(() => process.exit(0), 2000);
"
```

2. Check sentry.io → Issues. The test error should appear within 30 seconds.

3. Delete the test issue in Sentry after confirming it arrived.

---

## Privacy constraints

- `sendDefaultPii: false` — Sentry does not capture request IPs, cookies, or headers by default.
- `Sentry.setUser({ id: String(userId) })` — only the numeric user id is tagged; no email, no Steam id, no display name.
- `beforeSend` hook: strips `Authorization` header if it appears in any manually-attached request context.
- `beforeSend` hook: redacts the `google-rtdn-<token>` path segment from event URLs.
- Steam session cookies are never in Sentry event payloads — they are not logged and not attached to requests as structured data.
