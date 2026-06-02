import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};

function log(
  op: string,
  status: string,
  userId: string | null,
  detail?: Record<string, unknown>
) {
  console.log(
    JSON.stringify({
      ts: new Date().toISOString(),
      fn: "confirm-payslip",
      op,
      status,
      user_id: userId,
      ...(detail ? { detail } : {}),
    })
  );
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: corsHeaders });
}

interface PayslipImport {
  id: string;
  user_id: string;
  month: string;
  gross_salary_cents: number;
  irs_withheld_cents: number;
  ss_withheld_cents: number;
  other_deductions_cents: number;
  net_salary_cents: number;
  employer_name: string | null;
  status: string;
}

// Last working day of a month (Mon–Fri)
function lastWorkingDay(monthStr: string): string {
  const [year, month] = monthStr.split("-").map(Number);
  const lastDay = new Date(year, month, 0);
  while (lastDay.getDay() === 0 || lastDay.getDay() === 6) {
    lastDay.setDate(lastDay.getDate() - 1);
  }
  return lastDay.toISOString().split("T")[0];
}

const DEDUCTION_CATEGORIES = [
  { name: "IRS Retido", emoji: "🏛️", color: "#E03E3E", type: "expense" },
  {
    name: "Segurança Social",
    emoji: "🛡️",
    color: "#0F7B6C",
    type: "expense",
  },
  { name: "Outros Descontos", emoji: "📋", color: "#6B7280", type: "expense" },
] as const;

async function ensureCategory(
  supabase: ReturnType<typeof createClient>,
  userId: string,
  name: string,
  emoji: string,
  color: string,
  type: string
): Promise<string> {
  const { data: existing } = await supabase
    .from("categories")
    .select("id")
    .eq("user_id", userId)
    .eq("name", name)
    .maybeSingle();

  if (existing) return existing.id as string;

  const { data: maxOrder } = await supabase
    .from("categories")
    .select("sort_order")
    .eq("user_id", userId)
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();

  const nextOrder = ((maxOrder?.sort_order as number) ?? 0) + 1;

  const { data: created, error } = await supabase
    .from("categories")
    .insert({
      user_id: userId,
      name,
      emoji,
      color,
      type,
      sort_order: nextOrder,
      is_default: false,
    })
    .select("id")
    .single();

  if (error) throw new Error(`Failed to create category "${name}": ${error.message}`);
  return created.id as string;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  log("confirm", "start", null);

  const jwt = req.headers.get("Authorization")?.replace("Bearer ", "");
  if (!jwt) {
    log("confirm", "error", null, { reason: "missing_jwt" });
    return jsonResponse({ error: "Unauthorized" }, 401);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

  const authClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: `Bearer ${jwt}` } },
  });

  const {
    data: { user },
    error: authError,
  } = await authClient.auth.getUser();

  if (authError || !user) {
    log("confirm", "error", null, { reason: "jwt_invalid" });
    return jsonResponse({ error: "Unauthorized" }, 401);
  }

  const userId = user.id;
  log("confirm", "start", userId);

  let body: { payslip_import_id?: string };
  try {
    body = (await req.json()) as { payslip_import_id?: string };
  } catch {
    return jsonResponse({ error: "Invalid JSON body" }, 400);
  }

  const payslipImportId = body.payslip_import_id;
  if (!payslipImportId) {
    return jsonResponse({ error: "payslip_import_id is required" }, 400);
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey);

  // Fetch the payslip import and verify ownership
  const { data: importData, error: importError } = await supabase
    .from("payslip_imports")
    .select("*")
    .eq("id", payslipImportId)
    .eq("user_id", userId)
    .maybeSingle();

  const payslip = importData as PayslipImport | null;

  if (importError || !payslip) {
    log("confirm", "error", userId, {
      reason: "import_not_found",
      id: payslipImportId,
    });
    return jsonResponse({ error: "Payslip import not found" }, 404);
  }

  if (payslip.status === "done") {
    log("confirm", "error", userId, { reason: "already_confirmed" });
    return jsonResponse({ error: "Payslip already confirmed" }, 409);
  }

  // Ensure deduction categories exist
  const salaryCategory = await findOrCreateSalaryCategory(supabase, userId);

  const categoryIds: Record<string, string> = {
    salary: salaryCategory,
  };

  for (const cat of DEDUCTION_CATEGORIES) {
    categoryIds[cat.name] = await ensureCategory(
      supabase,
      userId,
      cat.name,
      cat.emoji,
      cat.color,
      cat.type
    );
  }

  const txDate = lastWorkingDay(payslip.month);
  const monthLabel = formatMonth(payslip.month);

  // Build transaction list
  const transactions: Array<{
    user_id: string;
    category_id: string;
    amount_cents: number;
    type: string;
    note: string;
    date: string;
    payslip_import_id: string;
  }> = [
    {
      user_id: userId,
      category_id: categoryIds.salary,
      amount_cents: payslip.gross_salary_cents,
      type: "income",
      note: `Salário bruto${payslip.employer_name ? ` — ${payslip.employer_name}` : ""} — ${monthLabel}`,
      date: txDate,
      payslip_import_id: payslip.id,
    },
    {
      user_id: userId,
      category_id: categoryIds["IRS Retido"],
      amount_cents: payslip.irs_withheld_cents,
      type: "expense",
      note: `Retenção IRS — ${monthLabel}`,
      date: txDate,
      payslip_import_id: payslip.id,
    },
    {
      user_id: userId,
      category_id: categoryIds["Segurança Social"],
      amount_cents: payslip.ss_withheld_cents,
      type: "expense",
      note: `Segurança Social (11%) — ${monthLabel}`,
      date: txDate,
      payslip_import_id: payslip.id,
    },
  ];

  if (payslip.other_deductions_cents > 0) {
    transactions.push({
      user_id: userId,
      category_id: categoryIds["Outros Descontos"],
      amount_cents: payslip.other_deductions_cents,
      type: "expense",
      note: `Outros descontos — ${monthLabel}`,
      date: txDate,
      payslip_import_id: payslip.id,
    });
  }

  // Insert all transactions
  const { data: createdTx, error: txError } = await supabase
    .from("transactions")
    .insert(transactions)
    .select("id, category_id, amount_cents, type, note, date");

  if (txError) {
    log("confirm", "error", userId, {
      reason: "tx_insert_failed",
      error: txError.message,
    });
    return jsonResponse({ error: "Failed to create transactions" }, 500);
  }

  // Mark payslip as done
  await supabase
    .from("payslip_imports")
    .update({ status: "done" })
    .eq("id", payslip.id);

  // Upsert monthly plan with net salary as expected income
  const monthDate = `${payslip.month}-01`;
  try {
    const { data: existingPlan } = await supabase
      .from("monthly_plans")
      .select("id, expected_income_cents")
      .eq("user_id", userId)
      .eq("month", monthDate)
      .maybeSingle();

    if (existingPlan) {
      await supabase
        .from("monthly_plans")
        .update({
          expected_income_cents: payslip.net_salary_cents,
        })
        .eq("id", existingPlan.id);
    } else {
      await supabase.from("monthly_plans").insert({
        user_id: userId,
        month: monthDate,
        expected_income_cents: payslip.net_salary_cents,
      });
    }

    log("confirm", "monthly_plan_updated", userId, {
      month: monthDate,
      expected_income_cents: payslip.net_salary_cents,
    });
  } catch (planError) {
    log("confirm", "monthly_plan_error", userId, {
      error: String(planError),
    });
  }

  // Upsert meal card budget if meal_card_cents > 0
  if (payslip.meal_card_cents && payslip.meal_card_cents > 0) {
    try {
      const { data: existingMcBudget } = await supabase
        .from("meal_card_budgets")
        .select("id")
        .eq("user_id", userId)
        .eq("month", monthDate)
        .maybeSingle();

      if (existingMcBudget) {
        await supabase
          .from("meal_card_budgets")
          .update({ allowance_cents: payslip.meal_card_cents })
          .eq("id", existingMcBudget.id);
      } else {
        await supabase.from("meal_card_budgets").insert({
          user_id: userId,
          month: monthDate,
          allowance_cents: payslip.meal_card_cents,
        });
      }

      log("confirm", "meal_card_budget_upserted", userId, {
        month: monthDate,
        allowance_cents: payslip.meal_card_cents,
      });
    } catch (mcError) {
      log("confirm", "meal_card_budget_error", userId, {
        error: String(mcError),
      });
    }
  }

  log("confirm", "success", userId, {
    transaction_count: createdTx?.length ?? 0,
    payslip_import_id: payslip.id,
  });

  return jsonResponse({ transactions: createdTx });
});

async function findOrCreateSalaryCategory(
  supabase: ReturnType<typeof createClient>,
  userId: string
): Promise<string> {
  // Look for existing salary/income category
  const { data: existing } = await supabase
    .from("categories")
    .select("id")
    .eq("user_id", userId)
    .eq("type", "income")
    .ilike("name", "%sal%rio%")
    .maybeSingle();

  if (existing) return existing.id as string;

  // Try any income category
  const { data: anyIncome } = await supabase
    .from("categories")
    .select("id")
    .eq("user_id", userId)
    .eq("type", "income")
    .limit(1)
    .maybeSingle();

  if (anyIncome) return anyIncome.id as string;

  // Create one
  return ensureCategory(supabase, userId, "Salário", "💰", "#0F7B6C", "income");
}

function formatMonth(monthStr: string): string {
  const months = [
    "janeiro", "fevereiro", "março", "abril", "maio", "junho",
    "julho", "agosto", "setembro", "outubro", "novembro", "dezembro",
  ];
  const [year, month] = monthStr.split("-").map(Number);
  return `${months[month - 1]} ${year}`;
}
