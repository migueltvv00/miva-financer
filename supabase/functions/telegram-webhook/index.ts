import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const GEMINI_MODEL = "gemini-3.1-flash-lite";

type TransactionType = "expense" | "income";
type PaymentMethod = "cartao_refeicao" | "multibanco" | "mbway" | "numerario" | "credito" | "debito";

const PAYMENT_METHOD_VALUES: PaymentMethod[] = [
  "cartao_refeicao",
  "multibanco",
  "mbway",
  "numerario",
  "debito",
  "credito",
];

const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  cartao_refeicao: "🍽️ Cartão Refeição",
  multibanco: "🏧 Multibanco",
  mbway: "📱 MBWay",
  numerario: "💵 Numerário",
  credito: "💳 Crédito",
  debito: "💳 Débito",
};

const PAYMENT_METHOD_BUTTON_LABELS: Record<PaymentMethod, string> = {
  cartao_refeicao: "🍽️ Refeição",
  multibanco: "🏧 MB",
  mbway: "📱 MBWay",
  numerario: "💵 Cash",
  debito: "💳 Débito",
  credito: "💳 Crédito",
};

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

function log(op: string, status: string, chatId: string | null, detail?: Record<string, unknown>) {
  console.log(JSON.stringify({
    ts: new Date().toISOString(),
    fn: "telegram-webhook",
    op,
    status,
    chat_id: chatId,
    ...(detail ? { detail } : {}),
  }));
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  if (typeof error === "object" && error !== null && "message" in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === "string") {
      return message;
    }
  }

  return String(error);
}

interface TelegramUpdate {
  message?: TelegramMessage;
  callback_query?: TelegramCallbackQuery;
}

interface TelegramUser {
  username?: string;
}

interface TelegramChat {
  id: number;
}

interface TelegramMessage {
  message_id: number;
  text?: string;
  chat: TelegramChat;
  from?: TelegramUser;
}

interface TelegramCallbackQuery {
  id: string;
  data?: string;
  from: TelegramUser;
  message?: TelegramMessage;
}

interface TelegramSession {
  user_id: string;
  is_authorized: boolean;
  telegram_username: string | null;
}

interface TelegramPin {
  id: string;
  user_id: string;
}

interface CategoryRecord {
  id: string;
  name: string;
  emoji: string;
  type: "expense" | "income";
  sort_order: number;
}

interface BudgetRecord {
  category_id: string;
  limit_cents: number;
}

interface TransactionRecord {
  category_id: string;
  amount_cents: number;
  type: "expense" | "income";
  note: string | null;
  date: string;
}

interface PayslipImportRecord {
  month: string;
  employer_name: string | null;
  net_salary_cents: number;
  irs_withheld_cents: number;
  ss_withheld_cents: number;
  created_at: string;
}

interface ParsedTransaction {
  amount_cents: number;
  category_hint: string;
  note: string;
  date: string;
  type: TransactionType;
  confidence: number;
  payment_method: PaymentMethod | null;
}

interface PendingTransaction {
  amount_cents: number;
  category_id: string | null;
  category_name: string | null;
  category_emoji: string | null;
  note: string;
  date: string;
  type: TransactionType;
  payment_method: PaymentMethod | null;
  edit_state?: EditState;
}

interface EditState {
  mode: "edit";
  transaction_id: string;
  field: string | null;
}

interface ParseTransactionResult {
  parsed: ParsedTransaction | null;
  rateLimited: boolean;
}

interface BudgetProgress {
  limitCents: number;
  spentCents: number;
  remainingCents: number;
  percentage: number;
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") {
    return new Response("OK");
  }

  const secret = req.headers.get("X-Telegram-Bot-Api-Secret-Token");
  if (secret !== Deno.env.get("TELEGRAM_WEBHOOK_SECRET")) {
    return new Response("Unauthorized", { status: 401 });
  }

  try {
    const update = (await req.json()) as TelegramUpdate;
    const chatId = update.message
      ? String(update.message.chat.id)
      : update.callback_query?.message?.chat.id
        ? String(update.callback_query.message.chat.id)
        : null;
    const updateType = update.message
      ? "message"
      : update.callback_query
        ? "callback_query"
        : "unknown";

    log("webhook_receive", "start", chatId, { type: updateType });

    if (update.message) {
      await handleMessage(update.message);
    } else if (update.callback_query) {
      await handleCallbackQuery(update.callback_query);
    }

    log("webhook_receive", "success", chatId, { type: updateType });
  } catch (error) {
    log("webhook_receive", "error", null, { error: getErrorMessage(error) });
  }

  return new Response("OK");
});

async function handleMessage(message: TelegramMessage) {
  const chatId = String(message.chat.id);
  const text = message.text?.trim();

  if (!text) {
    return;
  }

  if (text.startsWith("/start")) {
    await handleStartCommand(message, text);
    return;
  }

  const session = await getAuthorizedSession(chatId);
  const userId = await getUserIdByChatId(supabase, chatId);

  if (!session || !userId) {
    log("auth_check", "error", chatId, { reason: "unauthorized" });
    await sendMessage(chatId, "Este bot é privado. Não autorizado.");
    return;
  }

  log("auth_check", "success", chatId);

  switch (normalizeCommand(text)) {
    case "/saldo":
      await handleSaldoCommand(chatId, userId);
      return;
    case "/resumo":
      await handleResumoCommand(chatId, userId);
      return;
    case "/ultimas":
      await handleUltimasCommand(chatId, userId);
      return;
    case "/quota":
      await handleQuotaCommand(chatId, session.user_id);
      return;
    case "/recibo":
      await handleReciboCommand(chatId);
      return;
    case "/gasto":
      await handleManualTransactionCommand(chatId, userId, text, "expense");
      return;
    case "/receita":
      await handleManualTransactionCommand(chatId, userId, text, "income");
      return;
    case "/editar":
      await handleEditarCommand(chatId, userId);
      return;
    case "/apagar":
      await handleApagarCommand(chatId, userId);
      return;
    case "/cancelar":
      log("cmd_cancelar", "start", chatId);
      await setPendingTransaction(chatId, null);
      await sendMessage(chatId, "Não há ações pendentes.");
      log("cmd_cancelar", "success", chatId);
      return;
    case "/ajuda":
      log("cmd_ajuda", "start", chatId);
      await sendMessage(chatId, getHelpText());
      log("cmd_ajuda", "success", chatId);
      return;
    case "/desligar":
      await handleDesligarCommand(chatId);
      return;
    default:
      if (text.startsWith("/")) {
        await sendMessage(chatId, getHelpText());
        return;
      }

      await handleFreeTextMessage(chatId, userId, text);
  }
}

async function handleCallbackQuery(callbackQuery: TelegramCallbackQuery) {
  const chatId = callbackQuery.message?.chat.id;
  const messageId = callbackQuery.message?.message_id;
  const data = callbackQuery.data;

  if (!chatId || !messageId || !data) {
    await answerCallbackQuery(callbackQuery.id);
    return;
  }

  const chatIdKey = String(chatId);
  const session = await getAuthorizedSession(chatIdKey);

  if (!session) {
    log("auth_check", "error", chatIdKey, { reason: "unauthorized" });
    await answerCallbackQuery(callbackQuery.id, "Este bot é privado. Não autorizado.");
    await sendMessage(chatIdKey, "Este bot é privado. Não autorizado.");
    return;
  }

  log("auth_check", "success", chatIdKey);

  try {
    if (data === "confirm_tx") {
      await answerCallbackQuery(callbackQuery.id, "A guardar…");
      await handleConfirmTransaction(chatIdKey, messageId, session.user_id);
      return;
    }

    if (data === "edit_category") {
      await answerCallbackQuery(callbackQuery.id, "Escolhe a categoria.");
      await handleEditCategory(chatIdKey, messageId, session.user_id);
      return;
    }

    if (data === "cancel_tx") {
      await answerCallbackQuery(callbackQuery.id, "Cancelado.");
      await setPendingTransaction(chatIdKey, null);
      await safeEditMessage(chatIdKey, messageId, "❌ Cancelado.");
      return;
    }

    if (data.startsWith("cat_")) {
      await answerCallbackQuery(callbackQuery.id, "Categoria atualizada.");
      await handleCategorySelection(chatIdKey, messageId, session.user_id, data.slice(4));
      return;
    }

    if (data.startsWith("mc:")) {
      await answerCallbackQuery(callbackQuery.id, "Categoria atualizada.");
      await handleCategorySelection(chatIdKey, messageId, session.user_id, data.slice(3));
      return;
    }

    if (data.startsWith("pm:")) {
      const paymentMethod = normalizePaymentMethod(data.slice(3));

      if (!paymentMethod) {
        await answerCallbackQuery(callbackQuery.id, "Método inválido.");
        return;
      }

      await answerCallbackQuery(callbackQuery.id, "Método atualizado.");
      await handlePaymentMethodSelection(chatIdKey, messageId, paymentMethod);
      return;
    }

    if (data === "disconnect_confirm") {
      log("cmd_desligar", "start", chatIdKey, { step: "confirm" });
      await answerCallbackQuery(callbackQuery.id, "A desligar…");
      await setPendingTransaction(chatIdKey, null);
      const { error: disconnectError } = await supabase
        .from("telegram_sessions")
        .update({ is_authorized: false, pending_transaction: null })
        .eq("telegram_chat_id", chatId);
      if (disconnectError) {
        log("cmd_desligar", "error", chatIdKey, { error: getErrorMessage(disconnectError) });
        await safeEditMessage(chatIdKey, messageId, "Erro ao desligar. Tenta novamente.");
      } else {
        log("cmd_desligar", "success", chatIdKey);
        await safeEditMessage(chatIdKey, messageId, "✅ Bot desligado. Para voltar a ligar, gera um novo PIN no Fluxo.");
      }
      return;
    }

    if (data === "disconnect_cancel") {
      await answerCallbackQuery(callbackQuery.id, "Cancelado.");
      await safeEditMessage(chatIdKey, messageId, "Operação cancelada.");
      return;
    }

    if (data.startsWith("edit:")) {
      const transactionId = data.slice(5);
      await answerCallbackQuery(callbackQuery.id, "Que campo pretende alterar?");
      await handleEditSelectField(chatIdKey, messageId, transactionId);
      return;
    }

    if (data.startsWith("editfield:")) {
      const field = data.slice(10);
      if (field === "cancel") {
        await answerCallbackQuery(callbackQuery.id, "Cancelado.");
        await setPendingTransaction(chatIdKey, null);
        await safeEditMessage(chatIdKey, messageId, "❌ Edição cancelada.");
        return;
      }
      await answerCallbackQuery(callbackQuery.id, "Escreve o novo valor.");
      await handleEditFieldSelected(chatIdKey, messageId, field);
      return;
    }

    if (data.startsWith("editcat:")) {
      const categoryId = data.slice(8);
      await answerCallbackQuery(callbackQuery.id, "A atualizar…");
      await handleEditApplyCategory(chatIdKey, messageId, session.user_id, categoryId);
      return;
    }

    if (data.startsWith("del:")) {
      const transactionId = data.slice(4);
      await answerCallbackQuery(callbackQuery.id, "Confirma a eliminação?");
      await handleDeleteConfirmPrompt(chatIdKey, messageId, transactionId, session.user_id);
      return;
    }

    if (data.startsWith("delconfirm:")) {
      const transactionId = data.slice(11);
      await answerCallbackQuery(callbackQuery.id, "A eliminar…");
      await handleDeleteConfirm(chatIdKey, messageId, transactionId, session.user_id);
      return;
    }

    if (data === "delcancel") {
      await answerCallbackQuery(callbackQuery.id, "Cancelado.");
      await safeEditMessage(chatIdKey, messageId, "❌ Eliminação cancelada.");
      return;
    }

    await answerCallbackQuery(callbackQuery.id);
  } catch (error) {
    log("callback_query", "error", chatIdKey, { error: getErrorMessage(error), data });
    await answerCallbackQuery(callbackQuery.id, "Ocorreu um erro.");
  }
}

async function handleStartCommand(message: TelegramMessage, text: string) {
  const chatId = String(message.chat.id);
  const match = text.match(/^\/start(?:@[\w_]+)?\s+(\S+)$/i);
  const pin = match?.[1]?.trim();

  log("pin_validate", "start", chatId, { has_pin: Boolean(pin) });

  if (!pin) {
    log("pin_validate", "error", chatId, { reason: "missing_pin" });
    await sendMessage(chatId, "PIN inválido ou expirado. Gera um novo PIN na app.");
    return;
  }

  const nowIso = new Date().toISOString();
  const { data: pinData, error: pinError } = await supabase
    .from("telegram_pins")
    .select("id, user_id")
    .eq("pin", pin)
    .is("used_at", null)
    .gt("expires_at", nowIso)
    .maybeSingle();
  const pinRecord = pinData as TelegramPin | null;

  if (pinError) {
    log("pin_validate", "error", chatId, { reason: "lookup_failed", error: getErrorMessage(pinError) });
  }

  if (!pinRecord) {
    log("pin_validate", "error", chatId, { reason: "invalid_or_expired" });
    await sendMessage(chatId, "PIN inválido ou expirado. Gera um novo PIN na app.");
    return;
  }

  const linkedAt = new Date().toISOString();
  const username = message.from?.username ?? null;

  const { error: sessionError } = await supabase.from("telegram_sessions").upsert(
    {
      user_id: pinRecord.user_id,
      telegram_chat_id: message.chat.id,
      telegram_username: username,
      is_authorized: true,
      linked_at: linkedAt,
      pending_transaction: null,
    },
    { onConflict: "user_id" }
  );

  if (sessionError) {
    log("pin_validate", "error", chatId, { reason: "session_upsert_failed", error: getErrorMessage(sessionError) });
    await sendMessage(chatId, "Ocorreu um erro ao autorizar o bot. Tenta novamente.");
    return;
  }

  const { error: pinUpdateError } = await supabase
    .from("telegram_pins")
    .update({ used_at: linkedAt })
    .eq("id", pinRecord.id);

  if (pinUpdateError) {
    log("pin_validate", "error", chatId, { reason: "mark_used_failed", error: getErrorMessage(pinUpdateError) });
  }

  log("pin_validate", "success", chatId, { user_id: pinRecord.user_id });

  await sendMessage(
    chatId,
    "✅ Bot autorizado! Já podes enviar despesas como:\n\"café 1.50\"\n\"uber 8.30\"\n\nDigita /ajuda para ver todos os comandos."
  );
}

async function handleSaldoCommand(chatId: string, userId: string) {
  log("cmd_saldo", "start", chatId);
  const { monthStart, nextMonthStart, monthLabel } = getCurrentMonthRange();

  const [{ data: budgetsData, error: budgetsError }, { data: transactionsData, error: transactionsError }] =
    await Promise.all([
      supabase
        .from("budgets")
        .select("category_id, limit_cents")
        .eq("user_id", userId)
        .eq("month", monthStart),
      supabase
        .from("transactions")
        .select("category_id, amount_cents")
        .eq("user_id", userId)
        .eq("type", "expense")
        .gte("date", monthStart)
        .lt("date", nextMonthStart),
    ]);

  const budgets = (budgetsData ?? []) as BudgetRecord[];
  const transactions = (transactionsData ?? []) as Array<Pick<TransactionRecord, "category_id" | "amount_cents">>;

  if (budgetsError || transactionsError) {
    log("cmd_saldo", "error", chatId, { error: getErrorMessage(budgetsError ?? transactionsError) });
    await sendMessage(chatId, "Não foi possível obter o saldo dos orçamentos.");
    return;
  }

  if (!budgets || budgets.length === 0) {
    await sendMessage(chatId, `💰 Saldo de orçamentos — ${monthLabel}\n\nSem orçamentos definidos este mês.`);
    log("cmd_saldo", "success", chatId, { budget_count: 0, transaction_count: transactions.length });
    return;
  }

  const categoryIds = budgets.map((budget) => budget.category_id);
  const { data: categoriesData, error: categoriesError } = await supabase
    .from("categories")
    .select("id, name, emoji, type, sort_order")
    .eq("user_id", userId)
    .in("id", categoryIds);

  const categories = (categoriesData ?? []) as CategoryRecord[];

  if (categoriesError) {
    log("cmd_saldo", "error", chatId, { error: getErrorMessage(categoriesError), step: "load_categories" });
    await sendMessage(chatId, "Não foi possível obter o saldo dos orçamentos.");
    return;
  }

  const categoryMap = new Map((categories ?? []).map((category) => [category.id, category]));
  const spentByCategory = new Map<string, number>();

  for (const transaction of transactions ?? []) {
    spentByCategory.set(
      transaction.category_id,
      (spentByCategory.get(transaction.category_id) ?? 0) + transaction.amount_cents
    );
  }

  const lines = budgets
    .map((budget) => {
      const category = categoryMap.get(budget.category_id);
      if (!category) {
        return null;
      }

      const remaining = budget.limit_cents - (spentByCategory.get(budget.category_id) ?? 0);
      return {
        remaining,
        text: `${category.emoji} ${category.name}: ${formatCents(remaining)} / ${formatCents(budget.limit_cents)}`,
      };
    })
    .filter((row): row is { remaining: number; text: string } => row !== null)
    .sort((left, right) => left.remaining - right.remaining)
    .map((row) => row.text);

  await sendMessage(
    chatId,
    `💰 Saldo de orçamentos — ${monthLabel}\n\n${lines.join("\n") || "Sem orçamentos definidos este mês."}`
  );
  log("cmd_saldo", "success", chatId, { budget_count: budgets.length, transaction_count: transactions.length });
}

async function handleResumoCommand(chatId: string, userId: string) {
  log("cmd_resumo", "start", chatId);
  const { monthStart, nextMonthStart, monthLabel } = getCurrentMonthRange();
  const { data: summaryData, error } = await supabase
    .from("transactions")
    .select("type, amount_cents")
    .eq("user_id", userId)
    .gte("date", monthStart)
    .lt("date", nextMonthStart);

  const data = (summaryData ?? []) as Array<Pick<TransactionRecord, "type" | "amount_cents">>;

  if (error) {
    log("cmd_resumo", "error", chatId, { error: getErrorMessage(error) });
    await sendMessage(chatId, "Não foi possível obter o resumo mensal.");
    return;
  }

  let income = 0;
  let expenses = 0;

  for (const transaction of data ?? []) {
    if (transaction.type === "income") {
      income += transaction.amount_cents;
    } else {
      expenses += transaction.amount_cents;
    }
  }

  const net = income - expenses;
  await sendMessage(
    chatId,
    `📊 Resumo de ${monthLabel}\n\n💰 Rendimento: ${formatCents(income)}\n💸 Despesas: ${formatCents(expenses)}\n📈 Saldo: ${formatCents(net)}`
  );
  log("cmd_resumo", "success", chatId, { income_cents: income, expense_cents: expenses, net_cents: net });
}

async function handleUltimasCommand(chatId: string, userId: string) {
  log("cmd_ultimas", "start", chatId);
  const { data: transactionData, error } = await supabase
    .from("transactions")
    .select("id, category_id, amount_cents, type, note, date")
    .eq("user_id", userId)
    .order("date", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(5);

  const transactions = (transactionData ?? []) as (TransactionRecord & { id: string })[];

  if (error) {
    log("cmd_ultimas", "error", chatId, { error: getErrorMessage(error) });
    await sendMessage(chatId, "Não foi possível obter as últimas transações.");
    return;
  }

  if (!transactions || transactions.length === 0) {
    await sendMessage(chatId, "Ainda não há transações registadas.");
    log("cmd_ultimas", "success", chatId, { transaction_count: 0 });
    return;
  }

  const categoryIds = [...new Set(transactions.map((transaction) => transaction.category_id))];
  const { data: categoriesData, error: categoriesError } = await supabase
    .from("categories")
    .select("id, name, emoji, type, sort_order")
    .eq("user_id", userId)
    .in("id", categoryIds);

  const categories = (categoriesData ?? []) as CategoryRecord[];

  if (categoriesError) {
    log("cmd_ultimas", "error", chatId, { error: getErrorMessage(categoriesError), step: "load_categories" });
    await sendMessage(chatId, "Não foi possível obter as últimas transações.");
    return;
  }

  const categoryMap = new Map((categories ?? []).map((category) => [category.id, category]));
  const lines = transactions.map((transaction, idx) => {
    const category = categoryMap.get(transaction.category_id);
    const label = category ? `${category.emoji} ${category.name}` : "Categoria";
    const detail = transaction.note ? ` · ${transaction.note}` : "";
    const prefix = transaction.type === "income" ? "💰" : "💸";
    return `${idx + 1}. ${formatDate(transaction.date)} · ${prefix} ${formatCents(transaction.amount_cents)} · ${label}${detail}`;
  });

  const keyboard = {
    inline_keyboard: transactions.map((tx, idx) => [
      { text: `✏️ ${idx + 1}`, callback_data: `edit:${tx.id}` },
      { text: `🗑️ ${idx + 1}`, callback_data: `del:${tx.id}` },
    ]),
  };

  await sendMessage(chatId, `🧾 Últimas 5 transações\n\n${lines.join("\n")}`, keyboard);
  log("cmd_ultimas", "success", chatId, { transaction_count: transactions.length });
}

async function handleQuotaCommand(chatId: string, userId: string) {
  log("cmd_quota", "start", chatId);
  const todayStr = new Date().toISOString().slice(0, 10);
  const { data: usageRows, error } = await supabase
    .from("gemini_usage")
    .select("tokens_in, tokens_out")
    .eq("user_id", userId)
    .eq("date", todayStr);

  if (error) {
    log("cmd_quota", "error", chatId, { error: getErrorMessage(error) });
    await sendMessage(chatId, "Não foi possível obter o uso do Gemini.");
    return;
  }

  const rows = (usageRows ?? []) as Array<{ tokens_in: number | null; tokens_out: number | null }>;
  const requests = rows.length;
  const totalTokens = rows.reduce(
    (sum, row) => sum + (row.tokens_in ?? 0) + (row.tokens_out ?? 0),
    0
  );
  const bar = progressBar(requests, 500);
  const pct = Math.min(Math.round((requests / 500) * 100), 100);
  const now = new Date().toLocaleTimeString("pt-PT", { hour: "2-digit", minute: "2-digit" });
  const quotaMsg = `📊 *Uso Gemini hoje*\nPedidos: ${requests} / 500\nTokens: ${totalTokens}\n${bar}  ${pct}%\nModelo: ${GEMINI_MODEL}\n_Actualizado: ${now}_`;

  await callTelegram("sendMessage", {
    chat_id: chatId,
    text: quotaMsg,
    parse_mode: "Markdown",
    disable_web_page_preview: true,
  });

  log("cmd_quota", "success", chatId, { requests, total_tokens: totalTokens });
}

async function handleReciboCommand(chatId: string) {
  log("cmd_recibo", "start", chatId);

  const session = await getAuthorizedSession(chatId);
  if (!session?.user_id) {
    log("cmd_recibo", "error", chatId, { reason: "unauthorized" });
    await sendMessage(chatId, "❌ Sessão não autorizada. Usa /start para ligar a conta.");
    return;
  }

  const { data, error } = await supabase
    .from("payslip_imports")
    .select("month, employer_name, net_salary_cents, irs_withheld_cents, ss_withheld_cents, created_at")
    .eq("user_id", session.user_id)
    .eq("status", "done")
    .order("month", { ascending: false })
    .limit(1)
    .maybeSingle();

  const lastPayslip = data as PayslipImportRecord | null;

  if (error) {
    log("cmd_recibo", "error", chatId, { error: getErrorMessage(error) });
    await sendMessage(chatId, "Não foi possível obter o último recibo.");
    return;
  }

  if (!lastPayslip) {
    await sendMessage(chatId, "Ainda não importaste nenhum recibo.");
    log("cmd_recibo", "success", chatId, { found: false });
    return;
  }

  const monthLabel = formatPayslipMonth(lastPayslip.month);
  const netFormatted = formatEuroCents(lastPayslip.net_salary_cents);
  const irsFormatted = formatEuroCents(lastPayslip.irs_withheld_cents);
  const ssFormatted = formatEuroCents(lastPayslip.ss_withheld_cents);
  const importedAt = new Date(lastPayslip.created_at).toLocaleDateString("pt-PT", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });

  const msg = `📄 *Recibo ${monthLabel}*\nEntidade: ${lastPayslip.employer_name || "—"}\nLíquido: ${netFormatted}\nIRS: ${irsFormatted}   SS: ${ssFormatted}\n_Importado em: ${importedAt}_`;
  await sendMessage(chatId, msg, undefined, "Markdown");
  log("cmd_recibo", "success", chatId, { found: true, month: lastPayslip.month });
}

async function handleDesligarCommand(chatId: string) {
  log("cmd_desligar", "start", chatId);
  await sendMessage(chatId, "⚠️ Tens a certeza que queres desligar o bot do Fluxo?", {
    inline_keyboard: [
      [
        { text: "✅ Sim, desligar", callback_data: "disconnect_confirm" },
        { text: "❌ Cancelar", callback_data: "disconnect_cancel" },
      ],
    ],
  });
  log("cmd_desligar", "success", chatId, { awaiting_confirm: true });
}

async function handleManualTransactionCommand(
  chatId: string,
  userId: string,
  text: string,
  type: TransactionType
) {
  log("cmd_manual_tx", "start", chatId, { type });

  const parsed = parseManualCommand(text);
  if (parsed.status === "missing_amount") {
    await sendMessage(chatId, getManualCommandUsageText(type), undefined, "Markdown");
    log("cmd_manual_tx", "error", chatId, { type, reason: "missing_amount" });
    return;
  }

  if (parsed.status === "invalid_amount") {
    await sendMessage(chatId, "Valor inválido. Usa um número (ex: 12.50 ou 12,50).");
    log("cmd_manual_tx", "error", chatId, { type, reason: "invalid_amount" });
    return;
  }

  const categories = (await getUserCategories(userId, type)).slice(0, 12);
  if (categories.length === 0) {
    await sendMessage(chatId, "Não tens categorias. Cria uma na app.");
    log("cmd_manual_tx", "error", chatId, { type, reason: "no_categories" });
    return;
  }

  const pendingTransaction: PendingTransaction = {
    amount_cents: parsed.amount_cents,
    category_id: null,
    category_name: null,
    category_emoji: null,
    note: parsed.note,
    date: new Date().toISOString().slice(0, 10),
    type,
    payment_method: null,
  };

  await setPendingTransaction(chatId, pendingTransaction);
  await sendMessage(
    chatId,
    buildManualCategoryPrompt(type, parsed.amount_cents, parsed.note),
    buildCategoryKeyboard(categories, "mc:")
  );

  log("cmd_manual_tx", "success", chatId, { type, amount_cents: parsed.amount_cents, category_count: categories.length });
}

async function handleFreeTextMessage(chatId: string, userId: string, text: string) {
  const pending = await getPendingTransaction(chatId);

  if (pending?.edit_state?.mode === "edit" && pending.edit_state.field) {
    await handleEditApplyValue(chatId, userId, pending.edit_state, text);
    return;
  }

  const { parsed, rateLimited } = await parseTransactionMessage(chatId, text, userId);

  if (rateLimited) {
    await sendMessage(
      chatId,
      "⚠️ Modelo AI indisponível (limite de pedidos atingido).\nUsa o comando manual:\n`/gasto 12.50 Almoço`\n`/receita 1400 Salário`",
      undefined,
      "Markdown"
    );
    return;
  }

  if (!parsed || parsed.confidence < 0.7) {
    await sendMessage(chatId, 'Não consegui perceber. Tenta: "café 1.50" ou "salário 1500"');
    return;
  }

  const categories = await getUserCategories(userId, parsed.type);
  if (categories.length === 0) {
    await sendMessage(chatId, "Não encontrei categorias disponíveis na tua conta.");
    return;
  }

  const matchedCategory = findCategoryMatch(parsed.category_hint, categories) ?? categories[0];
  const pendingTransaction: PendingTransaction = {
    amount_cents: parsed.amount_cents,
    category_id: matchedCategory.id,
    category_name: matchedCategory.name,
    category_emoji: matchedCategory.emoji,
    note: parsed.note,
    date: parsed.date,
    type: parsed.type,
    payment_method: parsed.payment_method,
  };

  await setPendingTransaction(chatId, pendingTransaction);
  await sendMessage(
    chatId,
    buildConfirmationText(pendingTransaction),
    buildConfirmationKeyboard(pendingTransaction.payment_method)
  );
}

async function handleConfirmTransaction(chatId: string, messageId: number, userId: string) {
  const pendingTransaction = await getPendingTransaction(chatId);

  if (!pendingTransaction) {
    await safeEditMessage(chatId, messageId, "Não há ações pendentes.");
    return;
  }

  if (!pendingTransaction.category_id || !pendingTransaction.category_name) {
    await safeEditMessage(chatId, messageId, "Escolhe a categoria primeiro.");
    return;
  }

  const categoryId = pendingTransaction.category_id;
  const categoryName = pendingTransaction.category_name;
  const categoryEmoji = pendingTransaction.category_emoji ?? "💸";

  log("tx_create", "start", chatId, {
    category: categoryName,
    amount_cents: pendingTransaction.amount_cents,
  });

  const { error } = await supabase.from("transactions").insert({
    user_id: userId,
    amount_cents: pendingTransaction.amount_cents,
    category_id: categoryId,
    type: pendingTransaction.type,
    note: pendingTransaction.note || null,
    date: pendingTransaction.date,
    payment_method: pendingTransaction.payment_method,
    is_recurring: false,
    recurrence_rule: null,
    recurrence_parent_id: null,
  });

  if (error) {
    log("tx_create", "error", chatId, { error: getErrorMessage(error) });
    await safeEditMessage(chatId, messageId, "Ocorreu um erro ao registar a transação.");
    return;
  }

  await setPendingTransaction(chatId, null);

  let successMessage = `✅ ${formatCents(pendingTransaction.amount_cents)} — ${categoryName} registado!`;

  if (pendingTransaction.type === "expense") {
    const budgetProgress = await getBudgetProgress(
      supabase,
      userId,
      categoryId
    );

    if (budgetProgress) {
      successMessage += `\n\n${categoryEmoji} ${categoryName}: ${formatCents(budgetProgress.spentCents)} / ${formatCents(budgetProgress.limitCents)} este mês`;
    }
  }

  if (pendingTransaction.payment_method) {
    successMessage += `\n💳 ${PAYMENT_METHOD_LABELS[pendingTransaction.payment_method]}`;
  }

  await safeEditMessage(chatId, messageId, successMessage);
  log("tx_create", "success", chatId, {
    category: categoryName,
    amount_cents: pendingTransaction.amount_cents,
  });

  if (pendingTransaction.type === "expense") {
    await checkBudgetAlert(
      supabase,
      userId,
      categoryId,
      chatId,
      sendMessage
    );
  }
}

async function handleEditCategory(chatId: string, messageId: number, userId: string) {
  const pendingTransaction = await getPendingTransaction(chatId);

  if (!pendingTransaction) {
    await safeEditMessage(chatId, messageId, "Não há ações pendentes.");
    return;
  }

  const categories = (await getUserCategories(userId, pendingTransaction.type)).slice(0, 12);
  if (categories.length === 0) {
    await safeEditMessage(chatId, messageId, "Não encontrei categorias disponíveis.");
    return;
  }

  await safeEditMessage(chatId, messageId, "Escolhe a categoria:", buildCategoryKeyboard(categories, "cat_"));
}

async function handleCategorySelection(
  chatId: string,
  messageId: number,
  userId: string,
  categoryId: string
) {
  const pendingTransaction = await getPendingTransaction(chatId);

  if (!pendingTransaction) {
    await safeEditMessage(chatId, messageId, "Não há ações pendentes.");
    return;
  }

  const { data: categoryData, error } = await supabase
    .from("categories")
    .select("id, name, emoji, type, sort_order")
    .eq("user_id", userId)
    .eq("id", categoryId)
    .eq("type", pendingTransaction.type)
    .maybeSingle();

  const category = categoryData as CategoryRecord | null;

  if (error) {
    log("category_select", "error", chatId, { error: getErrorMessage(error), category_id: categoryId });
  }

  if (!category) {
    await safeEditMessage(chatId, messageId, "Categoria inválida.");
    return;
  }

  const updatedPendingTransaction: PendingTransaction = {
    ...pendingTransaction,
    category_id: category.id,
    category_name: category.name,
    category_emoji: category.emoji,
  };

  await setPendingTransaction(chatId, updatedPendingTransaction);
  await safeEditMessage(
    chatId,
    messageId,
    buildConfirmationText(updatedPendingTransaction),
    buildConfirmationKeyboard(updatedPendingTransaction.payment_method)
  );
}

async function handlePaymentMethodSelection(
  chatId: string,
  messageId: number,
  paymentMethod: PaymentMethod
) {
  const pendingTransaction = await getPendingTransaction(chatId);

  if (!pendingTransaction) {
    await safeEditMessage(chatId, messageId, "Não há ações pendentes.");
    return;
  }

  const updatedPendingTransaction: PendingTransaction = {
    ...pendingTransaction,
    payment_method: paymentMethod,
  };

  await setPendingTransaction(chatId, updatedPendingTransaction);
  await safeEditMessage(
    chatId,
    messageId,
    buildConfirmationText(updatedPendingTransaction),
    buildConfirmationKeyboard(updatedPendingTransaction.payment_method)
  );
}

function buildConfirmationText(transaction: PendingTransaction) {
  const icon = transaction.type === "income" ? "💰" : "💸";
  const label = transaction.type === "income" ? "receita" : "despesa";
  const categoryLabel = transaction.category_name
    ? `${transaction.category_emoji ? `${transaction.category_emoji} ` : ""}${transaction.category_name}`
    : "—";
  const paymentMethodLabel = transaction.payment_method
    ? PAYMENT_METHOD_LABELS[transaction.payment_method]
    : "—";
  const lines = [
    `Registar ${label}?`,
    "",
    `${icon} ${formatCents(transaction.amount_cents)} — ${categoryLabel}`,
  ];

  if (transaction.note) {
    lines.push(`📝 ${transaction.note}`);
  }

  lines.push(`📅 ${formatDate(transaction.date)}`);
  lines.push(`💳 Método: ${paymentMethodLabel}`);

  return lines.join("\n");
}

function buildConfirmationKeyboard(selectedPaymentMethod: PaymentMethod | null) {
  const paymentMethodRows: Array<Array<{ text: string; callback_data: string }>> = [];

  for (let index = 0; index < PAYMENT_METHOD_VALUES.length; index += 3) {
    paymentMethodRows.push(
      PAYMENT_METHOD_VALUES.slice(index, index + 3).map((paymentMethod) => ({
        text: paymentMethod === selectedPaymentMethod
          ? `✅ ${PAYMENT_METHOD_BUTTON_LABELS[paymentMethod]}`
          : PAYMENT_METHOD_BUTTON_LABELS[paymentMethod],
        callback_data: `pm:${paymentMethod}`,
      }))
    );
  }

  return {
    inline_keyboard: [
      ...paymentMethodRows,
      [
        { text: "✅ Confirmar", callback_data: "confirm_tx" },
        { text: "❌ Cancelar", callback_data: "cancel_tx" },
      ],
      [{ text: "✏️ Editar categoria", callback_data: "edit_category" }],
    ],
  };
}

function buildCategoryKeyboard(categories: CategoryRecord[], callbackPrefix: string) {
  const inlineKeyboard: Array<Array<{ text: string; callback_data: string }>> = [];

  for (let index = 0; index < categories.length; index += 3) {
    inlineKeyboard.push(
      categories.slice(index, index + 3).map((category) => ({
        text: `${category.emoji} ${shortenLabel(category.name)}`,
        callback_data: `${callbackPrefix}${category.id}`,
      }))
    );
  }

  return { inline_keyboard: inlineKeyboard };
}

function buildManualCategoryPrompt(type: TransactionType, amountCents: number, note: string) {
  const label = type === "income" ? "Receita" : "Despesa";
  return [
    `📝 ${label}: ${formatCents(amountCents)}`,
    ...(note ? [note] : []),
    "",
    "Escolhe a categoria:",
  ].join("\n");
}

function parseManualCommand(text: string):
  | { status: "ok"; amount_cents: number; note: string }
  | { status: "missing_amount" }
  | { status: "invalid_amount" } {
  const match = text.trim().match(/^\/\w+(?:@[\w_]+)?(?:\s+(\S+)(?:\s+([\s\S]+))?)?$/i);
  const rawAmount = match?.[1]?.trim();

  if (!rawAmount) {
    return { status: "missing_amount" };
  }

  const amountCents = parseEuroAmountToCents(rawAmount);
  if (amountCents === null) {
    return { status: "invalid_amount" };
  }

  return {
    status: "ok",
    amount_cents: amountCents,
    note: match?.[2]?.trim() ?? "",
  };
}

function parseEuroAmountToCents(value: string) {
  const normalized = value.trim().replace(/\s+/g, "").replace(",", ".");
  const match = normalized.match(/^(\d+)(?:\.(\d{1,2}))?$/);

  if (!match) {
    return null;
  }

  const eurosPart = Number.parseInt(match[1], 10);
  const centsPart = Number.parseInt((match[2] ?? "").padEnd(2, "0"), 10) || 0;
  const amountCents = eurosPart * 100 + centsPart;

  return Number.isSafeInteger(amountCents) && amountCents > 0 ? amountCents : null;
}

function getManualCommandUsageText(type: TransactionType) {
  if (type === "income") {
    return "Uso: `/receita 1400 Salário`\nExemplos: `/receita 1400 Salário`, `/receita 250 Prémio`";
  }

  return "Uso: `/gasto 12.50 Almoço`\nExemplos: `/gasto 3,20`, `/gasto 45 Supermercado`";
}

async function parseTransactionMessage(
  chatId: string,
  message: string,
  userId: string
): Promise<ParseTransactionResult> {
  const apiKey = Deno.env.get("GEMINI_API_KEY");
  if (!apiKey) {
    log("gemini_parse", "error", chatId, { reason: "missing_api_key" });
    return { parsed: null, rateLimited: false };
  }

  const startedAt = Date.now();
  const today = new Date().toISOString().slice(0, 10);
  const prompt = `Parse this Portuguese expense message and respond ONLY with valid JSON (no markdown, no explanation):\n{ "amount_cents": integer, "category_hint": string, "note": string, "date": "YYYY-MM-DD", "type": "expense" | "income", "confidence": 0.0-1.0, "payment_method": string | null }\npayment_method: extract if the user mentions how they paid. Examples: 'cartão de refeição' or 'ticket' → "cartao_refeicao", 'multibanco' or 'MB' → "multibanco", 'MBWay' → "mbway", 'dinheiro' or 'numerário' → "numerario", 'crédito' → "credito", 'débito' → "debito". Return null if not mentioned.\nIf not a financial transaction, return the JSON: null\nMessage: ${JSON.stringify(message)}\nToday's date: ${today}`;

  log("gemini_parse", "start", chatId);

  let response: Response;
  try {
    response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
        }),
      }
    );
  } catch (error) {
    const errorMessage = getErrorMessage(error);
    log("gemini_parse", "error", chatId, {
      duration_ms: Date.now() - startedAt,
      reason: "request_failed",
      error: errorMessage,
    });
    return { parsed: null, rateLimited: isGeminiRateLimitError(undefined, errorMessage) };
  }

  if (!response.ok) {
    const errorText = await response.text();
    log("gemini_parse", "error", chatId, {
      duration_ms: Date.now() - startedAt,
      reason: "request_failed",
      status_code: response.status,
      error: errorText,
    });
    return {
      parsed: null,
      rateLimited: isGeminiRateLimitError(response.status, errorText),
    };
  }

  const payload = (await response.json()) as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  };

  void (async () => {
    try {
      const usageMeta = (payload as Record<string, unknown>).usageMetadata as {
        promptTokenCount?: number;
        candidatesTokenCount?: number;
      } | undefined;
      await supabase.from("gemini_usage").insert({
        user_id: userId,
        model: GEMINI_MODEL,
        fn_name: "telegram-webhook",
        date: new Date().toISOString().slice(0, 10),
        tokens_in: usageMeta?.promptTokenCount ?? 0,
        tokens_out: usageMeta?.candidatesTokenCount ?? 0,
      });
    } catch {
      // Never let tracking failure affect the main flow
    }
  })();

  const rawText = payload.candidates?.[0]?.content?.parts
    ?.map((part) => part.text ?? "")
    .join("")
    .trim();

  if (!rawText) {
    log("gemini_parse", "error", chatId, {
      duration_ms: Date.now() - startedAt,
      reason: "empty_response",
    });
    return { parsed: null, rateLimited: false };
  }

  const cleaned = rawText.replace(/^```json\s*/i, "").replace(/```$/i, "").trim();
  if (cleaned === "null") {
    log("gemini_parse", "success", chatId, {
      duration_ms: Date.now() - startedAt,
      confidence: null,
      parsed: false,
    });
    return { parsed: null, rateLimited: false };
  }

  try {
    const parsed = JSON.parse(cleaned) as Partial<ParsedTransaction> | null;

    if (!parsed || typeof parsed !== "object") {
      log("gemini_parse", "error", chatId, {
        duration_ms: Date.now() - startedAt,
        reason: "invalid_payload",
      });
      return { parsed: null, rateLimited: false };
    }

    if (
      !Number.isInteger(parsed.amount_cents) ||
      (parsed.type !== "expense" && parsed.type !== "income") ||
      typeof parsed.date !== "string" ||
      !/^\d{4}-\d{2}-\d{2}$/.test(parsed.date) ||
      typeof parsed.confidence !== "number"
    ) {
      log("gemini_parse", "error", chatId, {
        duration_ms: Date.now() - startedAt,
        reason: "schema_validation_failed",
      });
      return { parsed: null, rateLimited: false };
    }

    log("gemini_parse", "success", chatId, {
      duration_ms: Date.now() - startedAt,
      confidence: parsed.confidence,
    });

    return {
      parsed: {
        amount_cents: parsed.amount_cents,
        category_hint: typeof parsed.category_hint === "string" ? parsed.category_hint : "",
        note: typeof parsed.note === "string" ? parsed.note.trim() : "",
        date: parsed.date,
        type: parsed.type,
        confidence: parsed.confidence,
        payment_method: normalizePaymentMethod(parsed.payment_method),
      },
      rateLimited: false,
    };
  } catch (error) {
    log("gemini_parse", "error", chatId, {
      duration_ms: Date.now() - startedAt,
      reason: "json_parse_failed",
      error: getErrorMessage(error),
    });
    return { parsed: null, rateLimited: false };
  }
}

function findCategoryMatch(hint: string, categories: CategoryRecord[]) {
  const normalizedHint = normalizeText(hint);

  if (!normalizedHint) {
    return null;
  }

  return categories.find((category) => {
    const normalizedName = normalizeText(category.name);
    return (
      normalizedName.includes(normalizedHint) ||
      normalizedHint.includes(normalizedName) ||
      category.emoji.toLowerCase().includes(hint.toLowerCase())
    );
  }) ?? null;
}

async function getUserCategories(userId: string, type: "expense" | "income") {
  const { data, error } = await supabase
    .from("categories")
    .select("id, name, emoji, type, sort_order")
    .eq("user_id", userId)
    .eq("type", type)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });

  if (error) {
    log("categories_fetch", "error", null, { user_id: userId, error: getErrorMessage(error), type });
    return [];
  }

  return (data ?? []) as CategoryRecord[];
}

async function getAuthorizedSession(chatId: string) {
  const { data, error } = await supabase
    .from("telegram_sessions")
    .select("user_id, is_authorized, telegram_username")
    .eq("telegram_chat_id", chatId)
    .eq("is_authorized", true)
    .maybeSingle();

  if (error) {
    log("auth_check", "error", chatId, { reason: "session_lookup_failed", error: getErrorMessage(error) });
    return null;
  }

  return data as TelegramSession | null;
}

async function getPendingTransaction(chatId: string): Promise<PendingTransaction | null> {
  const { data, error } = await supabase
    .from("telegram_sessions")
    .select("pending_transaction")
    .eq("telegram_chat_id", chatId)
    .eq("is_authorized", true)
    .maybeSingle();

  if (error) {
    log("pending_tx_get", "error", chatId, { error: getErrorMessage(error) });
    throw error;
  }

  if (!data?.pending_transaction) {
    return null;
  }

  return data.pending_transaction as PendingTransaction;
}

async function setPendingTransaction(chatId: string, tx: PendingTransaction | null): Promise<void> {
  const { error } = await supabase
    .from("telegram_sessions")
    .update({ pending_transaction: tx })
    .eq("telegram_chat_id", chatId);

  if (error) {
    log("pending_tx_set", "error", chatId, { error: getErrorMessage(error) });
    throw error;
  }
}

async function getUserIdByChatId(
  client: typeof supabase,
  chatId: string
): Promise<string | null> {
  const { data, error } = await client
    .from("telegram_sessions")
    .select("user_id")
    .eq("telegram_chat_id", chatId)
    .eq("is_authorized", true)
    .maybeSingle();

  if (error) {
    log("auth_check", "error", chatId, { reason: "user_lookup_failed", error: getErrorMessage(error) });
    return null;
  }

  return (data as { user_id: string } | null)?.user_id ?? null;
}

async function getBudgetProgress(
  client: typeof supabase,
  userId: string,
  categoryId: string
): Promise<BudgetProgress | null> {
  const { monthStart, nextMonthStart } = getCurrentMonthRange();
  const [{ data: budgetData, error: budgetError }, { data: transactionData, error: transactionsError }] =
    await Promise.all([
      client
        .from("budgets")
        .select("limit_cents")
        .eq("user_id", userId)
        .eq("category_id", categoryId)
        .eq("month", monthStart)
        .maybeSingle(),
      client
        .from("transactions")
        .select("amount_cents")
        .eq("user_id", userId)
        .eq("category_id", categoryId)
        .eq("type", "expense")
        .gte("date", monthStart)
        .lt("date", nextMonthStart),
    ]);

  const budget = budgetData as { limit_cents: number } | null;
  const transactions = (transactionData ?? []) as Array<{ amount_cents: number }>;

  if (budgetError || transactionsError) {
    log("budget_progress", "error", null, {
      user_id: userId,
      category_id: categoryId,
      error: getErrorMessage(budgetError ?? transactionsError),
    });
    return null;
  }

  if (!budget) {
    return null;
  }

  const spentCents = (transactions ?? []).reduce(
    (sum, transaction) => sum + transaction.amount_cents,
    0
  );
  const limitCents = budget.limit_cents;
  return {
    limitCents,
    spentCents,
    remainingCents: limitCents - spentCents,
    percentage: limitCents > 0 ? spentCents / limitCents : 0,
  };
}

async function checkBudgetAlert(
  client: typeof supabase,
  userId: string,
  categoryId: string,
  chatId: string,
  sendMessageFn: typeof sendMessage
) {
  const progress = await getBudgetProgress(client, userId, categoryId);
  if (!progress || progress.percentage < 0.8) {
    return;
  }

  const { monthStart } = getCurrentMonthRange();
  const threshold = progress.percentage >= 1 ? 100 : 80;
  const { data: existing, error: existingError } = await client
    .from("budget_alerts")
    .select("id")
    .eq("user_id", userId)
    .eq("category_id", categoryId)
    .eq("month", monthStart)
    .eq("threshold", threshold)
    .maybeSingle();

  if (existingError) {
    log("budget_alert", "error", chatId, { error: getErrorMessage(existingError), threshold, step: "dedupe_check" });
    return;
  }

  if (existing) {
    return;
  }

  const { data: categoryData, error } = await client
    .from("categories")
    .select("name")
    .eq("user_id", userId)
    .eq("id", categoryId)
    .maybeSingle();

  const category = categoryData as { name: string } | null;

  if (error) {
    log("budget_alert", "error", chatId, { error: getErrorMessage(error), threshold, step: "load_category" });
  }

  const categoryName = category?.name ?? "esta categoria";
  const percentage = Math.round(progress.percentage * 100);
  const message = threshold === 100
    ? `🔴 ${categoryName} budget exceeded! Spent ${formatCents(progress.spentCents)} of ${formatCents(progress.limitCents)} limit.`
    : `⚠️ Atenção: já usaste ${percentage}% do orçamento de ${categoryName} (${formatCents(progress.spentCents)} de ${formatCents(progress.limitCents)}). Restam ${formatCents(progress.remainingCents)}.`;

  await sendMessageFn(chatId, message);

  const { error: insertError } = await client.from("budget_alerts").insert({
    user_id: userId,
    category_id: categoryId,
    month: monthStart,
    threshold,
  });

  if (insertError) {
    log("budget_alert", "error", chatId, { error: getErrorMessage(insertError), threshold, step: "record_alert" });
    return;
  }

  log("budget_alert", "success", chatId, {
    category: categoryName,
    percentage,
    threshold,
  });
}

// ─── /editar handlers ───────────────────────────────────────────────

async function handleEditarCommand(chatId: string, userId: string) {
  log("cmd_editar", "start", chatId);
  const transactions = await getRecentTransactions(chatId, userId);
  if (!transactions) return;

  const categoryMap = await getCategoryMapForTransactions(chatId, userId, transactions);
  if (!categoryMap) return;

  const lines = transactions.map((tx, idx) => {
    const cat = categoryMap.get(tx.category_id);
    const label = cat ? `${cat.emoji} ${cat.name}` : "Categoria";
    const prefix = tx.type === "income" ? "💰" : "💸";
    return `${idx + 1}. ${formatDate(tx.date)} · ${prefix} ${formatCents(tx.amount_cents)} · ${label}`;
  });

  const keyboard = {
    inline_keyboard: transactions.map((tx, idx) => [
      { text: `✏️ ${idx + 1}. ${formatCents(tx.amount_cents)}`, callback_data: `edit:${tx.id}` },
    ]),
  };

  await sendMessage(chatId, `✏️ Qual transação pretende editar?\n\n${lines.join("\n")}`, keyboard);
  log("cmd_editar", "success", chatId);
}

async function handleEditSelectField(chatId: string, messageId: number, transactionId: string) {
  log("edit_select_field", "start", chatId, { transactionId });

  await setPendingTransaction(chatId, {
    amount_cents: 0,
    category_id: null,
    category_name: null,
    category_emoji: null,
    note: "",
    date: "",
    type: "expense",
    payment_method: null,
    edit_state: { mode: "edit", transaction_id: transactionId, field: null },
  });

  const keyboard = {
    inline_keyboard: [
      [
        { text: "💰 Valor", callback_data: "editfield:amount" },
        { text: "📂 Categoria", callback_data: "editfield:category" },
      ],
      [
        { text: "📝 Nota", callback_data: "editfield:note" },
        { text: "📅 Data", callback_data: "editfield:date" },
      ],
      [{ text: "❌ Cancelar", callback_data: "editfield:cancel" }],
    ],
  };

  await safeEditMessage(chatId, messageId, "O que pretende alterar?", keyboard);
  log("edit_select_field", "success", chatId);
}

async function handleEditFieldSelected(chatId: string, messageId: number, field: string) {
  log("edit_field_selected", "start", chatId, { field });

  const pending = await getPendingTransaction(chatId);
  if (!pending?.edit_state) {
    await safeEditMessage(chatId, messageId, "❌ Sessão de edição expirada. Use /editar novamente.");
    return;
  }

  pending.edit_state.field = field;
  await setPendingTransaction(chatId, pending);

  const prompts: Record<string, string> = {
    amount: "💰 Escreva o novo valor (ex: 12.50 ou 12,50):",
    note: "📝 Escreva a nova nota:",
    date: "📅 Escreva a nova data (DD/MM/AAAA):",
    category: "📂 A carregar categorias…",
  };

  if (field === "category") {
    const userId = await getUserIdByChatId(supabase, chatId);
    if (!userId) {
      await safeEditMessage(chatId, messageId, "Erro de autenticação.");
      return;
    }

    const { data: txData } = await supabase
      .from("transactions")
      .select("type")
      .eq("id", pending.edit_state.transaction_id)
      .eq("user_id", userId)
      .maybeSingle();

    const txType = (txData as { type?: string } | null)?.type === "income" ? "income" : "expense";
    const categories = await getUserCategories(userId, txType as TransactionType);

    if (categories.length === 0) {
      await safeEditMessage(chatId, messageId, "Sem categorias disponíveis.");
      return;
    }

    const keyboard = buildCategoryKeyboard(categories, "editcat:" as "cat_");
    await safeEditMessage(chatId, messageId, "📂 Escolha a nova categoria:", keyboard);
  } else {
    await safeEditMessage(chatId, messageId, prompts[field] ?? "Escreva o novo valor:");
  }

  log("edit_field_selected", "success", chatId, { field });
}

async function handleEditApplyCategory(chatId: string, messageId: number, userId: string, categoryId: string) {
  log("edit_apply_category", "start", chatId, { categoryId });

  const pending = await getPendingTransaction(chatId);
  if (!pending?.edit_state?.transaction_id) {
    await safeEditMessage(chatId, messageId, "❌ Sessão de edição expirada.");
    return;
  }

  const { error } = await supabase
    .from("transactions")
    .update({ category_id: categoryId, updated_at: new Date().toISOString() })
    .eq("id", pending.edit_state.transaction_id)
    .eq("user_id", userId);

  await setPendingTransaction(chatId, null);

  if (error) {
    log("edit_apply_category", "error", chatId, { error: getErrorMessage(error) });
    await safeEditMessage(chatId, messageId, "❌ Erro ao atualizar categoria.");
    return;
  }

  await safeEditMessage(chatId, messageId, "✅ Categoria atualizada com sucesso!");
  log("edit_apply_category", "success", chatId);
}

async function handleEditApplyValue(chatId: string, userId: string, editState: EditState, text: string) {
  log("edit_apply_value", "start", chatId, { field: editState.field, text });

  const field = editState.field;
  const transactionId = editState.transaction_id;

  let updatePayload: Record<string, unknown> = {};

  if (field === "amount") {
    const normalized = text.replace(",", ".").trim();
    const value = parseFloat(normalized);
    if (isNaN(value) || value <= 0) {
      await sendMessage(chatId, "❌ Valor inválido. Escreva um número positivo (ex: 12.50).");
      return;
    }
    updatePayload = { amount_cents: Math.round(value * 100) };
  } else if (field === "note") {
    updatePayload = { note: text.trim() || null };
  } else if (field === "date") {
    const dateMatch = text.trim().match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})$/);
    if (!dateMatch) {
      await sendMessage(chatId, "❌ Formato inválido. Use DD/MM/AAAA (ex: 15/05/2025).");
      return;
    }
    const [, day, month, year] = dateMatch;
    const isoDate = `${year}-${month!.padStart(2, "0")}-${day!.padStart(2, "0")}`;
    const parsed = new Date(isoDate);
    if (isNaN(parsed.getTime())) {
      await sendMessage(chatId, "❌ Data inválida.");
      return;
    }
    updatePayload = { date: isoDate };
  } else {
    await sendMessage(chatId, "❌ Campo desconhecido.");
    await setPendingTransaction(chatId, null);
    return;
  }

  updatePayload.updated_at = new Date().toISOString();

  const { error } = await supabase
    .from("transactions")
    .update(updatePayload)
    .eq("id", transactionId)
    .eq("user_id", userId);

  await setPendingTransaction(chatId, null);

  if (error) {
    log("edit_apply_value", "error", chatId, { error: getErrorMessage(error) });
    await sendMessage(chatId, "❌ Erro ao atualizar transação.");
    return;
  }

  const fieldLabels: Record<string, string> = {
    amount: "valor",
    note: "nota",
    date: "data",
  };
  await sendMessage(chatId, `✅ ${capitalize(fieldLabels[field] ?? field)} atualizado com sucesso!`);
  log("edit_apply_value", "success", chatId, { field });
}

// ─── /apagar handlers ───────────────────────────────────────────────

async function handleApagarCommand(chatId: string, userId: string) {
  log("cmd_apagar", "start", chatId);
  const transactions = await getRecentTransactions(chatId, userId);
  if (!transactions) return;

  const categoryMap = await getCategoryMapForTransactions(chatId, userId, transactions);
  if (!categoryMap) return;

  const lines = transactions.map((tx, idx) => {
    const cat = categoryMap.get(tx.category_id);
    const label = cat ? `${cat.emoji} ${cat.name}` : "Categoria";
    const prefix = tx.type === "income" ? "💰" : "💸";
    return `${idx + 1}. ${formatDate(tx.date)} · ${prefix} ${formatCents(tx.amount_cents)} · ${label}`;
  });

  const keyboard = {
    inline_keyboard: transactions.map((tx, idx) => [
      { text: `🗑️ ${idx + 1}. ${formatCents(tx.amount_cents)}`, callback_data: `del:${tx.id}` },
    ]),
  };

  await sendMessage(chatId, `🗑️ Qual transação pretende eliminar?\n\n${lines.join("\n")}`, keyboard);
  log("cmd_apagar", "success", chatId);
}

async function handleDeleteConfirmPrompt(chatId: string, messageId: number, transactionId: string, userId: string) {
  log("del_confirm_prompt", "start", chatId, { transactionId });

  const { data: txData } = await supabase
    .from("transactions")
    .select("amount_cents, type, note, date, category_id")
    .eq("id", transactionId)
    .eq("user_id", userId)
    .maybeSingle();

  if (!txData) {
    await safeEditMessage(chatId, messageId, "❌ Transação não encontrada.");
    return;
  }

  const tx = txData as TransactionRecord;
  const prefix = tx.type === "income" ? "💰" : "💸";
  const detail = tx.note ? ` · ${tx.note}` : "";

  const keyboard = {
    inline_keyboard: [
      [
        { text: "✅ Sim, eliminar", callback_data: `delconfirm:${transactionId}` },
        { text: "❌ Cancelar", callback_data: "delcancel" },
      ],
    ],
  };

  await safeEditMessage(
    chatId,
    messageId,
    `Tem a certeza que pretende eliminar?\n\n${prefix} ${formatCents(tx.amount_cents)} · ${formatDate(tx.date)}${detail}`,
    keyboard
  );
  log("del_confirm_prompt", "success", chatId);
}

async function handleDeleteConfirm(chatId: string, messageId: number, transactionId: string, userId: string) {
  log("del_confirm", "start", chatId, { transactionId });

  const { error } = await supabase
    .from("transactions")
    .delete()
    .eq("id", transactionId)
    .eq("user_id", userId);

  if (error) {
    log("del_confirm", "error", chatId, { error: getErrorMessage(error) });
    await safeEditMessage(chatId, messageId, "❌ Erro ao eliminar transação.");
    return;
  }

  await safeEditMessage(chatId, messageId, "✅ Transação eliminada com sucesso!");
  log("del_confirm", "success", chatId);
}

// ─── Shared helpers for edit/delete ─────────────────────────────────

async function getRecentTransactions(chatId: string, userId: string): Promise<(TransactionRecord & { id: string })[] | null> {
  const { data, error } = await supabase
    .from("transactions")
    .select("id, category_id, amount_cents, type, note, date")
    .eq("user_id", userId)
    .order("date", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(5);

  if (error) {
    log("get_recent_tx", "error", chatId, { error: getErrorMessage(error) });
    await sendMessage(chatId, "Não foi possível obter as últimas transações.");
    return null;
  }

  const transactions = (data ?? []) as (TransactionRecord & { id: string })[];

  if (transactions.length === 0) {
    await sendMessage(chatId, "Ainda não há transações registadas.");
    return null;
  }

  return transactions;
}

async function getCategoryMapForTransactions(
  chatId: string,
  userId: string,
  transactions: (TransactionRecord & { id: string })[]
): Promise<Map<string, CategoryRecord> | null> {
  const categoryIds = [...new Set(transactions.map((tx) => tx.category_id))];
  const { data: categoriesData, error } = await supabase
    .from("categories")
    .select("id, name, emoji, type, sort_order")
    .eq("user_id", userId)
    .in("id", categoryIds);

  if (error) {
    log("get_categories", "error", chatId, { error: getErrorMessage(error) });
    await sendMessage(chatId, "Não foi possível carregar categorias.");
    return null;
  }

  return new Map(((categoriesData ?? []) as CategoryRecord[]).map((cat) => [cat.id, cat]));
}

function formatCents(cents: number): string {
  const sign = cents < 0 ? "-" : "";
  const formatted = new Intl.NumberFormat("pt-PT", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Math.abs(cents) / 100);
  return `${sign}€${formatted}`;
}

function formatEuroCents(cents: number): string {
  return (cents / 100).toLocaleString("pt-PT", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 2,
  });
}

function formatPayslipMonth(monthStr: string): string {
  const months = [
    "janeiro",
    "fevereiro",
    "março",
    "abril",
    "maio",
    "junho",
    "julho",
    "agosto",
    "setembro",
    "outubro",
    "novembro",
    "dezembro",
  ];
  const parts = monthStr.replace(/-01$/, "").split("-");
  const year = parts[0];
  const monthPart = parts[1];

  if (!year || !monthPart) {
    return monthStr;
  }

  const monthIdx = Number.parseInt(monthPart, 10) - 1;
  return `${months[monthIdx] ?? monthStr} ${year}`;
}

function formatDate(dateStr: string): string {
  const [year, month, day] = dateStr.split("-");
  if (!year || !month || !day) {
    return dateStr;
  }

  return `${day}/${month}/${year}`;
}

function getCurrentMonthRange(referenceDate = new Date()) {
  const year = referenceDate.getUTCFullYear();
  const month = referenceDate.getUTCMonth();
  const monthStart = new Date(Date.UTC(year, month, 1)).toISOString().slice(0, 10);
  const nextMonthStart = new Date(Date.UTC(year, month + 1, 1)).toISOString().slice(0, 10);
  const monthLabel = capitalize(
    new Intl.DateTimeFormat("pt-PT", { month: "long", timeZone: "UTC" }).format(referenceDate)
  );

  return { monthStart, nextMonthStart, monthLabel };
}

function progressBar(used: number, total: number, width = 10): string {
  const ratio = total > 0 ? used / total : 0;
  const filled = Math.min(width, Math.max(0, Math.round(ratio * width)));
  const rest = width - filled;
  return "█".repeat(filled) + "░".repeat(rest);
}

function getHelpText() {
  return [
    "🤖 Comandos disponíveis",
    "",
    "/saldo — ver saldo dos orçamentos deste mês",
    "/resumo — ver rendimento, despesas e saldo do mês",
    "/ultimas — listar as últimas 5 transações",
    "/editar — editar uma transação recente",
    "/apagar — eliminar uma transação recente",
    "/quota — ver o uso do Gemini hoje",
    "/recibo — ver o último recibo importado",
    "/gasto 12.50 almoço — registar despesa manualmente",
    "/receita 1400 salário — registar receita manualmente",
    "/cancelar — cancelar a ação pendente",
    "/desligar — desligar esta conta do bot",
    "/ajuda — mostrar esta ajuda",
    "",
    'Também podes escrever mensagens como "café 1.50" ou "salário 1500".',
  ].join("\n");
}

function normalizeCommand(text: string) {
  return text.split(/\s+/)[0]?.toLowerCase() ?? text.toLowerCase();
}

function normalizePaymentMethod(value: unknown): PaymentMethod | null {
  if (typeof value !== "string") {
    return null;
  }

  return PAYMENT_METHOD_VALUES.includes(value as PaymentMethod)
    ? (value as PaymentMethod)
    : null;
}

function isGeminiRateLimitError(status?: number, message?: string) {
  if (status === 429) {
    return true;
  }

  if (!message) {
    return false;
  }

  return /\bquota\b/i.test(message) || /rate[_ -]?limit/i.test(message) || /\brate\b/i.test(message);
}

function normalizeText(value: string) {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .trim();
}

function capitalize(value: string) {
  return value ? `${value.charAt(0).toUpperCase()}${value.slice(1)}` : value;
}

function shortenLabel(value: string, maxLength = 14) {
  return value.length <= maxLength ? value : `${value.slice(0, maxLength - 1).trimEnd()}…`;
}

async function safeEditMessage(
  chatId: string,
  messageId: number,
  text: string,
  replyMarkup?: Record<string, unknown>
) {
  const edited = await editMessageText(chatId, messageId, text, replyMarkup);
  if (!edited) {
    await sendMessage(chatId, text, replyMarkup);
  }
}

async function callTelegram(method: string, payload: Record<string, unknown>) {
  const rawChatId = payload["chat_id"];
  const chatId = typeof rawChatId === "string" || typeof rawChatId === "number"
    ? String(rawChatId)
    : null;
  const token = Deno.env.get("TELEGRAM_BOT_TOKEN");
  if (!token) {
    log("telegram_api", "error", chatId, { method, reason: "missing_bot_token" });
    return null;
  }

  const response = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    log("telegram_api", "error", chatId, {
      method,
      status_code: response.status,
      error: await response.text(),
    });
    return null;
  }

  return await response.json().catch(() => null);
}

async function sendMessage(
  chatId: string,
  text: string,
  replyMarkup?: Record<string, unknown>,
  parseMode?: "Markdown" | "MarkdownV2" | "HTML"
) {
  await callTelegram("sendMessage", {
    chat_id: chatId,
    text,
    disable_web_page_preview: true,
    ...(replyMarkup ? { reply_markup: replyMarkup } : {}),
    ...(parseMode ? { parse_mode: parseMode } : {}),
  });
}

async function editMessageText(
  chatId: string,
  messageId: number,
  text: string,
  replyMarkup?: Record<string, unknown>
) {
  return await callTelegram("editMessageText", {
    chat_id: chatId,
    message_id: messageId,
    text,
    disable_web_page_preview: true,
    ...(replyMarkup ? { reply_markup: replyMarkup } : {}),
  });
}

async function answerCallbackQuery(callbackQueryId: string, text?: string) {
  await callTelegram("answerCallbackQuery", {
    callback_query_id: callbackQueryId,
    ...(text ? { text } : {}),
  });
}

