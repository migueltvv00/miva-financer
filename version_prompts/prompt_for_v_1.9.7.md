# Fluxo v1.9.7 — Dark Mode, Insights, Cash Flow & Subscriptions

## Research Summary

Competitor analysis of YNAB, Monarch Money, Wallet (BudgetBakers), and 2024 user-demand surveys
highlighted the following gaps in Fluxo relative to best-in-class personal finance apps:

| Gap | Competitors with it | Priority for PT single user |
|-----|--------------------|-----------------------------|
| Dark mode | All major apps | 🔴 High — daily UX |
| Spending insights / anomaly alerts | Monarch, Mint, Rocket Money | 🔴 High — daily value |
| Cash flow forecast (end-of-period) | Monarch, YNAB, PocketGuard | 🔴 High — planning |
| Subscription tracker | Rocket Money, Monarch | 🟡 Medium — awareness |
| IRS deduction tracker (PT-specific) | None (PT gap) | 🟡 Medium — fiscal value |
| CSV export | All major apps | 🟢 Low — power user |

This version addresses the top three high-priority gaps plus the subscription tracker.
The IRS deduction tracker and CSV export are deferred to v1.9.8.

---

## Feature Catalogue (validate before starting)

Mark each line with ✅ keep / ❌ skip:

```
✅  A. Dark mode (CSS tokens + Settings toggle + persist to user_settings)
✅  B. Spending insights card (current vs. previous period per category, top anomalies)
✅  C. Cash flow forecast (end-of-period projection on Dashboard)
✅  D. Subscription tracker (tag recurring transactions as subscriptions, monthly total widget)
❌  E. IRS deduction tracker — deferred to v1.9.8
❌  F. CSV export — deferred to v1.9.8
```

All ✅ items are implemented. ❌ items are skipped entirely — no stub code.

---

## Phase 0 — Bug Fixes (always included)

### 0.1 RecurringPanel empty state
`RecurringPanel` shows a spinner forever if the user has no recurring transactions.
Add a proper empty state: "Sem transações recorrentes activas".

### 0.2 Duplicate modal date field
When quick-duplicating a transaction, the date pre-fills correctly but the NumPad
still shows the original amount. Ensure the modal pre-fills amount **and** date correctly.

### 0.3 Budget rollover sign convention label
The rollover badge on BudgetScreen shows `+X €` for underspend (good) and `-X €`
for overspend (bad) — but the colour is wrong. Positive rollover should be green
(accent), negative should be red (danger). Fix the conditional className.

---

## Phase A — Dark Mode

### A1. Design Tokens

Add a `[data-theme='dark']` block to `src/styles/tokens.css`:

```css
[data-theme='dark'] {
  /* Backgrounds */
  --color-bg:           #191919;
  --color-bg-secondary: #252525;
  --color-bg-tertiary:  #2F2F2F;
  --color-bg-hover:     #3A3A3A;

  /* Text */
  --color-text:           #E8E7E4;
  --color-text-secondary: #9B9B96;
  --color-text-tertiary:  #5A5A56;
  --color-text-inverse:   #191919;

  /* Accent (keep brand green, lighten slightly) */
  --color-accent:       #22A99A;
  --color-accent-light: #1A3D38;
  --color-accent-hover: #1C8A7C;

  /* Semantic */
  --color-success: #22A99A;
  --color-warning: #F08030;
  --color-danger:  #F05050;

  /* Borders & Dividers */
  --color-border:  #3A3A3A;
  --color-divider: #2F2F2F;

  /* Shadows */
  --shadow-sm: 0 1px 2px rgba(0, 0, 0, 0.30);
  --shadow-md: 0 4px 12px rgba(0, 0, 0, 0.40);
}
```

### A2. Theme Store

Add `theme: 'light' | 'dark' | 'system'` to `src/store/settingsStore.ts`:

```typescript
// in Settings interface
theme: 'light' | 'dark' | 'system';

// default
theme: 'system',
```

Persist `theme` alongside other settings in Supabase `user_settings` table
(`ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS theme TEXT NOT NULL DEFAULT 'system'`).

### A3. Theme Provider

Create `src/hooks/useTheme.ts`:

```typescript
// Reads settings.theme + system preference
// Sets document.documentElement.setAttribute('data-theme', resolvedTheme)
// Listens to prefers-color-scheme media query when theme === 'system'
// Returns { resolvedTheme: 'light' | 'dark', setTheme }
```

Call `useTheme()` in `App.tsx` (top level) so the attribute is set before first paint.

### A4. Settings UI

In `SettingsScreen.tsx`, inside the "Aspecto" section (or create one):

```
Tema
  ○ Sistema   ○ Claro   ● Escuro
```

Use radio-style button group, minimum 44px tap targets.

### A5. Meta Theme Color

Update `index.html` to use `<meta name="theme-color" media="(prefers-color-scheme: dark)" content="#191919">` and `<meta name="theme-color" media="(prefers-color-scheme: light)" content="#FFFFFF">`.

---

## Phase B — Spending Insights Card

### B1. Calculation Logic

Create `src/features/trends/spendingInsights.ts`:

```typescript
export interface CategoryInsight {
  categoryId: string;
  categoryName: string;
  emoji: string;
  currentCents: number;
  previousCents: number;
  deltaPercent: number; // positive = more spent, negative = less spent
  direction: 'up' | 'down' | 'new' | 'gone';
}

export function computeSpendingInsights(
  currentPeriodTransactions: Transaction[],
  previousPeriodTransactions: Transaction[],
  categories: Category[]
): CategoryInsight[]
```

Rules:
- Only `type === 'expense'` transactions
- `direction: 'new'` if no spend in previous period but spend this period
- `direction: 'gone'` if spend in previous period but zero this period
- Sort by `Math.abs(deltaPercent)` descending
- Return top 5

### B2. InsightsCard Component

Create `src/features/dashboard/InsightsCard.tsx`:

```
┌─────────────────────────────────────────────┐
│ 💡 Comparação com mês anterior              │
│─────────────────────────────────────────────│
│ 🔺 Alimentação      +38%   127 € vs 92 €   │
│ 🔻 Transportes      -22%    44 € vs 56 €   │
│ 🆕 Streaming          —      9 €  (novo)   │
└─────────────────────────────────────────────┘
```

- Rendered inside a `<SectionCard>` on Dashboard
- Uses `trendTransactions` from the store (already fetched by `useTrendTransactionData`)
- Slice current vs. previous period using `getPeriodStart`/`getPeriodEnd`
- Render max 5 rows; if none, show "Sem dados suficientes para comparar."
- 🔺 red for `direction: 'up'` (over previous), 🔻 green for `direction: 'down'`
- Note: "up" is not inherently bad (income up is good), but for expenses up = warning colour

### B3. Dashboard Placement

Add `<InsightsCard>` to `DashboardScreen.tsx` right-hand column (desktop) or below
the category progress section (mobile), after `<PaymentMethodChart>`.

---

## Phase C — Cash Flow Forecast

### C1. Forecast Logic

Create `src/features/dashboard/useCashFlowForecast.ts`:

```typescript
export interface CashFlowForecast {
  projectedSurplusCents: number;   // positive = on track, negative = overspend
  remainingExpenseCents: number;   // sum of recurring expenses not yet logged in period
  earnedSoFarCents: number;        // income transactions in current period
  expectedIncomeCents: number;     // from monthly_plans.expected_income_cents
  spentSoFarCents: number;         // expense transactions in current period
  daysRemaining: number;
  dailyBudgetRemainingCents: number; // (projectedSurplus) / daysRemaining
}

export function useCashFlowForecast(
  userId: string | null | undefined,
  selectedMonth: Date
): CashFlowForecast | null
```

Algorithm:
1. `remainingRecurring` = recurring transactions where `recurrence_parent_id IS NULL`
   and their next occurrence falls inside the current period but is after today
2. `projectedSurplus` = `expectedIncome - spentSoFar - remainingRecurring`
3. `dailyBudgetRemaining` = `projectedSurplus / daysRemaining` (0 if daysRemaining=0)

### C2. ForecastBanner Component

Create `src/features/dashboard/ForecastBanner.tsx`:

```
┌──────────────────────────────────────────────────────────┐
│ 📊 Previsão de fim de período  (12 dias restantes)       │
│  Previsto disponível:   +234 €    ████████░░  72%        │
│  Orçamento diário:       +19 €/dia                       │
└──────────────────────────────────────────────────────────┘
```

- Green background tint if surplus > 0, red if surplus < 0
- If `expectedIncomeCents === 0`, show "Define o rendimento esperado no Planeamento
  para ver a previsão" and render nothing else
- If `daysRemaining === 0`, hide entirely (period just ended)

### C3. Dashboard Placement

Add `<ForecastBanner>` at the very top of `DashboardScreen`, between the period
selector and the first SectionCard, so it's immediately visible on open.

---

## Phase D — Subscription Tracker

### D1. Schema

```sql
ALTER TABLE transactions
  ADD COLUMN IF NOT EXISTS is_subscription BOOLEAN NOT NULL DEFAULT false;
```

Add migration: `supabase/migrations/20260514000001_add_subscription_flag.sql`

### D2. Type Update

Add `is_subscription: boolean` to `Transaction` interface in `src/types/index.ts`.

### D3. Entry UI

In `EntryScreen.tsx`, below the "Recorrente" toggle, add a "Subscrição" toggle
(only visible when `is_recurring = true` since subscriptions must be recurring):

```
[🔁 Recorrente]   [📦 Subscrição]
```

### D4. SubscriptionsWidget Component

Create `src/features/dashboard/SubscriptionsWidget.tsx`:

```
┌──────────────────────────────────────────────────────┐
│ 📦 Subscrições activas                   12 €/mês ▼  │
│─────────────────────────────────────────────────────│
│  🎵 Spotify          5,99 €   mensal                 │
│  📺 Netflix          7,99 €   mensal                 │
│─────────────────────────────────────────────────────│
│  Total mensal       13,98 €                          │
└──────────────────────────────────────────────────────┘
```

- Rendered as a collapsible `<details>` on Dashboard, left column
- Data from `trendTransactions` filtered on `is_subscription = true AND is_recurring = true`
- Show monthly equivalent (if weekly: × 4.33, if monthly: × 1)
- Total line at bottom
- If none, show "Sem subscrições registadas."

### D5. Subscription filter in TransactionListScreen

Add a "📦 Subscrições" filter chip alongside the existing "🔁 Recorrentes" chip.

### D6. EditTransactionModal

Add `is_subscription` checkbox to the edit modal (visible only when `is_recurring = true`).

---

## Implementation Notes

### Dark mode checklist
Every component uses CSS vars via Tailwind (`text-[var(--color-text)]` etc.), so dark mode
requires **zero component changes** — only the tokens override and the `data-theme` attribute.
Verify by spot-checking Dashboard, Entry, Transaction List, Budget screens.

### Supabase `user_settings` migration
```sql
ALTER TABLE user_settings
  ADD COLUMN IF NOT EXISTS theme TEXT NOT NULL DEFAULT 'system';
```

Apply via Supabase MCP after schema approval.

### No new screens
- `InsightsCard` and `ForecastBanner` and `SubscriptionsWidget` are all Dashboard additions — no routing changes needed.
- `useTheme` is wired at App root — no per-screen changes.

---

## Phasing & Order

| Phase | Estimated scope | Depends on |
|-------|----------------|------------|
| 0 (bugs) | Small | — |
| A (dark mode) | Medium — tokens + store + UI | — |
| B (insights) | Medium — calculation + card | trend data (already loaded) |
| C (forecast) | Medium — hook + banner | plan data (already loaded) |
| D (subscriptions) | Medium — migration + UI | — |

Phases A and D can be parallelised (independent).
Phases B and C can be parallelised after Phase 0.

---

## Acceptance Criteria

- [ ] Dark mode toggle in Settings → page renders correctly in dark/light/system mode
- [ ] Dark mode persists across sessions (stored in user_settings)
- [ ] InsightsCard shows correct % diff vs. previous period; empty state renders
- [ ] ForecastBanner shows projected surplus in green/red; hides if no expected income set
- [ ] Subscription flag on transactions persists to DB
- [ ] SubscriptionsWidget shows monthly total correctly
- [ ] All existing tests pass; no TypeScript errors (`pnpm type-check`)
- [ ] Build succeeds (`pnpm build`)
