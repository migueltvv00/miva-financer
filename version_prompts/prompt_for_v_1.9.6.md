# Fluxo v1.9.6 — UX Polish, Budget Rollover & Recurring Summaries

## Overview

This version focuses on three areas:

1. **Bug fixes & UX hardening** — small paper-cuts that hurt daily use
2. **Budget rollover** — carry unused/overspent budget forward to next period
3. **Recurring transaction summary** — visibility into what auto-creates each period

---

## Feature Catalogue (validate before starting)

Mark each line with ✅ keep / ❌ skip:

```
✅  A. Budget rollover (carry delta to next period)
✅  B. Recurring transaction summary panel on Dashboard
✅  C. Transaction quick-duplicate (copy an existing transaction)
✅  D. Category spending sparkline (7-period mini chart on Category list)
✅  E. Offline queue visible indicator (badge on nav showing queued count)
✅  F. Period PDF auto-generate on first open of new period (client-side)
```

All ✅ items are implemented. ❌ items are skipped entirely — no stub code.

---

## Phase 0 — Bug Fixes (always included)

### 0.1 PWA chunk staleness (DONE — deployed in hotfix)
- `vite:preloadError` auto-reload ✅
- `NetworkFirst` for `/assets/*.js` ✅

### 0.2 Local state desync on period day change

**Bug:** When the user changes `monthStartDay` in Settings, open screens (Dashboard, Transactions) still show the old period until a full reload.

**Fix:** In `settingsStore.ts`, after `setSettings()`, emit a custom event or update a `settingsVersion` counter. All hooks that depend on `monthStartDay` subscribe to the store correctly — verify they re-derive `selectedMonth` when `monthStartDay` changes (they currently use `useState` initialised once at mount).

**Affected hooks:** `useBudgetData`, `useTransactionData`, `useMonthlyPlanData`, `useNetWorthData`, `useInvestmentData`

**Approach:** Add `useEffect` that resets `selectedMonth` to `getPeriodStart(new Date(), monthStartDay)` when `monthStartDay` changes.

### 0.3 `useMonthlyPlanData` — `copyFromPreviousMonth` dependency array has unused `monthStartDay`

Check `useMonthlyPlanData` — the `copyPlanToNextMonth` callback uses `monthStartDay` from the module scope (via store.getState()) but it should also be in the dep array to avoid stale closure.

---

## Phase A — Budget Rollover

### A1. Schema

```sql
ALTER TABLE budgets
  ADD COLUMN IF NOT EXISTS rollover_cents INTEGER NOT NULL DEFAULT 0;
```

`rollover_cents` stores the signed carry from the previous period:
- Positive = underspent (more budget this period)
- Negative = overspent (less budget this period)

### A2. Logic

In `useBudgetData.ts`, add a `rolloverFromPrevious()` function:

1. Fetch the previous period's budgets (with `rollover_cents` and `limit_cents`)
2. Fetch actual spending for the previous period
3. Compute delta = `limit_cents + rollover_cents - actual_spent_cents` for each category
4. Upsert the current period's budgets with `rollover_cents = delta`

Expose a `rolloverBudgets()` action from the hook.

### A3. UI

In `BudgetScreen` (inside SettingsScreen), add a "Transportar do período anterior" button at the top. Only show it if the previous period has budgets but the current period does not yet have any rollover applied.

Show a small `(+X,XX €)` or `(-X,XX €)` badge next to each budget item to indicate the rollover component.

---

## Phase B — Recurring Transaction Summary

### B1. Component: `RecurringPanel`

New component `src/features/transactions/RecurringPanel.tsx`:
- Reads from `transactions` where `is_recurring = true AND recurring_parent_id IS NULL`
- Groups by frequency (mensal, semanal, etc.)
- Shows name, amount, next occurrence date, payment method
- "Ver todas" → navigates to `/transacoes?filter=recorrentes`

### B2. Dashboard placement

In `DashboardScreen.tsx`, add `<RecurringPanel />` in a collapsible `<details>` below the expense breakdown chart. Start collapsed.

### B3. Transaction list filter

In `TransactionListScreen.tsx`, if `?filter=recorrentes` is in the URL, pre-set the filter to show only recurring transactions.

---

## Phase C — Transaction Quick-Duplicate

In `TransactionListScreen.tsx`, add a ⊕ (copy) icon to the transaction row action bar (alongside the existing edit ✏️ / delete 🗑️ icons). Tapping it opens the entry modal pre-filled with all fields of the selected transaction but with today's date. User can tweak and confirm.

No new backend work — just reuse the existing `createTransaction` flow.

---

## Phase D — Category Spending Sparkline (optional, skip if complex)

In the Category list (SettingsScreen → CategoryList), each expense category shows a tiny 6-period sparkline (inline SVG, no Recharts, to keep bundle size down). Data comes from `trendTransactions` already in the store. Render only when trend data is loaded; hide otherwise.

---

## Phase E — Offline Queue Badge

In `src/components/NavBar.tsx` (or equivalent nav component), show a small orange dot badge on the nav icon when `localStorage.getItem('fluxo-offline-queue')` has items. Re-read on focus/online events.

---

## Phase F — Period PDF Auto-Generate

On the first render after a new period starts (i.e., `getPeriodKey(new Date(), monthStartDay) !== lastSeenPeriodKey`):
1. Read `lastSeenPeriodKey` from `localStorage`
2. If it changed, check if `autoReportPdf` is true in settings
3. If so, programmatically trigger the existing `PDFDownloadLink` for the just-closed period
4. Update `lastSeenPeriodKey` in `localStorage`

Implement as a hook: `useAutoReportPdf()` called once in `DashboardScreen`.

---

## Phase G — Deploy

```bash
npx tsc --noEmit
pnpm build
npx vercel --prod --yes
SUPABASE_ACCESS_TOKEN=$SUPABASE_TOKEN /tmp/supabase functions deploy telegram-webhook --project-ref mkihzxyplnfktsicsrpw --no-verify-jwt
git add -A && git commit -m "feat: v1.9.6 — budget rollover, recurring summary, UX polish"
git push origin main
```

---

## Files to create/modify

| File | Change |
|---|---|
| `supabase/migrations/add_budget_rollover.sql` | ADD COLUMN rollover_cents |
| `src/features/budgets/useBudgetData.ts` | rolloverBudgets() action |
| `src/features/budgets/BudgetScreen.tsx` | Rollover button + badge |
| `src/features/transactions/RecurringPanel.tsx` | NEW — recurring summary |
| `src/features/dashboard/DashboardScreen.tsx` | Add RecurringPanel, useAutoReportPdf |
| `src/features/transactions/TransactionListScreen.tsx` | Duplicate action + URL filter |
| `src/store/settingsStore.ts` | settingsVersion counter |
| `src/hooks/useAutoReportPdf.ts` | NEW — auto PDF on period start |

---

## Notes

- Keep all monetary values as integer cents
- All UI text in pt-PT
- No new libraries — sparklines in vanilla SVG, no new charting deps
- The `period-reminder` edge function cron schedule must be set manually in Supabase Dashboard → Edge Functions → period-reminder → Schedule (cron: `0 19 * * *`)
