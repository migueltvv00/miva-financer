<project_overview>
Continuation of Fluxo after v1.1 is stable. v1.2 adds intelligence
and insight: spending trend analysis, a monthly PDF report useful for
Portuguese IRS review, smart category suggestions from the user's own
transaction history, and a manual net worth snapshot.

Stable from v1.0–v1.1 — do not touch existing features.
</project_overview>

<tech_stack>
Defined in copilot-instructions.md. Additional libraries this version:
- @react-pdf/renderer — for PDF report generation client-side.
  Verify via context7 before implementing.
No other new dependencies without user confirmation.
</tech_stack>

<architecture_decisions>

Spending trends:
- No new tables. Computed from existing transactions.
- For each expense category, compute rolling 3-month and 6-month
  average spend (excluding the current in-progress month).
- Display as a sparkline (small inline chart) per category in the
  dashboard, alongside the current month's spend.
- Insight text auto-generated client-side (no AI API):
    if current > 3m_avg * 1.2: "20% acima da sua média"
    if current < 3m_avg * 0.8: "20% abaixo da sua média"
    else: "Dentro da sua média habitual"
- A dedicated Trends screen shows all categories with 6-month bar
  charts and insight labels.

Monthly PDF report:
- Generated entirely client-side with @react-pdf/renderer.
- Triggered from the dashboard: "Exportar relatório PDF" button.
- Content:
    Cover: month/year, user email, generation date
    Summary: income, expenses, net, savings rate %
    Income detail: breakdown by source
    Expense detail: per category — budgeted, actual, variance
    Freelance income total YTD with IRS disclaimer
    Savings goals: current progress on each active goal
- Styled cleanly — black and white, printable. No fancy design.
- Filename: fluxo-{YYYY}-{MM}.pdf

Smart category suggestions:
- When the user types in the note field during transaction entry,
  compute the most frequent category used with that note text
  (case-insensitive, partial match against past transaction notes).
- If confidence > 60% (note appears in that category more than 60%
  of times it has been used), auto-select that category and show
  a subtle "Sugerido" badge on it.
- User can override by tapping a different category — no friction.
- Purely client-side frequency analysis on the local Zustand store.
  No API calls, no ML.

Net worth snapshot:
- New table:
    net_worth_entries:
      id            uuid pk
      user_id       uuid references auth.users
      month         date  -- first of month
      assets_json   jsonb -- { "Conta CGD": 150000, "PPR": 320000 }
      liabilities_json jsonb -- { "Cartão crédito": 45000 }
      created_at    timestamptz
      unique(user_id, month)
- A monthly snapshot screen where the user manually enters:
    Asset accounts with current values (savings, investments, PPR)
    Liabilities (credit card balances, loans)
- Net worth = sum(assets) - sum(liabilities) computed client-side.
- A line chart shows net worth trajectory over all recorded months.
- "Copy from last month" pre-fills this month's entry with last
  month's values — user only updates what changed.

</architecture_decisions>

<frontend_requirements>
Implement in this order:

1. Spending trends
   - 3m/6m averages computed from transaction store
   - Sparklines per category in dashboard
   - Insight text labels
   - Dedicated Trends screen
   Gate: verify 3m average is mathematically correct for a category
   with 4+ months of data.

2. PDF report
   - "Exportar PDF" button on dashboard
   - Client-side generation with correct content sections
   - IRS disclaimer on freelance income section
   Gate: generate PDF for a month with income, expenses, and at
   least one active savings goal. Verify all sections render.

3. Smart category suggestions
   - Note field triggers suggestion after 2+ characters typed
   - Auto-selects category if confidence > 60%
   - "Sugerido" badge visible, overridable
   Gate: log 5 transactions with note "Continente" in Alimentação,
   then start a new entry with note "Contin" — verify Alimentação
   is auto-selected with badge.

4. Net worth snapshot
   - Monthly entry screen with assets/liabilities
   - Copy from last month
   - Net worth line chart
   Gate: enter 3 months of net worth data, verify chart trajectory
   is correct and net = assets - liabilities per month.
</frontend_requirements>

<development_guidelines>
Workflow, error handling, cleanup, boundary commits, Jira conventions
defined in copilot-instructions.md. Feature work under v1.2 epic.

After all phases merged and test agent signs off:
    git commit --allow-empty -m "chore: v1.2 feature complete — cleanup begins"
After cleanup:
    git commit --allow-empty -m "chore: v1.2-cleanup complete"
</development_guidelines>