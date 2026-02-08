# Security Documentation

## Overview

This document describes the security measures implemented in the GA Developments property management web application. The application is designed for public internet deployment on Render.

## Required Environment Variables

The following environment variables must be set in your deployment environment. **Never commit actual values to the repository.**

### Required (App will not start without these)

| Variable | Description |
|----------|-------------|
| `BETTER_AUTH_SECRET` | Session encryption key (min 32 chars, recommend 64+ for production) |
| `DATABASE_URL` | Database connection string |

### Recommended for Production

| Variable | Description |
|----------|-------------|
| `APP_ENV` | Set to `production` for production deployments |
| `NODE_ENV` | Set to `production` for production deployments |
| `UPLOADS_DIR` | Persistent disk path for file uploads (e.g., `/var/data/uploads`) |
| `APP_URL` | Public URL of the frontend application |
| `BACKEND_URL` | Public URL of the backend API |

### Payment Processing (Optional)

| Variable | Description |
|----------|-------------|
| `STRIPE_SECRET_KEY` | Stripe API secret key |
| `STRIPE_WEBHOOK_SECRET` | Stripe webhook signing secret |

### Email Sending (Optional)

| Variable | Description |
|----------|-------------|
| `RESEND_API_KEY` | Resend email service API key |
| `SENDGRID_API_KEY` | Alternative: SendGrid API key |
| `FROM_EMAIL` | Sender email address |

### Debug/Staging Mode (Optional)

| Variable | Description |
|----------|-------------|
| `DEBUG_MODE` | Set to `true` to enable debug features (disable in production) |
| `DEBUG_ACCESS_KEY` | Secret key required to access debug endpoints |
| `STAGING_EMAIL_ALLOWLIST` | Comma-separated list of allowed email addresses in staging |

## Security Measures Implemented

### 1. Authentication & Session Security

- **Better Auth** with database-backed sessions
- Session cookies: `HttpOnly`, `Secure`, `SameSite=none`
- Session expiry: 7 days with 24-hour refresh
- CSRF protection enabled via trusted origins
- Password hashing handled by Better Auth (bcrypt)

### 2. Authorization (RBAC)

- Two roles: `ADMIN` and `TENANT`
- Role-based route protection via middleware
- Tenants can only access their own data
- Admin routes require `ADMIN` role
- IDOR prevention: All queries filter by user's tenancy/unit

### 3. Rate Limiting

Protected endpoints:
- Login: 5 attempts per 15 minutes
- Signup: 5 accounts per hour
- Password reset: 3 requests per hour
- File uploads: 10 per hour per user
- Email sending: 20 per hour per user
- General API: 1000 requests per minute

### 4. Input Validation

- Zod schema validation on all API inputs
- File upload validation (type, size, extension)
- Date validation with reasonable limits
- String length limits on user input

### 5. CORS Configuration

- Strict origin allowlist (no wildcards for entire domains)
- Development origins excluded in production
- Explicit allowed methods and headers
- Credentials mode enabled for session cookies

### 6. Security Headers

All responses include:
- `X-Content-Type-Options: nosniff`
- `X-Frame-Options: SAMEORIGIN`
- `X-XSS-Protection: 1; mode=block`
- `Referrer-Policy: strict-origin-when-cross-origin`
- `Permissions-Policy` (camera, microphone disabled)
- `Content-Security-Policy` (restrictive baseline)
- `Strict-Transport-Security` (production only)

### 7. File Upload Security

- Authentication required for all file access
- Authorization checks (tenant sees own files, admin sees all)
- File type validation (MIME type + extension)
- File size limits (10MB)
- Path traversal prevention
- Random filenames to prevent enumeration
- Private storage (not publicly accessible)

### 8. Logging & Secrets Protection

- Centralized redaction utility for logs
- PII automatically redacted (emails, phones)
- API keys and tokens never logged
- Error messages sanitized before client response
- Stack traces only in debug mode

### 9. Webhook Security

- Stripe webhooks verified via signature
- Webhook payloads redacted before storage (debug mode only)
- Idempotent payment processing

### 10. Database Security

- Soft delete for users (data retention)
- Cascade deletes configured for referential integrity
- Parameterized queries via Prisma (SQL injection prevention)

## Remaining Considerations

### Not Yet Implemented

1. **Virus scanning** for uploaded files (recommended for production)
2. **Data retention policy** for soft-deleted records
3. **Account lockout** after repeated failed logins
4. **IP-based suspicious activity detection**
5. **Audit log viewer** for admins (logs stored, UI pending)

### Deployment Checklist

- [ ] Set all required environment variables in Render
- [ ] Use strong, unique `BETTER_AUTH_SECRET` (64+ characters)
- [ ] Configure `UPLOADS_DIR` to Render persistent disk
- [ ] Set `APP_ENV=production` and `NODE_ENV=production`
- [ ] Disable `DEBUG_MODE` in production
- [ ] Configure Stripe webhook endpoint in Stripe Dashboard
- [ ] Set up email provider (Resend or SendGrid)
- [ ] Review CORS origins match your actual domains
- [ ] Test login, payment, and file upload flows

## Reporting Security Issues

If you discover a security vulnerability, please report it privately rather than opening a public issue. Contact the development team directly.

## Updates

This document should be updated whenever security-related changes are made to the application.

Last updated: 2026-01-25
