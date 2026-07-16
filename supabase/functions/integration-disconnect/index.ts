import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders, errorMessage, json } from '../_shared/http.ts';
import { decryptSecret } from '../_shared/google.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const authorization = req.headers.get('Authorization');
    if (!authorization) return json({ error: 'Sessão não informada.' }, 401);
    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const { data: userData, error: userError } = await admin.auth.getUser(authorization.replace(/^Bearer\s+/i, ''));
    if (userError || !userData.user) return json({ error: 'Sessão inválida.' }, 401);

    const { data: tokenRow } = await admin.from('integration_tokens').select('*').eq('user_id', userData.user.id).eq('provider', 'google_workspace').maybeSingle();
    if (tokenRow?.access_token_encrypted) {
      const token = await decryptSecret(tokenRow.access_token_encrypted).catch(() => null);
      if (token) await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(token)}`, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }).catch(() => null);
    }

    await admin.from('integration_tokens').delete().eq('user_id', userData.user.id).eq('provider', 'google_workspace');
    await admin.from('integration_accounts').delete().eq('user_id', userData.user.id).in('provider', ['google_calendar', 'google_meet', 'gmail', 'google_drive']);
    await admin.from('integration_logs').insert({ user_id: userData.user.id, provider: 'google_workspace', action: 'disconnected', message: 'Google Workspace desconectado.' });
    return json({ ok: true });
  } catch (error) {
    return json({ error: errorMessage(error) }, 500);
  }
});
