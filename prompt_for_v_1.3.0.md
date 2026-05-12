<project_overview>
Continuation of Fluxo after v1.2 is stable. v1.3 adds power features:
bank statement CSV import from Portuguese banks, instalment/split
tracking for large credit purchases, and manual investment portfolio
tracking.

Stable from v1.0–v1.2 — do not touch existing features.
</project_overview>

<tech_stack>
Defined in copilot-instructions.md. Additional libraries this version:
- papaparse — CSV parsing (already familiar from Miva codebase)
No other new dependencies without user confirmation.
</tech_stack>

<architecture_decisions>

Bank statement CSV import:
- Supported banks: CGD, BPI, Millennium BCP, Novo Banco.
  Each has a known CSV export format — hardcode parsers for each.
- Import flow:
    1. User selects bank from a dropdown.
    2. Uploads CSV file.
    3. App parses with papaparse, maps columns to
       { date, amount_cents, description, type }.
    4. Deduplication: for each parsed row, check if a transaction
       exists with the same date + amount_cents + type within
       a 3-day window. Flag likely duplicates.
    5. Review screen: table of parsed transactions with:
       - Auto-suggested category (from smart suggestion engine)
       - Duplicate warning badge if likely duplicate
       - Checkbox to include/exclude each row
    6. Confirm import: creates all included transactions in bulk.
- New table:
    import_sessions:
      id          uuid pk
      user_id     uuid references auth.users
      bank        text
      filename    text
      row_count   integer
      imported_count integer
      created_at  timestamptz
- Each imported transaction gets a nullable import_session_id FK.
- "Undo import" button in settings: deletes all transactions from
  a given import session (only if none have been manually edited
  since import — check updated_at vs created_at).

CSV format reference (hardcoded parsers, verify with context7
or web search for current format before implementing):
  CGD:         semicolon-separated, columns: Data;Descrição;Valor
  BPI:         semicolon-separated, columns: Data Mov.;Descrição;Valor
  Millennium:  semicolon-separated, Data;Descrição;Débito;Crédito
  Novo Banco:  semicolon-separated, Data;Descrição;Montante

Instalment / split tracking:
- New table:
    instalments:
      id                  uuid pk
      user_id             uuid references auth.users
      name                text        -- e.g. "MacBook 14 — 12x"
      total_cents         integer
      instalment_cents    integer     -- total / num_instalments
      num_instalments     integer
      paid_instalments    integer default 0
      start_month         date        -- first day of first month
      category_id         uuid references categories
      note                text
      created_at          timestamptz
- Creating an instalment plan auto-creates recurring monthly
  transactions for N months starting from start_month, all linked
  via a shared instalment_id FK on the transactions table
  (add nullable instalment_id column to transactions).
- In transaction list, instalment transactions show "2/12 prestações"
  label.
- Instalment dashboard widget: list of active instalments with
  paid/remaining count and remaining total.

Investment portfolio:
- New tables:
    investment_accounts:
      id          uuid pk
      user_id     uuid references auth.users
      name        text    -- e.g. "DeGiro", "PPR Fidelidade", "CTT"
      type        text    -- 'etf'|'ppr'|'stock'|'savings'|'other'
      color       text
      created_at  timestamptz

    investment_snapshots:
      id              uuid pk
      user_id         uuid references auth.users
      account_id      uuid references investment_accounts
      month           date
      value_cents     integer     -- current value this month
      cost_basis_cents integer    -- total invested to date
      created_at      timestamptz
      unique(account_id, month)

- Monthly snapshot entry: for each investment account, user enters
  current value and total invested to date.
- Computed client-side: unrealised gain/loss per account
  (value - cost_basis), gain % ((value/cost_basis - 1) * 100).
- Portfolio allocation donut chart (by account type).
- Total portfolio value over time line chart.
- "Copy from last month" for easy monthly updates.
- These values are separate from net worth but feed into it:
  investment account values automatically populate the assets
  section of the net worth snapshot with a "Sync from portfolio"
  button.

</architecture_decisions>

<frontend_requirements>
Implement in this order:

1. Bank statement CSV import
   - Bank selector, file upload, papaparse parsing
   - Deduplication detection
   - Review screen with category suggestions, duplicate badges,
     include/exclude checkboxes
   - Bulk import confirm
   - Import history in settings with undo option
   Gate: import a real or mock CGD CSV. Verify deduplication flags
   a transaction that already exists. Verify undo removes all
   imported transactions.

2. Instalment tracking
   - Create instalment plan form (name, total, N months, category,
     start month)
   - Auto-creates N recurring transactions
   - "X/N prestações" label in transaction list
   - Active instalments widget in dashboard
   Gate: create a 6-month instalment, verify 6 transactions created
   in correct months. Verify widget shows 0/6 paid on creation.

3. Investment portfolio
   - Investment accounts management in settings
   - Monthly snapshot entry with copy from last month
   - Gain/loss computed and displayed per account
   - Allocation donut chart
   - Portfolio value over time chart
   - "Sync to net worth" button
   Gate: create 2 accounts, enter 3 months of snapshots, verify
   gain/loss calculation is correct, verify sync populates net
   worth assets correctly.
</frontend_requirements>

<development_guidelines>
Workflow, error handling, cleanup, boundary commits, Jira conventions
defined in copilot-instructions.md. Feature work under v1.3 epic.

Stop and ask before implementing CSV parsers: user should provide
a real sample export file from their bank so the column format
can be verified before hardcoding.

After all phases merged and test agent signs off:
    git commit --allow-empty -m "chore: v1.3 feature complete — cleanup begins"
After cleanup:
    git commit --allow-empty -m "chore: v1.3-cleanup complete"
</development_guidelines>