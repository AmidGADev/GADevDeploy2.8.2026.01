# Render Debugging Guide

This document describes how to use the debug/staging mode for safely validating all systems on Render-hosted deployments.

## Overview

The debug/staging system provides:
- **System health checks** for all services (database, email, storage, etc.)
- **Email diagnostics** with staging safety (allowlist-based blocking)
- **API smoke tests** for validating critical endpoints
- **Webhook viewer** for debugging Stripe and other webhook integrations
- **Structured logging** with request tracing for Render logs

## Environment Variables

### Required for Staging/Debug Mode

| Variable | Description | Example |
|----------|-------------|---------|
| `APP_ENV` | Environment mode | `staging` or `production` |
| `DEBUG_MODE` | Enable debug features | `true` or `false` |
| `DEBUG_ACCESS_KEY` | Secret key to access debug tools | `your-secure-random-key` |
| `STAGING_EMAIL_ALLOWLIST` | Comma-separated list of allowed email addresses in staging | `admin@example.com,*@yourcompany.com` |

### Production vs Staging

| Setting | Production | Staging |
|---------|------------|---------|
| `APP_ENV` | `production` | `staging` |
| `DEBUG_MODE` | `false` | `true` |
| Debug Console | Hidden (404) | Available to admins |
| Email sending | All recipients | Only allowlisted recipients |
| Detailed logs | Standard | Verbose with debug info |

## Setting Up Debug Mode on Render

### 1. Configure Environment Variables

In your Render dashboard:

1. Go to your service → **Environment**
2. Add the following environment variables:

```
APP_ENV=staging
DEBUG_MODE=true
DEBUG_ACCESS_KEY=<generate-a-secure-random-string>
STAGING_EMAIL_ALLOWLIST=your-email@example.com,team@yourcompany.com
```

**Important**: Generate a secure random key for `DEBUG_ACCESS_KEY`:
```bash
openssl rand -base64 32
```

### 2. Generate Staging Email Allowlist

The allowlist supports:
- Exact email addresses: `user@example.com`
- Wildcard domains: `*@yourcompany.com`

Example:
```
STAGING_EMAIL_ALLOWLIST=admin@gadevelopments.ca,*@gadevelopments.ca,test@gmail.com
```

## Accessing the Debug Console

### 1. Navigate to Debug Console

As an admin user, go to:
```
https://gadevelopments.ca/admin/debug
```

### 2. Unlock with Debug Key

Enter your `DEBUG_ACCESS_KEY` to unlock the console. The key is stored in your browser session and will persist until you lock the console or clear session storage.

### 3. Available Tools

#### A. System Health

Shows pass/fail status for:
- **Database** - Connection status
- **Email Provider** - Resend/SendGrid configuration
- **From Email** - Sender email configuration
- **Covie Insurance** - Integration status
- **File Storage** - Upload directory configuration
- **Stripe** - Payment processing configuration

#### B. Email Diagnostics

- **Send Test Email** - Verify email delivery
- **View Failures** - Last 20 failed email attempts
- **Staging Info** - Current allowlist and blocking status

**Staging Safety**: In staging mode, emails are only sent to addresses matching the allowlist. Blocked emails are logged with a clear reason.

#### C. API Smoke Tests

One-click tests for:
- Auth/Session validity
- Tenants list query
- Showing requests query
- Invoice system check
- Insurance status check

Each test returns:
- Pass/fail status
- Response message
- Request ID (for log correlation)
- Duration in milliseconds

#### D. Webhook Viewer

View recent webhook events with:
- Source (stripe, covie, etc.)
- Event type
- Processing status (received/processed/failed)
- Error messages
- Timestamps

#### E. Database Stats

Quick overview of:
- User counts (admins, tenants)
- Units, invoices, payments
- Service requests, email logs

## Viewing Logs on Render

### Log Format

All logs follow this structured format:
```
[timestamp] [SUBSYSTEM] message { context }
```

Subsystems:
- `[AUTH]` - Login, logout, session issues
- `[EMAIL]` - Resend sends, failures
- `[INSURANCE]` - Covie verification
- `[WEBHOOK]` - Received/processed events
- `[JOBS]` - Scheduled job runs
- `[DB]` - Query errors (debug only)
- `[API]` - Request/response logging

### Request Tracing

Every API request includes:
- `requestId` - Unique UUID for the request
- `x-request-id` response header

In staging/debug mode, error toasts include the request ID for easy log correlation.

### Finding Logs in Render

1. Go to your service → **Logs**
2. Use filters to search by:
   - Subsystem: `[EMAIL]`
   - Request ID: `abc123-def456-...`
   - Error messages

## Verification Checklist

Use this checklist to validate all systems after deployment:

### Authentication & Roles
- [ ] Admin can log in
- [ ] Tenant can log in
- [ ] Role-based routing works correctly
- [ ] Session persists across page refreshes
- [ ] Sign out clears session

### Email Sending
- [ ] Test email sends successfully (check Debug Console)
- [ ] EmailLog records created in database
- [ ] Staging allowlist blocks non-approved addresses
- [ ] Email template renders correctly

### Admin Alerts
- [ ] Dashboard loads with correct stats
- [ ] "Needs Attention" section shows relevant items

### Insurance Verification
- [ ] Tenant can upload insurance document
- [ ] Admin can approve/reject insurance
- [ ] Status updates correctly

### Invoice Generation
- [ ] Invoices created for tenants
- [ ] Payment status tracking works
- [ ] e-Transfer flow functions

### Webhooks
- [ ] Stripe webhooks received (check Webhook Viewer)
- [ ] Payment status updates on webhook receipt
- [ ] Failed webhooks logged with errors

## Production Deployment

Before deploying to production:

1. **Change environment variables**:
   ```
   APP_ENV=production
   DEBUG_MODE=false
   ```

2. **Remove or keep DEBUG_ACCESS_KEY**:
   - Keep it if you want emergency debug access
   - Remove it to fully disable debug features

3. **Verify debug routes return 404**:
   ```bash
   curl -I https://your-production-app.com/api/admin/debug/health
   # Should return 404
   ```

4. **Check debug badge is hidden**:
   - No "Debug Mode" or "Staging" badge should appear

## Troubleshooting

### Debug Console Returns 404

1. Verify `APP_ENV=staging` or `DEBUG_MODE=true`
2. Verify you're logged in as an admin
3. Check `DEBUG_ACCESS_KEY` is set

### Emails Not Sending in Staging

1. Check `STAGING_EMAIL_ALLOWLIST` includes your email
2. Wildcard format is `*@domain.com` (not `@domain.com`)
3. Check Email Diagnostics for error messages

### Cannot Unlock Debug Console

1. Verify `DEBUG_ACCESS_KEY` matches exactly (no trailing spaces)
2. Check browser console for errors
3. Try clearing session storage and re-entering

### Logs Not Showing in Render

1. Logs may take a few seconds to appear
2. Use specific search terms (subsystem tags, request IDs)
3. Verify the action actually occurred (check database)

## Security Notes

1. **Never commit `DEBUG_ACCESS_KEY` to version control**
2. **Use a strong, random key** (at least 32 characters)
3. **Debug routes return 404 in production** - not discoverable
4. **Admin authentication required** for all debug endpoints
5. **Staging email allowlist** prevents accidental emails to real users
6. **Webhook payloads are redacted** of sensitive data (emails, personal info)
