# GA Developments - Property Management System

A high-end, minimal real estate website and invite-only tenant portal for GA Developments.

## Overview

This property management system provides:
- **Public Landing Page**: Elegant marketing site with property information, unit listings, amenities, gallery, and contact form
- **Tenant Portal**: Dashboard for tenants to view invoices, pay rent (via Stripe), submit service requests, and view announcements
- **Admin Portal**: Management interface for units, tenants, invoices, service requests, announcements, and emails

## Property Information

- **Property Name**: Carsons Terrace Rentals
- **Address**: 709 & 711 Carsons Road, Ottawa, Ontario K1K 2H2
- **Units**: 8 units (709A1, 709A2, 709B1, 709B2, 711A1, 711A2, 711B1, 711B2)

## Tech Stack

### Frontend (webapp/)
- **React 18** with TypeScript
- **Vite** for build tooling
- **TailwindCSS** for styling
- **shadcn/ui** component library
- **React Router** for navigation
- **TanStack Query** for data fetching
- **Framer Motion** for animations

### Backend (backend/)
- **Hono** web framework
- **Bun** runtime
- **Prisma** ORM with PostgreSQL (production) / SQLite (development)
- **Better Auth** for authentication
- **Stripe** for payment processing
- **SendGrid** for email sending
- **Zod** for validation

## Routes

### Public Routes
- `/` - Landing page with property info
- `/login` - Login page (email/password)
- `/forgot-password` - Request password reset link
- `/reset-password` - Set new password (via email link)
- `/accept-invite` - Accept invitation and create account
- `/privacy` - Privacy policy
- `/terms` - Terms of service

### Tenant Portal (`/portal/*`)
- `/portal` - Tenant dashboard with account standing card and compliance status
- `/portal/invoices` - View and pay invoices
- `/portal/payments` - Payment history with downloadable PDF receipts
- `/portal/requests` - Submit and track service requests with status timeline; Request to move-out
- `/portal/documents` - View lease agreements and other documents
- `/portal/checklists` - View move-in/move-out checklists (task-based)
- `/portal/inspections` - View move-in/move-out inspections (condition-based, read-only)
- `/portal/insurance` - Manage renter's insurance
- `/portal/building-info` - Building amenities, rules, and emergency contacts
- `/portal/calendar` - Calendar with building logistics, lease milestones, and admin alerts
- `/portal/announcements` - View announcements with acknowledgement tracking
- `/portal/settings` - Tenant profile settings

### Admin Portal (`/admin/*`)
- `/admin` - Admin dashboard with portfolio overview, cash flow metrics, action center, and insurance compliance
- `/admin/units` - Manage property units with Rent Roll generation (PDF/Excel export), sortable Rent Due Day column (1-31)
- `/admin/tenants` - Manage tenants (invite, deactivate)
- `/admin/tenants/:id/checklist` - Manage tenant move-in checklist (task-based)
- `/admin/tenants/:id/checklist/move-out` - Manage tenant move-out checklist (task-based)
- `/admin/tenants/:id/inspection/:type` - Manage tenant inspection (condition-based, type = move-in or move-out)
- `/admin/compliance/checklists` - Overview of all move-in and move-out checklists
- `/admin/compliance/inspections` - Overview of all move-in and move-out inspections
- `/admin/invoices` - View and create invoices, including custom invoices (late fees, repairs, utility surcharges)
- `/admin/requests` - Unified requests view with tabs for:
  - **Maintenance Requests**: Service requests from tenants + admin-created requests
  - **Move-Out Requests**: Tenant move-out requests
  - **Showing Requests**: Property viewing requests from prospects
  - Includes "Create Request" button for admin-generated service requests
- `/admin/announcements` - Create announcements with optional acknowledgement requirement
- `/admin/building-info` - Manage building information per building, with per-building rules and emergency contacts
- `/admin/calendar` - Calendar module with event management, visibility controls, and notification settings
- `/admin/email` - Send mass emails

## API Endpoints

### Public
- `GET /api/property` - Get property info and vacant units
- `POST /api/property/showing-request` - Submit showing request

### Auth (Better Auth)
- `POST /api/auth/sign-in/email` - Login
- `POST /api/auth/sign-out` - Logout
- `GET /api/auth/session` - Get current session
- `POST /api/auth/request-password-reset` - Request password reset email
- `GET /api/auth/reset-password/:token` - Validate reset token (redirects to frontend)
- `POST /api/auth/reset-password` - Set new password with token

### Admin (requires ADMIN role)
- `GET/POST /api/admin/units` - List/create units (includes buildingName field)
- `GET /api/admin/units/buildings` - List unique building names for dropdown
- `GET /api/admin/units/rent-roll` - Generate rent roll data for a building (`?buildingName=`, `?periodMonth=`)
- `PUT/DELETE /api/admin/units/:id` - Update/delete unit
- `GET /api/admin/tenants` - List tenants (supports `?unitId=` filter)
- `POST /api/admin/tenants/invite` - Invite new tenant (with `roleInUnit`)
- `PUT /api/admin/tenants/:id/deactivate` - Deactivate tenant
- `PUT /api/admin/tenants/:id/reactivate` - Reactivate deactivated tenant
- `PUT /api/admin/tenants/:id/move-out` - Move out tenant
- `PUT /api/admin/tenants/:id/promote` - Promote occupant to primary
- `PUT /api/admin/tenants/:id/schedule-move-out` - Schedule move-out date (auto-creates checklist)
- `DELETE /api/admin/tenants/:id/permanent` - Permanently delete tenant with cascading cleanup (requires email confirmation)
- `GET/POST /api/admin/announcements` - List/create announcements
- `GET/PUT /api/admin/service-requests` - List/update service requests
- `POST /api/admin/service-requests` - Create service request (admin-generated)
- `GET /api/admin/service-requests/options` - Get tenants/units for create form
- `GET /api/admin/service-requests/:id` - Get service request details
- `POST /api/admin/service-requests/:id/comment` - Add comment
- `GET/PUT /api/admin/showing-requests` - List/update showing requests
- `POST /api/admin/showing-requests` - Create showing request (admin-generated)
- `GET/POST /api/admin/move-out-requests` - List move-out requests / Create move-out request (admin-generated)
- `GET /api/admin/move-out-requests/:id` - Get move-out request details
- `PUT /api/admin/move-out-requests/:id` - Respond to move-out request (acknowledge/decline)
- `GET /api/admin/tenancies` - List tenancies (supports `?active=true` filter)
- `GET /api/admin/properties` - List properties
- `GET /api/admin/notification-settings/tenant-preferences` - Get tenant notification settings
- `PUT /api/admin/notification-settings/tenant-preferences` - Update tenant notification settings
- `GET /api/admin/notification-settings/tenant-history/:tenantId` - Get notification history for a tenant
- `GET/POST/PUT /api/admin/invoices` - Manage invoices (supports filters: `?status=`, `?unitId=`, `?periodMonth=`, `?buildingName=`, `?search=`)
  - POST supports `invoiceType: "RENT" | "CUSTOM"`, `chargeCategory` (LATE_FEE, REPAIR, UTILITY_SURCHARGE, OTHER), and `description` for custom invoices
- `GET /api/admin/invoices/buildings` - List distinct building names for filtering
- `POST /api/admin/invoices/generate` - Generate monthly invoices
- `PUT /api/admin/invoices/:id/paid` - Mark invoice as paid
- `PUT /api/admin/invoices/:id/void` - Void invoice
- `POST /api/admin/invoices/:id/reminder` - Send payment reminder
- `GET /api/admin/dashboard` - Dashboard statistics with building filter support (`?buildingName=`)
- `POST /api/admin/email/send` - Send mass email
- `POST /api/admin/email/test` - Send test email (body: `{ to: "email@example.com" }`)
- `GET /api/admin/email/config` - Get email provider configuration status
- `GET /api/admin/email/logs` - Get email history with source attribution
- `GET /api/admin/email-settings` - Get sender configuration (name, email, reply-to)
- `PUT /api/admin/email-settings` - Update sender configuration
- `POST /api/admin/data-purge` - Clear all property data (requires `{ confirmationText: "PURGE DATA" }`)
- `GET/POST /api/admin/invitations` - List/create invitations
- `DELETE /api/admin/invitations/:id` - Cancel invitation
- `POST /api/admin/invitations/:id/resend` - Resend invitation
- `GET /api/admin/documents` - List all tenant documents
- `GET /api/admin/documents/:userId` - List documents for a specific tenant
- `POST /api/admin/documents/:userId/upload` - Upload document for tenant (multipart form)
- `DELETE /api/admin/documents/:documentId` - Delete a tenant document
- `GET /api/admin/building-info` - List all building infos
- `GET /api/admin/building-info/:buildingName` - Get specific building info
- `PUT /api/admin/building-info/:buildingName` - Create/update building info (upsert by building, supports structured garbage schedule)
- `POST /api/admin/building-info/:buildingName/sync-calendar` - Explicitly sync garbage schedule to calendar events
- `DELETE /api/admin/building-info/:buildingName` - Delete building info

### Calendar (Admin)
- `GET /api/admin/calendar` - Get calendar events with filters (`?start=`, `?end=`, `?buildingName=`, `?unitId=`)
- `GET /api/admin/calendar/buildings` - List unique building names for filtering
- `GET /api/admin/calendar/units` - List units for filtering
- `POST /api/admin/calendar/events` - Create custom calendar event with visibility and notification settings
- `DELETE /api/admin/calendar/events/:id` - Delete custom calendar event

### Calendar (Tenant)
- `GET /api/tenant/calendar` - Get tenant-specific calendar events (only events visible to tenant)

### Move-In/Move-Out Checklists (Admin)
- `GET /api/admin/checklist/tenant/:tenantId` - Get tenant checklist (supports `?type=MOVE_IN|MOVE_OUT`)
- `POST /api/admin/checklist/tenant/:tenantId` - Add custom checklist item
- `POST /api/admin/checklist/tenant/:tenantId/initialize` - Initialize default checklist (body: `{ checklistType }`)
- `PUT /api/admin/checklist/item/:itemId/complete` - Mark item complete
- `PUT /api/admin/checklist/item/:itemId/incomplete` - Mark item incomplete
- `DELETE /api/admin/checklist/item/:itemId` - Delete checklist item
- `POST /api/admin/checklist/item/:itemId/photo` - Upload photo to checklist item
- `DELETE /api/admin/checklist/photo/:photoId` - Delete checklist item photo

### Inspections (Admin) - Condition-based assessments
- `GET /api/admin/inspections/tenant/:tenantId/:inspectionType` - Get inspection (type = move-in or move-out)
- `POST /api/admin/inspections/tenant/:tenantId/:inspectionType/initialize` - Initialize inspection
- `PUT /api/admin/inspections/:inspectionId` - Update inspection (status, notes, damage, keys)
- `PUT /api/admin/inspections/:inspectionId/finalize` - Finalize and lock inspection
- `PUT /api/admin/inspections/:inspectionId/reopen` - Reopen a finalized inspection
- `PUT /api/admin/inspections/item/:itemId` - Update item condition/notes
- `POST /api/admin/inspections/item/:itemId/photo` - Upload photo to item
- `DELETE /api/admin/inspections/photo/:photoId` - Delete a photo

### Move-Out Checklist (Admin) - Legacy, use Inspections instead
- `GET /api/admin/move-out-checklist/tenant/:tenantId` - Get move-out checklist for tenant
- `POST /api/admin/move-out-checklist/tenant/:tenantId/initialize` - Initialize default move-out checklist
- `PUT /api/admin/move-out-checklist/:checklistId` - Update checklist (status, notes, damage, keys)
- `PUT /api/admin/move-out-checklist/:checklistId/finalize` - Finalize and lock checklist
- `PUT /api/admin/move-out-checklist/:checklistId/reopen` - Reopen a finalized checklist
- `PUT /api/admin/move-out-checklist/item/:itemId` - Update item condition/notes
- `POST /api/admin/move-out-checklist/item/:itemId/photo` - Upload photo to item
- `DELETE /api/admin/move-out-checklist/photo/:photoId` - Delete a photo

### Compliance (Admin)
- `GET /api/admin/compliance/move-in` - List all tenants with move-in checklist status
- `GET /api/admin/compliance/move-out` - List all tenants with move-out checklist status

### Invitations (Public)
- `GET /api/invitations/:token` - Validate invitation token
- `POST /api/invitations/:token/accept` - Accept invitation and create account

### Tenant (requires TENANT role)
- `GET /api/tenant/dashboard` - Dashboard data
- `GET /api/tenant/compliance` - Account standing and compliance status
- `GET /api/tenant/invoices` - List invoices
- `POST /api/tenant/invoices/:id/checkout` - Create Stripe checkout
- `GET /api/tenant/payments` - Payment history
- `GET /api/tenant/payments/:id/receipt` - Download PDF receipt for payment
- `GET/POST /api/tenant/service-requests` - List/create service requests
- `GET /api/tenant/service-requests/:id` - Get service request details with comments
- `POST /api/tenant/service-requests/:id/comment` - Add comment to service request
- `GET /api/tenant/announcements` - View announcements
- `POST /api/tenant/announcements/:id/acknowledge` - Acknowledge announcement
- `GET /api/tenant/documents` - View tenant's documents (lease, signed agreements)
- `GET /api/tenant/checklist` - View move-in/move-out checklist items
- `PUT /api/tenant/checklist/:id/complete` - Mark checklist item complete
- `PUT /api/tenant/checklist/:id/incomplete` - Mark checklist item incomplete
- `GET /api/tenant/building-info` - View building information for tenant's building

### Webhooks
- `POST /api/webhooks/stripe` - Stripe payment webhook

### Document Management System
Robust local file storage for tenant documents with security checks and persistent storage.

**Tenant Endpoints:**
- `POST /api/documents/upload` - Upload document (PDF only, max 10MB)
  - Form data: `file` (PDF), `category` (GENERAL|LEASE|INSURANCE|ID|OTHER), `description`
  - Standardized filename: `{unitId}-{YYYY-MM-DD}-{uuid}.pdf`
- `GET /api/documents` - List tenant's own documents
- `GET /api/documents/:documentId/download` - Download document (own documents only)
- `DELETE /api/documents/:documentId` - Delete own document

**Admin Endpoints:**
- `GET /api/documents/admin/all` - List all documents (filters: `?userId=`, `?unitId=`, `?category=`)
- `POST /api/documents/admin/upload/:userId` - Upload document for specific tenant
- `DELETE /api/documents/admin/:documentId` - Delete any document

**Security Features:**
- PDF-only validation (MIME type + extension check)
- 10MB file size limit
- Path traversal prevention
- Session-based authorization (tenants can only access own files)
- Audit logging for admin uploads/deletes
- Persistent storage support (`UPLOADS_DIR` env var for Render)
- Sanitized filenames to prevent overwriting

### Cron Jobs (Automated Tasks)

#### Rent Reminders
- `POST /api/cron/rent-reminders/send` - Send rent reminder emails to tenants with unpaid invoices due tomorrow
- `GET /api/cron/rent-reminders/status` - Check which invoices would receive reminders

#### Invoice Auto-Generation
- `POST /api/cron/invoices/generate-monthly` - Auto-generate rent invoices for upcoming month (5 days before due)
- `GET /api/cron/invoices/status` - Check which invoices would be generated

**Authentication**: Cron endpoints require `x-cron-secret` header or `?secret=` query parameter matching `CRON_SECRET` (or `DEBUG_ACCESS_KEY`).

**Render Cron Job Setup**:

1. **Invoice Auto-Generation** (runs daily at 2 AM):
   - Schedule: `0 2 * * *`
   - Command: `curl -X POST "https://api.gadevelopments.ca/api/cron/invoices/generate-monthly" -H "x-cron-secret: $CRON_SECRET"`

2. **Rent Reminders** (runs daily at 6 PM):
   - Schedule: `0 18 * * *`
   - Command: `curl -X POST "https://api.gadevelopments.ca/api/cron/rent-reminders/send" -H "x-cron-secret: $CRON_SECRET"`

3. Set `CRON_SECRET` environment variable on Render (use a secure random string)

## Authentication

The system uses invite-only authentication:
- **Admin** users can invite new tenants via the admin portal
- **Tenants** receive login credentials when invited and assigned to a unit
- Roles: `ADMIN` or `TENANT`

### Password Reset
- Users can reset their password via the "Forgot Password?" link on the login page
- Password reset emails are sent via Resend (requires `RESEND_API_KEY`)
- Reset tokens expire after 1 hour
- Uses secure scrypt hashing (equivalent to bcrypt cost 10)

## Multi-Tenant Units (Roommates)

The system supports multiple tenants per unit:

### Tenant Roles
- **Primary Tenant**: The main lease holder (exactly one per unit)
- **Occupant**: Additional roommates/family members (unlimited per unit)

### Business Rules
- Each unit must have exactly one PRIMARY tenant
- OCCUPANT invitations require the unit to already have a PRIMARY
- Any tenant can pay rent (payment completes invoice for the unit)
- Any tenant can submit service requests for their unit
- Any tenant can view all unit invoices and service requests
- Primary tenant must be reassigned before moving out if occupants exist

### Admin Workflows
- **Invite Primary**: Available when unit has no primary tenant
- **Invite Occupant**: Available when unit is occupied
- **Promote to Primary**: Move occupant to primary when primary leaves
- **Move Out**: Ends tenancy; marks unit vacant if last tenant

### Tenant Portal
- Dashboard shows "Your Unit" with household members
- Invoices display "Paid by {name}" when paid
- Service requests show all requests for the unit
- Any tenant can pay rent for the entire unit

## Default Admin Account

- **Email**: info@gadevelopments.ca
- **Password**: Admin123!@#

## Environment Variables

### Backend
```env
DATABASE_URL=file:./prisma/dev.db
BETTER_AUTH_SECRET=<secret>
STRIPE_SECRET_KEY=<stripe-secret>
STRIPE_WEBHOOK_SECRET=<webhook-secret>
RESEND_API_KEY=<resend-api-key>
FROM_EMAIL=info@gadevelopments.ca
```

### Frontend
```env
VITE_BACKEND_URL=<backend-url>
```

## Email Configuration

The app supports two email providers. Use **Resend (recommended)** or SendGrid.

### Option 1: Resend (Recommended - Easy Setup)

1. Go to https://resend.com and sign up with GitHub (instant approval)
2. Add and verify your domain or use their test domain
3. Create an API key
4. Add environment variable: `RESEND_API_KEY=re_xxxxxxxxxxxx`

### Option 2: SendGrid

1. Create a SendGrid account at https://sendgrid.com
2. Verify your sender email
3. Create an API key with Mail Send permissions
4. Add environment variable: `SENDGRID_API_KEY=SG.xxxxxxxxxxxx`

### Email Features
- **Dynamic Sender Identity**: Admin can configure custom sender name and email address
- **Sender Configuration UI**: Set "Friendly Sender Name" and "Sender Email Address" in Send Email tab
- **Verification Status**: Shows domain verification status (pending/verified) based on Resend configuration
- **Master Email Log**: All emails (manual and automated) tracked with source attribution
  - "Admin" badge (purple) for manually sent emails
  - "System" badge (blue) for automated emails (welcome, reminders, alerts)
- **Welcome emails**: Sent when admin creates a tenant account (includes login credentials)
- **Invitation emails**: Sent when using the invitation system (token-based)
- **Announcement emails**: Optional when creating announcements (checkbox to email recipients)
- **Payment reminders**: Sent via the admin invoice reminder button

**Note**: Without an email API key, emails will fail silently. The app will still function, but no emails will be sent.

## Development

Both frontend and backend servers run automatically in the Vibecode environment:
- Frontend: Port 8000
- Backend: Port 3000

### Database Commands

```bash
# Push schema changes
cd backend && bunx prisma db push

# Create migration
cd backend && bunx prisma migrate dev --create-only --name <name>

# Apply migrations
cd backend && bunx prisma migrate deploy

# Generate client
cd backend && bunx prisma generate

# Run seed
cd backend && bun run src/seed.ts
```

## Stripe Integration

To enable payments:
1. Add `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET` to backend environment
2. Configure webhook endpoint: `<backend-url>/api/webhooks/stripe`
3. Subscribe to `checkout.session.completed` events

**Testing with Test Cards:**
- Card number: `4242 4242 4242 4242`
- Any future expiry date (e.g., `12/28`)
- Any CVC (e.g., `123`)

**Note:** In Vibecode preview, clicking "Pay with Card" opens a dialog with a link to Stripe checkout. This bypasses iframe restrictions. In production, the same approach works seamlessly.

## Features

### Implemented
- Public landing page with all sections (Hero, Overview, Units, Amenities, Neighborhood, Gallery, FAQs, Contact)
- Authentication with role-based access control
- Tenant portal with dashboard, invoices, payments, service requests, announcements
- **Enhanced Tenant Portal Features**:
  - Account standing / compliance status card showing GOOD_STANDING, ACTION_REQUIRED, or NOT_IN_COMPLIANCE
  - Payment history with downloadable PDF receipts
  - Service request status timeline (Submitted → In Progress → Completed)
  - Move-in/move-out checklist with admin-controlled items
  - Building information page with amenities, rules, and emergency contacts
  - Announcement acknowledgements with legal timestamp tracking
  - Lease expiry awareness (90/60/30 day warnings)
  - Tenant profile completion indicator
- **Full admin portal with**:
  - Dashboard with stats and quick actions
  - Units management (CRUD, tenant assignment)
  - Tenants management (invite, deactivate, move-out)
  - Invoices management (generate rent invoices, create custom invoices for late fees/repairs/utilities, mark paid, void, send reminders)
  - Invoice page defaults to current month view with monthly summary totals
  - Service requests with comments
  - Announcements with audience targeting
  - Showing requests with status workflow
  - Mass email composer
  - **Calendar Module** with:
    - Tenant visibility toggle for events
    - Notification system (email/dashboard/both)
    - Reminder scheduling (at event, 24 hours, 3 days before)
    - Automated garbage/recycling schedule sync from Building Info (structured day/frequency selector with explicit Sync to Calendars)
    - Per-tenant communication preferences with opt-out support
    - Communication history audit logging
  - **Tenant Communication Preferences UI** with:
    - Financial, Operations, Compliance category cards with individual toggle controls
    - Delivery Guardrails sidebar (Global Mute, Overdue Interval, Bundle Window)
    - Contextual info tooltips on every toggle and dropdown for admin clarity
    - Visual dimming of category cards when Global Mute is active
    - Symmetrical 4-column card layout for engineering-grade alignment
- Invitation system with token-based tenant onboarding
- Stripe checkout integration for rent payments
- Audit logging for admin actions
- Database schema with all required tables including Invitation and AuditLog
- **Security hardening** - See [SECURITY.md](./SECURITY.md) for details

### Admin Settings - Redesigned Card-Based Layout
- **Profile & Identity Section** - Static dual-column card for admin profile and security settings
- **Email Communication Templates** - Collapsible accordion section with template count badge
- **Notification Center** - Collapsible accordion with recipient management and tenant communication preferences
- **Notification Log** - Collapsible section for delivery history
- **Data Management & Backups** - Collapsible section with:
  - Quick "Run System Backup" button in header
  - Import/Export drop zone
  - "View Detailed History" toggle showing last 3 backups by default
  - Last backup timestamp badge
- **Danger Zone** - Red-tinted card at bottom for destructive actions
- **Clear All Property Data**: High-security surgical data purge feature with 3-layer safety confirmation
  - Layer 1: Initial warning button in "Danger Zone" card
  - Layer 2: Detailed consequences modal showing what will be deleted vs preserved
  - Layer 3: Type "PURGE DATA" confirmation to enable final action
  - Preserves: Admin accounts, Email Templates, System Settings, Audit History
  - Deletes: All Properties, Units, Tenants, Invoices, Payments, Service Requests, Documents
  - Full audit trail logging of purge operations
  - Zero-state stability: Dashboard, Units, and Tenants pages display welcome states when empty

### Future Enhancements
- Automated monthly invoice generation (CRON)
- Rent reminder automation
- Image upload for service requests

## Render Deployment

### Quick Deploy

1. Fork/clone this repo to your GitHub account
2. Go to [Render Dashboard](https://dashboard.render.com/blueprints)
3. Click "New Blueprint Instance"
4. Connect your GitHub repo
5. Configure the required environment variables (see below)
6. Click "Apply"

### Required Environment Variables

Set these in Render Dashboard → Environment:

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | Auto | Provided by Render PostgreSQL |
| `BETTER_AUTH_SECRET` | Auto | Auto-generated (64+ chars recommended) |
| `BACKEND_URL` | Yes | Your API URL (e.g., `https://api.gadevelopments.ca`) |
| `APP_URL` | Yes | Your frontend URL (e.g., `https://www.gadevelopments.ca`) |
| `RESEND_API_KEY` | Yes* | From resend.com (*required for email features) |
| `FROM_EMAIL` | Yes* | Must match verified Resend domain |
| `STRIPE_SECRET_KEY` | No | For payment processing |
| `STRIPE_WEBHOOK_SECRET` | No | For Stripe webhook verification |
| `CRON_SECRET` | Auto | Auto-generated for cron job auth |
| `UPLOADS_DIR` | Auto | Set to `/var/data/uploads` for persistent storage |

### Build & Start Commands

**Build Command (Backend):**
```bash
cd backend && bash scripts/prepare-postgres.sh && bun install && bunx prisma generate
```

**Start Command (Backend):**
```bash
cd backend && bunx prisma migrate deploy && bun run src/index.ts
```

**Build Command (Frontend):**
```bash
cd webapp && bun install && bun run build
```

### Database Migrations

Migrations run automatically on each deploy via `prisma migrate deploy` in the start command.

For manual migration:
```bash
cd backend && bunx prisma migrate deploy
```

### File Uploads

On Render's free tier, file uploads are ephemeral (lost on redeploy). For persistent storage:
1. Upgrade to a paid plan
2. Add a persistent disk in Render dashboard
3. Mount at `/var/data`
4. Set `UPLOADS_DIR=/var/data/uploads`

### Testing Checklist

After deploying to Render, verify these features:

#### 1. Health Check
- [ ] Visit `https://api.gadevelopments.ca/health` → should return `{"status":"ok"}`

#### 2. Email Sending (Resend)
- [ ] Go to Admin Portal → Email
- [ ] Check "Email Configuration" shows "Email Configured" with provider "resend"
- [ ] Enter your email in "Send Test Email" field
- [ ] Click "Send Test" button
- [ ] Verify JSON result shows `ok: true`
- [ ] Check your inbox for the test email
- [ ] If failed, check Render logs for `[EMAIL]` entries

#### 3. User Activation/Deactivation
- [ ] Go to Admin Portal → Tenants
- [ ] Click tenant menu → Deactivate
- [ ] Confirm the tenant shows "Deactivated" badge (red)
- [ ] Try to log in as that tenant → should see "Account is deactivated" error
- [ ] Go back to Admin Portal → Tenants
- [ ] Click tenant menu → Reactivate
- [ ] Confirm the tenant shows "Active" badge
- [ ] Log in as that tenant → should succeed

#### 4. Welcome Email on Tenant Creation
- [ ] Go to Admin Portal → Tenants → Invite Tenant
- [ ] Create a tenant with a real email address
- [ ] Check inbox for welcome email with login credentials
- [ ] If no email received, check Render logs for `[EMAIL]` errors

#### 5. Announcement Emails
- [ ] Go to Admin Portal → Announcements
- [ ] Create announcement with "Send Email" checkbox enabled
- [ ] Check tenant inbox for announcement email
- [ ] If no email, check Render logs

#### 6. Stripe Payments (if configured)
- [ ] Go to Tenant Portal → Invoices
- [ ] Click "Pay with Card" on an open invoice
- [ ] Complete checkout with test card `4242 4242 4242 4242`
- [ ] Verify invoice status changes to PAID

### Troubleshooting

**Build fails with "prisma generate" error:**
- Ensure `DATABASE_URL` is set correctly
- Check that PostgreSQL addon is attached

**404 on all routes after deploy:**
- Run `bunx prisma generate` in build command
- Check Render logs for startup errors

**Emails not sending:**
- Verify `RESEND_API_KEY` is set
- Check `FROM_EMAIL` matches your verified domain
- Look for `[EMAIL]` entries in Render logs

**CORS errors:**
- Verify `BACKEND_URL` matches your actual API URL
- Check that frontend `VITE_BACKEND_URL` is correct
