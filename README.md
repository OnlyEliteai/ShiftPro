# ShiftPro v2

Shift management system for OnlyElite — managing 15+ OnlyFans chatters with automated WhatsApp reminders, real-time shift tracking, and analytics.

## What It Does

- **Admin dashboard** — weekly grid view, chatter management, shift templates, analytics, error monitoring
- **Chatter personal view** — mobile-first, token-based access (no passwords), clock-in/out with countdown timers
- **WhatsApp reminders** — automated 60min and 15min reminders via Twilio + n8n
- **Missed shift detection** — auto-marks missed shifts, alerts admin via WhatsApp
- **Weekly template engine** — auto-generates shifts from recurring templates every Sunday
- **Error pipeline** — dual-channel alerts (WhatsApp + Email) + DB logging for all automation failures

## Tech Stack

| Layer | Tech |
|---|---|
| Frontend | React 18 + Vite + TypeScript + Tailwind CSS |
| Backend | Supabase (PostgreSQL + Auth + Realtime + Edge Functions) |
| Automation | n8n (WhatsApp reminders, missed detection, template apply) |
| WhatsApp | Twilio WhatsApp Business API via n8n |
| Icons | lucide-react |
| Charts | Recharts |

## Architecture

```
Browser (React)
    |
    |-- Admin: Supabase Auth → Supabase Client (RLS) → PostgreSQL
    |-- Chatter: Token URL → Edge Functions (service role) → PostgreSQL
    |
n8n (every 5 min)
    |-- upcoming-shifts edge fn → Twilio WhatsApp
    |-- detect-missed edge fn → WhatsApp admin alert
    |-- apply-templates edge fn (weekly) → WhatsApp confirmation
    |-- error handler → WhatsApp + Gmail + error_log table
```

## Project Structure

```
src/
├── lib/
│   ├── supabase.ts          # Supabase client + callEdgeFunction wrapper
│   ├── types.ts              # All TypeScript interfaces
│   └── utils.ts              # Hebrew labels, formatters, helpers
├── hooks/
│   ├── useAdminAuth.ts       # Supabase Auth for admin
│   ├── useChatterAuth.ts     # Token-based auth for chatters
│   ├── useShifts.ts          # CRUD + Realtime subscriptions
│   ├── useChatters.ts        # Chatter CRUD
│   ├── useAnalytics.ts       # Dashboard stats + analytics data
│   └── useToast.ts           # Toast notification state
├── components/
│   ├── admin/
│   │   ├── AdminLayout.tsx   # Sidebar navigation
│   │   ├── Dashboard.tsx     # Stat cards overview
│   │   ├── WeeklyGrid.tsx    # Weekly shift calendar
│   │   ├── ShiftEditor.tsx   # Add/edit shift modal
│   │   ├── ChatterManager.tsx# Chatter CRUD + copy link
│   │   ├── TemplateManager.tsx# Recurring shift templates
│   │   ├── ReminderLog.tsx   # WhatsApp reminder history
│   │   ├── ErrorLog.tsx      # Error monitoring dashboard
│   │   └── Analytics.tsx     # Recharts analytics (attendance, trends, models)
│   ├── chatter/
│   │   ├── ChatterLayout.tsx # Mobile-first wrapper
│   │   ├── MySchedule.tsx    # Shift list grouped by date
│   │   └── ShiftCard.tsx     # Clock-in/out + countdown
│   └── shared/
│       ├── StatusBadge.tsx
│       ├── TimeDisplay.tsx
│       ├── LoadingSpinner.tsx
│       └── ToastContainer.tsx
└── pages/
    ├── LoginPage.tsx         # Admin login (Supabase Auth)
    ├── AdminPage.tsx         # Admin dashboard + tab routing
    └── ChatterPage.tsx       # Chatter personal view
```

## Database (Supabase)

6 tables with RLS:

| Table | Purpose |
|-------|---------|
| `chatters` | Chatter profiles with auto-generated tokens |
| `shifts` | All shifts with status tracking |
| `shift_templates` | Recurring weekly shift definitions |
| `reminder_log` | WhatsApp reminder delivery log (idempotent) |
| `activity_log` | Audit trail: clock-in, clock-out, auto-missed |
| `error_log` | n8n workflow error persistence |

## Edge Functions (8 deployed)

| Function | Auth | Purpose |
|----------|------|---------|
| `chatter-view` | Token | Get chatter profile + shifts |
| `clock-in` | Token | Clock into a scheduled shift |
| `clock-out` | Token | Clock out of an active shift |
| `upcoming-shifts` | JWT | Get shifts needing reminders (for n8n) |
| `log-reminder` | JWT | Log sent reminder (idempotent) |
| `detect-missed` | JWT | Mark overdue shifts as missed |
| `apply-templates` | JWT | Generate shifts from templates |
| `log-error` | JWT | Persist workflow errors to DB |

## n8n Workflows (4 created)

| Workflow | Schedule | Purpose |
|----------|----------|---------|
| WhatsApp Reminders | Every 5 min | Send 60min + 15min shift reminders |
| Missed Shift Detection | Every 5 min | Detect and alert on missed shifts |
| Weekly Template Apply | Sunday 00:00 | Generate next week's shifts |
| Error Handler | On error | WhatsApp + Email + DB logging |

## Quick Start

```bash
# Install dependencies
npm install

# Set environment variables (see .env)
cp .env.example .env

# Start dev server
npm run dev

# Build for production
npm run build
```

## Environment Variables

```env
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
```

## Setup Checklist

### Supabase
- [x] Database migrations (10 applied)
- [x] Edge functions (8 deployed)
- [x] RLS policies with optimized `(select auth.role())`
- [x] Realtime enabled on `shifts` table
- [ ] Create admin user in Supabase Auth dashboard

### n8n
- [ ] Add Twilio API credential (`ShiftPro Twilio`)
- [ ] Add Gmail OAuth2 credential (`ShiftPro Gmail`)
- [ ] Add HTTP Bearer Auth credential with Supabase Service Role Key
- [ ] Set Twilio `from` number in each workflow's Twilio node
- [ ] Set Error Workflow in WF1, WF2, WF3 settings → point to Error Handler
- [ ] Publish all 4 workflows

## Key Design Decisions

- **Hebrew UI (RTL)** — all user-facing text, `dir="rtl"` on root
- **UTC in DB, Asia/Jerusalem in UI** — edge functions handle timezone conversion
- **Token-based chatter auth** — no passwords, link shared via WhatsApp
- **Idempotent reminders** — `UNIQUE(shift_id, reminder_type)` prevents duplicates
- **Dual-channel error alerts** — WhatsApp (immediate) + Email (permanent record)
- **Edge functions validate everything** — never trust the client

## Routes

| Path | View | Auth |
|------|------|------|
| `/login` | Admin login | None |
| `/admin` | Admin dashboard | Supabase Auth |
| `/shift?token=xxx` | Chatter personal view | Token in URL |

## License

Private — OnlyElite internal use only.
