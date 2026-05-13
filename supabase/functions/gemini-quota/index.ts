import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Content-Type": "application/json",
};

const LIMITS = {
  model: {
    name: "gemini-3.1-flash-lite",
    rpm: 15,
    rpd: 500,
    tpm: 250_000,
  },
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: corsHeaders });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return jsonResponse({ ok: true });
  }

  if (req.method !== "GET") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    return jsonResponse({ error: "Missing environment configuration" }, 500);
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    return jsonResponse({ error: "Unauthorized" }, 401);
  }

  const jwt = authHeader.replace(/^Bearer\s+/i, "").trim();
  if (!jwt) {
    return jsonResponse({ error: "Unauthorized" }, 401);
  }

  const authClient = createClient(supabaseUrl, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const {
    data: { user },
    error: authError,
  } = await authClient.auth.getUser(jwt);

  if (authError || !user) {
    return jsonResponse({ error: "Unauthorized" }, 401);
  }

  const userId = user.id;

  const dbClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: rows, error: queryError } = await dbClient
    .from("gemini_usage")
    .select("date, tokens_in, tokens_out")
    .eq("user_id", userId)
    .gte("date", new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10))
    .order("date", { ascending: false });

  if (queryError) {
    return jsonResponse({ error: "Failed to query usage" }, 500);
  }

  const byDate = new Map<string, { requests: number; tokens_in: number; tokens_out: number }>();

  for (const row of rows ?? []) {
    const dateStr = String(row.date);
    const existing = byDate.get(dateStr) ?? { requests: 0, tokens_in: 0, tokens_out: 0 };
    existing.requests += 1;
    existing.tokens_in += Number(row.tokens_in) || 0;
    existing.tokens_out += Number(row.tokens_out) || 0;
    byDate.set(dateStr, existing);
  }

  const todayStr = new Date().toISOString().slice(0, 10);
  const todayData = byDate.get(todayStr) ?? { requests: 0, tokens_in: 0, tokens_out: 0 };

  const last7days = Array.from(byDate.entries())
    .sort(([a], [b]) => b.localeCompare(a))
    .slice(0, 7)
    .map(([date, data]) => ({
      date,
      requests: data.requests,
      tokens: data.tokens_in + data.tokens_out,
    }));

  return jsonResponse({
    today: {
      date: todayStr,
      requests: todayData.requests,
      tokens_in: todayData.tokens_in,
      tokens_out: todayData.tokens_out,
    },
    last7days,
    limits: LIMITS,
  });
});
