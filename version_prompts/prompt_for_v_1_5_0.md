<project_overview>
This is v1.5 of Fluxo — the Telegram bot feature. The payslip
feature (previously v1.4) is now v1.6 and is not in scope here.

Current state:
- Telegram bot created in BotFather, token obtained.
- Webhook registered and pointing to a Supabase Edge Function.
- A partial implementation exists but the PIN generation flow
  is broken: the frontend call to generate the PIN fails with
  a network/API error before the Edge Function is even reached.
- DB state is unknown — Telegram-related tables may or may not
  exist. RLS state on those tables is unknown.

This prompt covers two things in strict order:
PART A — Audit and fix the broken PIN generation flow.
PART B — Complete the full bot feature as specified.

Do not start Part B until Part A is fully working and verified.
Do not touch any existing Fluxo features outside of Telegram.
</project_overview>

<tech_stack>
Defined in copilot-instructions.md. Additions for this version:
- grammy — Telegram bot framework. Use context7 for latest
  Deno-compatible version and import path before writing
  any bot handler code. Verify it works in Supabase Edge
  Functions (Deno runtime) specifically.
- Gemini API (@google/genai) — for natural language parsing.
  Already in the project. Use context7 for latest docs.
No other new dependencies without user confirmation.
</tech_stack>

<logging_standards>
This version requires exhaustive logging throughout. Every
operation — DB query, Edge Function call, Telegram webhook
receipt, Gemini call, RLS check — must emit a structured log
entry. This is a hard requirement, not optional.

Log format for all Edge Functions (structured JSON to stdout):
  {
    "ts":       ISO timestamp,
    "fn":       Edge Function name,
    "op":       operation name (e.g. "pin_generate", "pin_validate"),
    "status":   "start" | "success" | "error" | "warn",
    "user_id":  uuid or "unauthenticated",
    "chat_id":  telegram chat_id or null,
    "detail":   any relevant context object,
    "error":    error message + stack if status=error
  }

Log frontend API calls in the browser console:
  [Fluxo:Telegram] {operation} {status} {detail}
  Examples:
    [Fluxo:Telegram] generatePin start
    [Fluxo:Telegram] generatePin success { pin_expires_at: ... }
    [Fluxo:Telegram] generatePin error { status: 401, body: ... }

Every log entry at status=error must include the full error
object, not just the message string. Never swallow errors silently.

Log ALL of the following explicitly:
- JWT presence and validity check at Edge Function entry
- CORS preflight handling
- Every Supabase DB operation (table, operation, RLS context)
- Every Gemini API call (prompt length, model, duration, outcome)
- Every Telegram API call (method, response status)
- PIN generation (expiry time set, row inserted)
- PIN validation (match found, expiry check, linking result)
- Webhook receipt (update type, chat_id, authorisation check)
- Budget alert trigger (category, percentage, message sent)
- Daily digest trigger (user count, messages sent)

Supabase Edge Function logs are visible in the Supabase
dashboard under Edge Functions → {function name} → Logs.
Instruct the user to check there for all server-side logs.
Frontend logs are in the browser DevTools console.
</logging_standards>

<architecture_decisions>

--- PART A: AUDIT AND FIX PIN GENERATION ---

Before writing any fix code, perform a full audit in this order.
Document each finding as a comment block in the relevant file.

Audit step 1 — DB state:
- Use the Supabase MCP to inspect all tables in the public schema.
- List every Telegram-related table found (telegram_sessions,
  telegram_pins, or any variant).
- For each table found: list columns, constraints, and RLS status.
- If tables are missing or have wrong schema: create migrations
  to bring them to the correct state (defined in Part B below).
- Log findings:
  "[AUDIT] DB tables found: {list}"
  "[AUDIT] RLS status per table: {object}"

Audit step 2 — Edge Function deployment:
- Verify the PIN generation Edge Function exists and is deployed.
- Check the function name matches exactly what the frontend calls.
- Verify the function URL is correct in the frontend env vars.
- Log: "[AUDIT] Edge Function URL in frontend: {url}"
         "[AUDIT] Deployed functions: {list}"

Audit step 3 — CORS:
- Verify the Edge Function returns correct CORS headers for all
  responses including errors and OPTIONS preflight:
    Access-Control-Allow-Origin: *
    Access-Control-Allow-Headers: authorization, x-client-info,
      apikey, content-type
    Access-Control-Allow-Methods: POST, OPTIONS
- A missing OPTIONS handler is the most common cause of
  "network error" on the frontend before the function body runs.
- Every Edge Function must handle OPTIONS requests and return
  200 with CORS headers before any other logic.
- Log: "[AUDIT] CORS headers present: {bool}"

Audit step 4 — JWT validation:
- Verify the frontend passes the Supabase session JWT in the
  Authorization header when calling the PIN generation function.
- Verify the Edge Function validates the JWT using the Supabase
  service role client, not the anon client.
- A 401 from JWT validation also surfaces as a network/API error
  if CORS headers are missing from the error response.
- Log: "[AUDIT] JWT header present in request: {bool}"
         "[AUDIT] JWT validation outcome: {success|error}"

Fix requirements (apply all findings from audit):
- Every Edge Function must start with an OPTIONS handler.
- Every Edge Function must attach CORS headers to ALL responses
  (success, error, 401, 500) — not just success responses.
- JWT must be extracted from Authorization header and validated
  before any DB operation.
- PIN generation must log each step as specified in
  <logging_standards>.
- If any DB table is missing, create it via migration before
  the fix is considered complete.

Fix verification gate (must pass before Part B starts):
  1. Open browser DevTools Network tab.
  2. Click "Connect Telegram" in Settings.
  3. The request to the PIN generation Edge Function must return
     200 with a PIN and expiry time.
  4. Console shows:
       [Fluxo:Telegram] generatePin start
       [Fluxo:Telegram] generatePin success { pin_expires_at: ... }
  5. Supabase Edge Function logs show the full structured log
     for the operation with no errors.
  6. A row exists in the telegram_pins table with the correct
     user_id, pin, and expires_at.
  Do not proceed to Part B until all 6 criteria pass.

--- PART B: COMPLETE BOT FEATURE ---

Database schema (correct final state — migrate to this if
the audit found different or missing tables):

telegram_pins:
  id          uuid pk default gen_random_uuid()
  user_id     uuid references auth.users not null
  pin         text not null               -- 6-digit string
  expires_at  timestamptz not null        -- now() + 10 minutes
  used        boolean not null default false
  created_at  timestamptz default now()

telegram_sessions:
  id                  uuid pk default gen_random_uuid()
  user_id             uuid references auth.users not null
  telegram_chat_id    bigint not null unique
  telegram_username   text
  is_authorized       boolean not null default false
  digest_enabled      boolean not null default false
  linked_at           timestamptz
  created_at          timestamptz default now()

RLS on both tables:
  SELECT, INSERT, UPDATE, DELETE: auth.uid() = user_id
  Exception: telegram_webhook Edge Function uses the service
  role key and bypasses RLS — this is intentional and required
  because webhook calls arrive without a user JWT.
  Document this exception explicitly in a code comment.

Edge Functions (one per concern — never combine):

1. POST /functions/v1/telegram-generate-pin
   Auth: requires valid user JWT.
   Logic:
     - Log receipt and JWT validation.
     - Delete any existing unused pins for this user_id.
     - Generate a cryptographically random 6-digit PIN:
         const pin = crypto.getRandomValues(new Uint32Array(1))[0]
           .toString().slice(-6).padStart(6, '0');
     - Insert into telegram_pins with expires_at = now() + 10min.
     - Log: pin length (not the value), expiry time.
     - Return: { pin, expires_at }
   Do NOT log the PIN value itself — treat it as a secret.

2. POST /functions/v1/telegram-pin-status
   Auth: requires valid user JWT.
   Logic:
     - Check telegram_sessions for is_authorized=true for
       this user_id.
     - Return: { linked: bool, telegram_username, linked_at }
   Used by the frontend polling loop.

3. POST /functions/v1/telegram-webhook
   Auth: validates Telegram secret token header, NOT a user JWT.
   This function receives all Telegram updates.
   Uses service role key for all DB operations.
   Logic — message routing:
     - Log every incoming update: type, chat_id, text (truncated
       to 50 chars for privacy).
     - If update is a message with text starting with /start:
       → PIN validation handler (see below)
     - Else: check telegram_sessions for this chat_id.
       If not found or is_authorized=false:
         → Reply: "This bot is private. Unauthorised."
         → Log: "Rejected message from unknown chat_id {id}"
         → Return.
       If authorised: → message handler
     - Always return 200 to Telegram regardless of outcome.
       Never return non-200 — Telegram will retry indefinitely.

   PIN validation handler:
     - Extract PIN from /start {PIN} message.
     - Log: "PIN validation attempt for chat_id {id}"
     - Find matching telegram_pins row: pin match + used=false
       + expires_at > now().
     - If not found: reply "Invalid or expired PIN. Generate
       a new one in the Fluxo app."
       Log: "PIN validation failed: {not_found|expired|used}"
     - If found:
         Update telegram_pins: set used=true.
         Upsert telegram_sessions: set telegram_chat_id,
           telegram_username, is_authorized=true, linked_at=now().
         Reply: "✅ Connected! Fluxo is ready.\nSend /help to
           see what I can do."
         Log: "PIN validated and session linked for user {id}"

   Message handler (authorised users only):
     - Parse the message text.
     - If it starts with /: route to command handler.
     - Else: route to natural language handler.

Commands:
  /balance    → remaining budget this month per category
                that has a limit set. Format:
                "📊 Budget remaining this month:
                 🛒 Food: €82.50 / €200 (41%)
                 🚗 Transport: €45.00 / €100 (45%)
                 ..."
                If no limits set: "No budget limits set yet.
                Configure them in the Fluxo app."

  /summary    → monthly summary for current month:
                "📅 May 2026 summary:
                 💰 Income: €2,450.00
                 💸 Expenses: €1,230.50
                 📈 Net: +€1,219.50
                 Top categories: Food €280, Transport €95..."

  /last       → last 5 transactions:
                "🕐 Last 5 transactions:
                 • €1.50 — Food (coffee) — today
                 • €8.30 — Transport (uber) — yesterday
                 ..."

  /cancel     → cancel any pending confirmation state.
                "Cancelled."

  /help       → list all commands with one-line descriptions.

  /disconnect → unlink this Telegram account.
                Ask confirmation first:
                "Are you sure you want to disconnect?
                 [Yes, disconnect] [Cancel]"
                On confirm: set is_authorized=false,
                nullify chat_id in sessions.

Natural language expense parsing:
- Pass message to Gemini with this prompt:
    "Parse this expense/income message and respond ONLY with
     valid JSON. No markdown, no extra text.
     Format: { 'amount_cents': integer,
               'category_hint': string,
               'note': string or null,
               'date': 'YYYY-MM-DD',
               'type': 'expense' | 'income',
               'confidence': float 0.0-1.0 }
     Return null if this is not a financial transaction.
     Message: '{MESSAGE}'
     Today: {TODAY_DATE}
     Currency: EUR. Treat bare numbers as euros.
     Examples:
       'coffee 1.50' → expense €1.50, hint 'coffee'
       'uber 8.30' → expense €8.30, hint 'uber'
       'salary 1500' → income €1500, hint 'salary'
       'lunch 22.50 at restaurant' → expense, note 'restaurant'"
- Log: Gemini call start, duration, confidence score, parsed type.
  Never log the raw message text — treat user messages as private.
- If response is null: reply "I didn't understand that as a
  transaction. Try: 'coffee 2.50' or 'uber 8.30'"
- If confidence < 0.7: reply "Did you mean to log:
  {type} €{amount} — {category}? [Yes] [No]"
- Map category_hint to user's actual categories using frequency
  matching (same logic as v1.2 smart suggestions).
- If no category match with >60% confidence: reply with inline
  keyboard of top 6 expense categories.

Transaction confirmation:
Always confirm before saving — no silent auto-create:
  "💾 Save transaction?
   💸 €1.50 — Food (coffee)
   📅 Today, 13 May"
  [✅ Yes] [✏️ Change category] [❌ Cancel]

On ✅ Yes:
  - Create transaction in Supabase.
  - Log: "Transaction created via bot: {category}, {amount_cents}"
  - Reply: "✅ Saved!
    Food this month: €165.50 / €200 (83%)"
    Include remaining budget if limit exists for that category.

On ✏️ Change category:
  - Show top 8 categories as inline keyboard buttons.
  - On selection: update confirmation message with new category.
  - Re-show [✅ Yes] [❌ Cancel].

On ❌ Cancel:
  - Reply: "Cancelled."
  - Clear pending confirmation state.

Pending state management:
  - Store pending confirmations in memory within the Edge Function
    invocation (not in DB — Edge Functions are stateless between
    calls).
  - Use Supabase to store pending state between invocations:
    add a pending_transaction jsonb column to telegram_sessions,
    nullable. Clear on confirm or cancel.
  - Log: "Pending transaction stored for chat_id {id}"
         "Pending transaction cleared for chat_id {id}"

Budget alerts (proactive):
  - Triggered from the existing transaction creation flow in
    the Fluxo web app (not the bot webhook).
  - After any transaction is created (web or bot), check if the
    category's monthly spend has crossed 80% or 100% of its limit.
  - If the user has a linked telegram_sessions row with
    is_authorized=true: send a Telegram message via
    POST https://api.telegram.org/bot{TOKEN}/sendMessage.
  - Log: "Budget alert sent: category={id} pct={pct}
    chat_id={id}"
  - 80% message:
    "⚠️ Heads up: you've used 82% of your Food budget
     (€164 of €200). €36 remaining."
  - 100% message:
    "🔴 Food budget exceeded! Spent €210 of €200 limit."
  - Do not send duplicate alerts: add a budget_alerts table
    to track which alerts have been sent this month.

budget_alerts:
  id            uuid pk
  user_id       uuid references auth.users
  category_id   uuid references categories
  month         date
  threshold     integer  -- 80 or 100
  sent_at       timestamptz
  unique(user_id, category_id, month, threshold)

Daily digest:
  - Supabase pg_cron job: runs daily at 20:00 Europe/Lisbon.
  - For each authorized telegram_sessions row where
    digest_enabled=true:
    - Count transactions created today for that user.
    - If count = 0: skip (no digest on empty days).
    - If count > 0: send:
      "📊 Daily summary — {date}
       💸 Today's spend: €X.XX ({N} transactions)
       📅 Month so far: €Y.YY spent of €Z.ZZ budgeted"
  - Log: "Daily digest: {N} users notified, {M} skipped
    (no transactions today)"

Supabase secrets required (stop and confirm each before use):
  TELEGRAM_BOT_TOKEN        — from BotFather (already obtained)
  TELEGRAM_WEBHOOK_SECRET   — generate: random 32-char hex string.
                              Set in Supabase secrets AND register
                              with Telegram via setWebhook call.
  GEMINI_API_KEY            — confirm already set from prior work.

</architecture_decisions>

<frontend_requirements>
All changes in Settings → "Telegram Bot" section only.

1. Connect flow (fix PIN generation first per Part A gate)
   - "Connect Telegram" button.
   - On click:
       Log: [Fluxo:Telegram] generatePin start
       Call POST /functions/v1/telegram-generate-pin with JWT.
       Log response in full regardless of success or error.
   - On success: show PIN prominently with countdown timer:
       "Your connection PIN: 4 8 2 9 1 7
        Open Telegram → @{BOT_USERNAME} → send: /start 482917
        PIN expires in 9:42"
       Countdown updates every second.
       Copy PIN button (copies "/start 482917" ready to paste).
   - Poll POST /functions/v1/telegram-pin-status every 3 seconds.
   - On linked=true: transition immediately to connected state.
   - On PIN expiry (countdown reaches 0): show "PIN expired.
     Generate a new one." with a retry button.
   - On any error: log the full error to console AND show a
     human-readable message in the UI:
       Network error → "Could not reach the server. Check your
         connection."
       401 → "Session expired. Please log out and back in."
       500 → "Server error. Check Supabase Edge Function logs."
     Never show raw error objects to the user.

2. Connected state
   - Show: "✅ Connected as @{username}" and linked date.
   - Daily digest toggle with label "Daily summary at 8pm".
   - "Test connection" button: calls a test endpoint that sends
     "🔔 Test from Fluxo — connection working!" to the linked
     chat. Confirm message received in Telegram.
   - "Disconnect" button with confirmation dialog.

3. Debug panel (development aid, always visible in this version)
   - Collapsible "Telegram Debug" section below the connect UI.
   - Shows last 10 Telegram-related log entries fetched from
     a GET /functions/v1/telegram-logs endpoint (or a Supabase
     table if Edge Function logs aren't queryable).
   - "Refresh" button.
   - This panel helps diagnose issues without opening Supabase
     dashboard. It can be hidden behind a feature flag in v1.6
     once the bot is stable.
</frontend_requirements>

<development_guidelines>
Workflow, error handling, cleanup, boundary commits, Jira conventions
defined in copilot-instructions.md.

Implement in this strict order. Do not skip steps.

PART A — Audit and fix (one PR, one ticket: FLUXO-BOT-AUDIT):

Step A1 — DB audit
  Use Supabase MCP to list all tables and their RLS status.
  Log findings. Create missing migrations if needed.
  Gate: telegram_pins and telegram_sessions tables exist with
  correct schema and RLS enabled.

Step A2 — Edge Function audit
  Check deployed functions, URL config, CORS headers, JWT handling.
  Log findings as comment block in each function file.
  Gate: OPTIONS preflight to the PIN generation function returns
  200 with correct CORS headers. Verify with curl:
    curl -X OPTIONS {FUNCTION_URL} \
      -H "Origin: {VERCEL_URL}" \
      -H "Access-Control-Request-Method: POST" \
      -v
  Expected: 200 with Access-Control-Allow-Origin header.

Step A3 — Fix and verify
  Apply all fixes found in A1 and A2.
  Gate: all 6 criteria in the Part A verification gate pass.
  Do not merge this PR until the gate is confirmed by the user.

PART B — Feature completion (one PR per phase):

Phase B1 — DB migrations
  All Telegram tables in correct final state.
  budget_alerts table created.
  pending_transaction column added to telegram_sessions.
  Gate: Supabase MCP confirms all tables exist with correct
  schema, RLS, and constraints.

Phase B2 — Edge Functions
  Deploy all three functions: telegram-generate-pin,
  telegram-pin-status, telegram-webhook.
  Verify webhook is registered with Telegram.
  Gate: send /start {valid_pin} in Telegram. Confirm
  telegram_sessions row is created with is_authorized=true.
  Confirm Supabase logs show full structured log chain.

Phase B3 — Natural language parsing
  Gemini integration in webhook handler.
  Confirmation inline keyboard.
  Pending state storage in telegram_sessions.
  Gate: send "coffee 1.50" in Telegram. Confirm confirmation
  message appears. Tap Yes. Confirm transaction in Fluxo web app.
  Confirm Supabase logs show Gemini call and transaction creation.

Phase B4 — Commands
  /balance, /summary, /last, /cancel, /help, /disconnect.
  Gate: each command returns correct data matching the Fluxo
  web app for the same month.

Phase B5 — Budget alerts
  budget_alerts table, alert trigger on transaction creation,
  Telegram sendMessage call.
  Gate: create a transaction that pushes a category to ≥80%.
  Confirm Telegram message received within 5 seconds.
  Create same transaction again. Confirm NO duplicate alert.

Phase B6 — Frontend connect flow
  Full UI per frontend requirements including debug panel.
  Gate: complete the connect flow end-to-end in the browser.
  DevTools console shows full log chain with no errors.

Phase B7 — Daily digest
  pg_cron job, digest_enabled toggle, skip-on-no-transactions.
  Gate: set digest_enabled=true, create a transaction, manually
  trigger the cron function. Confirm message received.

Phase B8 — End-to-end test pass
  Full flow: connect → log expense via NL → check /balance →
  trigger budget alert → receive digest.
  All Supabase Edge Function logs show clean structured output
  with no unhandled errors or missing log entries.

Jira: all Part A tickets under FLUXO-BOT-AUDIT epic.
All Part B tickets under v1.5 epic.

After all Part B PRs merged and test agent signs off:
    git commit --allow-empty -m "chore: v1.5 feature complete — cleanup begins"

Cleanup additions specific to this version:
- Remove the Telegram debug panel from the UI (or put it behind
  a DEV_MODE env var).
- Consolidate all Telegram Edge Function log calls into a single
  shared logger utility.
- Audit every Edge Function for missing CORS headers on error
  responses — this is the class of bug that caused the original
  PIN failure.

After cleanup:
    git commit --allow-empty -m "chore: v1.5-cleanup complete"
</development_guidelines>