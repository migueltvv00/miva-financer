# Fluxo v1.9.4 — Transaction Analysis + Telegram CRUD + Architecture Docs

## Scope

1. **Enhanced transaction analysis** — search, advanced filters, payment method breakdown
2. **Telegram edit/delete** — manage transactions directly from the bot
3. **Architecture documentation** — renderable Mermaid diagrams in README

---

## Phase A — Transaction Search & Advanced Filters (Web)

### A1. Text search on transaction list

Add a search bar at the top of `TransactionListScreen` that filters by:
- Note (substring match, case-insensitive)
- Category name (partial match)
- Amount (exact or range: "10-50")

Show match count. Clear button. Search is client-side (already loaded transactions).

### A2. Date range filter

Add "Período" option to month selector:
- Custom date range picker (from/to)
- Queries Supabase directly for the range (not just 1 month)
- Results replace the monthly view

### A3. Payment method breakdown widget

On `DashboardScreen`, add a new collapsible section "📊 Despesas por método":
- Horizontal bar chart showing spending per payment method
- Only visible if user has used multiple methods this month
- Uses existing transaction data (no extra query)

### A4. Verification gate

- Search filters work correctly
- Date range loads different month ranges
- Payment method chart renders on dashboard

---

## Phase B — Telegram Edit & Delete

### B1. `/editar` command

Flow:
1. User sends `/editar`
2. Bot shows last 5 transactions with numbered inline buttons (1️⃣, 2️⃣, etc.)
3. User taps one → bot asks "O que pretende alterar?" with buttons:
   - 💰 Valor
   - 📂 Categoria  
   - 📝 Nota
   - 📅 Data
   - ❌ Cancelar
4. User picks field → bot asks for new value
5. Bot confirms change + shows updated transaction

### B2. `/apagar` command

Flow:
1. User sends `/apagar`
2. Bot shows last 5 transactions with numbered inline buttons
3. User taps one → bot asks "Tem a certeza?" with ✅ Sim / ❌ Não buttons
4. On confirm: delete from DB, confirm to user

### B3. Inline delete from `/ultimas`

Add a 🗑️ button next to each transaction in the `/ultimas` response.
Tapping it asks for confirmation before deleting.

### B4. Verification gate

- `/editar` successfully changes a transaction field
- `/apagar` deletes a transaction
- 🗑️ inline button on `/ultimas` works

---

## Phase C — Architecture Documentation (Mermaid Diagrams)

### C1. Add architecture section to README.md

Include 3 renderable Mermaid diagrams:

1. **System Overview** — shows Vercel, Supabase, Telegram, Gemini connections
2. **Data Flow** — React → Zustand → Supabase → Realtime loop
3. **Feature Module Map** — all screens with their hooks and stores

### C2. Core decisions table

Document in README:
- Why Zustand over Redux/Context
- Why edge functions over client-side API calls
- Why stale-while-revalidate over react-query
- Why Gemini 3.1 Flash Lite
- Why integer cents over floats
- Why RLS over app-level auth checks

### C3. Code patterns section

Show the 5 core patterns with brief code examples:
1. Optimistic update pattern
2. Stale-while-revalidate fetch
3. Realtime subscription
4. Offline queue
5. Lazy route loading

---

## Phase D — Deploy & Commit

### D1. Final checks

```bash
pnpm type-check
pnpm build
pnpm lint
```

### D2. Deploy

```bash
SUPABASE_ACCESS_TOKEN=$SUPABASE_TOKEN /tmp/supabase functions deploy telegram-webhook --project-ref mkihzxyplnfktsicsrpw --no-verify-jwt
pnpm build && npx vercel --prod
```

### D3. Commit

```
feat: v1.9.4 — transaction search, Telegram edit/delete, architecture docs
```

---

## Execution Order

```
A1 → A2 → A3 → A4(verify)
  → B1 → B2 → B3 → B4(verify)
    → C1 → C2 → C3
      → D1 → D2 → D3
```

Phase A and B can be parallelized (independent). Phase C is documentation-only.

## Non-goals

- No new database tables (reuse existing)
- No new dependencies
- No changes to payslip/goals/net-worth features
