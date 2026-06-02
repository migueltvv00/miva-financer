<project_overview>
This is v1.9.2 of Fluxo. Four features:

1. SAVINGS & INVESTMENTS → NET WORTH AUTO-SYNC
   Extend the existing `syncToNetWorth()` (which already handles investments)
   to also pull savings goals' `current_cents` into `assets_json`. Provide a
   single "Sincronizar patrimônio" action that merges both.

2. MEAL CARD BUDGET (separate from salary income)
   When a payslip is confirmed with `meal_card_cents > 0`, create a dedicated
   meal-card budget for that month. Track expenses with
   `payment_method='cartao_refeicao'` against this allowance. Show a
   mini-widget on the Dashboard with credit/spent/balance.

3. TELEGRAM BOT — MEAL CARD SELECTION
   After a transaction is parsed (or entered manually), offer an inline
   keyboard button to mark it as paid with "Cartão Refeição" before
   confirming. The payment_method should be set accordingly.

4. TELEGRAM BOT — MANUAL EXPENSE (no AI)
   Add a `/gasto` command that accepts structured input without requiring
   Gemini NL parsing. This is the fallback when the model is rate-limited
   (500 RPD reached). Format: `/gasto <valor> <nota>` — uses most recent
   expense category or asks user to pick one via inline keyboard.

Stable from v1.0–v1.9.1 — do not touch unrelated features.
</project_overview>

<tech_stack>
Defined in copilot-instructions.md. No new libraries this version.

Gemini model: gemini-3.1-flash-lite (15 RPM, 500 RPD — rate-limit is the
reason for feature 4).

All monetary values: integer cents. Display: pt-PT locale (1.234,56 €).
Payment methods enum: 'cartao_refeicao' | 'multibanco' | 'mbway' |
'numerario' | 'credito' | 'debito' | null.
</tech_stack>

<architecture_decisions>

--- FEATURE 1: NET WORTH ASSET/LIABILITY REGISTRY + AUTO-SYNC ---

Context:
- Currently `net_worth_entries` stores monthly snapshots with
  `assets_json: Record<string, number>` and `liabilities_json: Record<string, number>`.
- User must manually re-enter ALL assets/liabilities each month.
- Investment sync exists but is awkward (merges into JSON blob).
- Savings goals have `current_cents` but no link to net worth.

REDESIGN: Asset & Liability Registry

Instead of free-form JSON per month, create a persistent registry of
assets and liabilities. Each entry is created ONCE and its value updates
over time (via savings deposits, investment snapshots, or manual edit).
Monthly snapshots are auto-generated from current registry values.

A) New table `net_worth_items`:
   ```sql
   CREATE TABLE net_worth_items (
     id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
     user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
     name text NOT NULL,
     type text NOT NULL CHECK (type IN ('asset', 'liability')),
     value_cents integer NOT NULL DEFAULT 0,
     source text NOT NULL DEFAULT 'manual'
       CHECK (source IN ('manual', 'savings_goal', 'investment')),
     source_id uuid,
     emoji text DEFAULT '💰',
     sort_order integer DEFAULT 0,
     created_at timestamptz DEFAULT now(),
     updated_at timestamptz DEFAULT now()
   );
   ALTER TABLE net_worth_items ENABLE ROW LEVEL SECURITY;
   CREATE POLICY "Users manage own net worth items"
     ON net_worth_items FOR ALL USING (auth.uid() = user_id);
   ```

   - `source = 'manual'`: user-created, user-edited (e.g., "Casa", "Carro", "Crédito habitação")
   - `source = 'savings_goal'`: linked to a savings goal, value auto-synced from `savings_goals.current_cents`
   - `source = 'investment'`: linked to an investment account, value from latest snapshot

   `source_id` stores the FK to `savings_goals.id` or `investment_accounts.id` when applicable.

B) Existing `net_worth_entries` table becomes HISTORICAL SNAPSHOTS only:
   - Keep the table as-is for chart history.
   - Each month-end (or on manual "snapshot" action), auto-generate a
     net_worth_entries row from current `net_worth_items` values.
   - The NetWorthScreen shows CURRENT values from `net_worth_items` (live)
     and a historical chart from `net_worth_entries` (monthly snapshots).

C) NetWorthScreen redesign:
   - Top: summary card with total assets, total liabilities, net worth
   - Middle: two lists — "Ativos" and "Passivos"
     - Each row: emoji, name, value (editable for manual items, read-only for synced)
     - Synced items show a small badge (🔗) indicating auto-managed
     - "+" button to add new manual asset/liability
   - Bottom: historical chart (from net_worth_entries, unchanged)
   - Action: "📸 Guardar snapshot" button to freeze current values into net_worth_entries

D) Auto-sync from savings goals:
   When user adds funds to a savings goal, also update the corresponding
   `net_worth_items` row (where source='savings_goal' and source_id=goal.id).
   If no item exists yet, auto-create one: name = goal.name, emoji = goal.emoji.

E) Auto-sync from investments:
   When user adds/updates an investment snapshot, update the corresponding
   `net_worth_items` row (where source='investment' and source_id=account.id).
   If no item exists yet, auto-create one: name = account.name, emoji based on type.

F) Migration of existing data:
   On first load (or via a one-time migration hook), if user has
   `net_worth_entries` but no `net_worth_items`:
   - Parse the latest `assets_json` and `liabilities_json`
   - Create `net_worth_items` rows for each key (source='manual')
   - This preserves the user's existing data seamlessly

No changes to `net_worth_entries` table itself — it stays as history.

--- FEATURE 2: MEAL CARD BUDGET ---

Context:
- `payslip_imports.meal_card_cents` stores the monthly meal card allowance
- Transactions have `payment_method` field; value 'cartao_refeicao' = meal card
- The BudgetScreen shows per-category expense limits
- Currently there is no dedicated meal card tracker

What to build:

A) Meal card budget record:
   New table `meal_card_budgets`:
   ```sql
   CREATE TABLE meal_card_budgets (
     id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
     user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
     month date NOT NULL,
     allowance_cents integer NOT NULL CHECK (allowance_cents > 0),
     created_at timestamptz DEFAULT now(),
     UNIQUE (user_id, month)
   );
   ALTER TABLE meal_card_budgets ENABLE ROW LEVEL SECURITY;
   CREATE POLICY "Users manage own meal card budgets"
     ON meal_card_budgets FOR ALL USING (auth.uid() = user_id);
   ```

B) Auto-creation from payslip:
   In `confirm-payslip` edge function, after upserting monthly_plans, also
   upsert `meal_card_budgets`:
   - If `payslip.meal_card_cents > 0`, upsert (user_id, month) with
     allowance_cents = meal_card_cents
   - If meal_card_cents is null or 0, skip

C) Dashboard widget "Cartão Refeição":
   Show on DashboardScreen when a `meal_card_budgets` entry exists for the
   current month:
   ```
   🍽️ Cartão Refeição
   Crédito:  {allowance_cents formatted}
   Gasto:    {sum of transactions with payment_method='cartao_refeicao' this month}
   Saldo:    {allowance - spent}
   [========░░] {percentage bar}
   ```
   
   Query for spent:
   ```sql
   SELECT COALESCE(SUM(amount_cents), 0) as spent
   FROM transactions
   WHERE user_id = ? AND payment_method = 'cartao_refeicao'
     AND type = 'expense'
     AND date >= '{month}-01' AND date < '{next_month}-01'
   ```

   Widget colour logic:
   - Green (accent) when spent < 80% of allowance
   - Warning (orange) when spent 80-100%
   - Danger (red) when spent > 100%

D) Hook: `src/hooks/useMealCardBudget.ts`
   Fetches: meal_card_budgets entry for current month + sum of meal card
   expenses. Returns: { allowance_cents, spent_cents, remaining_cents, isLoading }

E) Existing MealCardWidget on DashboardScreen (if present):
   Check if there's already a MealCardWidget.tsx — if so, enhance it with
   this budget data. If not, create it.

--- FEATURE 3: TELEGRAM BOT — MEAL CARD SELECTION ---

Context:
- When user sends a free-text message, Gemini parses it and may or may not
  detect `payment_method`
- The confirmation inline keyboard currently shows: ✅ Confirmar | ❌ Cancelar
- There is no explicit way to mark payment method after AI parsing

What to build:

A) After Gemini parses a transaction, before the final confirmation keyboard,
   add a payment method row. The confirmation message should show:
   ```
   💳 {category_emoji} {note}
   💰 {amount formatted}
   📅 {date}
   🏷️ {category name}
   💳 Método: {payment_method or "—"}
   ```

B) Inline keyboard layout (3 rows):
   Row 1: [🍽️ C. Refeição] [💳 Multibanco] [📱 MBWay]
   Row 2: [💵 Dinheiro] [🏦 Débito] [💳 Crédito]
   Row 3: [✅ Confirmar] [❌ Cancelar]

   Callback data format: `pm:{method}` (e.g., `pm:cartao_refeicao`)
   When user taps a payment method button:
   - Update the pending transaction's payment_method
   - Edit the message to show the updated method
   - Keep the keyboard visible (user can change their mind)
   
   When user taps ✅ Confirmar:
   - Save transaction with the selected payment_method
   - Remove the inline keyboard, show success message

C) State management:
   Use the existing `pending_transactions` or callback state in the webhook.
   Store the pending payment_method alongside the parsed transaction data
   until confirmation.

--- FEATURE 4: TELEGRAM BOT — MANUAL EXPENSE (no AI) ---

Context:
- Gemini 3.1 Flash Lite: 500 RPD limit. When hit, bot can't parse messages.
- Currently there is NO structured command — only free-text NL parsing.
- Users need a guaranteed fallback for adding expenses.

What to build:

A) Command: `/gasto <valor> [nota]`
   Examples:
   - `/gasto 12.50 Almoço` → expense €12.50, note "Almoço"
   - `/gasto 3.20` → expense €3.20, no note
   - `/gasto 45 Supermercado` → expense €45.00, note "Supermercado"

   Parsing rules:
   - First argument: amount in euros (supports comma or dot as decimal)
     e.g., "12.50", "12,50", "12" → 1250, 1250, 1200 cents
   - Remaining text: note (optional, default empty)
   - Type: always 'expense'
   - Date: today (can't specify date in manual mode for simplicity)

B) Category selection flow:
   After parsing the value/note, bot sends a message:
   ```
   📝 Despesa: {amount formatted}
   {note if present}
   
   Escolhe a categoria:
   ```
   With inline keyboard showing user's expense categories (emoji + name),
   max 3 per row, max 4 rows (12 categories). If user has more, show
   the 12 most-used first.

   Callback data format: `mc:{category_id}` (manual-category)

C) After category selection:
   Show the payment method keyboard (same as Feature 3, Row 1+2) + confirm:
   ```
   📝 Despesa: {amount formatted}
   📂 {category_emoji} {category_name}
   {note if present}
   
   Método de pagamento:
   ```
   Keyboard: same payment method row + [✅ Confirmar sem método] + [❌ Cancelar]

D) On confirm:
   Insert transaction directly to DB (no Gemini involved):
   ```
   { user_id, type: 'expense', amount_cents, category_id,
     note, date: today, payment_method: selected or null }
   ```
   Reply: `✅ {amount formatted} — {category} registado!`

E) Also add `/receita <valor> [nota]` for income (same flow, type='income',
   shows income categories instead).

F) Error handling:
   - `/gasto` with no arguments → reply with usage:
     "Uso: `/gasto 12.50 Almoço`\nExemplos: `/gasto 3.20`, `/gasto 45 Supermercado`"
   - Invalid amount → "Valor inválido. Usa um número (ex: 12.50 ou 12,50)."
   - No categories found → "Não tens categorias de despesa. Cria uma na app."

G) Quota bypass:
   This command NEVER calls Gemini. It is the guaranteed fallback.
   When the NL parser hits a rate limit (status 429 or quota error from
   Gemini), reply with:
   "⚠️ Modelo indisponível. Usa `/gasto 12.50 Almoço` para registar manualmente."

</architecture_decisions>

<implementation_order>
1. DB migration: create `net_worth_items` table + `meal_card_budgets` table with RLS.
2. Create `src/types/index.ts` additions: NetWorthItem interface.
3. Create `src/store/netWorthItemStore.ts` — Zustand store for the registry.
4. Rewrite `src/features/net-worth/NetWorthScreen.tsx` — registry-based UI
   with live values, add/edit/delete manual items, read-only synced items.
5. Create sync logic: auto-update net_worth_items from savings goals +
   investment snapshots (hook into goal fund additions + snapshot updates).
6. Data migration hook: on first load, parse existing net_worth_entries
   into net_worth_items.
7. Update `confirm-payslip` edge function: upsert meal_card_budgets when
   meal_card_cents > 0.
8. Create `src/hooks/useMealCardBudget.ts` hook.
9. Create/update MealCardWidget on DashboardScreen.
10. Update `telegram-webhook`: add `/gasto` and `/receita` commands.
11. Update `telegram-webhook`: add payment method inline keyboard to
    confirmation flow (both AI-parsed and manual entries).
12. Update `telegram-webhook`: handle `pm:*` and `mc:*` callback queries.
13. Update `telegram-webhook`: on Gemini rate-limit, suggest `/gasto` fallback.
14. Deploy edge functions:
    - confirm-payslip (verify_jwt)
    - telegram-webhook (--no-verify-jwt)
15. Type-check: pnpm type-check.
16. Build: pnpm build.
17. Commit: feat: v1.9.2 — net worth registry, meal card budget, manual bot entry
18. Push to GitHub.
19. User deploys to Vercel: pnpm build && npx vercel --prod
</implementation_order>

<verification_gates>
Feature 1 — Net Worth Registry:
  - Create a manual asset "Casa" with value €200,000
  - Create a manual liability "Crédito Habitação" with value €150,000
  - Verify net worth shows €200,000 - €150,000 = €50,000
  - Add funds to a savings goal → verify a synced asset appears automatically
  - Add an investment snapshot → verify a synced asset appears automatically
  - Synced items should be read-only (can't edit value directly)
  - Click "Guardar snapshot" → verify net_worth_entries row created
  - Historical chart still works from old snapshots

Feature 2 — Meal Card Budget:
  - Confirm a payslip with meal_card_cents = 10000 (€100)
  - Dashboard shows "Cartão Refeição" widget with €100 credit
  - Add an expense with payment_method='cartao_refeicao' (€15)
  - Widget shows: Crédito €100, Gasto €15, Saldo €85

Feature 3 — Telegram Meal Card Selection:
  - Send a free-text expense to bot (e.g., "almoço 8.50")
  - Bot shows transaction + payment method keyboard
  - Tap "🍽️ C. Refeição" → method updates in message
  - Tap "✅ Confirmar" → transaction saved with payment_method='cartao_refeicao'

Feature 4 — Manual Bot Entry:
  - Send `/gasto 12.50 Almoço` to bot
  - Bot shows amount + note, asks for category (inline keyboard)
  - Select category → bot shows payment method options
  - Confirm → transaction saved without any Gemini call
  - Verify: send free text when Gemini quota is hit → bot suggests /gasto
</verification_gates>
