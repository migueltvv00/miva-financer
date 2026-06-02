<project_overview>
Continuation of Fluxo after v1.0 is stable. The core loop works.
v1.1 adds the planning and goals layer: irregular income tracking
with Portuguese tax context, monthly budget planning (plan vs actual),
and savings goals with progress tracking.

Stable from v1.0 — do not touch: auth, categories, transaction entry,
transaction list, budget limits, dashboard, recurring transactions,
PWA, realtime sync.
</project_overview>

<tech_stack>
Defined in copilot-instructions.md. No new libraries this version.
</tech_stack>

<architecture_decisions>

New tables (all with RLS, all monetary values in cents):

income_sources:
  id          uuid primary key default gen_random_uuid()
  user_id     uuid references auth.users not null
  name        text not null       -- e.g. "Empresa X", "Cliente Y"
  type        text not null       -- 'salary' | 'freelance' | 'other'
  created_at  timestamptz default now()

Add source_id (nullable uuid references income_sources) to
transactions table via migration. Only populated for income
transactions.

monthly_plans:
  id              uuid primary key default gen_random_uuid()
  user_id         uuid references auth.users not null
  month           date not null   -- first day of month
  expected_income_cents integer not null default 0
  notes           text
  created_at      timestamptz default now()
  unique(user_id, month)

savings_goals:
  id              uuid primary key default gen_random_uuid()
  user_id         uuid references auth.users not null
  name            text not null
  target_cents    integer not null
  current_cents   integer not null default 0
  monthly_contribution_cents integer not null default 0
  deadline        date            -- nullable, optional
  color           text not null
  emoji           text not null
  is_complete     boolean not null default false
  created_at      timestamptz default now()

Irregular income tracking:
- Income transactions gain an optional source_id linking to a named
  income source (e.g. "Cliente Acme", "Empresa ABC").
- Income sources managed in settings: add, rename, archive.
- Monthly income view in dashboard shows breakdown by source.
- Year-to-date freelance income total shown in a dedicated widget —
  relevant for Portuguese categoria B self-employment IRS tracking.
- Freelance income total for the year shown with a note: "Para IRS
  categoria B — confirme com o seu contabilista."

Monthly budget planning (plan vs actual):
- Before a month, user can set expected_income for that month in
  monthly_plans.
- Budget limits already exist (from v1.0). Planning adds the income
  side: how much do you expect to earn this month.
- A planning screen shows: expected income, sum of all budget limits,
  projected net (expected income - sum of limits).
- At month end, a summary compares: planned income vs actual income,
  planned spend (budget limits) vs actual spend per category.
- Variance shown as +/- per category: green if under budget,
  red if over.
- "Copy plan to next month" button: copies monthly_plan expected
  income and all budget limits to the next month.

Savings goals:
- Goals screen: list of active goals as cards.
- Each card: emoji, name, progress bar (current/target), monthly
  contribution, projected completion date (calculated:
  months_remaining = ceil((target - current) / monthly_contribution)).
- "Add funds" button: creates an expense transaction in the Poupança
  category and increments current_cents on the goal by the same amount.
  These are linked — deleting the transaction decrements the goal.
- Goal completion: when current_cents >= target_cents, mark
  is_complete=true, show a celebration animation, move to
  "Completed goals" section.
- Goals are independent of the monthly budget — contributing to a
  goal creates a real transaction (so it shows in your expense
  tracking) but is visually distinguished in the goals screen.

</architecture_decisions>

<frontend_requirements>
Implement in this order:

1. Income sources
   - Income sources management in settings
   - Source selector on income transaction entry/edit
   - Income breakdown by source in monthly dashboard
   - Year-to-date freelance widget with IRS note
   Gate: create 2 income sources, assign to transactions, verify
   breakdown appears correctly in dashboard.

2. Monthly planning
   - Planning screen (new tab or section within Budget)
   - Expected income input for current and future months
   - Projected net calculation
   - Plan vs actual comparison at month end
   - Copy plan to next month
   Gate: set a plan for current month, log transactions, verify
   plan vs actual shows correct variances.

3. Savings goals
   - Goals screen under its own nav item (replace or extend
     existing nav — confirm with user if nav changes are needed)
   - Goal cards with progress, contribution, projected date
   - Add funds flow with linked transaction creation
   - Completion animation
   - Completed goals section
   Gate: create a goal, add funds twice, verify linked transactions
   appear in transaction list, verify projected date recalculates.
</frontend_requirements>

<development_guidelines>
Workflow, error handling, cleanup, boundary commits, Jira conventions
defined in copilot-instructions.md. Feature work under v1.1 epic.

After all phases merged and test agent signs off:
    git commit --allow-empty -m "chore: v1.1 feature complete — cleanup begins"
After cleanup:
    git commit --allow-empty -m "chore: v1.1-cleanup complete"
</development_guidelines>