import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const TELEGRAM_TOKEN = Deno.env.get("TELEGRAM_BOT_TOKEN") ?? "8615352134:AAFGcEEBzf5BHxil2KvY1yYDUaYRzkwwFJU";

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

function getPeriodEnd(referenceDate: Date, startDay: number): Date {
  const day = Math.max(1, Math.min(28, startDay));
  const year = referenceDate.getUTCFullYear();
  const month = referenceDate.getUTCMonth();
  const dateOfMonth = referenceDate.getUTCDate();

  let nextPeriodMonth: number;
  let nextPeriodYear: number;

  if (day === 1) {
    // Calendar month: period ends last day of current month
    nextPeriodMonth = month + 1;
    nextPeriodYear = year;
  } else if (dateOfMonth >= day) {
    // We're past the start of this period, next period starts next calendar month
    nextPeriodMonth = month + 1;
    nextPeriodYear = year;
  } else {
    // We're before the start day, current period started last month, ends this month
    nextPeriodMonth = month;
    nextPeriodYear = year;
  }

  // Period end is the day before next period start
  const nextStart = new Date(Date.UTC(nextPeriodYear, nextPeriodMonth, day));
  nextStart.setUTCDate(nextStart.getUTCDate() - 1);
  return nextStart;
}

function getDaysUntilPeriodEnd(referenceDate: Date, startDay: number): number {
  const periodEnd = getPeriodEnd(referenceDate, startDay);
  const diffMs = periodEnd.getTime() - referenceDate.getTime();
  return Math.ceil(diffMs / (1000 * 60 * 60 * 24));
}

function formatDate(date: Date): string {
  const dd = String(date.getUTCDate()).padStart(2, "0");
  const mm = String(date.getUTCMonth() + 1).padStart(2, "0");
  return `${dd}/${mm}`;
}

async function sendTelegramMessage(chatId: string, text: string) {
  const url = `https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: "Markdown" }),
  });

  if (!res.ok) {
    console.error(`Telegram send failed: ${res.status}`, await res.text());
  }
}

Deno.serve(async (_req: Request) => {
  try {
    const today = new Date();

    // Get all users who want reminders
    const { data: settings, error: settingsError } = await supabase
      .from("user_settings")
      .select("user_id, month_start_day, reminder_days_before")
      .gt("reminder_days_before", 0);

    if (settingsError) {
      console.error("Error fetching user settings:", settingsError);
      return new Response(JSON.stringify({ error: settingsError.message }), { status: 500 });
    }

    if (!settings || settings.length === 0) {
      return new Response(JSON.stringify({ message: "No users with reminders enabled" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    let sent = 0;

    for (const setting of settings) {
      const daysRemaining = getDaysUntilPeriodEnd(today, setting.month_start_day);

      if (daysRemaining > setting.reminder_days_before || daysRemaining < 0) {
        continue;
      }

      // Find the user's Telegram session
      const { data: session } = await supabase
        .from("telegram_sessions")
        .select("chat_id")
        .eq("user_id", setting.user_id)
        .maybeSingle();

      if (!session?.chat_id) {
        continue;
      }

      const periodEnd = getPeriodEnd(today, setting.month_start_day);
      const endFormatted = formatDate(periodEnd);

      const message =
        daysRemaining === 0
          ? `⏰ *Último dia do período* (termina hoje, ${endFormatted}).\nTens tudo registado? /ultimas para verificar.`
          : daysRemaining === 1
            ? `⏰ *Falta 1 dia* para o fim do período (termina a ${endFormatted}).\nTens tudo registado? /ultimas para verificar.`
            : `⏰ Faltam *${daysRemaining} dias* para o fim do período (termina a ${endFormatted}).\nTens tudo registado? /ultimas para verificar.`;

      await sendTelegramMessage(session.chat_id, message);
      sent++;
    }

    return new Response(
      JSON.stringify({ message: `Reminders sent: ${sent}` }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("period-reminder error:", err);
    return new Response(JSON.stringify({ error: String(err) }), { status: 500 });
  }
});
