import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders, errorMessage, json } from '../_shared/http.ts';
import { exchangeCode, encryptSecret, googleScopes } from '../_shared/google.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const authorization = req.headers.get('Authorization');
    if (!authorization) return json({ error: 'Sessão não informada.' }, 401);

    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const { data: userData, error: userError } = await admin.auth.getUser(authorization.replace(/^Bearer\s+/i, ''));
    if (userError || !userData.user) return json({ error: 'Sessão inválida.' }, 401);

    const body = await req.json().catch(() => ({}));
    const code = String(body.code || '');
    const state = String(body.state || '');
    const oauthError = String(body.error || '');
    if (!state) return json({ error: 'Estado OAuth ausente.' }, 400);

    const { data: stateRow, error: stateError } = await admin
      .from('integration_oauth_states')
      .select('*')
      .eq('id', state)
      .eq('user_id', userData.user.id)
      .is('used_at', null)
      .gt('expires_at', new Date().toISOString())
      .single();
    if (stateError || !stateRow) return json({ error: 'Solicitação OAuth expirada ou inválida.' }, 400);

    await admin.from('integration_oauth_states').update({ used_at: new Date().toISOString() }).eq('id', state);
    if (oauthError) return json({ error: `Autorização cancelada: ${oauthError}` }, 400);
    if (!code) return json({ error: 'Código OAuth ausente.' }, 400);

    const tokenData = await exchangeCode(code);
    const userInfoResponse = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    });
    const userInfo = await userInfoResponse.json();
    if (!userInfoResponse.ok) throw new Error('Não foi possível identificar a conta Google.');

    const expiresAt = new Date(Date.now() + Number(tokenData.expires_in || 3600) * 1000).toISOString();
    const encryptedAccess = await encryptSecret(tokenData.access_token);
    const encryptedRefresh = await encryptSecret(tokenData.refresh_token);
    const { data: previous } = await admin.from('integration_tokens')
      .select('refresh_token_encrypted')
      .eq('user_id', userData.user.id)
      .eq('provider', 'google_workspace')
      .maybeSingle();

    const { error: tokenError } = await admin.from('integration_tokens').upsert({
      user_id: userData.user.id,
      provider: 'google_workspace',
      access_token_encrypted: encryptedAccess,
      refresh_token_encrypted: encryptedRefresh || previous?.refresh_token_encrypted || null,
      token_type: tokenData.token_type || 'Bearer',
      scopes: String(tokenData.scope || googleScopes.join(' ')).split(' ').filter(Boolean),
      expires_at: expiresAt,
      account_email: userInfo.email || null,
      account_name: userInfo.name || null,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id,provider' });
    if (tokenError) throw tokenError;

    const providers = ['google_calendar', 'google_meet', 'gmail', 'google_drive'];
    const rows = providers.map((provider) => ({
      user_id: userData.user.id,
      provider,
      status: 'connected',
      account_email: userInfo.email || null,
      account_name: userInfo.name || null,
      scopes: googleScopes,
      connected_at: new Date().toISOString(),
      expires_at: expiresAt,
      last_error: null,
      settings: {},
    }));
    const { error: accountError } = await admin.from('integration_accounts').upsert(rows, { onConflict: 'user_id,provider' });
    if (accountError) throw accountError;

    await admin.from('integration_logs').insert({
      user_id: userData.user.id,
      provider: 'google_workspace',
      action: 'oauth_connected',
      message: 'Google Workspace conectado com sucesso.',
      metadata: { email: userInfo.email },
    });

    return json({ ok: true, accountEmail: userInfo.email || null });
  } catch (error) {
    return json({ error: errorMessage(error) }, 500);
  }
});
