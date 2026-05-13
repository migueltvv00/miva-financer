<project_overview>
This is v1.6 of Fluxo, continuing from stable v1.5. Three things:

1. GEMINI MODEL MIGRATION — switch the entire app from
   gemini-2.5-flash (5 RPM, 20 RPD — confirmed exhausted) to
   gemini-3.1-flash-lite (15 RPM, 250K TPM, 500 RPD). This is
   a prerequisite for everything else in this version and must
   be done and verified before any other work starts.

2. PAYSLIP PARSING — upload a Portuguese recibo de vencimento
   PDF, have Gemini extract salary, tax, and SS values, and
   auto-create the corresponding transactions.

3. QUICK-ADD PANEL — a non-AI manual entry mode: always-visible
   panel above the transaction feed for instant one-tap logging
   without any Gemini call.

Stable from v1.0–v1.5 — do not touch existing features unless
strictly required by the above.
</project_overview>

<tech_stack>
Defined in copilot-instructions.md. Changes this version:

GEMINI MODEL: replace all occurrences of any previous Gemini
model string ('gemini-2.5-flash', 'gemini-2.0-flash',
'gemini-1.5-flash', or any variant) with 'gemini-3.1-flash-lite'.
This applies everywhere: Fluxo Edge Functions, the Telegram bot
webhook, and any other place in the codebase that references a
Gemini model string. Use context7 to verify the exact model string
and @google/genai SDK usage for gemini-3.1-flash-lite before
implementing — the SDK patterns may have changed since prior
versions.

Rate limit configuration for gemini-3.1-flash-lite free tier
(confirmed from AI Studio dashboard):
  RPM: 15  → safe intervalCap: 12 (80% of limit)
  RPD: 500 → safe daily budget: 450 (90% of limit)
  TPM: 250,000 → no app-level throttling needed

Update GEMINI_RPM_LIMIT env var to 12.
Update RPD_DAILY_BUDGET env var to 450.
Update the known-defaults rate limit table in the model selector
(v1.0.2) to reflect the correct values for gemini-3.1-flash-lite.

PDF handling: gemini-3.1-flash-lite natively accepts PDF as an
input type — no conversion to image required. Pass the PDF bytes
directly using the inline_data pattern:
  contents: [{
    parts: [
      { inline_data: { mime_type: 'application/pdf', data: base64PDF } },
      { text: extractionPrompt }
    ]
  }]
Verify this exact pattern via context7 for the installed SDK
version before implementing.

No new npm/Deno dependencies this version unless strictly required.
</tech_stack>

<architecture_decisions>

--- PART A: GEMINI MODEL MIGRATION ---

This is a find-and-replace with verification, not a feature.
Do it in one PR before anything else.

Steps:
1. Search the entire codebase for every Gemini model string.
   List every file and line found. Document in the PR description.
2. Replace all with 'gemini-3.1-flash-lite'.
3. Update GEMINI_RPM_LIMIT=12 and RPD_DAILY_BUDGET=450 in:
   - .env.local (frontend, if applicable)
   - Supabase Edge Function secrets
   - README env var documentation
4. Update the p-queue configuration in the Telegram webhook
   Edge Function if it uses a hardcoded interval derived from
   the old RPM limit.
5. Update the rate limits known-defaults table in the model
   selector settings UI.

Verification gate (must pass before Part B or C):
  - Trigger one NL transaction via the Telegram bot.
    Confirm it succeeds with no 429.
  - Check Supabase Edge Function logs: confirm model string
    in logs shows 'gemini-3.1-flash-lite'.
  - Check AI Studio dashboard: confirm RPD counter increments
    on the correct model row.
  Do not proceed until all three pass.

--- PART B: PAYSLIP PARSING ---

New Supabase table:
payslip_imports:
  id                      uuid pk default gen_random_uuid()
  user_id                 uuid references auth.users not null
  filename                text not null
  month                   date not null
  gross_salary_cents      integer not null
  irs_withheld_cents      integer not null
  ss_withheld_cents       integer not null
  other_deductions_cents  integer not null default 0
  net_salary_cents        integer not null
  employer_name           text
  raw_gemini_response     jsonb
  source                  text not null  -- 'upload' | 'email'
  status                  text not null  -- 'pending'|'done'|'failed'
  created_at              timestamptz default now()
RLS: auth.uid() = user_id on all operations.

Add nullable payslip_import_id uuid FK to transactions table
via migration.

Default categories to seed if missing (idempotent — check before
inserting):
  'IRS Retido'       emoji: 🏛️  color: #E03E3E  type: expense
  'Segurança Social' emoji: 🛡️  color: #0F7B6C  type: expense
  'Outros Descontos' emoji: 📋  color: #6B7280  type: expense

Edge Function: POST /functions/v1/parse-payslip
Auth: requires valid user JWT.
Runtime: Deno (Supabase Edge Function).

Implementation:
- Receive multipart/form-data with a PDF file (max 10MB).
- Validate: file must be application/pdf, size ≤ 10MB.
- Convert PDF to base64.
- Call Gemini with inline_data PDF pattern (see tech stack).
- Extraction prompt:
    "This is a Portuguese payslip (recibo de vencimento).
     Extract the following and respond ONLY with valid JSON,
     no markdown, no extra text:
     {
       'month': 'YYYY-MM',
       'gross_salary_cents': integer (vencimento base + subsidios,
         in euro cents),
       'irs_withheld_cents': integer (retenção IRS, in cents),
       'ss_employee_cents': integer (quota trabalhador SS ~11%,
         in cents),
       'other_deductions_cents': integer (all other deductions
         combined, in cents),
       'net_salary_cents': integer (vencimento líquido, in cents),
       'employer_name': string or null,
       'employee_name': string or null
     }
     Rules:
     - All amounts in euro cents (multiply euros by 100).
     - If a field is not visible on the document use 0 for
       numeric fields, null for strings.
     - Do NOT estimate or calculate — only extract values
       explicitly printed on the document.
     - Treat decimal comma as separator (1.234,56 = 1234.56€)."
- Use responseMimeType: 'application/json'.
- Log: function entry, JWT validation, PDF size, Gemini call
  start/end/duration, extracted values summary (not raw text),
  validation outcome.
- Validation: gross - irs - ss - other_deductions ≈ net.
  Tolerance: ±10 cents.
  If validation fails: return 200 with
  { needsReview: true, extracted, validationError: string }
  so the frontend can show the review screen.
- On validation pass: insert payslip_imports row with
  status='done'.
- Do NOT create transactions yet — that happens only after
  user confirms in the frontend review screen.
- PDF bytes are never stored — process in memory only.
- GEMINI_API_KEY used server-side only, never exposed to client.

Transaction creation endpoint:
POST /functions/v1/confirm-payslip
Auth: requires valid user JWT.
Body: { payslip_import_id: string, override?: PartialExtraction }
- Fetch the payslip_imports row (validate user owns it).
- Create these transactions atomically in a Supabase transaction:
    1. Income: gross_salary_cents, category=Salário,
       note="Gross salary — {employer_name}", date=last working
       day of the month, linked to payslip_import_id.
    2. Expense: irs_withheld_cents, category=IRS Retido,
       note="IRS withholding — {month}",
       linked to payslip_import_id.
    3. Expense: ss_employee_cents, category=Segurança Social,
       note="Social security (11%) — {month}",
       linked to payslip_import_id.
    4. If other_deductions_cents > 0: expense,
       category=Outros Descontos,
       note="Other deductions — {month}",
       linked to payslip_import_id.
- If any transaction insert fails: rollback all, return 500.
- Return { transactions: Transaction[] }.

Duplicate detection:
Before parsing, check payslip_imports for same user_id + month
with status='done'. If found: return 409 with
{ duplicate: true, existing: PayslipImport }.
Frontend shows warning with "Import anyway" option which passes
force=true to bypass.

Logging for Part B (follows <logging_standards> from v1.5):
  "[Fluxo:Payslip] parse start filename={name} size={bytes}"
  "[Fluxo:Payslip] gemini call start model=gemini-3.1-flash-lite"
  "[Fluxo:Payslip] gemini call end duration={ms}ms"
  "[Fluxo:Payslip] extracted gross={cents} net={cents}
    irs={cents} ss={cents} other={cents}"
  "[Fluxo:Payslip] validation pass|fail delta={cents}"
  "[Fluxo:Payslip] transactions created count={n}"

--- PART C: QUICK-ADD PANEL ---

A fast manual entry mode that bypasses Gemini entirely.
No AI, no NL parsing, no confirmation step — direct to save.

Design: always-visible panel pinned above the transaction feed
on both mobile and desktop. Collapsed by default on desktop
(one click to expand). Always expanded on mobile (it is the
primary entry point).

Panel layout (mobile-first, horizontal on one line):
  [Amount input] [Category picker] [+ Add] [↕ More]

- Amount input: numeric input, auto-focuses on tap, shows
  currency symbol prefix (€). Accepts decimal with comma or dot.
  Converts to cents on submit.
- Category picker: compact dropdown or bottom sheet on mobile
  showing all user categories with emoji + name. Defaults to
  the last used category (persisted in localStorage under
  'fluxo-last-category').
- Type toggle: small income/expense toggle, defaults to expense.
  Integrated into the category picker — expense categories
  shown by default, toggle switches to income categories.
- [+ Add] button: submits immediately. No confirmation. No AI.
  Optimistic insert, rollback on failure.
- [↕ More] expands an optional row below with: date picker
  (defaults today) and note field. Collapsed by default.
  State persists during the session (if expanded, stays
  expanded until manually closed).

On submit:
- Validate: amount > 0, category selected.
- Create transaction immediately (no Gemini, no confirmation).
- Show inline success flash: the row briefly highlights green,
  amount resets to empty, category stays selected.
- Do NOT navigate away. Do NOT show a modal. Stay in feed.
- On error: inline red highlight, preserve amount and category.

Distinction from the existing AI entry screen:
- The existing entry screen (bottom nav ➕) remains unchanged
  — it is the AI-powered NL flow with Gemini parsing.
- The quick-add panel is purely manual, always visible, zero AI.
- They serve different use cases: quick-add for known routine
  transactions (daily coffee, bus), AI entry for ambiguous or
  complex inputs.
- A small label in the quick-add panel: "Quick add — no AI"
  in muted text so the user always knows which mode they are in.

Design tokens: uses existing tokens.css system. Panel background
--color-bg-subtle, border-bottom 1px --color-border-default.
On mobile, panel is sticky below the top nav bar.
On desktop, panel sits above the transaction list in the main
content area, collapsible.

</architecture_decisions>

<frontend_requirements>
Implement in this order — Part A first, then B, then C.

Part A — model migration:
No UI changes. Only env vars, Edge Function secrets, and the
model selector known-defaults table update.

Part B — payslip parsing UI:
New section in Settings → "Import Payslip"

1. Upload area
   - Drag-and-drop + tap-to-select, PDF only, max 10MB.
   - File size and type validated client-side before upload.
   - On upload: show loading state
     "Reading your payslip…" with spinner.
   - Log: [Fluxo:Payslip] upload start

2. Review screen (shown after successful parse)
   Display extracted values clearly before confirming:
     Gross salary:      €X,XXX.XX
     IRS withheld:      €XXX.XX
     Social security:   €XXX.XX
     Other deductions:  €XX.XX (hidden if 0)
     Net salary:        €X,XXX.XX
     ─────────────────────────
     Month:             May 2026
     Employer:          {name} (hidden if null)
   Two buttons: [Confirm & import] [Cancel]
   If needsReview=true (validation warning): show yellow banner:
     "⚠️ Extracted values don't balance
      (gross - deductions ≠ net, Δ = €X.XX).
      Check the values below before confirming."
     Same review screen, user can still confirm.

3. Duplicate warning
   If 409 received: show modal:
     "A payslip for {month} was already imported on {date}.
      Import again?"
     [Import anyway] [Cancel]

4. Success state
   Toast: "✅ 4 transactions created for {month}"
   Link in toast: "View transactions" → filters feed to
   that payslip's transactions.

5. Import history
   List below the upload area:
   Columns: Month, Employer, Net salary, Imported on, Actions
   "View transactions" link per row.
   "Delete import" per row: deletes payslip_imports row and all
   linked transactions. Confirmation dialog required.
   Maximum 24 rows shown (2 years), paginated.

6. YTD deductions widget
   Below import history:
     "Year-to-date deductions (from imported payslips)"
     IRS withheld YTD:        €X,XXX.XX
     Social security YTD:     €XXX.XX
   Note in muted text: "Useful for your annual IRS declaration."

Part C — quick-add panel:
- Always visible above transaction feed on mobile.
- Collapsible above feed on desktop.
- Last-used category persisted in localStorage.
- [+ Add] submits with optimistic insert.
- [↕ More] expands date + note row.
- Inline success/error feedback, no navigation.
- "Quick add — no AI" label in muted text.
</frontend_requirements>

<development_guidelines>
Workflow, error handling, cleanup, boundary commits, Jira
conventions, and stop-and-ask rule defined in copilot-instructions.md.

Implement in strict order. Do not start the next part until
the current gate passes.

PART A — Model migration (one PR: FLUXO-116 or next available)
  Gate: three-point verification as specified in Part A above.
  User must confirm AI Studio shows RPD incrementing on
  gemini-3.1-flash-lite before this PR is merged.

PART B — Payslip parsing
  Phase B1 — DB migration
    payslip_imports table, payslip_import_id FK on transactions,
    three new default categories (idempotent seed).
    Gate: Supabase MCP confirms schema. RLS enabled.

  Phase B2 — Edge Functions
    parse-payslip and confirm-payslip deployed.
    Gate: upload a real or realistic mock payslip PDF.
    Confirm extracted values are correct.
    Confirm validation passes (or needsReview=true with correct
    delta if values don't balance).
    Confirm no PDF bytes stored in DB.

  Phase B3 — Frontend
    Upload UI, review screen, duplicate warning, success toast,
    import history, YTD widget.
    Gate: complete full flow — upload → review → confirm.
    Verify 4 transactions appear in the feed correctly.
    Verify import history shows the entry.
    Verify YTD widget shows correct totals.

PART C — Quick-add panel
  Phase C1 — Component
    Panel layout, amount input, category picker, type toggle,
    More row.
    Gate: add a transaction via quick-add. Verify it appears
    in the feed immediately. Verify last-used category persists
    across page reload.

  Phase C2 — Mobile polish
    Sticky positioning, bottom sheet category picker on mobile,
    tap-to-focus amount input.
    Gate: complete quick-add flow on a real mobile device or
    375px viewport in DevTools. Panel must not overlap the
    bottom nav bar.

End-to-end test pass after all parts:
  - Trigger 3 NL bot transactions. Confirm no 429.
    Confirm AI Studio shows gemini-3.1-flash-lite usage.
  - Upload a payslip. Confirm transactions. Delete import.
    Confirm transactions deleted.
  - Quick-add 5 transactions. Confirm all appear instantly.
    Confirm last-used category persists.

All under v1.6 epic in Jira.

Stop and ask before starting Part B:
  - Confirm GEMINI_API_KEY is set as a Supabase Edge Function
    secret (should already be set from v1.5, but verify).
  - Ask user to provide a sample payslip PDF (real or
    anonymised) for testing extraction accuracy in Phase B2.
    Without a real sample the extraction prompt cannot be
    validated.

After all PRs merged and test agent signs off:
    git commit --allow-empty -m "chore: v1.6 feature complete — cleanup begins"

Cleanup additions specific to this version:
  - Audit every place a Gemini model string appears and
    introduce a single GEMINI_MODEL constant imported from
    a shared config file — no more scattered hardcoded strings.
  - Consolidate RPM/RPD configuration into a single source
    of truth used by both the Telegram webhook and the payslip
    Edge Function.
  - Quick-add panel: extract the category picker into a shared
    component reused by both quick-add and the existing AI
    entry screen.

After cleanup:
    git commit --allow-empty -m "chore: v1.6-cleanup complete"
</development_guidelines>