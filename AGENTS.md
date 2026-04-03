# ShiftPro

Production shift-management app for OnlyElite (admin + chatter flows) with React + Supabase + n8n automation.

## Tech Stack
- Language: TypeScript
- Frontend: React + Vite
- Styling: Tailwind CSS (RTL + dark mode)
- Backend: Supabase (Postgres, Auth, Realtime, Edge Functions)
- Automation: n8n + Twilio WhatsApp

## Commands
- Install deps: `npm install`
- Dev server: `npm run dev`
- Lint: `npm run lint`
- Type check: `npx tsc -b`
- Build: `npm run build`
- Full validation (default before handoff): `npm run lint && npx tsc -b`
- Optional workflow test run: `npx -y vitest run src/test/n8n-workflow.test.ts`

## Project Structure
```text
src/
├── components/
│   ├── admin/      # Admin views (dashboard, scheduling, logs, analytics)
│   ├── chatter/    # Chatter-facing mobile flows
│   └── shared/     # Reusable UI components
├── hooks/          # Data/auth/realtime hooks
├── lib/            # Supabase client, shared types, labels/utils
├── pages/          # Route-level pages
└── test/           # n8n/workflow logic tests
```

## Coding Conventions
- All user-facing UI text stays in Hebrew and uses labels from `src/lib/utils.ts` (`LABELS`).
- Keep RTL-safe UI behavior and classes.
- Use existing hook-first patterns (`use*`) for data and side effects.
- Use strict TypeScript types; avoid `any`.
- Keep service-role keys server-side only (Edge Functions/n8n), never in frontend code.
- Match existing formatting and import style in nearby files.

## Workflow Rules
- Use Spec Mode for tasks touching 3+ files, refactors, or architecture changes.
- Check existing context/spec files before creating new patterns.
- Prefer small, scoped edits and run validation early.
- Do not create/update README/docs unless explicitly requested.

## Subagent Boot & Routing Rules
- Before any delegated task, subagents must read `AGENTS.md` and their own role file in `.factory/droids/`.
- Use `.factory/droids/orchestrator.md` as the default delegator for non-trivial work.
- Use `.factory/droids/implementer.md` for code implementation.
- Use `.factory/droids/test-writer.md` for test creation/updates.
- Use `.factory/droids/reviewer.md` for final correctness and safety review.
- Keep delegation scoped; do not load unrelated files or roles.

## Validation Rules
- After code edits, run `npm run lint && npx tsc -b`.
- If a change impacts runtime behavior, also run the relevant focused test command.
- Do not finish with failing validators unless the user explicitly approves skipping.

## Model Routing (Token Optimization)
- Default model for this project: Sonnet-class balanced coding model (keep stable for cache reuse).
- Escalate to stronger model only for deep architecture/debug tasks.
- Use lightweight model for mechanical edits, grep/audit passes, and formatting fixes.
- Avoid frequent model switching in one feature branch to preserve cache discounts.

## High-Impact Constraints
- Hebrew UI only; preserve RTL behavior.
- DB timestamps in UTC, UI logic in Asia/Jerusalem where applicable.
- Edge Functions must validate input and fail with structured errors.
- Reminder logging must stay idempotent (`shift_id + reminder_type` uniqueness).
- n8n workflows must use the dedicated Error Workflow (no silent failures).

## Do NOT
- Do not expose secrets, tokens, API keys, or service-role credentials.
- Do not introduce new libraries when existing project patterns are sufficient.
- Do not move core auth/shift logic into components; keep logic in hooks/lib.
- Do not commit generated build output or environment secrets.
