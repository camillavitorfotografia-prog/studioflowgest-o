import fs from 'node:fs/promises';
import path from 'node:path';
import { jidNormalizedUser } from '@whiskeysockets/baileys';

const jsonSafe = (value) => JSON.parse(JSON.stringify(value, (_key, current) =>
  typeof current === 'bigint' ? current.toString() : current));
const keyForMessage = (key = {}) => `${key.remoteJid || ''}:${key.id || ''}`;
const normalizedJid = (value = '') => jidNormalizedUser(String(value || ''));
const isPhoneJid = (value = '') => normalizedJid(value).endsWith('@s.whatsapp.net');
const isLidJid = (value = '') => normalizedJid(value).endsWith('@lid');

export class PersistentSessionStore {
  constructor({ directory, logger, maxMessages = 10000, flushDelayMs = 750 }) {
    this.directory = directory;
    this.filePath = path.join(directory, 'studioflow-store.json');
    this.logger = logger;
    this.maxMessages = maxMessages;
    this.flushDelayMs = flushDelayMs;
    this.messages = new Map();
    this.pendingMessages = new Map();
    this.contacts = new Map();
    this.chats = new Map();
    this.lidMappings = new Map();
    this.flushTimer = null;
    this.flushPromise = Promise.resolve();
    this.closed = false;
  }

  async load() {
    await fs.mkdir(this.directory, { recursive: true });
    try {
      const raw = JSON.parse(await fs.readFile(this.filePath, 'utf8'));
      this.messages = new Map(raw.messages || []);
      this.pendingMessages = new Map(raw.pendingMessages || []);
      this.contacts = new Map(raw.contacts || []);
      this.chats = new Map(raw.chats || []);
      this.lidMappings = new Map(raw.lidMappings || []);
      this.logger.info({
        messages: this.messages.size,
        pendingMessages: this.pendingMessages.size,
        contacts: this.contacts.size,
        chats: this.chats.size,
        lidMappings: this.lidMappings.size,
      }, 'store persistente carregada');
    } catch (error) {
      if (error?.code !== 'ENOENT') this.logger.warn({ error }, 'store persistente inválida; iniciando uma nova');
    }
    return this;
  }

  rememberMessage(message) {
    const key = keyForMessage(message?.key);
    if (!message?.key?.id || !key) return;
    const previous = this.messages.get(key) || {};
    this.messages.set(key, jsonSafe({ ...previous, ...message, key: { ...(previous.key || {}), ...(message.key || {}) } }));
    while (this.messages.size > this.maxMessages) this.messages.delete(this.messages.keys().next().value);
    this.scheduleFlush();
  }

  getStoredMessage(key) {
    const exact = this.messages.get(keyForMessage(key));
    if (exact) return exact;
    if (!key?.id) return undefined;
    return [...this.messages.values()].find((stored) => stored?.key?.id === key.id);
  }

  getMessage(key) {
    return this.getStoredMessage(key)?.message;
  }

  rememberPending(item, metadata = {}, reason = 'unknown') {
    const key = keyForMessage(item?.key);
    if (!item?.key?.id || !key) return;
    const previous = this.pendingMessages.get(key);
    this.pendingMessages.set(key, jsonSafe({
      item: { ...(previous?.item || {}), ...item },
      metadata: { ...(previous?.metadata || {}), ...metadata },
      reason,
      attempts: (previous?.attempts || 0) + 1,
      updatedAt: new Date().toISOString(),
    }));
    this.scheduleFlush();
  }

  removePending(key) {
    if (this.pendingMessages.delete(keyForMessage(key))) this.scheduleFlush();
  }

  getPendingMessages() {
    return [...this.pendingMessages.values()];
  }

  getPendingByLid(lid) {
    const normalized = normalizedJid(lid);
    return this.getPendingMessages().filter(({ item }) => {
      const key = item?.key || {};
      return [key.remoteJid, key.remoteJidAlt, key.participant, key.participantAlt]
        .some((value) => normalizedJid(value) === normalized);
    });
  }

  upsertContacts(contacts = []) {
    for (const contact of contacts) {
      if (!contact?.id) continue;
      const normalized = jsonSafe(contact);
      const keys = [contact.id, contact.lid, contact.phoneNumber].filter(Boolean).map(normalizedJid);
      for (const key of keys) this.contacts.set(key, { ...(this.contacts.get(key) || {}), ...normalized });
      if (contact.lid && contact.phoneNumber) this.rememberLidMapping(contact.lid, contact.phoneNumber);
    }
    if (contacts.length) this.scheduleFlush();
  }

  findPhoneForIdentity(identity) {
    if (!identity) return null;
    const normalized = normalizedJid(identity);
    if (isPhoneJid(normalized)) return normalized;
    const mapped = this.getPnForLid(normalized);
    if (mapped) return mapped;
    const contact = this.contacts.get(normalized);
    const candidate = contact?.phoneNumber || (isPhoneJid(contact?.id) ? contact.id : null);
    return candidate && isPhoneJid(candidate) ? normalizedJid(candidate) : null;
  }

  findContactName(...identities) {
    for (const identity of identities.filter(Boolean)) {
      const contact = this.contacts.get(normalizedJid(identity));
      const name = contact?.notify || contact?.name || contact?.verifiedName;
      if (name) return name;
    }
    return null;
  }

  upsertChats(chats = []) {
    for (const chat of chats) {
      if (!chat?.id) continue;
      this.chats.set(chat.id, { ...(this.chats.get(chat.id) || {}), ...jsonSafe(chat) });
    }
    if (chats.length) this.scheduleFlush();
  }

  rememberLidMapping(lid, pn) {
    const normalizedLid = normalizedJid(lid);
    const normalizedPn = normalizedJid(pn);
    if (!isLidJid(normalizedLid) || !isPhoneJid(normalizedPn)) return;
    this.lidMappings.set(normalizedLid, normalizedPn);
    this.scheduleFlush();
  }

  getPnForLid(lid) {
    return lid ? this.lidMappings.get(normalizedJid(lid)) : undefined;
  }

  scheduleFlush() {
    if (this.closed || this.flushTimer) return;
    this.flushTimer = setTimeout(() => {
      this.flushTimer = null;
      this.flush().catch((error) => this.logger.error({ error }, 'falha ao persistir store'));
    }, this.flushDelayMs);
    this.flushTimer.unref?.();
  }

  async flush() {
    const payload = JSON.stringify({
      version: 2,
      updatedAt: new Date().toISOString(),
      messages: [...this.messages.entries()],
      pendingMessages: [...this.pendingMessages.entries()],
      contacts: [...this.contacts.entries()],
      chats: [...this.chats.entries()],
      lidMappings: [...this.lidMappings.entries()],
    });
    const tempPath = `${this.filePath}.tmp`;
    this.flushPromise = this.flushPromise.then(async () => {
      await fs.writeFile(tempPath, payload, 'utf8');
      await fs.rename(tempPath, this.filePath);
    });
    return this.flushPromise;
  }

  async close() {
    this.closed = true;
    if (this.flushTimer) clearTimeout(this.flushTimer);
    this.flushTimer = null;
    await this.flush();
  }
}

export class TtlCache {
  constructor({ ttlMs = 10 * 60 * 1000, max = 10000 } = {}) {
    this.ttlMs = ttlMs;
    this.max = max;
    this.values = new Map();
  }
  get(key) {
    const item = this.values.get(key);
    if (!item) return undefined;
    if (item.expiresAt <= Date.now()) { this.values.delete(key); return undefined; }
    return item.value;
  }
  set(key, value) {
    this.values.set(key, { value, expiresAt: Date.now() + this.ttlMs });
    while (this.values.size > this.max) this.values.delete(this.values.keys().next().value);
    return true;
  }
  del(key) { return this.values.delete(key); }
  flushAll() { this.values.clear(); }
  close() { this.values.clear(); }
}
