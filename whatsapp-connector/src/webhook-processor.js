const digits = (value = '') => String(value).split('@')[0].replace(/\D/g, '');
const isIgnoredAddress = (value = '') => /(@g\.us|status@broadcast|@broadcast|@newsletter)/i.test(String(value));
const isLid = (value = '') => /@lid$/i.test(String(value));

const eventName = (payload) => String(payload?.event || payload?.typeEvent || payload?.body?.event || '').toLowerCase();
const dataOf = (payload) => payload?.data && typeof payload.data === 'object' ? payload.data : payload;
const isoTimestamp = (value) => {
  const numeric = Number(value);
  if (Number.isFinite(numeric) && numeric > 0) return new Date(numeric > 1e12 ? numeric : numeric * 1000).toISOString();
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : new Date().toISOString();
};

const extractPhone = (message) => {
  const candidates = [
    message?.from,
    message?.sender?.id,
    message?.sender?.wid,
    message?.chatId,
    message?.author,
    message?.to,
  ].filter(Boolean);
  const phoneAddress = candidates.find((value) => !isLid(value) && !isIgnoredAddress(value) && digits(value));
  return phoneAddress ? digits(phoneAddress) : '';
};

const extractBody = (message) => String(
  message?.body ?? message?.content ?? message?.caption ?? message?.text ?? message?.message ?? '',
);

const messageId = (message) => String(
  message?.id?._serialized || message?.id || message?.msgId || message?.messageId || '',
);

export class WppWebhookProcessor {
  constructor({ admin, logger, saveConnection }) {
    this.admin = admin;
    this.logger = logger;
    this.saveConnection = saveConnection;
  }

  async process(userId, payload) {
    const event = eventName(payload);
    const data = dataOf(payload);

    if (event === 'status-find' || event.includes('state') || event.includes('status')) {
      const raw = String(data?.status || data?.state || payload?.status || '');
      const upper = raw.toUpperCase();
      const status = /ISLOGGED|CONNECTED|INCHAT/.test(upper) ? 'connected'
        : /NOTLOGGED|UNPAIRED|QR/.test(upper) ? 'qr'
          : /CONFLICT|BLOCK|ERROR|DEPRECATED/.test(upper) ? 'error'
            : /CLOSED|DISCONNECTED|TIMEOUT/.test(upper) ? 'disconnected' : 'connecting';
      await this.saveConnection(userId, { status, error: status === 'error' ? raw : null });
      return { accepted: true, kind: 'status', status };
    }

    if (!['onmessage', 'onanymessage'].includes(event)) return { accepted: true, ignored: true, event };
    if (data?.fromMe || data?.isGroupMsg || isIgnoredAddress(data?.from)) return { accepted: true, ignored: true, reason: 'unsupported-chat' };

    const phone = extractPhone(data);
    const id = messageId(data);
    if (!phone || !id) {
      this.logger.warn({ event, hasPhone: Boolean(phone), hasId: Boolean(id), from: data?.from }, 'webhook de mensagem sem identidade utilizável');
      return { accepted: true, ignored: true, reason: 'missing-identity' };
    }

    const profileName = data?.sender?.pushname || data?.sender?.formattedName || data?.notifyName || data?.chat?.contact?.pushname || null;
    const type = String(data?.type || data?.mimetype || 'text');
    const body = extractBody(data);
    const timestamp = isoTimestamp(data?.timestamp || data?.t || data?.time);
    const enriched = {
      ...payload,
      studioflow: { source: 'wppconnect', event, receivedAt: new Date().toISOString() },
    };

    const { data: result, error } = await this.admin.rpc('ingest_whatsapp_message', {
      p_phone_number_id: `linked:${userId}`,
      p_wa_id: phone,
      p_profile_name: profileName,
      p_message_id: id,
      p_message_type: type,
      p_body: body || null,
      p_timestamp: timestamp,
      p_payload: enriched,
    });
    if (error) throw error;

    this.logger.info({ userId, phone, messageId: id, duplicate: Boolean(result?.duplicate) }, 'mensagem recebida via WPPConnect sincronizada');
    return { accepted: true, kind: 'message', result };
  }
}
