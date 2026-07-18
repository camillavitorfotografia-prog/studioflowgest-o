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
  const userClient = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: authorization } },
  });
  const { data: authData, error: authError } = await userClient.auth.getUser();
  if (authError || !authData.user) return json({ error: 'Não autenticado' }, 401);

  const { to, text, conversationId, contactId } = await request.json();
  if (!to || !text) return json({ error: 'Informe destinatário e mensagem.' }, 422);

  const token = Deno.env.get('WHATSAPP_ACCESS_TOKEN') || '';
  const phoneNumberId = Deno.env.get('WHATSAPP_PHONE_NUMBER_ID') || '';
  const graphVersion = Deno.env.get('WHATSAPP_GRAPH_API_VERSION') || 'v23.0';
  if (!token || !phoneNumberId) return json({ error: 'Credenciais do WhatsApp não configuradas.' }, 422);

  const response = await fetch(`https://graph.facebook.com/${graphVersion}/${phoneNumberId}/messages`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ messaging_product: 'whatsapp', recipient_type: 'individual', to: String(to).replace(/\D/g, ''), type: 'text', text: { preview_url: false, body: text } }),
  });
  const result = await response.json();
  if (!response.ok) return json({ error: result?.error?.message || 'Falha ao enviar mensagem.', details: result }, 400);

  const messageId = result.messages?.[0]?.id;
  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  if (conversationId && contactId && messageId) {
    await admin.from('whatsapp_messages').insert({
      user_id: authData.user.id,
      conversation_id: conversationId,
      contact_id: contactId,
      whatsapp_message_id: messageId,
      direction: 'outbound',
      message_type: 'text',
      body: text,
      status: 'sent',
      sent_at: new Date().toISOString(),
      payload: result,
    });
    await admin.from('whatsapp_conversations').update({
      last_message_preview: text.slice(0, 240),
      last_message_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }).eq('id', conversationId).eq('user_id', authData.user.id);
  }

  return json({ sent: true, messageId, result });
});
