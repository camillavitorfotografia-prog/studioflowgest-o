import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders, errorMessage, json } from '../_shared/http.ts';
import { decryptSecret, encryptSecret, refreshAccessToken } from '../_shared/google.ts';

type CalendarItem = {
  localId: string;
  title: string;
  description?: string;
  date: string;
  time?: string;
  endTime?: string;
  allDay?: boolean;
  location?: string;
  status?: string;
  createMeet?: boolean;
  metadata?: Record<string, unknown>;
};

const textEncoder = new TextEncoder();
const cancelledStatuses = new Set(['cancelado', 'cancelada', 'cancelled', 'arquivado', 'arquivada']);

const checksum = async (value: unknown) => {
  const digest = await crypto.subtle.digest('SHA-256', textEncoder.encode(JSON.stringify(value)));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
};

const addHour = (time = '09:00') => {
  const [hour, minute] = time.split(':').map(Number);
  const total = (hour || 0) * 60 + (minute || 0) + 60;
  return `${String(Math.floor(total / 60) % 24).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
};

const addDay = (date: string) => {
  const parsed = new Date(`${date}T12:00:00Z`);
  parsed.setUTCDate(parsed.getUTCDate() + 1);
  return parsed.toISOString().slice(0, 10);
};

const buildGoogleEvent = (item: CalendarItem) => {
  const base: Record<string, unknown> = {
    summary: item.title || 'Evento StudioFlow',
    description: item.description || 'Evento sincronizado pelo StudioFlow.',
    location: item.location || undefined,
    extendedProperties: {
      private: {
        studioflowLocalId: item.localId,
        studioflowResourceType: 'project',
      },
    },
  };

  if (item.allDay || !item.time) {
    base.start = { date: item.date };
    base.end = { date: addDay(item.date) };
  } else {
    base.start = { dateTime: `${item.date}T${item.time}:00`, timeZone: 'America/Bahia' };
    base.end = { dateTime: `${item.date}T${item.endTime || addHour(item.time)}:00`, timeZone: 'America/Bahia' };
  }

  if (item.createMeet) {
    base.conferenceData = {
      createRequest: {
        requestId: `studioflow-${item.localId}-${Date.now()}`,
        conferenceSolutionKey: { type: 'hangoutsMeet' },
      },
    };
  }

  return base;
};

const googleRequest = async (url: string, accessToken: string, init: RequestInit = {}) => {
  const response = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      ...(init.headers || {}),
    },
  });
  const payload = response.status === 204 ? null : await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(payload?.error?.message || payload?.error_description || `Google respondeu com status ${response.status}.`);
  }
  return payload;
};

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
    const action = String(body.action || 'health_check');
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

    if (action === 'sync_projects' && (provider === 'google_calendar' || provider === 'google_meet')) {
      const items = Array.isArray(body.items) ? body.items.slice(0, 250) as CalendarItem[] : [];
      const force = Boolean(body.force);
      const result = { created: 0, updated: 0, skipped: 0, deleted: 0, failed: 0, total: items.length, errors: [] as string[] };

      for (const item of items) {
        try {
          if (!item?.localId || !item?.date) {
            result.skipped += 1;
            continue;
          }

          const { data: link } = await admin
            .from('integration_resource_links')
            .select('*')
            .eq('user_id', userData.user.id)
            .eq('provider', 'google_calendar')
            .eq('resource_type', 'project')
            .eq('local_id', item.localId)
            .maybeSingle();

          if (cancelledStatuses.has(String(item.status || '').toLowerCase())) {
            if (link?.external_id) {
              await googleRequest(`https://www.googleapis.com/calendar/v3/calendars/primary/events/${encodeURIComponent(link.external_id)}`, accessToken, { method: 'DELETE' });
              await admin.from('integration_resource_links').delete().eq('id', link.id);
              result.deleted += 1;
            } else {
              result.skipped += 1;
            }
            continue;
          }

          const eventPayload = buildGoogleEvent(item);
          const currentChecksum = await checksum(eventPayload);
          if (!force && link?.checksum === currentChecksum && link?.external_id) {
            result.skipped += 1;
            continue;
          }

          let event;
          if (link?.external_id) {
            event = await googleRequest(
              `https://www.googleapis.com/calendar/v3/calendars/primary/events/${encodeURIComponent(link.external_id)}?conferenceDataVersion=1&sendUpdates=none`,
              accessToken,
              { method: 'PATCH', body: JSON.stringify(eventPayload) },
            );
            result.updated += 1;
          } else {
            event = await googleRequest(
              'https://www.googleapis.com/calendar/v3/calendars/primary/events?conferenceDataVersion=1&sendUpdates=none',
              accessToken,
              { method: 'POST', body: JSON.stringify(eventPayload) },
            );
            result.created += 1;
          }

          await admin.from('integration_resource_links').upsert({
            user_id: userData.user.id,
            provider: 'google_calendar',
            resource_type: 'project',
            local_id: item.localId,
            external_id: event.id,
            external_url: event.htmlLink || null,
            checksum: currentChecksum,
            metadata: {
              ...(item.metadata || {}),
              meetLink: event.hangoutLink || null,
              conferenceData: event.conferenceData || null,
            },
            last_synced_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          }, { onConflict: 'user_id,provider,resource_type,local_id' });
        } catch (itemError) {
          result.failed += 1;
          result.errors.push(`${item?.title || item?.localId || 'Evento'}: ${errorMessage(itemError)}`);
        }
      }

      const now = new Date().toISOString();
      const message = `${result.created} criado(s), ${result.updated} atualizado(s), ${result.skipped} sem alteração, ${result.deleted} removido(s).`;
      await admin.from('integration_accounts').update({ status: result.failed ? 'error' : 'connected', last_sync_at: now, last_error: result.failed ? result.errors.slice(0, 3).join(' | ') : null }).eq('user_id', userData.user.id).in('provider', ['google_calendar', 'google_meet']);
      await admin.from('integration_logs').insert({ user_id: userData.user.id, provider: 'google_calendar', level: result.failed ? 'warning' : 'info', action: 'projects_sync', message, metadata: result });
      return json({ ok: result.failed === 0, syncedAt: now, ...result, message }, result.failed === result.total && result.total > 0 ? 500 : 200);
    }

    const checks: Record<string, string> = {
      google_calendar: 'https://www.googleapis.com/calendar/v3/users/me/calendarList?maxResults=1',
      google_meet: 'https://www.googleapis.com/calendar/v3/users/me/calendarList?maxResults=1',
      gmail: 'https://gmail.googleapis.com/gmail/v1/users/me/profile',
      google_drive: 'https://www.googleapis.com/drive/v3/about?fields=user',
    };
    const endpoint = checks[provider];
    if (!endpoint) throw new Error('Provedor de sincronização não reconhecido.');
    await googleRequest(endpoint, accessToken);

    const now = new Date().toISOString();
    await admin.from('integration_accounts').update({ status: 'connected', last_sync_at: now, last_error: null }).eq('user_id', userData.user.id).eq('provider', provider);
    await admin.from('integration_logs').insert({ user_id: userData.user.id, provider, action: 'manual_sync', message: 'Conexão verificada com sucesso.' });
    return json({ ok: true, syncedAt: now });
  } catch (error) {
    return json({ error: errorMessage(error) }, 500);
  }
});
