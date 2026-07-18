import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { 'Content-Type': 'application/json' },
});

const bytesToHex = (bytes: ArrayBuffer) => [...new Uint8Array(bytes)]
  .map((value) => value.toString(16).padStart(2, '0')).join('');

const timingSafeEqual = (a = '', b = '') => {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i += 1) result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return result === 0;
};

const verifySignature = async (rawBody: string, signatureHeader: string, appSecret: string) => {
  if (!signatureHeader.startsWith('sha256=')) return false;
  const key = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(appSecret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
  );
  const digest = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(rawBody));
  return timingSafeEqual(`sha256=${bytesToHex(digest)}`, signatureHeader);
};

const messageBody = (message: Record<string, any>) => {
  if (message.type === 'text') return message.text?.body || '';
  if (message.type === 'button') return message.button?.text || '';
  if (message.type === 'interactive') {
    return message.interactive?.button_reply?.title || message.interactive?.list_reply?.title || '';
  }
  if (message.type === 'image') return message.image?.caption || '[Imagem]';
  if (message.type === 'video') return message.video?.caption || '[Vídeo]';
  if (message.type === 'document') return message.document?.filename || '[Documento]';
  if (message.type === 'audio') return '[Áudio]';
  if (message.type === 'location') return '[Localização]';
  if (message.type === 'contacts') return '[Contato]';
  return `[${message.type || 'Mensagem'}]`;
};

Deno.serve(async (request) => {
  const verifyToken = Deno.env.get('WHATSAPP_VERIFY_TOKEN') || '';
  const appSecret = Deno.env.get('WHATSAPP_APP_SECRET') || '';

  if (request.method === 'GET') {
    const url = new URL(request.url);
    const mode = url.searchParams.get('hub.mode');
    const token = url.searchParams.get('hub.verify_token');
    const challenge = url.searchParams.get('hub.challenge');
    if (mode === 'subscribe' && token && token === verifyToken) {
      return new Response(challenge || '', { status: 200 });
    }
    return new Response('Forbidden', { status: 403 });
  }

  if (request.method !== 'POST') return new Response('Method not allowed', { status: 405 });

  const rawBody = await request.text();
  const signature = request.headers.get('x-hub-signature-256') || '';
  if (!appSecret || !(await verifySignature(rawBody, signature, appSecret))) {
    return json({ error: 'Invalid webhook signature' }, 401);
  }

  const payload = JSON.parse(rawBody);
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  try {
    for (const entry of payload.entry || []) {
      for (const change of entry.changes || []) {
        const value = change.value || {};
        const phoneNumberId = value.metadata?.phone_number_id;
        const profileMap = new Map((value.contacts || []).map((contact: any) => [contact.wa_id, contact.profile?.name || '']));

        for (const status of value.statuses || []) {
          const patch: Record<string, unknown> = { status: status.status };
          const at = new Date(Number(status.timestamp || 0) * 1000).toISOString();
          if (status.status === 'sent') patch.sent_at = at;
          if (status.status === 'delivered') patch.delivered_at = at;
          if (status.status === 'read') patch.read_at = at;
          if (status.status === 'failed') {
            patch.failed_at = at;
            patch.error_code = String(status.errors?.[0]?.code || '');
            patch.error_message = status.errors?.[0]?.title || status.errors?.[0]?.message || 'Falha no envio';
          }
          await supabase.from('whatsapp_messages').update(patch).eq('whatsapp_message_id', status.id);
        }

        for (const message of value.messages || []) {
          const timestamp = new Date(Number(message.timestamp || 0) * 1000).toISOString();
          const { error } = await supabase.rpc('ingest_whatsapp_message', {
            p_phone_number_id: phoneNumberId,
            p_wa_id: message.from,
            p_profile_name: profileMap.get(message.from) || '',
            p_message_id: message.id,
            p_message_type: message.type || 'unknown',
            p_body: messageBody(message),
            p_timestamp: timestamp,
            p_payload: { entry_id: entry.id, change, message },
          });
          if (error) throw error;
        }
      }
    }
    return json({ received: true });
  } catch (error) {
    console.error(error);
    return json({ received: true, processing_error: String(error?.message || error) });
  }
});
