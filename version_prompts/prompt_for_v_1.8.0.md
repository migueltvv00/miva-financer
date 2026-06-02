<project_overview>
This is v1.8 of Fluxo, continuing from stable v1.7. Two required parts
and a set of optional PO-suggested features (clearly marked so each
can be accepted ✅ or rejected ❌ independently without touching the rest
of the prompt).

REQUIRED:
1. PAYSLIP → INCOME TRANSACTION — when a payslip is confirmed, auto-create
   an income transaction for the net salary in the correct month. The user
   must never have to do this manually again.

2. PAYSLIP EXTRACTION PREVIEW — add a collapsible panel next to the review
   form that shows the raw breakdown read from the PDF before any edits:
   gross, net, IRS, SS, subsidies, meal card value, etc.

3. SESSION LOSS FIX — the user is being silently signed out mid-session.
   Add a "Entrar" button on every screen that has auth-gated content, so
   re-login is one tap away and the user never gets stranded on a blank
   loading state.

OPTIONAL (PO SUGGESTIONS — accept or reject each independently):

  [ ] FEATURE A — Monthly net salary trend chart (6-month sparkline from payslip history)
  [ ] FEATURE B — IRS + SS deduction breakdown pie chart on the payslip history card
  [ ] FEATURE C — Telegram /recibo command to show last payslip summary inline
  [ ] FEATURE D — Budget auto-fill from payslip net (set income budget to net salary when confirmed)
  [ ] FEATURE E — Meal card balance tracker (running total of cartão refeição credits vs spend)
  [ ] FEATURE F — Push notification (web) when payslip is successfully parsed

To reject a feature, delete or comment out its block in this file.
Anything that remains uncommented is in scope.

Stable from v1.0–v1.7 — do not touch existing features unless strictly
required by the above.
</project_overview>

<tech_stack>
Defined in copilot-instructions.md. No new libraries this version.

Gemini model: gemini-3.1-flash-lite (unchanged from v1.7).
All monetary values: integer cents. Display: pt-PT locale (1.234,56 €).
</tech_stack>

<debugging_guide>
Reuse the debugging guide from prompt_for_v_1.7.0.md (unchanged).
The CURL simulation and Supabase log patterns are the same.
For the session loss issue: check supabase.auth.onAuthStateChange events
in the browser console. A SIGNED_OUT event without an explicit sign-out
action indicates a JWT expiry or session not being refreshed correctly.
</debugging_guide>

<architecture_decisions>

--- PART 1: PAYSLIP → INCOME TRANSACTION ---

Context:
- When the user confirms a payslip import in PayslipImport.tsx, the app
  currently stores the payslip data in the `payslip_imports` table.
- The net salary is NOT being added to the transaction list.
- The target month is `extracted.month` (format "YYYY-MM").

What to build:
After a successful payslip confirmation (the Supabase insert into
`payslip_imports` succeeds), automatically create an income transaction:

  table: transactions
  fields:
    user_id:          current user
    type:             'income'
    amount_cents:     net_salary_cents from the confirmed payslip
    category_id:      the default "Salário" or "Rendimentos" income category
                      (query categories where name ILIKE '%salário%' OR
                       name ILIKE '%rendimento%' AND type = 'income',
                       take the first result; if none found, take the first
                       income category for that user)
    note:             "Salário — {employer_name if present, else 'Recibo de vencimento'}"
    date:             last day of the payslip month
                      (e.g., month="2026-04" → date="2026-04-30")
    payment_method:   null (salary is a bank transfer, user can edit later)
    payslip_import_id: the id of the just-inserted payslip_imports row
                      (FK to link the income tx back to its source)

  Idempotency check (BEFORE inserting):
  Query transactions where payslip_import_id = <new id>. If a row
  already exists, skip the insert and show "Rendimento já registado"
  instead of "Rendimento criado". This prevents duplicates if the user
  somehow confirms twice.

DB change:
  ALTER TABLE transactions ADD COLUMN IF NOT EXISTS payslip_import_id uuid
  REFERENCES payslip_imports(id) ON DELETE SET NULL;

  Run this as a new Supabase migration: `add_payslip_import_id_to_transactions`.

Transaction type `src/types/index.ts`:
  Add `payslip_import_id?: string | null;` to the Transaction interface.

UI feedback after confirm:
  The success screen in PayslipImport.tsx currently shows "Importado com
  sucesso". Extend it to show two lines:
    ✅ Recibo importado
    💰 Rendimento de {net_salary formatted} registado em {month label}
  If the income tx creation fails, show a warning (not an error) — the
  payslip import itself succeeded, only the transaction creation failed:
    ⚠️  Recibo importado, mas não foi possível criar o rendimento automático.
        Cria manualmente nas transações.

In the transaction store (`transactionStore.ts`):
  After creating the income transaction, add it to the local store
  (optimistic update) so it appears in the transaction list immediately
  without a reload.

--- PART 2: PAYSLIP EXTRACTION PREVIEW ---

Context:
- PayslipImport.tsx currently has a 'review' phase that shows editable
  inputs for the extracted values (gross, net, IRS, SS, other, employer).
- The user edits these values before confirming.
- There is no way to see what Gemini actually extracted vs what they typed.

What to build:
A collapsible "Ver extracção original" panel inside the review phase.

Placement: above the editable form fields, collapsed by default.
Toggle: a single button/link — "▶ Ver extracção original" / "▼ Fechar".

Content when expanded (read-only, formatted in euros):
  Entidade: {employer_name or "—"}
  Mês:      {month label}
  ────────────────────────
  Vencimento base:       {gross_salary_cents}
  Subsídio de refeição:  {meal_card_cents or "—"}
  Total ilíquido:        {total_gross_cents or same as gross}
  ────────────────────────
  IRS retido:            {irs_withheld_cents}
  Segurança Social:      {ss_withheld_cents}
  Outras deduções:       {other_deductions_cents or "—"}
  ────────────────────────
  💰 Líquido recebido:   {net_salary_cents}   ← bold

All values are read-only. This is purely informational.

Data source: extend `ExtractedPayslipData` (the interface in PayslipImport.tsx)
to include the raw values returned by the Edge Function. The Edge Function
(`parse-payslip`) must return all extracted fields in the response, including:
  - meal_card_cents (if mentioned in the payslip)
  - total_gross_cents (if different from gross_salary_cents)
  Any field Gemini could not extract should be null (not 0).

Gemini prompt in `parse-payslip/index.ts`:
Extend the current extraction prompt to also extract:
  - "meal_card_cents": integer cents of the subsidio de refeicao value, null if absent
  - "total_gross_cents": integer cents of the total ilíquido (gross before deductions), null if same as gross_salary_cents

The Edge Function response shape (add to existing):
  meal_card_cents:   number | null
  total_gross_cents: number | null

Store these in a NEW table column or in a JSONB extras column on
`payslip_imports`. Recommendation: add two nullable integer columns to
`payslip_imports`:
  ALTER TABLE payslip_imports
    ADD COLUMN IF NOT EXISTS meal_card_cents integer,
    ADD COLUMN IF NOT EXISTS total_gross_cents integer;

Migration name: `add_payslip_extras_columns`.

--- PART 3: SESSION LOSS FIX ---

Context:
- The user is being silently signed out. After doing an operation they
  are suddenly on a loading screen and cannot recover without manually
  navigating to the login page.
- Root cause hypothesis: Supabase JWT expires (default 1 hour) and the
  session refresh fails silently, leaving the app in an auth-unknown limbo.

Fix strategy (two layers):

Layer 1 — Auth state listener:
  In `src/hooks/useAuth.ts` (or wherever `supabase.auth.onAuthStateChange`
  is subscribed), ensure that a `SIGNED_OUT` event triggers a clean redirect
  to the login page (not a blank loading spinner). Do not leave the user
  stranded on a loading screen.

Layer 2 — "Entrar" recovery button:
  Every screen that gate-keeps content behind auth (any screen that shows
  a loading spinner or empty state when session is null) must show a
  clearly-visible "Entrar" button if `session === null && !loading`.

  Button style: primary, centred, full-width on mobile (max-w-xs on
  desktop), label "Entrar na conta", onClick calls
  `supabase.auth.signInWithOtp` or redirects to the login route — use
  whichever login method already exists in the codebase (check AuthScreen).

  Affected screens (search for `session === null` or `!user` gates):
  - DashboardScreen (or equivalent home screen)
  - TransactionListScreen
  - BudgetScreen
  - SettingsScreen
  - Any other screen that shows a blank/loading state without session

  The recovery button is a safety net, not the primary auth flow. It
  should not replace the existing auth check logic.

Layer 3 — Session refresh on focus:
  In `src/App.tsx` or the root layout, add a `visibilitychange` listener:
  when the tab becomes visible again (document.hidden === false), call
  `supabase.auth.getSession()` to force a token refresh check. This
  handles the case where the device was sleeping or the tab was
  backgrounded for a long time.

--- OPTIONAL FEATURES ---

(Delete any block you do not want implemented.)

<!-- FEATURE A: Monthly net salary trend chart
In the PayslipImport history section, above the list of past imports,
add a small 6-month sparkline BarChart (Recharts, already a dependency)
showing net_salary_cents per month. Height: 80px. No axis labels.
Tooltip on hover: "{month label}: {net formatted}".
Only show if there are ≥ 2 payslip imports. -->

<!-- FEATURE B: IRS + SS deduction breakdown on history card
On each payslip history card, show two progress bars below the net:
  IRS: [████░░░░] {percentage of gross}%
  SS:  [██░░░░░░] {percentage of gross}%
Collapsed by default (toggle with a "▸ Deduções" link). -->

<!-- FEATURE C: Telegram /recibo command
When user sends /recibo, the bot replies with the last confirmed
payslip (most recent payslip_imports row for that user):
  📄 *Recibo {month label}*
  Entidade: {employer_name or "—"}
  Líquido: {net formatted}
  IRS: {irs formatted}   SS: {ss formatted}
  _Importado em: {created_at formatted}_
If no payslip exists: "Ainda não importaste nenhum recibo." -->

<!-- FEATURE D: Budget auto-fill from payslip net
After a payslip income transaction is created (Part 1), check if there
is a budget entry for the payslip month with category = 'Salário' /
'Rendimentos'. If none exists, create one with amount = net_salary_cents.
If one exists and its amount differs, show a Toast notification:
"💡 O teu orçamento de rendimento está em {old}. Atualizar para {new}?"
with Sim / Não buttons. -->

<!-- FEATURE E: Meal card balance tracker
New mini-widget on the DashboardScreen (or SettingsScreen):
"Cartão Refeição" widget showing:
  Crédito do mês (from payslip meal_card_cents): {value}
  Gasto até agora (sum of transactions with payment_method='cartao_refeicao' this month): {value}
  Saldo estimado: {credit - spent}
  [progress bar]
Only show if the current month has a payslip import with meal_card_cents > 0. -->

<!-- FEATURE F: Web push notification on payslip parse
After a payslip is successfully parsed (reaches 'review' phase),
trigger a Web Push notification (if permission granted):
  Title: "Recibo processado ✅"
  Body: "Líquido: {net formatted} — revê os valores antes de confirmar."
Use the existing Service Worker (Workbox GenerateSW) to handle the push.
Only request push permission the first time the user opens PayslipImport.
Store permission state in localStorage key 'fluxo-push-permission'. -->

</architecture_decisions>

<implementation_order>
1. DB migrations first (payslip_import_id column, payslip extras columns).
2. Update src/types/index.ts (Transaction interface + payslip fields).
3. Part 3 — Session fix (no DB changes, reduces risk of losing session mid-dev).
4. Part 2 — Extraction preview (Edge Function prompt + UI; no transaction logic).
5. Part 1 — Payslip → income transaction (depends on DB + types from steps 1–2).
6. Optional features (in any order, only if accepted).
7. Type-check: pnpm type-check.
8. Build: pnpm build.
9. Deploy edge functions:
     parse-payslip  (verify_jwt default)
     telegram-webhook (--no-verify-jwt) — only if FEATURE C accepted
10. Commit: feat: v1.8 — payslip income + preview + session fix
11. Boundary commits.
12. Push to GitHub.
13. User deploys to Vercel: pnpm build && npx vercel --prod
</implementation_order>

<verification_gates>
Part 1 — Upload a payslip PDF, confirm it, verify a new income transaction
  appears in the transaction list for the correct month with
  type='income' and the correct amount.
Part 2 — On the review screen, expand the "Ver extracção original" panel
  and confirm all extracted fields are shown read-only.
Part 3 — Background the browser tab for 90 minutes (or mock the SIGNED_OUT
  event), then return to the app. Verify the "Entrar na conta" button
  is visible and clicking it brings up the login flow.
</verification_gates>
