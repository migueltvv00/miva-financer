# Fluxo v1.9.8 — Resilience & Stability Sprint

## Context

Starting from v1.9.7 (dark mode, insights, cash-flow forecast, subscription tracker), the app
has seen persistent runtime errors in production:

- `Failed to fetch dynamically imported module` — stale PWA chunks (fixed in 1.9.7)
- React error #185 (Maximum update depth exceeded) — infinite update loops in
  `useCashFlowForecast` and `useUserSettings` (fixed pre-1.9.8)

This version has **zero new features**. Every hour goes toward making the existing surface
area bulletproof: defensive data loading, graceful error states, runtime observability,
and an exhaustive automated test pass across all routes.

---

## Objectives

| # | Goal |
|---|------|
| 1 | Eliminate every identified infinite-update and stale-closure pattern |
| 2 | Add runtime error logging (structured `console.error` with context object) |
| 3 | Ensure every data-loading hook has a robust error + empty state |
| 4 | Make every lazy route resilient to chunk-load failure (reload) |
| 5 | Audit and harden the offline queue flush cycle |
| 6 | Write Playwright E2E tests for the 10 critical user flows |
| 7 | Zero TypeScript errors (`pnpm type-check`) |
| 8 | Build must succeed (`pnpm build`) |

---

## Phase 1 — Hook Audit (all `use*.ts` files)

Run a systematic audit of **every** hook and store in `src/hooks/` and `src/store/`.
For each file check:

### 1.1 `useEffect` dependency arrays

Criteria — flag any effect where:
- A value that comes from a store/context is both **read** and **written** inside the same effect
- A Zustand store slice (`plans`, `transactions`, etc.) is in deps AND the effect calls a setter from that same store
- `lastFetchedAt` or similar "stamp" values from stores are in deps (these change every time the store is written, creating re-fetch loops)

**Files to inspect** (in order of risk):
```
src/hooks/useUserSettings.ts       ← fixed; verify hasFetchedRef pattern is solid
src/features/dashboard/useCashFlowForecast.ts  ← fixed; verify plansRef/setPlanRef pattern
src/features/transactions/useTransactionData.ts
src/features/categories/useCategoryData.ts
src/features/budgets/useBudgetData.ts
src/features/goals/useSavingsGoalData.ts
src/features/income-sources/useIncomeSourceData.ts
src/features/instalments/useInstalmentData.ts
src/features/investments/* (all hooks)
src/features/net-worth/* (all hooks)
src/features/import/useImportData.ts
src/features/trends/useTrendTransactionData.ts
src/hooks/useRealtimeSync.ts
src/hooks/useAutoReportPdf.ts
```

**Fix pattern** — for any risky dep, move the value to a `useRef` that is kept current:
```typescript
const storeSliceRef = useRef(storeSlice);
storeSliceRef.current = storeSlice;
// then use storeSliceRef.current inside the effect, NOT storeSlice
// remove storeSlice from the deps array
```

### 1.2 Stale closures in `useCallback`

Flag any `useCallback` where:
- The callback reads store state but the state is NOT in the deps array (would read stale data)
- The callback captures a value that changes frequently (e.g. `settings` from the settings store)

### 1.3 Zustand selectors returning new objects/arrays on every call

Audit all `useXxxStore((s) => s.something)` selectors. If any selector derives a new
object/array (e.g. `useStore((s) => s.items.filter(...))`) without a separate `useMemo`,
move the derivation to a memoised selector or a `useMemo` inside the component.

---

## Phase 2 — Data-Loading Robustness

### 2.1 Every hook must return `{ data, isLoading, error }`

Inventory every `use*Data` hook. Any that swallow errors silently must be updated to:
1. Catch and log with `console.error('Context:', { hookName, userId, params }, error)`
2. Set a user-readable `error` string on the return value
3. Surface the error in the consuming component (banner or inline message — see existing patterns)

### 2.2 Empty states

Audit every list/table render in every screen. Each must have:
- A loading skeleton (or `<LoadingState />` from `src/components/LoadingState.tsx`)
- A zero-items empty state with a helpful message in pt-PT
- An error state showing the error message with a retry affordance

Screens to check:
```
EntryScreen              → recent transactions list
TransactionListScreen    → main transaction list + recurring filter + subscription filter
DashboardScreen          → every SectionCard (category progress, insights, forecast, subscriptions)
TrendsScreen             → category trend cards
GoalsScreen              → goals list
NetWorthScreen           → net worth items list
InvestmentScreen         → accounts + snapshots list
SettingsScreen           → import history, category list, instalment list
```

### 2.3 Supabase query hardening

For every `supabase.from(...)` call that runs in a hook:
- Ensure `is_subscription` is included in all `select('*')` queries on `transactions`
  (the column now exists — if it's missing from a select, the TypeScript type will mismatch)
- Ensure `theme` is included in all `select(...)` queries on `user_settings`
- Wrap all queries that lack error handling with try/catch

---

## Phase 3 — PWA / Chunk-Load Resilience

### 3.1 Verify ErrorBoundary reload logic

The `ErrorBoundary` in `src/components/ErrorBoundary.tsx` currently calls
`window.location.reload()` in `componentDidCatch` when it detects a chunk-load error.

Problem: if the reload happens in a tight loop (e.g. network is truly offline), the browser
will reload infinitely. Add a guard:

```typescript
private static RELOAD_FLAG_KEY = 'fluxo_chunk_reload';

componentDidCatch(error: Error, errorInfo: ErrorInfo) {
  console.error('ErrorBoundary caught:', error, errorInfo);
  if (typeof window !== 'undefined' && isChunkLoadError(error)) {
    const alreadyReloaded = sessionStorage.getItem(ErrorBoundary.RELOAD_FLAG_KEY);
    if (!alreadyReloaded) {
      sessionStorage.setItem(ErrorBoundary.RELOAD_FLAG_KEY, '1');
      window.location.reload();
    }
    // If already reloaded and still failing, fall through to the error UI
  }
}
```

Clear the flag on successful render (in `componentDidUpdate` when `hasError` becomes false,
or on successful route navigation).

### 3.2 Lazy import retry wrapper

In `src/App.tsx`, wrap every `lazy(() => import(...))` with a retry helper:

```typescript
function lazyWithRetry<T extends React.ComponentType>(
  factory: () => Promise<{ default: T }>
): React.LazyExoticComponent<T> {
  return lazy(() =>
    factory().catch(() => {
      // Force service-worker bypass on retry
      return factory();
    })
  );
}
```

Replace all `lazy(() => import(...))` calls with `lazyWithRetry(() => import(...))`.

### 3.3 Service Worker — stale chunk cache TTL

In `vite.config.ts`, reduce the `maxAgeSeconds` on the `assets-cache` from 30 days to 7 days:
```typescript
maxAgeSeconds: 7 * 24 * 60 * 60,  // 7 days instead of 30
```
This limits how long an old chunk can persist in the browser cache.

---

## Phase 4 — Offline Queue Audit

**File**: `src/lib/offlineQueue.ts` (create if not present) or wherever the offline queue is implemented.

Search all hooks and stores for `fluxo-offline-queue` localStorage key usage.

Requirements:
1. Queue entries must include a `timestamp` and `retryCount` field
2. On reconnect flush: if an entry fails after 3 retries, discard it and show a toast: "X transação(ões) não puderam ser sincronizadas."
3. The flush must be idempotent — running it twice must not duplicate transactions
4. Test: go offline → create 2 transactions → come back online → verify both appear in list

---

## Phase 5 — Playwright E2E Test Suite

Create tests in `e2e/` using the existing Playwright config (`playwright.config.ts`).

### Critical user flows to cover

| Test file | Flow | Assertions |
|-----------|------|------------|
| `e2e/auth.spec.ts` | Login with valid credentials | Redirects to `/`, nav visible |
| `e2e/auth.spec.ts` | Login with wrong password | Error message visible |
| `e2e/entry.spec.ts` | Create expense transaction | Amount shown in recent list |
| `e2e/entry.spec.ts` | Create income transaction | Amount shown in green |
| `e2e/entry.spec.ts` | Create recurring expense | Recurring panel shows it |
| `e2e/transactions.spec.ts` | Edit transaction amount | Updated amount visible |
| `e2e/transactions.spec.ts` | Delete transaction | Removed from list |
| `e2e/transactions.spec.ts` | Duplicate transaction | New entry with today's date |
| `e2e/transactions.spec.ts` | Filter by "Recorrentes" | Only recurring shown |
| `e2e/dashboard.spec.ts` | Dashboard renders all 4 sections | No error boundary fallback |
| `e2e/dashboard.spec.ts` | ForecastBanner visible when income set | Forecast numbers present |
| `e2e/dashboard.spec.ts` | InsightsCard renders or shows empty state | No crash |
| `e2e/trends.spec.ts` | TrendsScreen loads without chunk error | Bars or empty state visible |
| `e2e/settings.spec.ts` | Theme toggle → dark mode applied | `data-theme="dark"` on `<html>` |
| `e2e/settings.spec.ts` | Theme persists after reload | Still dark after hard refresh |
| `e2e/pwa.spec.ts` | App loads offline (SW cache) | Content visible without network |

### Test helpers / fixtures

Create `e2e/fixtures/auth.ts`:
```typescript
import { test as base } from '@playwright/test';

export const test = base.extend({
  authedPage: async ({ page }, use) => {
    await page.goto('/login');
    await page.fill('[data-testid="email"]', process.env.E2E_EMAIL!);
    await page.fill('[data-testid="password"]', process.env.E2E_PASSWORD!);
    await page.click('[data-testid="login-submit"]');
    await page.waitForURL('/');
    await use(page);
  },
});
```

Add `data-testid` attributes to:
- `AuthScreen` login form: `email`, `password`, `login-submit`
- `NumPad` submit button: `numpad-submit`
- `AppLayout` nav links: `nav-entry`, `nav-transactions`, `nav-dashboard`, etc.

### Test environment variables (`.env.test`)

```
E2E_BASE_URL=https://financer-eight-zeta.vercel.app
E2E_EMAIL=<test account email>
E2E_PASSWORD=<test account password>
```

---

## Phase 6 — Runtime Observability

### 6.1 Structured error logging

Create `src/lib/logger.ts`:

```typescript
type LogContext = Record<string, unknown>;

export function logError(message: string, context: LogContext, error: unknown) {
  console.error(`[Fluxo] ${message}`, {
    ...context,
    error: error instanceof Error
      ? { message: error.message, stack: error.stack }
      : error,
    timestamp: new Date().toISOString(),
    userAgent: navigator.userAgent,
  });
}
```

Replace all bare `console.error(...)` calls across hooks and stores with
`logError(description, { hook, userId }, error)`.

### 6.2 Unhandled promise rejection catching

In `src/main.tsx`, add:

```typescript
window.addEventListener('unhandledrejection', (event) => {
  logError('Unhandled promise rejection', {
    reason: String(event.reason),
  }, event.reason);
});
```

### 6.3 React error boundary telemetry

In `ErrorBoundary.componentDidCatch`, call `logError(...)` instead of bare `console.error`.
Include the `componentStack` from `errorInfo` in the context.

---

## Phase 7 — TypeScript Hygiene

Run `pnpm type-check` and fix every error:

1. Any usage of `as any` or `as unknown as T` — replace with proper type guards
2. Ensure `is_subscription: boolean` is included everywhere `Transaction` is used
3. Ensure `theme: 'light' | 'dark' | 'system'` is included everywhere `UserSettings` is used
4. Verify all Supabase query results are typed via the generated types in `src/types/supabase.ts`
   (or update the generated types if they don't include the new columns)

---

## Acceptance Criteria

- [ ] `pnpm type-check` → zero errors
- [ ] `pnpm build` → success, no chunk > 500KB (except `vendor-pdf` which is expected)
- [ ] `pnpm lint` → zero errors on files touched in this sprint
- [ ] All 16 Playwright tests pass against production URL
- [ ] No React error #185 in browser console on any route navigation
- [ ] Navigating to every route 3× in quick succession produces no errors
- [ ] Dark mode toggle in Settings → page visually correct in dark, light, system modes
- [ ] Offline: create transaction → reconnect → transaction synced (verified in DB)
- [ ] Hard refresh after new deploy → app loads correctly (no "Failed to fetch" for chunks)

---

## Phasing & Order

| Phase | Files touched | Gate |
|-------|--------------|------|
| 1 — Hook audit | All `use*.ts` hooks | `pnpm type-check` passes |
| 2 — Data robustness | All screen components | No silent error swallowing |
| 3 — PWA resilience | `ErrorBoundary`, `App.tsx`, `vite.config.ts` | Manual chunk-fail test |
| 4 — Offline queue | `offlineQueue.ts`, relevant hooks | Manual offline test |
| 5 — E2E tests | `e2e/*.spec.ts` | All tests green |
| 6 — Observability | `logger.ts`, `main.tsx`, all hooks | `pnpm build` clean |
| 7 — TS hygiene | Type files | Zero type errors |

Phases 1–4 must be completed before Phase 5 (tests validate the fixes).
Phases 5–7 can run in parallel.

---

## Known Issues from Previous Versions (validate fixed)

| Issue | Where | Expected state in 1.9.8 |
|-------|-------|------------------------|
| React #185 (infinite update) | `useCashFlowForecast`, `useUserSettings` | Fixed by `plansRef`/`hasFetchedRef` pattern |
| Stale chunk 404 on deploy | `ErrorBoundary`, PWA SW | Fixed by `sessionStorage` guard + retry wrapper |
| RecurringPanel blank instead of empty state | `RecurringPanel.tsx` | Shows "Sem transações recorrentes activas" |
| Rollover badge wrong sign | `BudgetScreen.tsx` | `Math.abs()` applied |
| Duplicate modal stale amount | `TransactionListScreen.tsx` | `useMemo` on duplicate object |
