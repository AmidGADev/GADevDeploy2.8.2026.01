# Deploying GA Developments to Render

This guide walks you through deploying the application to Render with your custom domain gadevelopments.ca.

## Prerequisites

- A Render account (free at render.com)
- Your Stripe keys (from dashboard.stripe.com)
- A Resend account for email (optional, from resend.com)

---

## Step 1: Push Code to GitHub

First, push this codebase to a GitHub repository:

1. Create a new repository on GitHub (e.g., `ga-developments`)
2. Push the code:
   ```bash
   git remote add origin https://github.com/YOUR_USERNAME/ga-developments.git
   git push -u origin main
   ```

---

## Step 2: Deploy via Render Blueprint

1. Go to [render.com](https://render.com) and sign in
2. Click **New** → **Blueprint**
3. Connect your GitHub account and select the repository
4. Render will detect the `render.yaml` file and show 3 services:
   - **ga-developments-api** (Backend)
   - **ga-developments-web** (Frontend)
   - **ga-developments-db** (PostgreSQL Database)
5. Click **Apply**

---

## Step 3: Configure Environment Variables

After deployment starts, go to each service's **Environment** tab:

### Backend API (ga-developments-api)

| Variable | Value |
|----------|-------|
| `BETTER_AUTH_URL` | `https://api.gadevelopments.ca` (your API URL) |
| `STRIPE_SECRET_KEY` | `sk_live_...` (from Stripe dashboard) |
| `STRIPE_WEBHOOK_SECRET` | `whsec_...` (create webhook in Stripe - see Step 4) |
| `RESEND_API_KEY` | `re_...` (optional, from resend.com) |

### Frontend (ga-developments-web)

| Variable | Value |
|----------|-------|
| `VITE_BACKEND_URL` | `https://api.gadevelopments.ca` |

---

## Step 4: Set Up Stripe Webhook

1. Go to [Stripe Dashboard → Webhooks](https://dashboard.stripe.com/webhooks)
2. Click **Add endpoint**
3. URL: `https://api.gadevelopments.ca/api/webhooks/stripe`
4. Events to send:
   - `checkout.session.completed`
   - `payment_intent.succeeded`
5. Copy the **Signing secret** and add it as `STRIPE_WEBHOOK_SECRET` in Render

---

## Step 5: Set Up Custom Domain (gadevelopments.ca)

### For the Frontend (main site):

1. In Render, go to **ga-developments-web** → **Settings** → **Custom Domains**
2. Click **Add Custom Domain**
3. Enter `gadevelopments.ca`
4. Render will show you DNS records to add

### For the Backend API:

1. Go to **ga-developments-api** → **Settings** → **Custom Domains**
2. Add `api.gadevelopments.ca`
3. Add the DNS records

### DNS Changes (at your registrar):

Add these records to your domain:

| Type | Name | Value |
|------|------|-------|
| CNAME | @ | `ga-developments-web.onrender.com` |
| CNAME | www | `ga-developments-web.onrender.com` |
| CNAME | api | `ga-developments-api.onrender.com` |

**Note**: Some registrars don't allow CNAME on root (@). In that case:
- Use an A record pointing to Render's IP (shown in their dashboard)
- Or use Cloudflare as a proxy

---

## Step 6: Update Environment Variables for Custom Domain

After DNS is set up, update the environment variables:

### Backend (ga-developments-api):
| Variable | New Value |
|----------|-----------|
| `BETTER_AUTH_URL` | `https://api.gadevelopments.ca` |

### Frontend (ga-developments-web):
| Variable | New Value |
|----------|-----------|
| `VITE_BACKEND_URL` | `https://api.gadevelopments.ca` |

---

## Step 7: Create Admin Account

After deployment, you need to create the first admin user. Run this command against your database:

1. In Render, go to **ga-developments-db** → **Info**
2. Copy the **External Database URL**
3. Use a PostgreSQL client (like pgAdmin or TablePlus) to connect
4. Or use Render's **Shell** tab to run:

```sql
-- First, register through the app, then run:
UPDATE "User" SET role = 'ADMIN' WHERE email = 'your-email@example.com';
```

---

## Costs

Render Starter Plan pricing (as of 2024):
- **Web Service**: $7/month each (2 services = $14/month)
- **PostgreSQL**: $7/month
- **Total**: ~$21/month

Free tier available but has limitations (services sleep after 15 min inactivity).

---

## Troubleshooting

### Build fails with Prisma error
Ensure `DATABASE_URL` is set and the database is created first.

### CORS errors
Check that `VITE_BACKEND_URL` in the frontend matches exactly the backend URL (including https://).

### Auth not working
Ensure `BETTER_AUTH_URL` matches your backend URL and the domain is in `trustedOrigins` in auth.ts.

### Stripe webhooks failing
Check the webhook signing secret matches and the endpoint URL is correct.

---

## Migrating Data

If you have existing data from the development database, you'll need to migrate it. Since you're moving from SQLite to PostgreSQL, you can:

1. Export data from SQLite using a tool like DB Browser for SQLite
2. Transform the data if needed
3. Import into PostgreSQL

For a fresh start, just use the app and add properties/units manually.
