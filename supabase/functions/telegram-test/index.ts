import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'jsr:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json',
};

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: corsHeaders,
    });
  }

  const jwt = req.headers.get('Authorization')?.replace('Bearer ', '');
  if (!jwt) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: corsHeaders,
    });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  const botToken = Deno.env.get('TELEGRAM_BOT_TOKEN');

  if (!supabaseUrl || !serviceRoleKey || !anonKey || !botToken) {
    return new Response(JSON.stringify({ error: 'Missing environment configuration' }), {
      status: 500,
      headers: corsHeaders,
    });
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey);
  const authClient = createClient(supabaseUrl, anonKey, {
    global: {
      headers: { Authorization: `Bearer ${jwt}` },
    },
  });

  const {
    data: { user },
    error: userError,
  } = await authClient.auth.getUser();

  if (userError || !user) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: corsHeaders,
    });
  }

  const { data: session, error: sessionError } = await supabase
    .from('telegram_sessions')
    .select('telegram_chat_id')
    .eq('user_id', user.id)
    .single();

  if (sessionError || !session) {
    return new Response(JSON.stringify({ error: 'Not connected' }), {
      status: 404,
      headers: corsHeaders,
    });
  }

  const telegramResponse = await fetch(
    `https://api.telegram.org/bot${botToken}/sendMessage`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: session.telegram_chat_id,
        text: '✅ Fluxo está ligado! Podes enviar despesas como:\n\n"café 1.50"\n"uber 8.30"\n\n/ajuda para ver todos os comandos.',
      }),
    }
  );

  if (!telegramResponse.ok) {
    const telegramError = await telegramResponse.text();

    return new Response(
      JSON.stringify({
        error: 'Failed to send message',
        details: telegramError,
      }),
      {
        status: 502,
        headers: corsHeaders,
      }
    );
  }

  return new Response(JSON.stringify({ ok: true }), {
    headers: corsHeaders,
  });
});
