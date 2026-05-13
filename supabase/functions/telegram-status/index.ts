import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Content-Type": "application/json",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const jwt = req.headers.get("Authorization")?.replace("Bearer ", "");
  if (!jwt) {
    return new Response(
      JSON.stringify({
        authorized: false,
        session: null,
      }),
      { headers: corsHeaders }
    );
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: `Bearer ${jwt}` } } }
  );

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser(jwt);

  if (authError || !user) {
    if (authError) {
      console.error("Erro ao validar JWT do Telegram status:", authError);
    }

    return new Response(
      JSON.stringify({
        authorized: false,
        session: null,
      }),
      { status: 401, headers: corsHeaders }
    );
  }

  const { data: sessionData, error } = await supabase
    .from("telegram_sessions")
    .select("id, user_id, telegram_chat_id, telegram_username, is_authorized, digest_enabled, linked_at, created_at")
    .eq("user_id", user.id)
    .maybeSingle();

  if (error) {
    console.error("Erro ao obter estado do Telegram:", error);
  }

  if (!sessionData) {
    return new Response(
      JSON.stringify({
        authorized: false,
        session: null,
      }),
      { headers: corsHeaders }
    );
  }

  return new Response(
    JSON.stringify({
      authorized: sessionData.is_authorized === true,
      session: sessionData,
    }),
    { headers: corsHeaders }
  );
});
