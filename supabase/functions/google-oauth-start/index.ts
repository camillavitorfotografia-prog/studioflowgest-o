import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders, errorMessage, json } from '../_shared/http.ts';
import { googleConfig, googleScopes } from '../_shared/google.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const authorization = req.headers.get('Authorization');
    if (!authorization) return json({ error: 'Sessão não informada.' }, 401);

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const admin = createClient(supabaseUrl, serviceKey);
    const token = authorization.replace(/^Bearer\s+/i, '');
    const { data: userData, error: userError } = await admin.auth.getUser(token);
    if (userError || !userData.user) return json({ error: 'Sessão inválida.' }, 401);

    const body = await req.json().catch(() => ({}));
    const provider = String(body.provider || 'google_workspace');
    const returnUrl = String(body.returnUrl || '');
    if (!/^https?:\/\//i.test(returnUrl)) return json({ error: 'URL de retorno inválida.' }, 400);

    const { clientId, redirectUri } = googleConfig();
    const state = crypto.randomUUID();
    const { error: stateError } = await admin.from('integration_oauth_states').insert({
      id: state,
      user_id: userData.user.id,
      provider,
      return_url: returnUrl,
    });
    if (stateError) throw stateError;

    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: googleScopes.join(' '),
      access_type: 'offline',
      prompt: 'consent',
      include_granted_scopes: 'true',
      state,
    });

    return json({ authorizationUrl: `https://accounts.google.com/o/oauth2/v2/auth?${params}` });
  } catch (error) {
    return json({ error: errorMessage(error) }, 500);
  }
});
