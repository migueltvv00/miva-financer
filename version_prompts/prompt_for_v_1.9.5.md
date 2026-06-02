# Fluxo v1.9.5 — Custom Month Period + Auto-Reports + Reminders

## Overview

Replace fixed calendar months (1st–31st) with a **configurable period start day** stored per user. For example, if the user is paid on the 23rd, their "May period" runs from 23 Apr → 22 May. This affects all month references: transaction filtering, budgets, dashboard, planning, trends, Telegram, and reporting.

Additionally:
- Auto-generate a PDF report when a period ends
- Send Telegram reminders 3 days before period close

---

## Phase A — Period Settings Infrastructure

### A1. User Settings Table

Create `user_settings` table (or add column) to store:

```sql
CREATE TABLE IF NOT EXISTS user_settings (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  month_start_day INTEGER NOT NULL DEFAULT 1 CHECK (month_start_day BETWEEN 1 AND 28),
  reminder_days_before INTEGER NOT NULL DEFAULT 3,
  auto_report_pdf BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE user_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own settings" ON user_settings
  FOR ALL USING (auth.uid() = user_id);
```

Day is capped at 28 to avoid issues with February.

### A2. Centralized Period Utility (`src/lib/periodUtils.ts`)

Create a single source of truth for period calculations:

```typescript
// Given a reference date and startDay, compute the period boundaries
export function getPeriodStart(referenceDate: Date, startDay: number): Date
export function getPeriodEnd(referenceDate: Date, startDay: number): Date
export function getPeriodKey(referenceDate: Date, startDay: number): string // "2025-04-23" format
export function getPeriodLabel(referenceDate: Date, startDay: number): string // "Abr 23 – Mai 22"
export function getNextPeriod(referenceDate: Date, startDay: number): Date
export function getPreviousPeriod(referenceDate: Date, startDay: number): Date
export function isDateInPeriod(date: Date, periodStart: Date, periodEnd: Date): boolean
```

Logic: If today is May 10 and startDay=23, the current period started on Apr 23 and ends on May 22.
If today is May 25, the current period started on May 23 and ends on Jun 22.

### A3. Settings Store + Hook

- `src/store/settingsStore.ts` — Zustand store for user_settings
- `src/hooks/useUserSettings.ts` — Fetch/update settings, stale-while-revalidate pattern
- Expose `monthStartDay` to all hooks that need it

---

## Phase B — Migrate All Month References

### Touch Points (from codebase analysis):

| # | File | What to change |
|---|------|----------------|
| 1 | `src/features/transactions/useTransactionData.ts` (L46-47) | Replace `startOfMonth/endOfMonth` with `getPeriodStart/getPeriodEnd` |
| 2 | `src/features/budgets/useBudgetData.ts` (L20-26, 71, 231, 260) | Replace `getMonthKey` with period-aware key |
| 3 | `src/features/planning/useMonthlyPlanData.ts` (L22-27, 80, 220, 229) | Replace `getMonthKey` with period-aware key |
| 4 | `src/features/net-worth/useNetWorthData.ts` (L31-36, 61) | Replace month key |
| 5 | `src/features/trends/useTrendTransactionData.ts` (L47-49) | Replace 6-month range calculation |
| 6 | `src/features/trends/trendUtils.ts` (L14-23) | Replace `getMonthKeys` |
| 7 | `src/hooks/useRealtimeSync.ts` (L8-17) | Replace `getMonthPrefix` and `isTransactionInMonth` |
| 8 | `src/hooks/useMealCardBudget.ts` | Replace month key |
| 9 | `src/features/investments/utils.ts` | Replace `getMonthStart` |
| 10 | `src/features/investments/useInvestmentData.ts` | Month navigation |
| 11 | `src/features/dashboard/DashboardScreen.tsx` (L431) | YTD end calculation |
| 12 | `src/features/transactions/TransactionListScreen.tsx` (L96, 116-118, 283) | `isSameMonth` → `isDateInPeriod`, navigation |
| 13 | `supabase/functions/telegram-webhook/index.ts` (L1936-1946) | `getCurrentMonthRange` |

### Strategy:

1. Every hook that uses `selectedMonth` must accept `monthStartDay` (from settings store)
2. Replace all `startOfMonth(date)` calls with `getPeriodStart(date, monthStartDay)`
3. Replace all `endOfMonth(date)` calls with `getPeriodEnd(date, monthStartDay)`
4. Replace `addMonths`/`subMonths` with `getNextPeriod`/`getPreviousPeriod`
5. Replace `isSameMonth` with `isDateInPeriod`
6. Month labels change from "Maio 2025" to "23 Abr – 22 Mai" (when startDay ≠ 1)

### Budget/Plan Storage Compatibility:

The `budgets.month` column currently stores `"2025-05-01"`. With custom periods it would store `"2025-04-23"` (the period start date). This is backwards-compatible — existing data with day=1 continues to work when `month_start_day=1`.

---

## Phase C — Settings UI

### C1. Settings Screen Section

Add a "Período mensal" section to SettingsScreen:

- NumericInput for "Dia de início do mês" (1–28)
- Toggle for "Gerar relatório PDF automático"
- NumericInput for "Lembrete X dias antes do fim"
- Save button → upsert to `user_settings`

### C2. Telegram `/periodo` Command

```
/periodo — ver ou alterar o dia de início do mês
/periodo 23 — definir início do mês para dia 23
```

Response: "✅ Período mensal atualizado: dia 23 de cada mês."

---

## Phase D — Auto-Report at Period End

### D1. Edge Function: `period-report`

A scheduled Supabase Edge Function (cron: every day at 08:00 UTC):

1. Query all users from `user_settings` where `auto_report_pdf = true`
2. For each user, check if today = period end date + 1 (i.e., yesterday was their last day)
3. If so, generate the same PDF data as `DashboardPdfExport` for the completed period
4. Store the PDF in Supabase Storage bucket `reports/`
5. Send Telegram message with download link: "📊 Relatório do período [date range] disponível"

### D2. Alternative (simpler): Trigger from client

When user opens the app on the first day of a new period:
- Check if the previous period has an auto-generated report
- If not, generate it client-side using @react-pdf and store it

---

## Phase E — Daily Reminders Before Period End

### E1. Edge Function: `period-reminder`

A scheduled Supabase Edge Function (cron: every day at 19:00 UTC):

1. Query all users from `user_settings` where `reminder_days_before > 0`
2. For each user, calculate days until their period ends
3. If days_remaining <= `reminder_days_before`, send Telegram message:

```
⏰ Faltam X dias para o fim do período (termina a DD/MM).
Tens tudo registado? Use /ultimas para verificar.
```

4. Don't send duplicate reminders (track in `period_reminders_sent` table or use date comparison)

---

## Phase F — Deploy & Verify

```bash
SUPABASE_ACCESS_TOKEN=$SUPABASE_TOKEN /tmp/supabase functions deploy period-reminder --project-ref mkihzxyplnfktsicsrpw --no-verify-jwt
SUPABASE_ACCESS_TOKEN=$SUPABASE_TOKEN /tmp/supabase functions deploy telegram-webhook --project-ref mkihzxyplnfktsicsrpw --no-verify-jwt
pnpm build && npx vercel --prod
```

### Verification:
- [ ] Set month_start_day = 23, verify transactions filter correctly
- [ ] Budget/planning views use correct period boundaries
- [ ] Month label shows "23 Abr – 22 Mai" instead of "Maio 2025"
- [ ] `/periodo 23` via Telegram works
- [ ] Reminder fires 3 days before period end
- [ ] Auto-report generates on period close

---

## Key Design Decisions

| Decision | Rationale |
|----------|-----------|
| Cap day at 28 | February safety |
| Store period start date as budget.month key | Backwards-compatible with existing data (day=1) |
| Client-side PDF (not server) | Already have @react-pdf, works offline, no storage cost |
| Telegram reminders via cron | Doesn't depend on user opening app |
| Single `periodUtils.ts` | All period math in one place — easy to test, single source of truth |
