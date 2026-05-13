import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

interface DigestRecipient {
  user_id: string;
  telegram_chat_id: number;
  today_expense_cents: number;
  today_transaction_count: number;
  month_income_cents: number;
  month_expense_cents: number;
}

Deno.serve(async (req: Request) => {
  // Only allow POST (called by pg_cron via Supabase scheduled function)
  if (req.method !== "POST") {
    return new Response("OK");
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  const botToken = Deno.env.get("TELEGRAM_BOT_TOKEN");
  if (!botToken) {
    console.error("TELEGRAM_BOT_TOKEN não configurado.");
    return new Response("Missing config", { status: 500 });
  }

  const { data, error } = await supabase.rpc("get_digest_recipients");

  if (error) {
    console.error("Erro ao obter destinatários do digest:", error);
    return new Response("Error", { status: 500 });
  }

  const recipients = (data ?? []) as DigestRecipient[];

  const today = new Date();
  const dateLabel = today.toLocaleDateString("pt-PT", {
    day: "2-digit",
    month: "long",
    timeZone: "Europe/Lisbon",
  });

  const monthLabel = today.toLocaleDateString("pt-PT", {
    month: "long",
    timeZone: "Europe/Lisbon",
  });
  const capitalizedMonth = monthLabel.charAt(0).toUpperCase() + monthLabel.slice(1);

  const results = await Promise.allSettled(
    recipients.map(async (recipient) => {
      const net = recipient.month_income_cents - recipient.month_expense_cents;
      const text = [
        `📊 Resumo de hoje (${dateLabel})`,
        "",
        `💸 Despesas hoje: ${formatCents(recipient.today_expense_cents)} (${recipient.today_transaction_count} transaç${recipient.today_transaction_count === 1 ? "ão" : "ões"})`,
        `📈 Saldo de ${capitalizedMonth}: ${formatCents(net)}`,
        "",
        "Ver detalhe na app Fluxo →",
      ].join("\n");

      await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chat_id: recipient.telegram_chat_id, text }),
      });
    })
  );

  const failed = results.filter((r) => r.status === "rejected").length;
  console.log(`Digest enviado: ${recipients.length - failed} ok, ${failed} falhas`);

  return new Response(JSON.stringify({ sent: recipients.length - failed, failed }), {
    headers: { "Content-Type": "application/json" },
  });
});

function formatCents(cents: number): string {
  const sign = cents < 0 ? "-" : "";
  const formatted = new Intl.NumberFormat("pt-PT", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Math.abs(cents) / 100);
  return `${sign}€${formatted}`;
}
