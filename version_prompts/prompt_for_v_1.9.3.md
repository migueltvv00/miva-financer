# Fluxo v1.9.3 — Architecture Overhaul: Performance, Caching & Code Reduction

## Context

The app has grown to ~19k lines across 16 feature modules, 11 Zustand stores, and 12 data hooks — most following near-identical patterns. Users experience "stuck on loading" regularly. The bundle ships 1.1MB in a single chunk with zero route-level code splitting. This version is a **major internal refactor** that ships no new user-visible features — only faster loads, smoother navigation, and a leaner codebase.

## Current Problems (root causes)

| # | Problem | Impact |
|---|---------|--------|
| 1 | **No lazy loading** — all 10 screens imported eagerly in App.tsx | 1.1MB main bundle; every route pays full cost |
| 2 | **11 near-identical Zustand stores** — each ~30-80 lines of boilerplate | ~500 lines of copy-paste; changes need 11 updates |
| 3 | **12 data hooks all re-implement fetch/error/loading/optimistic** | ~3k lines of structural duplication |
| 4 | **No global loading coordination** — each store has independent `isLoading` | Screens show "A carregar" if ANY single source is slow |
| 5 | **No stale-while-revalidate** — every navigation/month-change = full refetch | Flickers and re-renders on every screen change |
| 6 | **Competing timeouts** — AuthContext 8s vs App.tsx 5s | Race conditions; can render half-loaded state |
| 7 | **Only 4 shared components** (AppLayout, BottomNav, NumPad, Sidebar) | Every feature rebuilds its own cards, modals, lists, empty states |
| 8 | **No request deduplication** — same query fires on re-render | Wasted bandwidth, slower loads |
| 9 | **Realtime subscriptions only on 2 tables** (goals, instalments) | Other data goes stale until manual refresh |
| 10 | **Goals ↔ Net Worth sync incomplete** — only syncs on addFunds, not on create/edit/delete | Stale net worth data, name/emoji drift |

## Architecture Targets

After this version:
- Main bundle < 400KB gzipped (from 310KB gzipped — reduce vendor split)
- Route chunks lazy-loaded with skeleton fallbacks
- Single generic store factory replaces 11 stores
- Single `useSupabaseQuery` hook replaces fetch boilerplate in all 12 hooks
- Data cached in Zustand with TTL; stale data shown instantly, refresh in background
- Unified loading coordinator — screens never stuck
- Goals fully synced to net_worth_items (create/edit/delete/addFunds)

---

## Phase A — Generic Store Factory + Query Hook (code reduction)

### A1. Create `src/lib/createEntityStore.ts`

A factory function that generates a typed Zustand store for any entity:

```typescript
function createEntityStore<T extends { id: string }>(name: string) → {
  useStore: UseBoundStore<...>,
  // selectors: items, isLoading, error, lastFetchedAt
  // actions: setItems, addItem, updateItem, removeItem, setLoading, setError, setLastFetched
}
```

Replace all 11 stores with this factory. Each store becomes a one-liner:
```typescript
export const { useStore: useBudgetStore } = createEntityStore<Budget>('budget');
```

Stores must also track `lastFetchedAt: number | null` for stale-while-revalidate.

### A2. Create `src/hooks/useSupabaseQuery.ts`

A generic data-fetching hook that handles:
- Loading state management (via store)
- Stale-while-revalidate (show cached data, refresh in background if stale > 60s)
- Error handling with retry (1 automatic retry after 2s)
- Request deduplication (skip if identical query in-flight)
- `isActive` cleanup on unmount
- Optional realtime subscription (pass `realtimeTable` option)

```typescript
function useSupabaseQuery<T>(options: {
  key: string;                              // dedup key
  store: EntityStore<T>;                    // from createEntityStore
  queryFn: (supabase, userId) => Promise<T[]>;
  userId: string | null;
  enabled?: boolean;                        // default true
  realtimeTable?: string;                   // auto-subscribe
  staleTime?: number;                       // ms, default 60_000
}) → { data: T[]; isLoading: boolean; error: string | null; refresh: () => void }
```

### A3. Migrate all 12 data hooks

Each hook shrinks to only its **domain-specific logic** (CRUD mutations, optimistic updates). The fetch/loading/error/realtime boilerplate is removed. Target: reduce total hook lines from ~3k to ~1.5k.

### A4. Verification gate

- `pnpm type-check` passes
- `pnpm build` passes
- All screens render data correctly (manual test)
- No regressions in loading behavior

---

## Phase B — Lazy Loading + Code Splitting

### B1. Lazy-load all route screens in App.tsx

```typescript
const DashboardScreen = lazy(() => import('@/features/dashboard/DashboardScreen'));
const GoalsScreen = lazy(() => import('@/features/goals/GoalsScreen'));
// ... all 10 screens
```

Each screen must use `export default` (or named re-export wrapper).

### B2. Create `src/components/ScreenSkeleton.tsx`

A lightweight skeleton placeholder (~20 lines) that shows during lazy load:
- Animated pulse bars mimicking a typical screen layout
- Used as `<Suspense fallback={<ScreenSkeleton />}>` wrapper

### B3. Configure Vite manual chunks

In `vite.config.ts`, add `build.rollupOptions.output.manualChunks`:

```typescript
manualChunks: {
  'vendor-react': ['react', 'react-dom', 'react-router'],
  'vendor-supabase': ['@supabase/supabase-js'],
  'vendor-charts': ['recharts'],
  'vendor-pdf': ['@react-pdf/renderer'],
}
```

Target: main chunk < 200KB, vendor-react ~140KB, charts + pdf loaded only when needed.

### B4. Lazy-load heavy sub-components

- `DashboardPdfExport` — already lazy ✅
- `recharts` components in DashboardScreen and TrendsScreen — wrap chart sections in `lazy()` + Suspense
- `papaparse` in ImportScreen — dynamic import on use

### B5. Verification gate

- `pnpm build` — check chunk sizes, no chunk > 500KB
- Navigation between screens shows skeleton briefly, then content
- No flash of empty content

---

## Phase C — Loading Architecture Fix

### C1. Unify auth timeout

Remove the duplicate `useLoadingTimeout` in App.tsx. Use only the AuthContext 8s timeout. ProtectedRoute should trust `isLoading` from AuthContext directly.

### C2. Create `src/hooks/useScreenData.ts`

A coordinator hook that multiple data sources feed into:

```typescript
function useScreenData(sources: { key: string; isLoading: boolean; error: string | null }[]) → {
  isReady: boolean;      // all sources loaded at least once
  isRefreshing: boolean; // any source refreshing after initial load
  errors: { key: string; error: string }[];
  hasError: boolean;
}
```

Screens use `isReady` instead of checking 3-4 individual `isLoading` flags.

### C3. Add error boundary with retry

Create `src/components/ErrorBoundary.tsx`:
- Catches render errors
- Shows "Algo correu mal" with "Tentar novamente" button
- Logs error to console

Wrap each lazy route in `<ErrorBoundary>`.

### C4. Fix stale loading states

Audit every hook: ensure `setLoading(false)` is called in BOTH success and error paths (finally block). Add safety: if `isLoading` is true for > 15s, auto-reset to false and show error.

### C5. Verification gate

- Navigate between all screens rapidly — no "stuck on loading"
- Kill network mid-load → error boundary catches, retry works
- Refresh page on any screen → loads correctly

---

## Phase D — Shared UI Components (reduce screen code)

### D1. Create `src/components/ScreenHeader.tsx`

Standardized header with title, optional subtitle, optional action button. Used by all screens.

### D2. Create `src/components/EmptyState.tsx`

Generic empty-state component (emoji + message + optional CTA). Replace the 10+ inline empty states across screens.

### D3. Create `src/components/LoadingState.tsx`

Replace all "A carregar X…" inline divs with a consistent component that shows the skeleton or spinner.

### D4. Create `src/components/ConfirmDialog.tsx`

Generic confirmation modal. Replace the 5+ inline confirm implementations.

### D5. Refactor screens to use shared components

Each screen should shrink by 20-40 lines by extracting repeated patterns.

### D6. Verification gate

- All screens look identical to before
- `pnpm build` bundle size decreased or unchanged

---

## Phase E — Goals ↔ Net Worth Full Sync

### E1. Sync on goal create

When a new goal is created (`createGoal()`), also create a net_worth_item with:
- `source: 'savings_goal'`, `source_id: goalId`
- `value_cents: 0` (just created)
- `name`, `emoji` from goal

### E2. Sync on goal edit

When a goal is edited (`updateGoal()`), update the matching net_worth_item:
- Sync `name` and `emoji` changes
- Recalculate `is_complete` status

### E3. Sync on goal delete

When a goal is deleted (`deleteGoal()`), also delete the matching net_worth_item where `source='savings_goal'` and `source_id=goalId`.

### E4. addFunds sync — already implemented ✅

Current implementation in `useSavingsGoalData.ts` already upserts net_worth_items on addFunds.

### E5. Data migration — backfill existing goals

Create a one-time hook or migration that:
- On app load, checks if user has savings_goals without matching net_worth_items
- Creates missing net_worth_items for any existing goals with `current_cents > 0`

### E6. Verification gate

- Create goal → appears in Patrimônio screen
- Edit goal name/emoji → updated in Patrimônio
- Delete goal → removed from Patrimônio
- Add funds → value updates in Patrimônio

---

## Phase F — Deploy & Commit

### F1. Final checks

```bash
pnpm type-check
pnpm build          # verify chunk sizes
pnpm lint
```

### F2. Deploy

```bash
# Edge functions (only if changed)
supabase functions deploy confirm-payslip --project-ref mkihzxyplnfktsicsrpw
supabase functions deploy telegram-webhook --project-ref mkihzxyplnfktsicsrpw --no-verify-jwt

# Frontend
pnpm build && npx vercel --prod
```

### F3. Commit

```
feat: v1.9.3 — architecture overhaul: lazy loading, generic stores, caching

- Generic store factory replaces 11 boilerplate stores
- useSupabaseQuery hook with stale-while-revalidate + request dedup
- Lazy-loaded routes with skeleton fallbacks
- Vite manual chunks (vendor-react, vendor-supabase, vendor-charts, vendor-pdf)
- Unified loading coordinator (useScreenData)
- Error boundaries with retry
- Shared UI components (ScreenHeader, EmptyState, LoadingState, ConfirmDialog)
- Goals ↔ net worth full bidirectional sync
- Fixed competing auth/route timeouts
```

---

## Execution Order

```
A1 → A2 → A3 → A4(verify)
  → B1 → B2 → B3 → B4 → B5(verify)
    → C1 → C2 → C3 → C4 → C5(verify)
      → D1 → D2 → D3 → D4 → D5 → D6(verify)
        → E1 → E2 → E3 → E5 → E6(verify)
          → F1 → F2 → F3
```

Each phase must pass its verification gate before moving to the next. Phases are sequential because each builds on the previous (e.g., Phase B needs the stores from Phase A; Phase C needs the lazy loading from Phase B).

## Non-goals (explicitly out of scope)

- No new user-visible features
- No database schema changes (reuse existing tables)
- No changes to Telegram webhook
- No changes to edge functions (unless needed for Phase E)
- No dependency additions (use existing stack only)
