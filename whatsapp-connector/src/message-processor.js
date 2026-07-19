import {
  getContentType,
  isJidBroadcast,
  isJidGroup,
  isJidNewsletter,
  isJidStatusBroadcast,
  jidNormalizedUser,
  normalizeMessageContent,
} from '@whiskeysockets/baileys';

const PHONE_SUFFIX = '@s.whatsapp.net';
const HOSTED_PHONE_SUFFIX = '@hosted';
const LID_SUFFIX = '@lid';
const HOSTED_LID_SUFFIX = '@hosted.lid';

const jsonSafe = (value) => JSON.parse(JSON.stringify(value, (_key, current) =>
  typeof current === 'bigint' ? current.toString() : current));

const jid = (value = '') => jidNormalizedUser(String(value || ''));
const isPhoneJid = (value = '') => {
  const normalized = jid(value);
  return normalized.endsWith(PHONE_SUFFIX) || normalized.endsWith(HOSTED_PHONE_SUFFIX);
};
const isLidJid = (value = '') => {
  const normalized = jid(value);
  return normalized.endsWith(LID_SUFFIX) || normalized.endsWith(HOSTED_LID_SUFFIX);
};
const digits = (value = '') => String(value).split('@')[0].split(':')[0].replace(/\D/g, '');
const normalizedPhoneJid = (value) => {
  if (!isPhoneJid(value)) return null;
  const phone = digits(value);
  return phone ? `${phone}${PHONE_SUFFIX}` : null;
};

const timestampToIso = (value) => {
  let seconds = Number(value?.toNumber?.() ?? value?.low ?? value);
  if (!Number.isFinite(seconds) || seconds <= 0) seconds = Math.floor(Date.now() / 1000);
  return new Date(seconds * 1000).toISOString();
};

const unwrapMessage = (message = {}) => {
  let current = normalizeMessageContent(message) || message;
  for (let index = 0; index < 8; index += 1) {
    const nested =
      current?.ephemeralMessage?.message ||
      current?.viewOnceMessage?.message ||
      current?.viewOnceMessageV2?.message ||
      current?.viewOnceMessageV2Extension?.message ||
      current?.documentWithCaptionMessage?.message ||
      current?.editedMessage?.message;
    if (!nested) break;
    current = normalizeMessageContent(nested) || nested;
  }
  return current || {};
};

const textFromMessage = (message = {}) => {
  const value = unwrapMessage(message);
  return (
    value.conversation ||
    value.extendedTextMessage?.text ||
    value.imageMessage?.caption ||
    value.videoMessage?.caption ||
    value.documentMessage?.caption ||
    value.buttonsResponseMessage?.selectedDisplayText ||
    value.listResponseMessage?.title ||
    value.templateButtonReplyMessage?.selectedDisplayText ||
    value.interactiveResponseMessage?.body?.text ||
    value.interactiveResponseMessage?.nativeFlowResponseMessage?.paramsJson ||
    value.contactMessage?.displayName ||
    value.contactsArrayMessage?.displayName ||
    value.locationMessage?.name ||
    value.liveLocationMessage?.caption ||
    ''
  );
};

const messageType = (message = {}) => getContentType(unwrapMessage(message)) || 'unknown';
const contextInfoOf = (message = {}) => {
  const value = unwrapMessage(message);
  const type = getContentType(value);
  return type ? value[type]?.contextInfo : undefined;
};

const ignoredJid = (value = '') =>
  !value ||
  isJidStatusBroadcast(value) ||
  isJidGroup(value) ||
  isJidBroadcast(value) ||
  isJidNewsletter(value) ||
  value === 'status@broadcast';

const unique = (values) => [...new Set(values.filter(Boolean).map((value) => jid(value)))];

export class WhatsAppMessageProcessor {
  constructor({ userId, socket, store, admin, logger, linkedPhoneId }) {
    this.userId = userId;
    this.socket = socket;
    this.store = store;
    this.admin = admin;
    this.logger = logger;
    this.linkedPhoneId = linkedPhoneId;
    this.inFlight = new Set();
    this.serial = Promise.resolve();
  }

  enqueue(task, label = 'evento') {
    const run = this.serial.then(task, task);
    this.serial = run.catch((error) => this.logger.error({ error, label }, 'falha na fila de eventos WhatsApp'));
    return run;
  }

  async rememberMapping(lidValue, pnValue, source = 'unknown') {
    const normalizedLid = isLidJid(lidValue) ? jid(lidValue) : null;
    const phoneJid = normalizedPhoneJid(pnValue);
    if (!normalizedLid || !phoneJid) return false;
    this.store.rememberLidMapping(normalizedLid, phoneJid);
    this.logger.info({ lid: normalizedLid, phone: digits(phoneJid), source }, 'mapeamento LID-PN registrado');
    await this.retryPendingForLid(normalizedLid);
    return true;
  }

  identityCandidates(item) {
    const key = item?.key || {};
    const contextInfo = contextInfoOf(item?.message);
    return unique([
      key.remoteJidAlt,
      key.participantPn,
      key.participantAlt,
      item?.participantPn,
      item?.participantAlt,
      contextInfo?.participant,
      contextInfo?.remoteJid,
      key.remoteJid,
      key.participant,
    ]);
  }

  async resolveIdentity(item) {
    const candidates = this.identityCandidates(item);
    const phoneJid = candidates.map(normalizedPhoneJid).find(Boolean) || null;
    const lidValue = candidates.find(isLidJid) || null;

    if (phoneJid) {
      if (lidValue) await this.rememberMapping(lidValue, phoneJid, 'message_payload');
      return { phone: digits(phoneJid), phoneJid, lid: lidValue, source: 'payload', candidates };
    }

    const contactPn = this.store.findPhoneForIdentity(lidValue || item?.key?.remoteJid);
    if (contactPn) {
      if (lidValue) await this.rememberMapping(lidValue, contactPn, 'contact_store');
      return { phone: digits(contactPn), phoneJid: contactPn, lid: lidValue, source: 'contact_store', candidates };
    }

    const persistedPn = this.store.getPnForLid(lidValue);
    if (persistedPn) {
      return { phone: digits(persistedPn), phoneJid: persistedPn, lid: lidValue, source: 'persistent_store', candidates };
    }

    if (lidValue) {
      try {
        const resolved = await this.socket?.signalRepository?.lidMapping?.getPNForLID?.(lidValue);
        const repositoryPn = normalizedPhoneJid(resolved);
        if (repositoryPn) {
          await this.rememberMapping(lidValue, repositoryPn, 'signal_repository');
          return { phone: digits(repositoryPn), phoneJid: repositoryPn, lid: lidValue, source: 'signal_repository', candidates };
        }
      } catch (error) {
        this.logger.debug({ error, lid: lidValue }, 'consulta ao repositório LID falhou');
      }
    }

    return { phone: '', phoneJid: null, lid: lidValue, source: 'unresolved', candidates };
  }

  async syncContacts(contacts = [], source = 'event') {
    this.store.upsertContacts(contacts);
    for (const contact of contacts) {
      const contactId = contact?.id;
      if (!contactId || ignoredJid(contactId)) continue;
      const lidValue = isLidJid(contact?.lid) ? contact.lid : (isLidJid(contactId) ? contactId : null);
      const phoneValue = contact?.phoneNumber || (isPhoneJid(contactId) ? contactId : null);
      if (lidValue && phoneValue) await this.rememberMapping(lidValue, phoneValue, source);

      const identity = await this.resolveIdentity({
        key: { remoteJid: contactId, remoteJidAlt: contact?.phoneNumber || contact?.lid },
      });
      if (!identity.phone) continue;

      const now = new Date().toISOString();
      const profileName = contact?.notify || contact?.name || contact?.verifiedName || null;
      const metadata = {
        source: `linked_device_${source}`,
        jid: contactId,
        lid: identity.lid,
        phoneJid: identity.phoneJid,
      };
      const { error } = await this.admin.from('whatsapp_contacts').upsert({
        user_id: this.userId,
        wa_id: identity.phone,
        phone_normalized: identity.phone,
        profile_name: profileName,
        metadata,
        updated_at: now,
      }, { onConflict: 'user_id,wa_id' });
      if (error) this.logger.warn({ error, jid: contactId }, 'falha ao sincronizar contato');
    }
    await this.retryPending();
  }

  syncChats(chats = []) {
    this.store.upsertChats(chats.filter((chat) => !ignoredJid(chat?.id)));
  }

  async processBatch(messages = [], metadata = {}) {
    this.logger.info({
      count: messages.length,
      type: metadata.type || 'unknown',
      source: metadata.source || 'live',
      requestId: metadata.requestId || null,
    }, 'lote de mensagens recebido do WhatsApp');
    for (const item of messages) await this.processOne(item, metadata);
  }

  async processUpdates(updates = []) {
    for (const entry of updates) {
      const stored = this.store.getStoredMessage(entry?.key);
      const merged = stored ? { ...stored, ...entry?.update, key: entry.key } : null;
      if (merged?.message) await this.processOne(merged, { type: 'update', source: 'messages_update' });
    }
  }

  async processOne(item, metadata = {}) {
    const messageId = item?.key?.id;
    const remoteJid = item?.key?.remoteJid || '';
    if (!messageId || ignoredJid(remoteJid) || item?.broadcast === true) return;

    this.store.rememberMessage(item);
    if (item?.key?.fromMe) return;

    const processKey = `${remoteJid}:${messageId}`;
    if (this.inFlight.has(processKey)) return;
    this.inFlight.add(processKey);

    try {
      this.logger.info({
        messageId,
        remoteJid,
        remoteJidAlt: item?.key?.remoteJidAlt || null,
        hasMessage: Boolean(item?.message),
        type: metadata.type || 'unknown',
        source: metadata.source || 'live',
      }, 'mensagem recebida do WhatsApp');

      if (!item?.message) {
        this.store.rememberPending(item, metadata, 'placeholder');
        let requestId;
        try {
          requestId = await this.socket.requestPlaceholderResend(item.key, jsonSafe(item));
        } catch (error) {
          this.logger.warn({ error, messageId, remoteJid }, 'falha ao solicitar reenvio do placeholder');
        }
        this.logger.warn({ messageId, remoteJid, requestId: requestId || null }, 'placeholder preservado e reenvio solicitado');
        return;
      }

      const identity = await this.resolveIdentity(item);
      if (!identity.phone) {
        this.store.rememberPending(item, metadata, 'unresolved_lid');
        this.logger.warn({
          messageId,
          remoteJid,
          lid: identity.lid,
          candidates: identity.candidates,
          addressingMode: item?.key?.addressingMode,
        }, 'mensagem preservada aguardando resolução LID-PN');
        return;
      }

      const body = textFromMessage(item.message);
      const type = messageType(item.message);
      const timestamp = timestampToIso(item.messageTimestamp);
      const payload = jsonSafe({ ...item, studioflow: { ...metadata, identity } });
      const { data, error } = await this.admin.rpc('ingest_whatsapp_message', {
        p_phone_number_id: this.linkedPhoneId(this.userId),
        p_wa_id: identity.phone,
        p_profile_name: item.pushName || this.store.findContactName(identity.phoneJid, identity.lid) || null,
        p_message_id: messageId,
        p_message_type: type,
        p_body: body || null,
        p_timestamp: timestamp,
        p_payload: payload,
      });
      if (error) throw error;

      this.store.removePending(item.key);
      this.logger.info({
        messageId,
        phone: identity.phone,
        phoneSource: identity.source,
        messageType: type,
        source: metadata.source || 'live',
        duplicate: Boolean(data?.duplicate),
      }, 'mensagem sincronizada com o StudioFlow');
    } catch (error) {
      this.store.rememberPending(item, metadata, 'processing_error');
      this.logger.error({ error, messageId, remoteJid, metadata }, 'falha ao processar mensagem');
    } finally {
      this.inFlight.delete(processKey);
    }
  }

  async retryPendingForLid(lidValue) {
    const items = this.store.getPendingByLid(lidValue);
    for (const pending of items) {
      await this.processOne(pending.item, { ...pending.metadata, source: 'pending_lid_retry' });
    }
  }

  async retryPending() {
    const items = this.store.getPendingMessages();
    if (!items.length) return;
    this.logger.info({ count: items.length }, 'reprocessando mensagens pendentes');
    for (const pending of items) {
      await this.processOne(pending.item, { ...pending.metadata, source: 'pending_retry' });
    }
  }
}
