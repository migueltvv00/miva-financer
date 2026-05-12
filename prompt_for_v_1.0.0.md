<project_overview>
Build Fluxo — a personal finance PWA for a single Portuguese user.
This is a greenfield project. Nothing exists yet.

v1.0 delivers the core loop: log a transaction on your phone in under
10 seconds, set monthly budget limits per category, review a monthly
summary dashboard on desktop, and have everything sync instantly
between devices via Supabase Realtime.

This version must be fully usable as a daily driver before v1.1 begins.
</project_overview>

<tech_stack>
Defined in copilot-instructions.md. No additional libraries this version except:
- date-fns (date formatting with pt-PT locale)
- vite-plugin-pwa (PWA manifest and service worker)
Confirm both via context7 before implementing.
</tech_stack>

<architecture_decisions>

Database schema (Supabase/Postgres):
All tables have RLS enabled. All monetary values in euro cents (integer).

categories:
  id          uuid primary key default gen_random_uuid()
  user_id     uuid references auth.users not null
  name        text not null
  emoji       text not null
  color       text not null        -- hex string e.g. "#E03E3E"
  type        text not null        -- 'expense' | 'income'
  sort_order  integer not null default 0
  is_default  boolean not null default false
  created_at  timestamptz default now()

transactions:
  id              uuid primary key default gen_random_uuid()
  user_id         uuid references auth.users not null
  amount_cents    integer not null        -- always positive
  type            text not null           -- 'expense' | 'income'
  category_id     uuid references categories not null
  note            text
  date            date not null
  is_recurring    boolean not null default false
  recurrence_rule text                    -- 'weekly'|'monthly'|'yearly'
  recurrence_parent_id uuid references transactions
  created_at      timestamptz default now()
  updated_at      timestamptz default now()

budgets:
  id              uuid primary key default gen_random_uuid()
  user_id         uuid references auth.users not null
  category_id     uuid references categories not null
  month           date not null   -- always first day of month
  limit_cents     integer not null
  created_at      timestamptz default now()
  unique(user_id, category_id, month)

RLS policies (apply to all tables):
  SELECT: auth.uid() = user_id
  INSERT: auth.uid() = user_id
  UPDATE: auth.uid() = user_id
  DELETE: auth.uid() = user_id

Seed data — on first sign-in, create default categories:
  expense: 🛒 Alimentação, 🚗 Transporte, 🏠 Renda, ⚡ Serviços,
           💊 Saúde, 🍻 Lazer, 📺 Subscrições, 🛍 Compras,
           💰 Poupança, 📈 Investimento
  income:  💼 Salário, 🧑‍💻 Freelance, 📥 Outros Rendimentos
These are created with is_default=true so the user knows they can
be renamed but not deleted (enforce this in the UI only, not DB).

Authentication:
- Email + password via Supabase Auth.
- On first login, run the category seed function.
- Session persisted in localStorage — user stays logged in on phone.
- Auth state managed in a dedicated useAuth hook.

Quick transaction entry (primary mobile screen):
- This is the most important screen. Optimise for speed.
- Layout: large amount input at top (custom numpad component,
  not the browser keyboard — more reliable on iOS/Android),
  category icon grid below (2 rows of 4, scrollable if more),
  note field (optional, triggers keyboard only if tapped),
  date (defaults to today, tappable calendar picker to change),
  income/expense toggle (defaults to expense),
  large submit button at bottom.
- On submit: optimistic insert to Zustand store immediately,
  then async insert to Supabase. On failure: rollback local state,
  show error toast, preserve the form data so user doesn't lose entry.
- After submit: brief success animation, form resets, stays on
  entry screen (do not navigate away — user may log multiple).
- Offline: if no connection, queue the transaction in localStorage
  under key 'fluxo-offline-queue'. Show a subtle "Offline — will
  sync when connected" indicator. On reconnect, flush the queue
  to Supabase and clear it.

Transaction list:
- Grouped by date, descending (today first).
- Each item: category emoji + name, note (if present), amount,
  recurring indicator if applicable.
- Month filter at top (defaults to current month).
- Category filter (multi-select chips).
- Swipe left to delete on mobile (with confirmation).
- Tap to open edit modal (same layout as entry, pre-filled).
- Pull to refresh on mobile.

Budget limits:
- Accessed from the settings or a dedicated Budget tab.
- List of expense categories with a limit input per category.
- Limits are per-month. Default is no limit (unlimited).
- Setting a limit for the current month creates/updates a budgets row.
- Limits can be copied from the previous month (button: "Copy from
  last month") to avoid re-entering every month.

Monthly summary dashboard (desktop primary, mobile secondary):
- Month selector at top.
- Summary row: total income, total expenses, net (income - expenses).
  Net shown in green if positive, red if negative.
- Category breakdown: horizontal bar chart per expense category
  showing spent vs limit. Color: green → yellow at 75% → red at 100%.
  If no limit set, show spend amount only with no bar fill.
- Donut chart: expense distribution across categories.
- Income breakdown: list of income transactions grouped by category.
- Responsive: single column on mobile, two-column grid on desktop.

Recurring transactions:
- When creating/editing a transaction, a "Recurring" toggle appears.
- If enabled, show frequency selector: weekly / monthly / yearly.
- On save: create the transaction with is_recurring=true and store
  recurrence_rule.
- A background function (Supabase Edge Function or client-side on
  app open) checks for recurring transactions due today or earlier
  that haven't been created yet, and auto-creates them with
  recurrence_parent_id pointing to the original.
- In the transaction list, recurring transactions show a 🔁 indicator.
- Deleting a recurring transaction: ask "Delete this one" or
  "Delete this and all future". Never delete past occurrences.

Realtime sync:
- Subscribe to INSERT/UPDATE/DELETE on transactions and budgets
  tables filtered by user_id.
- On change: update Zustand store immediately.
- This means a transaction logged on the phone appears on the desktop
  dashboard within 1–2 seconds with no refresh.

PWA setup:
- vite-plugin-pwa with Workbox GenerateSW strategy.
- Manifest: name "Fluxo", short_name "Fluxo", theme_color matching
  --color-accent from design system, display "standalone",
  orientation "portrait".
- App icon: simple euro sign or wallet icon in the accent color —
  generate as SVG, convert to required PNG sizes.
- iOS meta tags: apple-mobile-web-app-capable,
  apple-mobile-web-app-status-bar-style.
- Offline fallback page shown when navigating to an uncached route
  without connection.

Navigation:
- Mobile (< 768px): bottom tab bar with 4 items:
    ➕ Adicionar (entry screen — default)
    📋 Transações (transaction list)
    📊 Resumo (monthly summary)
    ⚙️ Definições (settings)
- Desktop (≥ 768px): left sidebar with same items plus labels.
- Active tab highlighted with --color-accent.
</architecture_decisions>

<frontend_requirements>
Implement in this order. Each phase is a gate — do not proceed until
the previous phase passes its test criteria.

1. Project scaffold
   - Vite + React + TypeScript + TailwindCSS
   - tokens.css with the Notion-inspired design system
   - Supabase client initialisation (src/lib/supabase.ts)
   - Zustand store skeleton (src/store/)
   - PWA manifest and vite-plugin-pwa config
   - Bottom nav (mobile) + sidebar (desktop) shell with placeholder
     screens
   Gate: app loads on mobile browser, installs to home screen,
   shows bottom nav with 4 tabs.

2. Auth
   - Login / signup screen (email + password)
   - useAuth hook
   - Protected routes — unauthenticated users redirected to login
   - On first login: seed default categories
   Gate: sign up, log in, log out. Categories seeded on first login.
   Verify in Supabase dashboard that RLS is enforced.

3. Categories management
   - Category list in settings
   - Add, rename, reorder (drag or up/down arrows), set emoji + color
   - Type (expense/income) not changeable after creation
   - Default categories not deletable (show lock icon)
   Gate: create a custom category, rename it, reorder it.

4. Quick transaction entry
   - Custom numpad
   - Category icon grid
   - Note field, date picker, income/expense toggle
   - Optimistic submit with rollback
   - Offline queue with sync on reconnect
   Gate: log a transaction offline, go online, confirm it appears in
   Supabase. Log 3 transactions in under 30 seconds.

5. Transaction list
   - Grouped by date, month filter, category filter
   - Swipe to delete, tap to edit
   - Pull to refresh
   Gate: edit a transaction, delete a transaction, filter by category.

6. Budget limits
   - Per-category monthly limit input
   - Copy from last month
   Gate: set limits for 3 categories, verify they persist across
   page reload.

7. Monthly summary dashboard
   - Income / expense / net summary row
   - Category progress bars with color thresholds
   - Donut chart
   - Income breakdown
   - Realtime update test: log a transaction on "mobile" (narrow
     viewport), confirm dashboard updates without refresh
   Gate: dashboard reflects all transactions for the month accurately.
   Realtime sync verified.

8. Recurring transactions
   - Toggle + frequency selector on entry/edit form
   - Auto-creation logic on app open
   - Delete one vs delete all future
   Gate: create a monthly recurring transaction, advance the date
   by 1 month, reopen app, confirm new occurrence created.
</frontend_requirements>

<development_guidelines>
Workflow, error handling, cleanup structure, boundary commits, Jira
conventions, and stop-and-ask rule defined in copilot-instructions.md.

Feature phases as listed in frontend_requirements above.
All under v1.0 epic in Jira. Cleanup under v1.0-cleanup epic.

Stop and ask for the following before starting phase 1:
- Supabase project URL (VITE_SUPABASE_URL)
- Supabase anon key (VITE_SUPABASE_ANON_KEY)
- Confirm Supabase project is created in Frankfurt (eu-central-1)

After all phases merged and test agent signs off:
    git commit --allow-empty -m "chore: v1.0 feature complete — cleanup begins"
After cleanup:
    git commit --allow-empty -m "chore: v1.0-cleanup complete"
</development_guidelines>
