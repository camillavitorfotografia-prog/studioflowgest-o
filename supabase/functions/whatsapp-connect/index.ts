import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { ...corsHeaders, 'Content-Type': 'application/json' },
});

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  const authorization = request.headers.get('Authorization') || '';
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: authorization } } },
  );
  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError || !authData.user) return json({ error: 'Não autenticado' }, 401);

  const token = Deno.env.get('WHATSAPP_ACCESS_TOKEN') || '';
  const phoneNumberId = Deno.env.get('WHATSAPP_PHONE_NUMBER_ID') || '';
  const businessAccountId = Deno.env.get('WHATSAPP_BUSINESS_ACCOUNT_ID') || '';
  const graphVersion = Deno.env.get('WHATSAPP_GRAPH_API_VERSION') || 'v23.0';
  if (!token || !phoneNumberId) {
    return json({ error: 'Configure WHATSAPP_ACCESS_TOKEN e WHATSAPP_PHONE_NUMBER_ID nos Secrets do Supabase.' }, 422);
  }

  const response = await fetch(`https://graph.facebook.com/${graphVersion}/${phoneNumberId}?fields=display_phone_number,verified_name,quality_rating`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const profile = await response.json();
  if (!response.ok) return json({ error: profile?.error?.message || 'Não foi possível validar o número do WhatsApp.' }, 400);

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const connection = {
    user_id: authData.user.id,
    phone_number_id: phoneNumberId,
    business_account_id: businessAccountId || null,
    display_phone_number: profile.display_phone_number || null,
    verified_name: profile.verified_name || null,
    status: 'connected',
    settings: { graph_version: graphVersion, quality_rating: profile.quality_rating || null },
    connected_at: new Date().toISOString(),
    last_error: null,
    updated_at: new Date().toISOString(),
  };
  const { error } = await admin.from('whatsapp_connections').upsert(connection, { onConflict: 'user_id' });
  if (error) return json({ error: error.message }, 400);

  await admin.from('integration_accounts').upsert({
    user_id: authData.user.id,
    provider: 'whatsapp',
    status: 'connected',
    account_name: profile.verified_name || 'WhatsApp Business',
    settings: { phone_number_id: phoneNumberId, display_phone_number: profile.display_phone_number, graph_version: graphVersion },
    connected_at: new Date().toISOString(),
    last_sync_at: new Date().toISOString(),
    last_error: null,
  }, { onConflict: 'user_id,provider' });

  return json({ connected: true, profile, webhookPath: '/functions/v1/whatsapp-webhook' });
});
