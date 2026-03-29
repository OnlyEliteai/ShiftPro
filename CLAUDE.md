# CLAUDE.md — ShiftPro v2

## Identity
You are building ShiftPro v2 for OnlyElite — a shift management system for 15+ OnlyFans chatters. The developer is Gil (CS student, direct communication, ships fast). No hand-holding, no over-engineering.

## Project Goal
Production full-stack shift management: React frontend → Supabase backend → n8n automation → Twilio WhatsApp reminders. Replaces the v1 Claude artifact that used `window.storage`.

---

## Tech Stack (locked)

| Layer | Tech |
|---|---|
| Frontend | React 18 + Vite + TypeScript |
| Styling | Tailwind CSS (dark mode, RTL) |
| Icons | lucide-react |
| Backend / DB | Supabase (PostgreSQL + Auth + Realtime + Edge Functions) |
| Auth | Supabase Auth (admin login) + token-based URLs (chatters — no passwords) |
| Realtime | Supabase Realtime subscriptions on `shifts` table |
| Automation | n8n (cloud, native Supabase + Twilio nodes) |
| WhatsApp | Twilio WhatsApp Business API via n8n |

---

## Supabase Project (LIVE)

```
Project ID:   cudyljivkfmkknfkldht
URL:          https://cudyljivkfmkknfkldht.supabase.co
Anon Key:     eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImN1ZHlsaml2a2Zta2tuZmtsZGh0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ4MDgzMDMsImV4cCI6MjA5MDM4NDMwM30.3TmhdkQXuYyAZvbjuYDFCFW58_qVGPCoaumKOG5lLII
Region:       ap-northeast-2
DB Host:      db.cudyljivkfmkknfkldht.supabase.co
Status:       ACTIVE_HEALTHY (fresh — no tables yet)
```

Use the Supabase MCP tools to run migrations and deploy edge functions directly. Do NOT create migrations manually — use `Supabase:apply_migration`.

---

## Database Schema

Run these as sequential migrations via `Supabase:apply_migration`:

### Migration 1: `create_chatters_table`
```sql
CREATE TABLE chatters (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  phone TEXT NOT NULL,
  token TEXT UNIQUE NOT NULL DEFAULT encode(gen_random_bytes(16), 'hex'),
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_chatters_token ON chatters(token);
CREATE INDEX idx_chatters_active ON chatters(active);
```

### Migration 2: `create_shifts_table`
```sql
CREATE TABLE shifts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  chatter_id UUID REFERENCES chatters(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  model TEXT,
  status TEXT DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'active', 'completed', 'missed')),
  clocked_in TIMESTAMPTZ,
  clocked_out TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_shifts_date ON shifts(date);
CREATE INDEX idx_shifts_chatter ON shifts(chatter_id);
CREATE INDEX idx_shifts_status ON shifts(status);
```

### Migration 3: `create_shift_templates_table`
```sql
CREATE TABLE shift_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  chatter_id UUID REFERENCES chatters(id) ON DELETE CASCADE,
  day_of_week INT NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  model TEXT,
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);
```

### Migration 4: `create_reminder_log_table`
```sql
CREATE TABLE reminder_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shift_id UUID REFERENCES shifts(id) ON DELETE CASCADE,
  reminder_type TEXT NOT NULL CHECK (reminder_type IN ('60min', '15min')),
  sent_at TIMESTAMPTZ DEFAULT now(),
  delivery_status TEXT DEFAULT 'sent',
  twilio_sid TEXT,
  UNIQUE(shift_id, reminder_type)
);
```

### Migration 5: `create_activity_log_table`
```sql
CREATE TABLE activity_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shift_id UUID REFERENCES shifts(id) ON DELETE CASCADE,
  chatter_id UUID REFERENCES chatters(id),
  action TEXT NOT NULL CHECK (action IN ('clock_in', 'clock_out', 'auto_missed', 'manual_override')),
  timestamp TIMESTAMPTZ DEFAULT now(),
  metadata JSONB DEFAULT '{}'
);
```

### Migration 6: `enable_rls_and_policies`
```sql
ALTER TABLE chatters ENABLE ROW LEVEL SECURITY;
ALTER TABLE shifts ENABLE ROW LEVEL SECURITY;
ALTER TABLE shift_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE reminder_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE activity_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE error_log ENABLE ROW LEVEL SECURITY;

-- Admin (authenticated via Supabase Auth): full access
CREATE POLICY "admin_all" ON chatters FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "admin_all" ON shifts FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "admin_all" ON shift_templates FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "admin_all" ON reminder_log FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "admin_all" ON activity_log FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "admin_all" ON error_log FOR ALL USING (auth.role() = 'authenticated');

-- Service role (Edge Functions + n8n): bypasses RLS automatically
-- Chatters: access only through Edge Functions (token validated server-side)
```

### Migration 7: `create_error_log_table`
```sql
CREATE TABLE error_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_name TEXT NOT NULL,
  node_name TEXT,
  error_message TEXT NOT NULL,
  error_stack TEXT,
  input_data JSONB DEFAULT '{}',
  retry_count INT DEFAULT 0,
  max_retries INT DEFAULT 3,
  resolved BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  resolved_at TIMESTAMPTZ
);

CREATE INDEX idx_error_log_unresolved ON error_log(resolved) WHERE resolved = false;
CREATE INDEX idx_error_log_workflow ON error_log(workflow_name);
```

### Migration 8: `enable_realtime`
```sql
ALTER PUBLICATION supabase_realtime ADD TABLE shifts;
```

---

## Supabase Edge Functions

Deploy via `Supabase:deploy_edge_function`. All use Deno. Create Supabase client with service role key from `Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')`.

### Edge Function Template
```typescript
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

Deno.serve(async (req: Request) => {
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  // ... function logic ...

  return new Response(JSON.stringify(data), {
    headers: { "Content-Type": "application/json" },
  });
});
```

### 1. `chatter-view` (GET, verify_jwt: false)
- Query param: `?token=xxx`
- Validates token → returns chatter profile + shifts for current week + next week
- Returns 401 if token invalid/inactive

### 2. `clock-in` (POST, verify_jwt: false)
- Body: `{ "token": "xxx", "shiftId": "uuid" }`
- Validates: token owns the shift, shift status is `scheduled`
- Sets `clocked_in = now()`, `status = 'active'`
- Inserts `activity_log` with `action = 'clock_in'`
- Returns updated shift

### 3. `clock-out` (POST, verify_jwt: false)
- Body: `{ "token": "xxx", "shiftId": "uuid" }`
- Validates: token owns shift, shift status is `active`
- Sets `clocked_out = now()`, `status = 'completed'`
- Inserts `activity_log` with `action = 'clock_out'`
- Returns updated shift

### 4. `upcoming-shifts` (GET, verify_jwt: true)
- Called by n8n with service role key in Authorization header
- Returns shifts where:
  - `status = 'scheduled'`
  - Start is 55–65 min from now → `reminder_type: '60min'`
  - Start is 10–20 min from now → `reminder_type: '15min'`
- LEFT JOIN `reminder_log` to exclude already-sent
- JOIN `chatters` for `name` and `phone`
- All time math in `Asia/Jerusalem`

### 5. `log-reminder` (POST, verify_jwt: true)
- Body: `{ "shiftId": "uuid", "reminderType": "60min"|"15min", "twilioSid": "SMxxxx" }`
- INSERT INTO `reminder_log` ON CONFLICT DO NOTHING

### 6. `apply-templates` (POST, verify_jwt: true)
- Reads active `shift_templates`
- Generates `shifts` for next 7 days
- Skips duplicates (same chatter + date + start_time)
- Returns `{ created: number }`

### 7. `detect-missed` (POST, verify_jwt: true)
- Finds: `status = 'scheduled'` AND shift start + 15 min < now (Asia/Jerusalem)
- Updates to `status = 'missed'`
- Inserts `activity_log` with `action = 'auto_missed'`
- Returns `{ missed: [{ chatter_name, start_time }] }`

### 8. `log-error` (POST, verify_jwt: true)
- Body: `{ "workflowName": "string", "nodeName": "string", "errorMessage": "string", "errorStack": "string", "inputData": {} }`
- Inserts into `error_log`
- Returns `{ id: "uuid", logged: true }`

---

## n8n Workflows

n8n instance: `gilelite.app.n8n.cloud`. Has native Supabase + Twilio nodes.

### n8n Credential Setup (manual in n8n dashboard)
- **Supabase**: name `ShiftPro Supabase`, Project URL + Service Role Key
- **Twilio**: name `ShiftPro Twilio`, Account SID + Auth Token
- **Gmail**: name `ShiftPro Gmail`, OAuth2 (Gil's gmail)

### n8n Node Reference (exact parameter schemas — do NOT guess)

**Schedule Trigger** (`n8n-nodes-base.scheduleTrigger` v1.3):
```
rule.interval[0].field = 'minutes'
rule.interval[0].minutesInterval = 5
```

**Supabase GetAll** (`n8n-nodes-base.supabase` v1):
```
resource: 'row', operation: 'getAll'
tableId: 'shifts' | 'chatters' | 'reminder_log'
returnAll: true
filterType: 'manual'
filters.conditions[]: { keyName, condition ('eq'|'gt'|'lt'|'neq'), keyValue }
matchType: 'allFilters'
```

**Supabase Create** (`n8n-nodes-base.supabase` v1):
```
resource: 'row', operation: 'create'
tableId: 'reminder_log'
dataToSend: 'autoMapInputData' | 'defineBelow'
fieldsUi.fieldValues[]: { fieldId, fieldValue }
```

**Supabase Update** (`n8n-nodes-base.supabase` v1):
```
resource: 'row', operation: 'update'
tableId: 'shifts'
filterType: 'manual'
filters.conditions[]: { keyName: 'id', condition: 'eq', keyValue: '={{$json.id}}' }
dataToSend: 'defineBelow'
fieldsUi.fieldValues[]: { fieldId: 'status', fieldValue: 'missed' }
```

**Twilio Send WhatsApp** (`n8n-nodes-base.twilio` v1):
```
resource: 'sms', operation: 'send'
from: 'whatsapp:+TWILIO_NUMBER'
to: '={{$json.phone}}'
toWhatsapp: true
message: '={{$json.reminder_message}}'
```

**Code Node** (`n8n-nodes-base.code` v2):
```
mode: 'runOnceForAllItems'
language: 'javaScript'
jsCode: '...'
```

**If Node** (`n8n-nodes-base.if` v2.3):
```
conditions: { conditions: [{ leftValue, operator: { type, operation }, rightValue }] }
```

**Gmail Send** (`n8n-nodes-base.gmail` v2.2):
```
resource: 'message', operation: 'send'
sendTo: 'gil@onlyelite.co.il'
subject: '={{$json.email_subject}}'
emailType: 'html'
message: '={{$json.email_body}}'
options.appendAttribution: false
```

**Error Trigger** (`n8n-nodes-base.errorTrigger` v1):
```
// No params — triggers when the linked workflow errors
// Set as "Error Workflow" in the erroring workflow's settings
// Receives: $json.execution.id, $json.execution.error.message, $json.workflow.name
```

### Workflow 1: `ShiftPro — WhatsApp Reminders` (every 5 min)

```
Schedule Trigger (every 5 min)
  │
  ├─ HTTP Request: GET {SUPABASE_URL}/functions/v1/upcoming-shifts
  │   Headers: Authorization: Bearer {SERVICE_ROLE_KEY}
  │   (HTTP Request because edge function handles complex join + time math)
  │
  ├─ If: items.length > 0
  │   │
  │   ├─ TRUE → Code Node: Build WhatsApp messages per item
  │   │   - 60min: "היי {name}! 🔔 תזכורת: יש לך משמרת בעוד שעה ({startTime}). מודל: {model}"
  │   │   - 15min: "{name}, המשמרת שלך מתחילה בעוד 15 דקות! ({startTime}) — תתחבר/י ותסמן/י כניסה."
  │   │
  │   ├─ Twilio: Send WhatsApp (toWhatsapp: true)
  │   │
  │   └─ HTTP Request: POST {SUPABASE_URL}/functions/v1/log-reminder
  │       Body: { shiftId, reminderType, twilioSid }
  │
  └─ FALSE → NoOp
```

### Workflow 2: `ShiftPro — Missed Shift Detection` (every 5 min)

```
Schedule Trigger (every 5 min)
  │
  ├─ HTTP Request: POST {SUPABASE_URL}/functions/v1/detect-missed
  │
  ├─ If: missed count > 0
  │   │
  │   ├─ Code Node: Build admin alert
  │   │   "⚠️ משמרות שלא התחילו:\n{name} — {time}\n..."
  │   │
  │   └─ Twilio: Send WhatsApp to admin (Gil's number)
  │
  └─ FALSE → NoOp
```

### Workflow 3: `ShiftPro — Weekly Template Apply` (Sunday 00:00 IL)

```
Schedule Trigger (weekly, Sunday, 00:00)
  │
  ├─ HTTP Request: POST {SUPABASE_URL}/functions/v1/apply-templates
  │
  └─ Twilio: Send WhatsApp to admin
      "✅ המשמרות לשבוע הבא נוצרו ({count} משמרות חדשות)."
```

### Workflow 4: `ShiftPro — Error Handler` (Error Trigger)

This is a **separate workflow** set as the "Error Workflow" for Workflows 1, 2, and 3. When any of those workflows fail, this one fires automatically.

```
Error Trigger (fires when a linked workflow errors)
  │
  ├─ Code Node: Extract error context
  │   Sets: workflow_name, node_name, error_message, error_stack,
  │          timestamp (Asia/Jerusalem), execution_id, execution_url
  │   Builds Hebrew WhatsApp alert + HTML email body
  │
  ├─ Twilio: Send WhatsApp to admin (IMMEDIATE — Gil sees it on his phone)
  │   to: 'whatsapp:+972XXXXXXXXX'
  │   toWhatsapp: true
  │   message: |
  │     "🚨 שגיאה ב-ShiftPro!
  │      Workflow: {workflow_name}
  │      Node: {node_name}
  │      שגיאה: {error_message}
  │      זמן: {timestamp}
  │      🔗 {execution_url}"
  │
  ├─ Gmail: Send email to admin (BACKUP — permanent record + details)
  │   resource: 'message', operation: 'send'
  │   sendTo: 'gil@onlyelite.co.il'
  │   subject: '🚨 ShiftPro Error: {workflow_name} — {node_name}'
  │   emailType: 'html'
  │   message: |
  │     <div dir="rtl" style="font-family: sans-serif;">
  │       <h2>🚨 שגיאה במערכת ShiftPro</h2>
  │       <table>
  │         <tr><td><b>Workflow:</b></td><td>{workflow_name}</td></tr>
  │         <tr><td><b>Node:</b></td><td>{node_name}</td></tr>
  │         <tr><td><b>Error:</b></td><td>{error_message}</td></tr>
  │         <tr><td><b>Time:</b></td><td>{timestamp}</td></tr>
  │         <tr><td><b>Stack:</b></td><td><pre>{error_stack}</pre></td></tr>
  │       </table>
  │       <p><a href="{execution_url}">צפה ב-execution ב-n8n</a></p>
  │     </div>
  │
  └─ HTTP Request: POST {SUPABASE_URL}/functions/v1/log-error
      Body: { workflowName, nodeName, errorMessage, errorStack, inputData }
      (Persists to error_log table for dashboard visibility)
```

**Setup**: In n8n, go to Workflows 1, 2, 3 → Settings → Error Workflow → select "ShiftPro — Error Handler"

---

## Error Handling & Retry Strategy

### Philosophy
Gil must know about failures within seconds (WhatsApp) AND have a permanent searchable record (email + DB). The system retries automatically where safe, and alerts Gil when it can't self-heal.

### Layer 1: Edge Function Error Handling
Every edge function wraps its logic in try/catch and returns structured errors:

```typescript
// Standard error response pattern for ALL edge functions
try {
  // ... function logic ...
  return new Response(JSON.stringify({ success: true, data }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
} catch (error) {
  console.error(`[${functionName}]`, error);
  return new Response(JSON.stringify({
    success: false,
    error: error.message,
    function: functionName,
    timestamp: new Date().toISOString(),
  }), {
    status: 500,
    headers: { "Content-Type": "application/json" },
  });
}
```

### Layer 2: n8n Workflow-Level Retry
Each workflow's critical nodes have retry configured:

| Node Type | Retry On Fail | Max Retries | Wait Between |
|---|---|---|---|
| HTTP Request (edge functions) | Yes | 3 | 30 seconds |
| Twilio Send WhatsApp | Yes | 2 | 15 seconds |
| Gmail Send | Yes | 2 | 15 seconds |
| Supabase CRUD | Yes | 3 | 10 seconds |

Configure in n8n: select node → Settings → "Retry on Fail" → set values.

### Layer 3: n8n Error Workflow (Workflow 4)
When retries exhaust and a workflow still fails:
1. **WhatsApp alert** → Gil's phone, immediately (Hebrew, concise, includes link to n8n execution)
2. **Email alert** → Gil's inbox, HTML formatted with full stack trace + context
3. **DB log** → `error_log` table, queryable from admin dashboard

### Layer 4: Frontend Error Handling
Edge function calls from the frontend include error handling:

```typescript
// In every hook that calls an edge function
const callEdgeFunction = async (name: string, options: RequestInit) => {
  try {
    const res = await fetch(
      `${SUPABASE_URL}/functions/v1/${name}`,
      options
    );
    const data = await res.json();

    if (!res.ok || !data.success) {
      // Show Hebrew error toast to user
      showToast({ type: 'error', message: data.error || 'שגיאה בשרת' });
      return null;
    }
    return data;
  } catch (err) {
    // Network error — show offline/retry message
    showToast({ type: 'error', message: 'אין חיבור לשרת. נסה שוב.' });
    return null;
  }
};
```

### Layer 5: Supabase Realtime Reconnection
```typescript
// In useShifts.ts — handle disconnection gracefully
const channel = supabase.channel('shifts-realtime')
  .on('postgres_changes', { event: '*', schema: 'public', table: 'shifts' }, handleChange)
  .on('system', {}, (payload) => {
    if (payload.extension === 'postgres_changes' && payload.status === 'error') {
      // Reconnect after 5 seconds
      setTimeout(() => channel.subscribe(), 5000);
      showToast({ type: 'warning', message: 'מתחבר מחדש...' });
    }
  })
  .subscribe();
```

### Error Scenarios & Expected Behavior

| Scenario | What Happens | Gil Sees |
|---|---|---|
| Twilio fails to send WhatsApp reminder | n8n retries 2x → if still fails → Error Workflow fires | WhatsApp: "🚨 שגיאה: Twilio SMS send failed" + Email with details |
| Supabase Edge Function down | n8n retries 3x @ 30s → Error Workflow fires | WhatsApp + Email: which function, what error |
| `upcoming-shifts` returns empty (no reminders to send) | Normal flow — If node routes to NoOp | Nothing (expected behavior, not an error) |
| Chatter's clock-in request fails (network) | Frontend shows "שגיאה בשרת. נסה שוב." toast | Chatter retries manually |
| Realtime subscription drops | Auto-reconnect after 5s, warning toast | Admin sees "מתחבר מחדש..." then auto-recovers |
| Weekly template apply creates 0 shifts (all exist) | Success response with `created: 0` | WhatsApp: "✅ המשמרות לשבוע הבא נוצרו (0 משמרות חדשות)." |
| DB connection error in edge function | Edge function returns 500 → n8n retries → Error Workflow | WhatsApp + Email with DB error details |
| Gmail send fails in Error Workflow | Twilio WhatsApp already sent (runs first) → error logged to console | Gil still gets WhatsApp, email delivery fails silently |

### Admin Dashboard: Error Log View
Add an `ErrorLog.tsx` component to the admin view:
- Shows unresolved errors from `error_log` table
- Red badge count on sidebar "שגיאות" nav item
- Each row: timestamp, workflow name, error message, link to n8n execution
- "Mark resolved" button per error
- Filter by workflow, date range

### n8n Node Reference: Error Handling Nodes

**Error Trigger** (`n8n-nodes-base.errorTrigger` v1):
```
// No config needed — auto-receives error context
// Access via expressions:
//   $json.execution.id → execution ID
//   $json.execution.error.message → error message
//   $json.execution.error.node → node that failed
//   $json.execution.url → direct link to execution in n8n
//   $json.workflow.name → workflow name
```

**Gmail Send** (`n8n-nodes-base.gmail` v2.2):
```
resource: 'message', operation: 'send'
authentication: 'oAuth2'
sendTo: 'gil@onlyelite.co.il'
subject: '={{$json.email_subject}}'
emailType: 'html'
message: '={{$json.email_body}}'
options.appendAttribution: false
```

### File Structure
```
src/
├── main.tsx
├── App.tsx
├── lib/
│   ├── supabase.ts
│   ├── types.ts
│   └── utils.ts
├── hooks/
│   ├── useChatterAuth.ts
│   ├── useAdminAuth.ts
│   ├── useShifts.ts
│   ├── useChatters.ts
│   └── useAnalytics.ts
├── components/
│   ├── admin/
│   │   ├── AdminLayout.tsx
│   │   ├── Dashboard.tsx
│   │   ├── WeeklyGrid.tsx
│   │   ├── ChatterManager.tsx
│   │   ├── ShiftEditor.tsx
│   │   ├── TemplateManager.tsx
│   │   ├── ReminderLog.tsx
│   │   ├── ErrorLog.tsx        -- Unresolved errors from error_log table
│   │   └── Analytics.tsx
│   ├── chatter/
│   │   ├── ChatterLayout.tsx
│   │   ├── MySchedule.tsx
│   │   └── ShiftCard.tsx
│   └── shared/
│       ├── StatusBadge.tsx
│       ├── TimeDisplay.tsx
│       └── LoadingSpinner.tsx
└── pages/
    ├── AdminPage.tsx
    ├── ChatterPage.tsx
    └── LoginPage.tsx
```

### Routing
```
/              → /admin (if authed) or /login
/login         → Supabase Auth UI
/admin         → Dashboard + sub-views (schedule, chatters, templates, analytics, reminders)
/shift?token=x → Chatter personal view
```

### Realtime
```typescript
supabase.channel('shifts-realtime')
  .on('postgres_changes', { event: '*', schema: 'public', table: 'shifts' }, handleChange)
  .subscribe();
```

### Interactive Features
1. Click-to-create on weekly grid → ShiftEditor modal
2. Live "who's online" green dots (shift status === 'active')
3. Toast notifications on clock-in/out (realtime)
4. Countdown timer in chatter view
5. Copy personal link button
6. "Apply templates" button → calls edge function
7. Attendance sparklines per chatter (last 4 weeks)

### Analytics Metrics (Recharts)
- Attendance rate: `completed / (completed + missed)` per chatter, 30 days
- Avg clock-in delay: `AVG(clocked_in - (date + start_time))` per chatter
- Missed rate: `missed / total` per chatter + overall
- Weekly workload: shifts per chatter (bar chart)
- Model coverage: shifts per model
- Trend: attendance % over 12 weeks (line chart)

---

## Environment Variables

### Frontend (.env)
```
VITE_SUPABASE_URL=https://cudyljivkfmkknfkldht.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImN1ZHlsaml2a2Zta2tuZmtsZGh0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ4MDgzMDMsImV4cCI6MjA5MDM4NDMwM30.3TmhdkQXuYyAZvbjuYDFCFW58_qVGPCoaumKOG5lLII
```

### Supabase Secrets (set via dashboard)
```
SUPABASE_SERVICE_ROLE_KEY=<get from Supabase dashboard → Settings → API>
```

### n8n Credentials (set in n8n UI)
```
Supabase: URL + Service Role Key
Twilio: SID + Token + From number
```

---

## Implementation Order

### Phase 1: Database
1. Run migrations 1–8 via `Supabase:apply_migration` on `cudyljivkfmkknfkldht`
2. Verify via `Supabase:list_tables`
3. Check security via `Supabase:get_advisors` (type: security)
4. Insert test chatters via `Supabase:execute_sql`

### Phase 2: Edge Functions
5–11. Deploy all 7 edge functions via `Supabase:deploy_edge_function` (chatter-view, clock-in, clock-out, upcoming-shifts, log-reminder, detect-missed, apply-templates)
12. Deploy `log-error` edge function
13. Test each with curl / Postman

### Phase 3: Frontend Core
14. Vite + React + TS scaffold
15. Install deps: `@supabase/supabase-js`, `tailwindcss`, `lucide-react`, `react-router-dom`, `recharts`
16. Tailwind config (RTL, dark mode)
17. `supabase.ts`, `types.ts`, `utils.ts`
18. Auth: LoginPage, useAdminAuth, useChatterAuth
19. Admin: ChatterManager
20. Admin: WeeklyGrid + ShiftEditor
21. Chatter: MySchedule + ShiftCard
22. Frontend error handling: `callEdgeFunction` wrapper with Hebrew error toasts

### Phase 4: Realtime + Dashboard
23. Realtime subscription in useShifts (with auto-reconnect)
24. Dashboard with metrics + toasts
25. "Who's online" indicators
26. Countdown timer (chatter view)

### Phase 5: n8n Workflows + Error Handling
27. Validate + create Workflow 4 (Error Handler) FIRST via `n8n:validate_workflow` + `n8n:create_workflow_from_code`
28. Publish Workflow 4 via `n8n:publish_workflow`
29. Validate + create Workflow 1 (Reminders) — set Error Workflow = Workflow 4 in settings
30. Validate + create Workflow 2 (Missed Detection) — set Error Workflow = Workflow 4
31. Validate + create Workflow 3 (Template Apply) — set Error Workflow = Workflow 4
32. Publish Workflows 1–3
33. Test error handling: intentionally break an edge function URL → verify WhatsApp + Email arrive
34. E2E test: create shift → wait for reminder → verify WhatsApp received

### Phase 6: Templates + Analytics + Error Dashboard
35. TemplateManager
36. Apply-templates button
37. Analytics with Recharts
38. ReminderLog view
39. ErrorLog view (admin sidebar: "שגיאות" with red badge for unresolved count)

---

## Hard Constraints

1. **Hebrew UI** — all user-facing text in Hebrew
2. **RTL** — `dir="rtl"` on root
3. **Mobile-first chatter view** — chatters use phones
4. **UTC in DB, Asia/Jerusalem in UI**
5. **Anon key in frontend only** — service role key stays server-side
6. **Token links = chatter auth** — no passwords for chatters
7. **Edge Functions validate everything** — never trust client
8. **Idempotent reminders** — UNIQUE(shift_id, reminder_type)
9. **Native n8n nodes** — use Supabase + Twilio nodes, HTTP Request only for edge functions
10. **Ship before polish** — working CRUD before animations
11. **Every n8n workflow MUST have Error Workflow set** — point to Workflow 4 (Error Handler). No silent failures.
12. **Dual-channel error alerts** — WhatsApp (immediate, Hebrew) + Email (permanent record, HTML with stack trace). WhatsApp fires FIRST.
13. **Every edge function wraps in try/catch** — returns `{ success: false, error }` on failure, never crashes silently
14. **Retry before alert** — n8n retries failed nodes (HTTP: 3x/30s, Twilio: 2x/15s, Gmail: 2x/15s) before Error Workflow fires
15. **Error log in DB** — all workflow errors persist to `error_log` table, visible in admin dashboard

---

## Hebrew Labels

```typescript
export const LABELS = {
  dashboard: 'לוח בקרה',
  schedule: 'לוח משמרות',
  chatters: 'צ׳אטרים',
  analytics: 'אנליטיקס',
  templates: 'תבניות',
  reminders: 'תזכורות',
  settings: 'הגדרות',
  clockIn: 'כניסה למשמרת',
  clockOut: 'יציאה ממשמרת',
  addShift: 'הוסף משמרת',
  editShift: 'ערוך משמרת',
  deleteShift: 'מחק משמרת',
  addChatter: 'הוסף צ׳אטר/ית',
  copyLink: 'העתק קישור',
  applyTemplates: 'החל תבניות לשבוע הבא',
  save: 'שמור',
  cancel: 'ביטול',
  login: 'התחברות',
  logout: 'התנתקות',
  scheduled: 'מתוכנן',
  active: 'פעיל',
  completed: 'הושלם',
  missed: 'לא הגיע',
  online: 'מחובר/ת',
  activeChatters: 'צ׳אטרים פעילים',
  currentlyOnShift: 'במשמרת כרגע',
  todayShifts: 'משמרות היום',
  attendanceRate: 'אחוז נוכחות',
  avgDelay: 'איחור ממוצע',
  missedRate: 'אחוז החמצה',
  days: ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'],
  shiftStartsIn: 'המשמרת מתחילה בעוד',
  minutesShort: 'דק׳',
  hoursShort: 'שע׳',
  clockedInSuccess: 'נכנסת למשמרת בהצלחה!',
  clockedOutSuccess: 'יצאת מהמשמרת. תודה!',
  noUpcomingShifts: 'אין משמרות קרובות',
  linkCopied: 'הקישור הועתק!',

  // Errors
  errors: 'שגיאות',
  serverError: 'שגיאה בשרת',
  noConnection: 'אין חיבור לשרת. נסה שוב.',
  reconnecting: 'מתחבר מחדש...',
  markResolved: 'סמן כטופל',
  unresolvedErrors: 'שגיאות פתוחות',
} as const;
```

---

## What NOT to Build
- Chat/messaging (WhatsApp handles that)
- Content management (separate system)
- Payment/billing
- Multi-tenant
- Native mobile app
- Complex roles beyond admin + chatter
- Push notifications (WhatsApp is the channel)
- Custom retry queue system (n8n's built-in retry handles this)
- Separate monitoring service (error_log table + Error Workflow is sufficient)

---

## Fallback Behavior (when things go wrong)

<fallback_rules>
These rules define what to do when you hit blockers, ambiguity, or failure during implementation. Follow them strictly — do NOT silently skip broken steps.

### If a Supabase MCP tool call fails:
1. Read the error message carefully
2. If it's a permission/RLS issue → check the migration ran correctly via `Supabase:list_migrations`
3. If it's a connection issue → retry once, then report to Gil with the exact error
4. NEVER silently skip a failed migration — the rest of the system depends on the schema being correct

### If an n8n workflow validation fails:
1. Read the validation error
2. Check node parameter names against the exact schemas in the "n8n Node Reference" section above
3. Fix and re-validate — do NOT create a workflow that failed validation
4. If stuck after 3 attempts → show Gil the error and the code, ask for guidance

### If you're unsure about a design decision:
1. Check this CLAUDE.md first — most decisions are already made
2. If the answer isn't here → pick the simpler option and document what you chose with a `// DECISION:` comment
3. NEVER add a feature not listed in this spec without asking Gil first

### If a Supabase Edge Function deployment fails:
1. Check `Supabase:get_logs` (service: 'edge-function') for deployment errors
2. Common issues: missing imports, Deno compatibility, env var not set
3. Fix and redeploy — edge functions are idempotent (redeploying overwrites)

### If an n8n workflow runs but produces wrong results:
1. Check the n8n execution log (link in error workflow notification)
2. Verify the edge function returns the expected shape by testing with curl
3. Verify n8n expressions reference the correct `$json` paths

### If you can't connect to Supabase or n8n:
1. Tell Gil immediately — these are infrastructure issues he needs to resolve
2. Continue working on frontend code that doesn't depend on the blocked service
3. Use mock data in frontend components so progress isn't blocked

### Priority order when multiple things break:
1. Fix error notification pipeline first (Workflow 4) — Gil needs to know about failures
2. Fix edge functions — they're the API layer everything depends on
3. Fix n8n workflows — automation layer
4. Fix frontend issues — users can wait, automation can't
</fallback_rules>
