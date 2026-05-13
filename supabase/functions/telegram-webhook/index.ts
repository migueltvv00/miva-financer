import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

const pendingTransactions = new Map<string, PendingTransaction>();

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

interface ParsedTransaction {
  amount_cents: number;
  category_hint: string;
  note: string;
  date: string;
  type: "expense" | "income";
  confidence: number;
}

interface PendingTransaction {
  amount_cents: number;
  category_id: string;
  category_name: string;
  category_emoji: string;
  note: string;
  date: string;
  type: "expense" | "income";
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

    if (update.message) {
      await handleMessage(update.message);
    } else if (update.callback_query) {
      await handleCallbackQuery(update.callback_query);
    }
  } catch (error) {
    console.error("Erro no webhook do Telegram:", error);
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
    await sendMessage(chatId, "Este bot é privado. Não autorizado.");
    return;
  }

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
    case "/cancelar":
      pendingTransactions.delete(chatId);
      await sendMessage(chatId, "Não há ações pendentes.");
      return;
    case "/ajuda":
      await sendMessage(chatId, getHelpText());
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
    await answerCallbackQuery(callbackQuery.id, "Este bot é privado. Não autorizado.");
    await sendMessage(chatIdKey, "Este bot é privado. Não autorizado.");
    return;
  }

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
      pendingTransactions.delete(chatIdKey);
      await safeEditMessage(chatIdKey, messageId, "Cancelado.");
      return;
    }

    if (data.startsWith("cat_")) {
      await answerCallbackQuery(callbackQuery.id, "Categoria atualizada.");
      await handleCategorySelection(chatIdKey, messageId, session.user_id, data.slice(4));
      return;
    }

    await answerCallbackQuery(callbackQuery.id);
  } catch (error) {
    console.error("Erro ao processar callback do Telegram:", error);
    await answerCallbackQuery(callbackQuery.id, "Ocorreu um erro.");
  }
}

async function handleStartCommand(message: TelegramMessage, text: string) {
  const chatId = String(message.chat.id);
  const match = text.match(/^\/start(?:@[\w_]+)?\s+(\S+)$/i);
  const pin = match?.[1]?.trim();

  if (!pin) {
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
    console.error("Erro ao validar PIN do Telegram:", pinError);
  }

  if (!pinRecord) {
    await sendMessage(chatId, "PIN inválido ou expirado. Gera um novo PIN na app.");
    return;
  }

  const linkedAt = new Date().toISOString();
  const username = message.from?.username ?? null;

  const { error: sessionError } = await supabase.from("telegram_sessions").upsert(
    {
      user_id: pinRecord.user_id,
      telegram_chat_id: chatId,
      telegram_username: username,
      is_authorized: true,
      linked_at: linkedAt,
    },
    { onConflict: "user_id" }
  );

  if (sessionError) {
    console.error("Erro ao autorizar sessão do Telegram:", sessionError);
    await sendMessage(chatId, "Ocorreu um erro ao autorizar o bot. Tenta novamente.");
    return;
  }

  const { error: pinUpdateError } = await supabase
    .from("telegram_pins")
    .update({ used_at: linkedAt })
    .eq("id", pinRecord.id);

  if (pinUpdateError) {
    console.error("Erro ao marcar PIN do Telegram como usado:", pinUpdateError);
  }

  await sendMessage(
    chatId,
    "✅ Bot autorizado! Já podes enviar despesas como:\n\"café 1.50\"\n\"uber 8.30\"\n\nDigita /ajuda para ver todos os comandos."
  );
}

async function handleSaldoCommand(chatId: string, userId: string) {
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
    console.error("Erro ao obter saldo de orçamentos:", budgetsError ?? transactionsError);
    await sendMessage(chatId, "Não foi possível obter o saldo dos orçamentos.");
    return;
  }

  if (!budgets || budgets.length === 0) {
    await sendMessage(chatId, `💰 Saldo de orçamentos — ${monthLabel}\n\nSem orçamentos definidos este mês.`);
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
    console.error("Erro ao obter categorias dos orçamentos:", categoriesError);
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
}

async function handleResumoCommand(chatId: string, userId: string) {
  const { monthStart, nextMonthStart, monthLabel } = getCurrentMonthRange();
  const { data: summaryData, error } = await supabase
    .from("transactions")
    .select("type, amount_cents")
    .eq("user_id", userId)
    .gte("date", monthStart)
    .lt("date", nextMonthStart);

  const data = (summaryData ?? []) as Array<Pick<TransactionRecord, "type" | "amount_cents">>;

  if (error) {
    console.error("Erro ao obter resumo mensal:", error);
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
}

async function handleUltimasCommand(chatId: string, userId: string) {
  const { data: transactionData, error } = await supabase
    .from("transactions")
    .select("category_id, amount_cents, type, note, date")
    .eq("user_id", userId)
    .order("date", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(5);

  const transactions = (transactionData ?? []) as TransactionRecord[];

  if (error) {
    console.error("Erro ao obter últimas transações:", error);
    await sendMessage(chatId, "Não foi possível obter as últimas transações.");
    return;
  }

  if (!transactions || transactions.length === 0) {
    await sendMessage(chatId, "Ainda não há transações registadas.");
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
    console.error("Erro ao obter categorias das últimas transações:", categoriesError);
    await sendMessage(chatId, "Não foi possível obter as últimas transações.");
    return;
  }

  const categoryMap = new Map((categories ?? []).map((category) => [category.id, category]));
  const lines = transactions.map((transaction) => {
    const category = categoryMap.get(transaction.category_id);
    const label = category ? `${category.emoji} ${category.name}` : "Categoria";
    const detail = transaction.note ? ` · ${transaction.note}` : "";
    const prefix = transaction.type === "income" ? "💰" : "💸";
    return `${formatDate(transaction.date)} · ${prefix} ${formatCents(transaction.amount_cents)} · ${label}${detail}`;
  });

  await sendMessage(chatId, `🧾 Últimas 5 transações\n\n${lines.join("\n")}`);
}

async function handleFreeTextMessage(chatId: string, userId: string, text: string) {
  const parsed = await parseTransactionMessage(text);

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
  };

  pendingTransactions.set(chatId, pendingTransaction);
  await sendMessage(chatId, buildConfirmationText(pendingTransaction), buildConfirmationKeyboard());
}

async function handleConfirmTransaction(chatId: string, messageId: number, userId: string) {
  const pendingTransaction = pendingTransactions.get(chatId);

  if (!pendingTransaction) {
    await safeEditMessage(chatId, messageId, "Não há ações pendentes.");
    return;
  }

  const { error } = await supabase.from("transactions").insert({
    user_id: userId,
    amount_cents: pendingTransaction.amount_cents,
    category_id: pendingTransaction.category_id,
    type: pendingTransaction.type,
    note: pendingTransaction.note || null,
    date: pendingTransaction.date,
    is_recurring: false,
    recurrence_rule: null,
    recurrence_parent_id: null,
  });

  if (error) {
    console.error("Erro ao inserir transação via Telegram:", error);
    await safeEditMessage(chatId, messageId, "Ocorreu um erro ao registar a transação.");
    return;
  }

  pendingTransactions.delete(chatId);

  let successMessage = "✅ Registado!";

  if (pendingTransaction.type === "expense") {
    const budgetProgress = await getBudgetProgress(
      supabase,
      userId,
      pendingTransaction.category_id
    );

    if (budgetProgress) {
      successMessage = `✅ Registado!\n\n${pendingTransaction.category_emoji} ${pendingTransaction.category_name}: ${formatCents(budgetProgress.spentCents)} / ${formatCents(budgetProgress.limitCents)} este mês`;
    }
  }

  await safeEditMessage(chatId, messageId, successMessage);

  if (pendingTransaction.type === "expense") {
    await checkBudgetAlert(
      supabase,
      userId,
      pendingTransaction.category_id,
      chatId,
      sendMessage
    );
  }
}

async function handleEditCategory(chatId: string, messageId: number, userId: string) {
  const pendingTransaction = pendingTransactions.get(chatId);

  if (!pendingTransaction) {
    await safeEditMessage(chatId, messageId, "Não há ações pendentes.");
    return;
  }

  const categories = (await getUserCategories(userId, pendingTransaction.type)).slice(0, 8);
  if (categories.length === 0) {
    await safeEditMessage(chatId, messageId, "Não encontrei categorias disponíveis.");
    return;
  }

  const inlineKeyboard: Array<Array<{ text: string; callback_data: string }>> = [];

  for (let index = 0; index < categories.length; index += 2) {
    inlineKeyboard.push(
      categories.slice(index, index + 2).map((category) => ({
        text: `${category.emoji} ${category.name}`,
        callback_data: `cat_${category.id}`,
      }))
    );
  }

  await safeEditMessage(chatId, messageId, "Escolhe a categoria:", {
    inline_keyboard: inlineKeyboard,
  });
}

async function handleCategorySelection(
  chatId: string,
  messageId: number,
  userId: string,
  categoryId: string
) {
  const pendingTransaction = pendingTransactions.get(chatId);

  if (!pendingTransaction) {
    await safeEditMessage(chatId, messageId, "Não há ações pendentes.");
    return;
  }

  const { data: categoryData, error } = await supabase
    .from("categories")
    .select("id, name, emoji, type, sort_order")
    .eq("user_id", userId)
    .eq("id", categoryId)
    .maybeSingle();

  const category = categoryData as CategoryRecord | null;

  if (error) {
    console.error("Erro ao obter categoria escolhida via Telegram:", error);
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

  pendingTransactions.set(chatId, updatedPendingTransaction);
  await safeEditMessage(
    chatId,
    messageId,
    buildConfirmationText(updatedPendingTransaction),
    buildConfirmationKeyboard()
  );
}

function buildConfirmationText(transaction: PendingTransaction) {
  const icon = transaction.type === "income" ? "💰" : "💸";
  const note = transaction.note ? ` (${transaction.note})` : "";
  const label = transaction.type === "income" ? "receita" : "despesa";
  return `Registar ${label}?\n\n${icon} ${formatCents(transaction.amount_cents)} — ${transaction.category_name}${note}\n📅 ${formatDate(transaction.date)}`;
}

function buildConfirmationKeyboard() {
  return {
    inline_keyboard: [
      [
        { text: "✅ Sim", callback_data: "confirm_tx" },
        { text: "✏️ Editar categoria", callback_data: "edit_category" },
        { text: "❌ Cancelar", callback_data: "cancel_tx" },
      ],
    ],
  };
}

async function parseTransactionMessage(message: string): Promise<ParsedTransaction | null> {
  const apiKey = Deno.env.get("GEMINI_API_KEY");
  if (!apiKey) {
    console.error("GEMINI_API_KEY não configurada.");
    return null;
  }

  const today = new Date().toISOString().slice(0, 10);
  const prompt = `Parse this Portuguese expense message and respond ONLY with valid JSON (no markdown, no explanation):\n{ "amount_cents": integer, "category_hint": string, "note": string, "date": "YYYY-MM-DD", "type": "expense" | "income", "confidence": 0.0-1.0 }\nIf not a financial transaction, return the JSON: null\nMessage: ${JSON.stringify(message)}\nToday's date: ${today}`;

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
      }),
    }
  );

  if (!response.ok) {
    console.error("Erro ao chamar Gemini:", await response.text());
    return null;
  }

  const payload = (await response.json()) as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  };
  const rawText = payload.candidates?.[0]?.content?.parts
    ?.map((part) => part.text ?? "")
    .join("")
    .trim();

  if (!rawText) {
    return null;
  }

  const cleaned = rawText.replace(/^```json\s*/i, "").replace(/```$/i, "").trim();
  if (cleaned === "null") {
    return null;
  }

  try {
    const parsed = JSON.parse(cleaned) as Partial<ParsedTransaction> | null;

    if (!parsed || typeof parsed !== "object") {
      return null;
    }

    if (
      !Number.isInteger(parsed.amount_cents) ||
      (parsed.type !== "expense" && parsed.type !== "income") ||
      typeof parsed.date !== "string" ||
      !/^\d{4}-\d{2}-\d{2}$/.test(parsed.date) ||
      typeof parsed.confidence !== "number"
    ) {
      return null;
    }

    return {
      amount_cents: parsed.amount_cents,
      category_hint: typeof parsed.category_hint === "string" ? parsed.category_hint : "",
      note: typeof parsed.note === "string" ? parsed.note.trim() : "",
      date: parsed.date,
      type: parsed.type,
      confidence: parsed.confidence,
    };
  } catch (error) {
    console.error("Erro ao interpretar resposta do Gemini:", error, cleaned);
    return null;
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
    console.error("Erro ao obter categorias do utilizador:", error);
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
    console.error("Erro ao obter sessão do Telegram:", error);
    return null;
  }

  return data as TelegramSession | null;
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
    console.error("Erro ao obter utilizador pelo chat_id:", error);
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
    console.error("Erro ao calcular progresso do orçamento:", budgetError ?? transactionsError);
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

  const { data: categoryData, error } = await client
    .from("categories")
    .select("name")
    .eq("user_id", userId)
    .eq("id", categoryId)
    .maybeSingle();

  const category = categoryData as { name: string } | null;

  if (error) {
    console.error("Erro ao obter categoria para alerta de orçamento:", error);
  }

  const categoryName = category?.name ?? "esta categoria";
  const percentage = Math.round(progress.percentage * 100);
  await sendMessageFn(
    chatId,
    `⚠️ Atenção: já usaste ${percentage}% do orçamento de ${categoryName} (${formatCents(progress.spentCents)} de ${formatCents(progress.limitCents)}). Restam ${formatCents(progress.remainingCents)}.`
  );
}

function formatCents(cents: number): string {
  const sign = cents < 0 ? "-" : "";
  const formatted = new Intl.NumberFormat("pt-PT", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Math.abs(cents) / 100);
  return `${sign}€${formatted}`;
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

function getHelpText() {
  return [
    "🤖 Comandos disponíveis",
    "",
    "/saldo — ver saldo dos orçamentos deste mês",
    "/resumo — ver rendimento, despesas e saldo do mês",
    "/ultimas — listar as últimas 5 transações",
    "/cancelar — cancelar a ação pendente",
    "/ajuda — mostrar esta ajuda",
    "",
    'Também podes escrever mensagens como "café 1.50" ou "salário 1500".',
  ].join("\n");
}

function normalizeCommand(text: string) {
  return text.split(/\s+/)[0]?.toLowerCase() ?? text.toLowerCase();
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
  const token = Deno.env.get("TELEGRAM_BOT_TOKEN");
  if (!token) {
    console.error("TELEGRAM_BOT_TOKEN não configurado.");
    return null;
  }

  const response = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    console.error(`Erro da API do Telegram (${method}):`, await response.text());
    return null;
  }

  return await response.json().catch(() => null);
}

async function sendMessage(
  chatId: string,
  text: string,
  replyMarkup?: Record<string, unknown>
) {
  await callTelegram("sendMessage", {
    chat_id: chatId,
    text,
    disable_web_page_preview: true,
    ...(replyMarkup ? { reply_markup: replyMarkup } : {}),
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

