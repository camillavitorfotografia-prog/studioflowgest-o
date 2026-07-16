import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders, errorMessage, json } from '../_shared/http.ts';
import { decryptSecret, encryptSecret, refreshAccessToken } from '../_shared/google.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const authorization = req.headers.get('Authorization');
    if (!authorization) return json({ error: 'Sessão não informada.' }, 401);
    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const { data: userData, error: userError } = await admin.auth.getUser(authorization.replace(/^Bearer\s+/i, ''));
    if (userError || !userData.user) return json({ error: 'Sessão inválida.' }, 401);

    const body = await req.json().catch(() => ({}));
    const provider = String(body.provider || 'google_calendar');
    const { data: tokenRow, error: tokenError } = await admin
      .from('integration_tokens')
      .select('*')
      .eq('user_id', userData.user.id)
      .eq('provider', 'google_workspace')
      .single();
    if (tokenError || !tokenRow) throw new Error('Google Workspace ainda não está conectado.');

    let accessToken = await decryptSecret(tokenRow.access_token_encrypted);
    const expiresSoon = !tokenRow.expires_at || new Date(tokenRow.expires_at).getTime() < Date.now() + 60_000;
    if (expiresSoon) {
      const refreshToken = await decryptSecret(tokenRow.refresh_token_encrypted);
      if (!refreshToken) throw new Error('A conexão Google precisa ser renovada.');
      const refreshed = await refreshAccessToken(refreshToken);
      accessToken = refreshed.access_token;
      const expiresAt = new Date(Date.now() + Number(refreshed.expires_in || 3600) * 1000).toISOString();
      await admin.from('integration_tokens').update({
        access_token_encrypted: await encryptSecret(accessToken),
        expires_at: expiresAt,
        updated_at: new Date().toISOString(),
      }).eq('id', tokenRow.id);
    }

    const checks: Record<string, string> = {
      google_calendar: 'https://www.googleapis.com/calendar/v3/users/me/calendarList?maxResults=1',
      google_meet: 'https://www.googleapis.com/calendar/v3/users/me/calendarList?maxResults=1',
      gmail: 'https://gmail.googleapis.com/gmail/v1/users/me/profile',
      google_drive: 'https://www.googleapis.com/drive/v3/about?fields=user',
    };
    const endpoint = checks[provider];
    if (!endpoint) throw new Error('Provedor de sincronização não reconhecido.');
    const check = await fetch(endpoint, { headers: { Authorization: `Bearer ${accessToken}` } });
    if (!check.ok) throw new Error(`Google respondeu com status ${check.status}.`);

    const now = new Date().toISOString();
    await admin.from('integration_accounts').update({ status: 'connected', last_sync_at: now, last_error: null }).eq('user_id', userData.user.id).eq('provider', provider);
    await admin.from('integration_logs').insert({ user_id: userData.user.id, provider, action: 'manual_sync', message: 'Conexão verificada com sucesso.' });
    return json({ ok: true, syncedAt: now });
  } catch (error) {
    return json({ error: errorMessage(error) }, 500);
  }
});
