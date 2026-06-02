# Features Developed Between v1.9.5 and v1.9.8

This document records all features, bug fixes, and infrastructure changes
introduced between v1.9.5 (commit `2b04ce8`) and the v1.9.8 working tree.

These changes are being rolled back due to persistent runtime instability
(React error #185 — infinite update loops, stale PWA chunks, cascading regressions).

They should be re-introduced incrementally after thorough testing of each phase.

---

## v1.9.6 — UX Polish, Budget Rollover & Recurring Summaries

**Commit:** `09bde56`

### Features
- **A. Budget rollover** — carry unused/overspent budget delta to next period
  - Migration: `20260514000000_add_budget_rollover.sql` (`rollover_cents` column)
  - `useBudgetData.ts` — `rolloverBudgets()` callback, display logic
  - `BudgetScreen.tsx` — rollover badge with green (underspend) / red (overspend)
- **B. Recurring transaction summary panel** — `RecurringPanel.tsx` on Dashboard
  - Lists all active recurring series with next occurrence date
- **C. Transaction quick-duplicate** — swipe-left on TransactionListScreen to copy
  - Uses `EditTransactionModal` with today's date and original amount
- **D. Category spending sparklines** — 7-period mini charts on CategoryList
- **E. Offline queue badge** — `BottomNav.tsx` shows count of queued offline transactions
- **F. Auto PDF report** — `useAutoReportPdf.ts` generates period report on first Dashboard open

### Bug Fixes
- `vite:preloadError` auto-reload for stale PWA chunks
- `NetworkFirst` caching strategy for JS chunks in service worker
- Local state desync fix when user changes `monthStartDay`
- `useMonthlyPlanData` stale closure fix

### Files Added
- `src/features/transactions/RecurringPanel.tsx`
- `src/hooks/useAutoReportPdf.ts`
- `supabase/migrations/20260514000000_add_budget_rollover.sql`
- `prompt_for_v_1.9.6.md`

### Files Modified
- `src/components/BottomNav.tsx` — offline badge
- `src/features/budgets/BudgetScreen.tsx` — rollover display
- `src/features/budgets/useBudgetData.ts` — rollover logic
- `src/features/categories/CategoryList.tsx` — sparklines
- `src/features/dashboard/DashboardPdfExport.tsx` — auto PDF
- `src/features/dashboard/DashboardScreen.tsx` — RecurringPanel placement
- `src/features/investments/useInvestmentData.ts` — monthStartDay reset
- `src/features/net-worth/useNetWorthData.ts` — monthStartDay reset
- `src/features/planning/useMonthlyPlanData.ts` — dep array fix
- `src/features/transactions/TransactionListScreen.tsx` — quick-duplicate
- `src/main.tsx` — preload error handler
- `src/types/index.ts` — Instalment type
- `vite.config.ts` — NetworkFirst for assets

---

## v1.9.7 — Dark Mode, Insights, Cash Flow & Subscriptions (uncommitted)

### Features
- **A. Dark mode** — `[data-theme='dark']` CSS tokens, `useTheme` hook, Settings toggle
  - Theme persisted to `user_settings.theme` column
  - `<meta name="theme-color">` for light/dark (/)
- **B. Spending insights card** — `InsightsCard.tsx` comparing current vs previous period
  - `spendingInsights.ts` — computation logic (top 5 category deltas)
- **C. Cash flow forecast** — `ForecastBanner.tsx` + `useCashFlowForecast.ts`
  - Projects end-of-period surplus, daily budget remaining
- **D. Subscription tracker**
  - Migration: `20260514000001_add_subscription_flag.sql` (`is_subscription` column)
  - `SubscriptionsWidget.tsx` — collapsible panel on Dashboard
  - Toggle in `EntryScreen` and `EditTransactionModal`
  - Filter chip "📦 Subscrições" in `TransactionListScreen`

### Bug Fixes
- `ErrorBoundary` auto-reload on stale chunk errors
- `RecurringPanel` empty state (was returning null)
- `BudgetScreen` rollover sign display (`Math.abs`)
- `TransactionListScreen` duplicate modal `useMemo` stabilisation

### Files Added
- `src/hooks/useTheme.ts`
- `src/features/dashboard/InsightsCard.tsx`
- `src/features/dashboard/ForecastBanner.tsx`
- `src/features/dashboard/SubscriptionsWidget.tsx`
- `src/features/dashboard/useCashFlowForecast.ts`
- `src/features/trends/spendingInsights.ts`
- `supabase/migrations/20260514000001_add_subscription_flag.sql`
- `supabase/migrations/20260514000002_add_user_settings_theme.sql`

### Files Modified
- `index.html` — dual theme-color meta tags
- `src/App.tsx` — ThemeApplier component
- `src/store/settingsStore.ts` — theme field
- `src/hooks/useUserSettings.ts` — theme column in Supabase queries
- `src/styles/tokens.css` — dark mode token overrides
- `src/types/index.ts` — `is_subscription` on Transaction
- `src/features/settings/SettingsScreen.tsx` — theme radio group
- `src/features/transactions/EntryScreen.tsx` — subscription toggle
- `src/features/transactions/EditTransactionModal.tsx` — subscription checkbox
- `src/features/transactions/TransactionListScreen.tsx` — subscription filter
- `src/features/transactions/RecurringPanel.tsx` — empty state
- `src/features/budgets/BudgetScreen.tsx` — rollover Math.abs fix
- `src/features/dashboard/DashboardScreen.tsx` — all new widgets
- `src/components/ErrorBoundary.tsx` — chunk-load reload

---

## v1.9.8 — Resilience & Stability Sprint (uncommitted)

### Infrastructure
- **Structured logging** — `src/lib/logger.ts` (`logError`, `logWarn`)
  - 69× `console.error` replaced with `logError` across all hooks/services
  - `unhandledrejection` listener in `main.tsx`
- **`lazyWithRetry`** — retry failed dynamic imports once before ErrorBoundary
- **`ErrorBoundary` hardening** — `sessionStorage` guard prevents infinite reload loops
- **Offline queue** — retry counter (max 3), dedup by ID, sync toast feedback
- **SW cache TTL** — reduced from 30 days to 7 days

### Hook Audit Fixes
- `useCashFlowForecast` — `plans`/`setPlan` moved to refs to break infinite update loop
- `useUserSettings` — `lastFetchedAt` removed from deps, replaced with `hasFetchedRef`

### Screen Robustness
- Added missing loading/empty/error states across all screens
- `is_subscription` added to all explicit transaction `select(...)` queries

### E2E Tests (Playwright)
- 19 tests in 6 spec files: auth, navigation, entry, dashboard, settings, pwa
- `data-testid` attributes on auth form, nav links, NumPad keys
- Auth fixture for test reuse

### Files Added
- `src/lib/logger.ts`
- `e2e/auth.spec.ts`, `e2e/dashboard.spec.ts`, `e2e/entry.spec.ts`
- `e2e/navigation.spec.ts`, `e2e/pwa.spec.ts`, `e2e/settings.spec.ts`
- `e2e/fixtures/auth.ts`

### Files Modified
- `src/main.tsx` — unhandledrejection, logError import
- `src/components/ErrorBoundary.tsx` — logError, sessionStorage guard
- `src/App.tsx` — lazyWithRetry
- `src/lib/offlineQueue.ts` — retry counter, dedup, FlushResult type
- `vite.config.ts` — 7-day cache TTL
- All `use*.ts` hooks — console.error → logError
- Multiple screen components — empty/error states
- `src/components/BottomNav.tsx`, `NumPad.tsx`, `Sidebar.tsx` — data-testid
- `src/features/auth/AuthScreen.tsx` — data-testid

---

## Migrations to Revert (if applied to Supabase)

If these migrations were applied to the production Supabase database, they must
be reverted manually BEFORE deploying the rollback:

1. `20260514000000_add_budget_rollover.sql`
   ```sql
   ALTER TABLE budgets DROP COLUMN IF EXISTS rollover_cents;
   ```

2. `20260514000001_add_subscription_flag.sql`
   ```sql
   ALTER TABLE transactions DROP COLUMN IF EXISTS is_subscription;
   ```

3. `20260514000002_add_user_settings_theme.sql`
   ```sql
   ALTER TABLE user_settings DROP COLUMN IF EXISTS theme;
   ```

**Note:** Dropping columns is destructive. If data has been written to these
columns and should be preserved for later re-introduction, skip the DROP and
instead let the columns remain (the v1.9.5 code will simply ignore them).

---

## Re-introduction Strategy

After stabilising on v1.9.5, re-introduce features one at a time in this order:

1. **v1.9.6 bug fixes only** (PWA chunk handling, monthStartDay desync) — no features
2. **v1.9.6 features** (budget rollover, recurring panel, duplicate, sparklines)
3. **v1.9.7 dark mode** (isolated — CSS tokens + store + hook, zero component changes)
4. **v1.9.7 insights + forecast** (read-only widgets, low risk)
5. **v1.9.7 subscriptions** (migration + UI changes, higher risk)
6. **v1.9.8 resilience** (logger, lazyWithRetry, ErrorBoundary, E2E tests)

Each step must pass `pnpm build` + manual smoke test before proceeding.
