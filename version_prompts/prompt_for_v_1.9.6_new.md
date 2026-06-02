# Fluxo v1.9.6 — Bug Fixes, Budget Rollover, Recurring Panel, Auto PDF, Dark Mode & Spending Insights

## Context

v1.9.5 is the current stable baseline. Previous v1.9.6–v1.9.8 attempts introduced
cascading instability (infinite update loops, stale chunks). This version cherry-picks
the safest, most valuable features while fixing known bugs.

**Principles:**
- Fix bugs first, then add features
- No infinite-loop patterns (never put Zustand array/object slices in useEffect deps if the effect mutates the same store)
- Guard every `format()` / `parseISO()` call against Invalid Date
- Test `pnpm build` after every phase

---

## Phase 0 — Bug Fixes

### 0.1 EditTransactionModal — Invalid Date on first render

**Bug:** When the edit modal opens, React renders BEFORE the `useEffect` that copies
`transaction.date` into the `date` state. First render has `date = ''`, so
`formatEntryDate('')` → `new Date("T12:00:00")` → Invalid Date → crash.

**Fix:** In `EditTransactionModal.tsx`, guard `formatEntryDate`:
```ts
function formatEntryDate(dateValue: string) {
  if (!dateValue) return '—';
  const d = new Date(`${dateValue}T12:00:00`);
  if (isNaN(d.getTime())) return dateValue;
  return format(d, 'd MMM yyyy', { locale: pt });
}
```

### 0.2 useUserSettings — infinite re-fetch loop (preventive)

**Bug:** `lastFetchedAt` is in the `useEffect` dependency array. `setSettings` updates
`lastFetchedAt` → deps change → effect re-runs → infinite loop.

**Fix:** Remove `lastFetchedAt` from the dependency array. Use `hasFetchedRef` keyed
by `userId` to track whether settings have been loaded:
```ts
const hasFetchedRef = useRef<string | null>(null);

useEffect(() => {
  if (!userId || hasFetchedRef.current === userId) return;
  // ... fetch ...
  hasFetchedRef.current = userId;
}, [userId, setLoading, setSettings]);
```

### 0.3 Defensive date guards

Add `isValidDate` guard to all `toLocalDate` / `formatEntryDate` helpers across:
- `TransactionListScreen.tsx` (`toLocalDate`, `getTransactionGroupLabel`)
- `EntryScreen.tsx` (`formatEntryDate`)
- Any other `new Date(\`${dateValue}T12:00:00\`)` usage

Pattern:
```ts
function toLocalDate(dateValue: string): Date {
  const d = new Date(`${dateValue}T12:00:00`);
  return isNaN(d.getTime()) ? new Date() : d;
}
```

---

## Phase 1 — Feature A: Budget Rollover

Carry unused/overspent budget delta forward to the next period.

### Migration
```sql
ALTER TABLE budgets ADD COLUMN IF NOT EXISTS rollover_cents INTEGER NOT NULL DEFAULT 0;
```

### Implementation
- `useBudgetData.ts`: Add `rolloverBudgets()` callback that:
  1. Calculates delta = `limit_cents - spent_cents` for previous period
  2. Stores the delta as `rollover_cents` on the current period's budget row
  3. Effective limit = `limit_cents + rollover_cents`
- `BudgetScreen.tsx`: Show rollover badge:
  - Green "▼ X €" if underspend carried forward (positive rollover)
  - Red "▲ X €" if overspend carried forward (negative rollover)
- Include `rollover_cents` in all budget `select()` queries

---

## Phase 2 — Feature B: Recurring Transaction Summary Panel

A collapsible panel showing all active recurring series.

### Implementation
- Create `src/features/transactions/RecurringPanel.tsx`:
  - Fetch all transactions where `is_recurring = true AND recurrence_parent_id IS NULL`
  - For each, compute next occurrence via `getRecurringOccurrenceDate`
  - Display: emoji + category name, amount, frequency label, next date
  - Sorted by next occurrence (soonest first)
  - Empty state: "Não tem transações recorrentes"
- Add to `DashboardScreen.tsx` as a collapsible `<SectionCard>`
- Use existing `recurringEngine.ts` helpers — do NOT duplicate logic

---

## Phase 3 — Feature F: Auto PDF Report

Generate a PDF report on the first dashboard open of a new period.

### Implementation
- Create `src/hooks/useAutoReportPdf.ts`:
  - Track last generated period in `localStorage` key `fluxo-auto-report-month`
  - On dashboard mount, if `autoReportPdf` setting is true and current period key
    differs from stored key, trigger PDF generation
  - Update the stored key after generation
  - Use existing `DashboardPdfExport` component's generation logic
- Wire into `DashboardScreen.tsx` — call the hook, no UI needed (silent generation)
- Respect the `autoReportPdf` setting from `useSettingsStore`

---

## Phase 4 — Feature A (v1.9.7): Dark Mode

### Migration
```sql
ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS theme TEXT NOT NULL DEFAULT 'system';
```

### Implementation
- Add dark-mode CSS tokens to `src/styles/tokens.css` under `[data-theme='dark']`
  - Invert backgrounds: bg → #191919, bg-secondary → #202020, bg-tertiary → #2D2D2D
  - Invert text: text → #E8E8E3, text-secondary → #9B9A97, text-tertiary → #6B6B6B
  - Keep accent colours (green) the same
  - Adjust borders, dividers, shadows for dark
- Create `src/hooks/useTheme.ts`:
  - Read `theme` from settings store ('light' | 'dark' | 'system')
  - Use `matchMedia('(prefers-color-scheme: dark)')` for 'system'
  - Set `document.documentElement.dataset.theme` to resolved value
  - Update `<meta name="theme-color">` dynamically
- Update `src/store/settingsStore.ts`: add `theme` to `UserSettings`
- Update `src/hooks/useUserSettings.ts`: add `theme` to Supabase select + upsert
- Update `src/features/settings/SettingsScreen.tsx`: add theme radio group
  (Claro / Escuro / Sistema) in a new "Aparência" section
- Add `ThemeApplier` component to `App.tsx` that calls `useTheme()`
- Update `index.html`: add second `<meta name="theme-color">` with
  `media="(prefers-color-scheme: dark)"` content="#191919"

**⚠️ CRITICAL:** The `useUserSettings` hook must NOT have `lastFetchedAt` in its
dependency array (fixed in Phase 0.2). Verify this fix is in place before adding
the `theme` column to the Supabase query.

---

## Phase 5 — Feature B (v1.9.7): Spending Insights Card

A card on the dashboard comparing current period spending vs previous period.

### Implementation
- Create `src/features/trends/spendingInsights.ts`:
  - `computeSpendingInsights(transactions, trendTransactions, categories, referenceDate, monthStartDay)`
  - Returns: totalCurrentCents, totalPreviousCents, delta percentage
  - Top 5 categories by absolute change (increase or decrease)
  - Each item: categoryId, emoji, name, currentCents, previousCents, deltaPercent
- Create `src/features/dashboard/InsightsCard.tsx`:
  - Summary line: "Gastou X% mais/menos que o período anterior"
  - List of top category changes with green ↓ / red ↑ indicators
  - Collapsed by default, expandable
  - Empty state if no previous period data
- Add to `DashboardScreen.tsx` after the expense donut section
- Use `trendTransactions` already fetched by the dashboard — no new queries

---

## Build Verification

After each phase:
```bash
pnpm build
```
Must pass with zero TypeScript errors and zero build failures.

## Commit Strategy

One commit per phase:
1. `fix: guard date formatting against Invalid Date`
2. `feat: budget rollover with carry-forward delta`
3. `feat: recurring transaction summary panel`
4. `feat: auto PDF report on new period`
5. `feat: dark mode with system preference detection`
6. `feat: spending insights comparison card`

Final: `feat: v1.9.6 — rollover, recurring panel, auto PDF, dark mode, insights`
