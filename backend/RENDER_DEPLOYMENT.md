# Render Deployment & Production Data Safety Guide

## CRITICAL: Current State Assessment

**Current Issues:**
- Schema uses SQLite (`provider = "sqlite"`) - NOT suitable for Render production
- No migration files exist (using `db push` which is unsafe for production)
- `start:prod` uses `db push --skip-generate` which can cause data loss

**Required Changes Before Production:**
1. Switch to PostgreSQL for production
2. Create initial migration from current schema
3. Update deployment scripts

---

## 1. Render-Specific Release Checklist

### Pre-Release (Every Deploy)

```
[ ] Code changes reviewed and tested locally
[ ] TypeScript compiles without errors: `bun run typecheck`
[ ] If schema changed:
    [ ] Migration created: `bunx prisma migrate dev --name <description>`
    [ ] Migration is ADDITIVE (no drops, no NOT NULL without defaults)
    [ ] Migration tested on staging first
[ ] Environment variables verified (no secrets in code)
[ ] Cron job secrets match between environments
```

### Deploy Process

```
[ ] Push to staging branch first
[ ] Verify staging deployment succeeds
[ ] Test critical flows on staging:
    [ ] User login works
    [ ] Invoice generation works
    [ ] Cron endpoints respond (with secret)
[ ] Create PR to main/production branch
[ ] Monitor Render deploy logs
[ ] Verify production health: GET /health returns 200
[ ] Spot-check one critical flow in production
```

### Post-Deploy

```
[ ] Check Render logs for errors (first 5 minutes)
[ ] Verify cron jobs run at scheduled time
[ ] If issues: rollback via Render dashboard immediately
```

---

## 2. Database Setup for Render

### Production: Render PostgreSQL

**Create Render PostgreSQL Database:**
1. Render Dashboard → New → PostgreSQL
2. Name: `ga-developments-db-prod`
3. Region: Same as your web service (e.g., Oregon)
4. Plan: Starter ($7/mo) or Standard ($20/mo) for production
5. Copy the **Internal Database URL** (starts with `postgres://`)

**Environment Variable:**
```
DATABASE_URL=postgres://user:password@host:port/dbname
```

### Staging: Separate PostgreSQL Instance

Create a second database:
- Name: `ga-developments-db-staging`
- Use the cheapest plan (Starter)

---

## 3. Schema Migration: SQLite → PostgreSQL

### Step 1: Update schema.prisma for PostgreSQL

```prisma
datasource db {
  provider = "postgresql"  // Changed from "sqlite"
  url      = env("DATABASE_URL")
}
```

### Step 2: Create Initial Migration

```bash
# In backend directory
bunx prisma migrate dev --name init
```

This creates `prisma/migrations/YYYYMMDD_init/migration.sql`

### Step 3: Update package.json Scripts

```json
{
  "scripts": {
    "start:prod": "npx prisma migrate deploy && npx prisma generate && node dist/index.cjs",
    "db:migrate:deploy": "bunx prisma migrate deploy",
    "db:migrate:create": "bunx prisma migrate dev --create-only --name",
    "db:migrate:status": "bunx prisma migrate status"
  }
}
```

**IMPORTANT:** `migrate deploy` is safe for production (only applies pending migrations, never resets).

---

## 4. Migration Execution on Render

### Automatic (Recommended)

Migrations run automatically via `start:prod` script:
```
npx prisma migrate deploy && npx prisma generate && node dist/index.cjs
```

Render executes this on every deploy. If migration fails, the deploy fails (safe).

### Manual (For Major Changes)

1. SSH into Render shell or use Render's Shell tab
2. Run: `npx prisma migrate deploy`
3. Then deploy the new code

### Safe Migration Patterns

**Adding a column:**
```sql
-- Migration 1: Add nullable column
ALTER TABLE "User" ADD COLUMN "newField" TEXT;

-- Migration 2 (later): Backfill data
UPDATE "User" SET "newField" = 'default' WHERE "newField" IS NULL;

-- Migration 3 (later): Add NOT NULL constraint
ALTER TABLE "User" ALTER COLUMN "newField" SET NOT NULL;
```

**Never do this in production:**
```sql
-- DANGEROUS: Will fail if table has data
ALTER TABLE "User" ADD COLUMN "required" TEXT NOT NULL;

-- DANGEROUS: Data loss
DROP TABLE "OldTable";
```

---

## 5. Backups & Restore (Render PostgreSQL)

### Enable Automated Backups

1. Render Dashboard → Your PostgreSQL database
2. Settings → Backup → Enable Daily Backups
3. Retention: 7 days (default) or longer for production

**Cost:** Included in paid plans, small fee for Starter plan.

### Manual Backup (Before Risky Operations)

```bash
# From local machine with psql installed
pg_dump $DATABASE_URL > backup_$(date +%Y%m%d_%H%M%S).sql
```

### Restore Procedure

**Option A: Restore to Same Database (Downtime)**

1. Render Dashboard → Database → Backups
2. Select backup → Restore
3. Estimated time: 1-5 minutes for small DBs
4. App will be unavailable during restore

**Option B: Restore to New Database (Minimal Downtime)**

1. Create new PostgreSQL instance on Render
2. Render Dashboard → New DB → Backups → Restore from backup
3. Update `DATABASE_URL` env var on web service
4. Redeploy web service
5. Downtime: ~30 seconds (just the redeploy)

**Option C: Point-in-Time Recovery (Render Pro)**

Available on Render Pro plans - restore to any point in last 7 days.

---

## 6. Environment Setup

### Render Services to Create

**Production:**
```
Web Service: ga-developments-api-prod
  - Branch: main
  - Build: cd backend && bun install && bun run build:prod
  - Start: cd backend && bun run start:prod
  - Health Check: /health

PostgreSQL: ga-developments-db-prod
  - Plan: Standard ($20/mo recommended)

Cron Job: ga-invoice-generation-prod
  - Schedule: 0 2 * * * (daily 2 AM)
  - Command: curl -X POST https://your-api.com/api/cron/invoices/generate-monthly -H "x-cron-secret: $CRON_SECRET"
```

**Staging:**
```
Web Service: ga-developments-api-staging
  - Branch: staging (or develop)
  - Same build/start commands

PostgreSQL: ga-developments-db-staging
  - Plan: Starter ($7/mo)

Cron Job: ga-invoice-generation-staging
  - Same schedule, different secret
```

### Environment Variables (Both Environments)

```bash
# Database (different per environment)
DATABASE_URL=postgres://...

# App
NODE_ENV=production  # or "staging"
APP_URL=https://your-app-url.com
PORT=3000

# Auth
BETTER_AUTH_SECRET=<generate unique per env>

# Email
RESEND_API_KEY=re_...
FROM_EMAIL=noreply@gadevelopments.ca

# Stripe (use test keys for staging)
STRIPE_SECRET_KEY=sk_live_... or sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...

# Cron Security
CRON_SECRET=<random 32+ char string, different per env>

# Staging only
STAGING_EMAIL_ALLOWLIST=dev@yourcompany.com
APP_ENV=staging
```

---

## 7. Rollback Plan

### App Rollback (Code Issues)

1. Render Dashboard → Web Service → Deploys
2. Find last working deploy
3. Click "Rollback" button
4. Takes effect in ~30 seconds

### Database Rollback (Migration Issues)

**If migration is backward-compatible:**
- Just rollback the app, old code works with new schema

**If migration broke old code:**
1. Restore database from backup (see Section 5)
2. Then rollback the app
3. Investigate and fix migration

### Expand/Contract Pattern (Safest)

For risky changes, deploy in phases:

1. **Expand:** Add new column/table, keep old ones
2. **Migrate:** Deploy code that writes to both old and new
3. **Backfill:** Copy data from old to new
4. **Switch:** Deploy code that only uses new
5. **Contract:** Remove old column/table (weeks later)

---

## 8. Monitoring & Logging

### Structured Logs (Already Implemented)

The cron jobs log structured output:
```
[CRON-INVOICES] Job complete - Created: 5, Skipped: 10, Errors: 0, Emails sent: 5
```

View in Render Dashboard → Web Service → Logs

### Recommended Alerts (Render)

1. Web Service → Settings → Health Checks
   - Path: `/health`
   - Alert on: 3 consecutive failures

2. Set up Log Drain to Datadog/Papertrail for search & alerting

### Admin Job Status Endpoint

The `/api/cron/invoices/status` endpoint shows:
- Which invoices would be generated
- Which already exist
- Tenant details

Call it to debug: `curl -H "x-cron-secret: $CRON_SECRET" https://api.../api/cron/invoices/status`

---

## 9. Quick Command Reference

```bash
# Check migration status
bunx prisma migrate status

# Create a new migration (dev only)
bunx prisma migrate dev --name add_user_phone

# Apply migrations to production DB
bunx prisma migrate deploy

# Generate Prisma client
bunx prisma generate

# Open database GUI
bunx prisma studio

# Backup production (from local with psql)
pg_dump $DATABASE_URL > backup.sql

# Test cron endpoint
curl -X POST https://your-api/api/cron/invoices/generate-monthly?dryRun=true \
  -H "x-cron-secret: YOUR_SECRET"
```

---

## 10. First Production Deploy Checklist

```
[ ] PostgreSQL database created on Render
[ ] DATABASE_URL set to Render PostgreSQL connection string
[ ] Schema updated to use PostgreSQL provider
[ ] Initial migration created and committed
[ ] All environment variables set on Render
[ ] CRON_SECRET set (random, secure string)
[ ] Web service deployed successfully
[ ] /health returns 200
[ ] Cron job created with correct schedule and secret
[ ] Automated backups enabled on PostgreSQL
[ ] Test invoice generation with ?dryRun=true
[ ] Remove dryRun and verify real generation works
```
