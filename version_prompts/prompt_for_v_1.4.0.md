<project_overview>
Continuation of Fluxo after v1.3 is stable. v1.4 adds a Telegram
bot that lets the user interact with Fluxo conversationally from
their phone without opening the app.

Platform: Telegram Bot API (completely free, unlimited messages,
no Meta approval required — confirmed as the correct choice over
WhatsApp for a personal tool).

Bot capabilities:
- Log a quick expense in natural language ("café 1.50")
- Check remaining budget per category
- Get a monthly summary
- Query recent transactions
- Receive a daily digest (optional, scheduled)

The bot connects to the existing Supabase backend — it is not a
separate data store. All transactions logged via bot appear
immediately in the Fluxo web app.

Stable from v1.0–v1.3 — do not touch existing features.
</project_overview>

<tech_stack>
Defined in Copilot-Instructions.md. New additions:
- grammy — Telegram bot framework for Node.js/TypeScript.
  Modern, actively maintained, excellent TypeScript support.
  Use context7 for latest docs before implementing.
- Bot hosted as a Supabase Edge Function (Deno) — no new server
  needed, already in the stack, webhook-based (no polling).
  Verify grammy's Deno/Edge Function compatibility via context7.
- Gemini API (@google/genai) for natural language parsing of
  expense messages. Already in the stack.
No other new dependencies without user confirmation.
</tech_stack>

<architecture_decisions>

New Supabase table:
telegram_sessions:
  id              uuid pk default gen_random_uuid()
  user_id         uuid references auth.users not null
  telegram_chat_id bigint not null unique
  telegram_username text
  is_authorized   boolean not null default false
  linked_at       timestamptz
  created_at      timestamptz default now()
RLS: user_id = auth.uid() on all operations.

Security — single user bot:
This bot serves one user only. It must reject all messages from
unknown Telegram chat IDs.
- Authorisation flow:
    1. User opens Settings in the Fluxo web app.
    2. Clicks "Conectar Telegram" — generates a one-time 6-digit
       PIN stored in Supabase (expires in 10 minutes).
    3. User messages the bot: /start {PIN}
    4. Bot validates PIN, links telegram_chat_id to the user's
       Supabase user_id, sets is_authorized=true.
    5. All subsequent messages from that chat_id are accepted.
       All messages from any other chat_id are rejected with:
       "Este bot é privado. Não autorizado."
- The TELEGRAM_ALLOWED_CHAT_ID env var is NOT used — the PIN
  flow is more secure and doesn't require manual config.

Bot architecture:
- Supabase Edge Function: POST /functions/v1/telegram-webhook
  Receives Telegram webhook updates.
  Validates the request is from Telegram (check secret token).
  Routes to the appropriate handler.
- Register webhook on bot deployment:
  POST https://api.telegram.org/bot{TOKEN}/setWebhook
  url: {SUPABASE_EDGE_FUNCTION_URL}
  secret_token: {TELEGRAM_WEBHOOK_SECRET}
- Add to Supabase secrets: TELEGRAM_BOT_TOKEN,
  TELEGRAM_WEBHOOK_SECRET.
  Stop and ask user to provide TELEGRAM_BOT_TOKEN (obtained from
  @BotFather) before implementing.

Natural language expense parsing:
When the bot receives a free-text message (not a command), pass
it to Gemini for parsing:
  Prompt:
    "Parse this Portuguese expense message and respond ONLY with JSON:
     { 'amount_cents': integer,
       'category_hint': string (e.g. 'café', 'uber', 'continente'),
       'note': string,
       'date': 'YYYY-MM-DD' (today if not mentioned),
       'type': 'expense' | 'income',
       'confidence': 0.0–1.0 }
     If the message is not a financial transaction, return null.
     Message: '{USER_MESSAGE}'
     Today's date: {TODAY}"
- If confidence < 0.7: ask for clarification.
- Map category_hint to the user's actual categories using the
  same frequency-based matching from v1.2 smart suggestions.
- If no category match: ask user to pick from an inline keyboard
  showing their top 6 expense categories.

Bot commands:
  /start {PIN}    — authorisation (see above)
  /saldo          — show remaining budget this month per category
                    that has a limit set
  /resumo         — monthly summary: income, expenses, net
  /ultimas        — last 5 transactions with amounts and categories
  /cancelar       — cancel any pending action
  /ajuda          — show all commands

Free-text handling (no command prefix):
  "café 1.50"          → expense €1.50, category Alimentação
  "uber 8.30"          → expense €8.30, category Transporte
  "salário 1500"       → income €1,500, category Salário
  "almoco restaurante 22.50" → expense €22.50, note "restaurante"
  "quanto gastei este mês" → same as /resumo

Transaction confirmation flow:
After parsing, always confirm before saving:
  Bot: "Registar despesa?
        💸 €1.50 — Alimentação (café)
        📅 Hoje"
  [✅ Sim] [✏️ Editar categoria] [❌ Cancelar]
Inline keyboard buttons for one-tap confirm.
On ✅: create transaction in Supabase, respond:
  "✅ Registado! Alimentação: €X,XX / €Y,YY este mês"
  (show remaining budget for that category if a limit exists)

On ✏️ Editar categoria: show top 8 categories as inline keyboard.
On ❌ Cancelar: "Cancelado." — no transaction created.

Budget alerts (proactive, not on demand):
When a transaction pushes a category to ≥80% of its monthly limit,
the bot sends an unprompted message:
  "⚠️ Atenção: já usaste 82% do orçamento de Alimentação
   (€164 de €200). Restam €36."
This is triggered server-side when the transaction is created,
not by a polling job.

Daily digest (optional, scheduled):
- A Supabase cron job (pg_cron) runs daily at 20:00 Lisbon time.
- Sends a summary only on days where at least one transaction
  was logged:
    "📊 Resumo de hoje ({date})
     💸 Despesas: €X,XX (N transações)
     💰 Saldo do mês: €Y,YY
     [Ver detalhe no app →]"
- Can be toggled on/off in Settings.
- Store preference in the telegram_sessions table:
  add digest_enabled boolean default false.

Supabase secrets required:
  TELEGRAM_BOT_TOKEN       — from @BotFather
  TELEGRAM_WEBHOOK_SECRET  — random string, you generate it
  GEMINI_API_KEY           — already set from v1.4

</architecture_decisions>

<frontend_requirements>
New section in Settings: "Telegram Bot"

1. Connect flow
   - "Conectar Telegram" button.
   - On click: generate PIN, show instructions:
       "1. Abre o Telegram e procura @{BOT_USERNAME}
        2. Envia a mensagem: /start {PIN}
        3. O PIN expira em 10 minutos."
   - Poll GET /functions/v1/telegram-status every 5 seconds.
   - On authorisation detected: show connected state:
       "✅ Conectado como @{telegram_username}"
       "Desconectar" button.

2. Connected state
   - Show: connected username, linked date.
   - Daily digest toggle (on/off).
   - "Desconectar" — deletes telegram_sessions row, bot rejects
     future messages from that chat_id.
   - "Testar bot" button: triggers bot to send a test message
     to the linked chat_id.

3. No other UI changes — bot interaction happens entirely in
   Telegram, not in the web app.
</frontend_requirements>

<development_guidelines>
Workflow, error handling, cleanup, boundary commits, Jira conventions
defined in Copilot-Instructions.md.

Stop and ask before starting:
- User must create a Telegram bot via @BotFather and provide
  TELEGRAM_BOT_TOKEN. Provide step-by-step instructions:
    1. Open Telegram, search @BotFather
    2. Send /newbot
    3. Choose a name: "Fluxo Finance" (or similar)
    4. Choose a username ending in 'bot': e.g. fluxo_finance_bot
    5. Copy the token provided and share it.
- Confirm GEMINI_API_KEY is already set from v1.3.
- Generate TELEGRAM_WEBHOOK_SECRET (random 32-char string) and
  add to Supabase secrets.

Feature phases:
1. DB migration — telegram_sessions table, digest_enabled column.
2. PIN authorisation flow — PIN generation in Supabase,
   /start command handler, linking logic, security rejection.
3. Natural language parsing — Gemini prompt, category matching,
   confirmation inline keyboard, transaction creation.
4. Commands — /saldo, /resumo, /ultimas, /cancelar, /ajuda.
5. Budget alerts — trigger on transaction creation when ≥80%.
6. Settings UI — connect flow, connected state, digest toggle.
7. Daily digest — pg_cron job, 20:00 Lisbon time, toggle respect.
8. End-to-end test:
   - Authorise bot via PIN flow.
   - Send "café 1.50", confirm, verify transaction in web app.
   - Send /saldo, verify correct remaining budgets shown.
   - Log a transaction that pushes a category to ≥80%, verify
     alert received unprompted.
   - Toggle digest on, verify it fires at 20:00.

All under v1.4 epic in Jira.

After all phases merged:
    git commit --allow-empty -m "chore: v1.4 feature complete — cleanup begins"
After cleanup:
    git commit --allow-empty -m "chore: v1.4-cleanup complete"
</development_guidelines>