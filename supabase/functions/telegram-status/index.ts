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
        username: null,
        linkedAt: null,
        digestEnabled: false,
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
        username: null,
        linkedAt: null,
        digestEnabled: false,
      }),
      { status: 401, headers: corsHeaders }
    );
  }

  const { data: sessionData, error } = await supabase
    .from("telegram_sessions")
    .select("is_authorized, telegram_username, linked_at, digest_enabled")
    .eq("user_id", user.id)
    .maybeSingle();

  const data = sessionData as {
    is_authorized: boolean;
    telegram_username: string | null;
    linked_at: string | null;
    digest_enabled: boolean | null;
  } | null;

  if (error) {
    console.error("Erro ao obter estado do Telegram:", error);
  }

  if (!data) {
    return new Response(
      JSON.stringify({
        authorized: false,
        username: null,
        linkedAt: null,
        digestEnabled: false,
      }),
      { headers: corsHeaders }
    );
  }

  return new Response(
    JSON.stringify({
      authorized: data.is_authorized,
      username: data.telegram_username,
      linkedAt: data.linked_at,
      digestEnabled: data.digest_enabled ?? false,
    }),
    { headers: corsHeaders }
  );
});
