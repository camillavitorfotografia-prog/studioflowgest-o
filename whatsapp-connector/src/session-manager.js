import fs from 'node:fs/promises';
import path from 'node:path';
import QRCode from 'qrcode';
import makeWASocket, {
  Browsers,
  DisconnectReason,
  fetchLatestBaileysVersion,
  isJidBroadcast,
  isJidGroup,
  isJidNewsletter,
  isJidStatusBroadcast,
  makeCacheableSignalKeyStore,
  useMultiFileAuthState,
} from '@whiskeysockets/baileys';
import { PersistentSessionStore, TtlCache } from './persistent-store.js';
import { WhatsAppMessageProcessor } from './message-processor.js';

const digits = (value = '') => String(value).split('@')[0].split(':')[0].replace(/\D/g, '');
const disconnectCode = (error) => error?.output?.statusCode || error?.data?.statusCode || error?.statusCode;
const errorMessage = (error) => error?.message || error?.output?.payload?.message || String(error || 'Conexão encerrada');

export class SessionManager {
  constructor({ config, admin, logger, saveConnection }) {
    this.config = config;
    this.admin = admin;
    this.logger = logger;
    this.saveConnection = saveConnection;
    this.sessions = new Map();
    this.starting = new Map();
    this.reconnectAttempts = new Map();
    this.reconnectTimers = new Map();
  }

  linkedPhoneId(userId) { return `linked:${userId}`; }
  sessionPath(userId) { return path.join(this.config.sessionDir, userId); }
  authPath(userId) { return path.join(this.sessionPath(userId), 'auth'); }
  get(userId) { return this.sessions.get(userId); }
  size() { return this.sessions.size; }

  async start(userId) {
    const existing = this.sessions.get(userId);
    if (existing?.socket && !existing.closed) return existing;
    if (this.starting.has(userId)) return this.starting.get(userId);
    const promise = this.createSession(userId).finally(() => this.starting.delete(userId));
    this.starting.set(userId, promise);
    return promise;
  }

  async createSession(userId) {
    const directory = this.sessionPath(userId);
    const authDirectory = this.authPath(userId);
    await fs.mkdir(directory, { recursive: true });
    await this.migrateLegacyAuthFiles(directory, authDirectory);
    await fs.mkdir(authDirectory, { recursive: true });
    const sessionLogger = this.logger.child({ userId, component: 'whatsapp-session' });
    const baileysLogger = sessionLogger.child({ component: 'baileys' });
    baileysLogger.level = 'warn';

    const store = await new PersistentSessionStore({
      directory,
      logger: sessionLogger,
      maxMessages: this.config.historyMessageLimit,
      flushDelayMs: this.config.storeFlushMs,
    }).load();
    const { state, saveCreds } = await useMultiFileAuthState(authDirectory);

    const persistCreds = async (reason = 'creds.update') => {
      try {
        await saveCreds();
        const stats = await fs.stat(path.join(authDirectory, 'creds.json'));
        if (!stats.isFile() || stats.size < 20) throw new Error('creds.json não foi gravado corretamente');
        sessionLogger.debug({ reason, registered: Boolean(state.creds.registered) }, 'credenciais do WhatsApp persistidas');
      } catch (error) {
        sessionLogger.error({ error, reason, authDirectory }, 'falha crítica ao persistir credenciais do WhatsApp');
        throw error;
      }
    };

    // Garante que a sessão possua um arquivo de credenciais desde a criação.
    // As atualizações posteriores são gravadas pelo listener dedicado abaixo.
    await persistCreds('session-initialization');
    const { version, isLatest } = await fetchLatestBaileysVersion();

    const holder = {
      userId,
      status: 'connecting',
      qr: null,
      phone: null,
      socket: null,
      store,
      processor: null,
      closed: false,
      stopping: false,
      version,
      disposeEvents: null,
      persistCreds: null,
    };
    this.sessions.set(userId, holder);

    const socket = makeWASocket({
      auth: { creds: state.creds, keys: makeCacheableSignalKeyStore(state.keys, baileysLogger) },
      version,
      logger: baileysLogger,
      browser: Browsers.ubuntu('Chrome'),
      printQRInTerminal: false,
      markOnlineOnConnect: false,
      syncFullHistory: this.config.historySync,
      shouldSyncHistoryMessage: () => this.config.historySync,
      msgRetryCounterCache: new TtlCache({ ttlMs: 15 * 60 * 1000, max: 20000 }),
      placeholderResendCache: new TtlCache({ ttlMs: 5 * 60 * 1000, max: 10000 }),
      userDevicesCache: new TtlCache({ ttlMs: 5 * 60 * 1000, max: 10000 }),
      maxMsgRetryCount: this.config.maxMessageRetries,
      enableAutoSessionRecreation: true,
      enableRecentMessageCache: true,
      getMessage: async (key) => store.getMessage(key),
      shouldIgnoreJid: (jid) =>
        isJidStatusBroadcast(jid) || isJidGroup(jid) || isJidBroadcast(jid) || isJidNewsletter(jid),
    });

    holder.socket = socket;
    holder.persistCreds = persistCreds;
    holder.processor = new WhatsAppMessageProcessor({
      userId,
      socket,
      store,
      admin: this.admin,
      logger: sessionLogger,
      linkedPhoneId: (id) => this.linkedPhoneId(id),
    });

    const onCredsUpdate = () => {
      persistCreds('creds.update').catch((error) => {
        sessionLogger.fatal({ error }, 'não foi possível salvar a autenticação do WhatsApp');
      });
    };
    socket.ev.on('creds.update', onCredsUpdate);

    const disposeProcess = socket.ev.process(async (events) => {
      try {

        if (events['lid-mapping.update']) {
          const { lid, pn } = events['lid-mapping.update'];
          await holder.processor.enqueue(() => holder.processor.rememberMapping(lid, pn, 'baileys_event'), 'lid-mapping.update');
        }

        if (events['contacts.upsert']) {
          await holder.processor.enqueue(() => holder.processor.syncContacts(events['contacts.upsert'], 'contacts_upsert'), 'contacts.upsert');
        }
        if (events['contacts.update']) {
          await holder.processor.enqueue(() => holder.processor.syncContacts(events['contacts.update'], 'contacts_update'), 'contacts.update');
        }
        if (events['chats.upsert']) holder.processor.syncChats(events['chats.upsert']);
        if (events['chats.update']) holder.processor.syncChats(events['chats.update']);

        const history = events['messaging-history.set'];
        if (history) {
          sessionLogger.info({
            chats: history.chats?.length || 0,
            contacts: history.contacts?.length || 0,
            messages: history.messages?.length || 0,
            mappings: history.lidPnMappings?.length || 0,
            isLatest: history.isLatest,
            progress: history.progress,
            syncType: history.syncType,
          }, 'bloco de histórico recebido');
          await holder.processor.enqueue(async () => {
            for (const mapping of history.lidPnMappings || []) {
              await holder.processor.rememberMapping(mapping.lid, mapping.pn, 'history_sync');
            }
            await holder.processor.syncContacts(history.contacts || [], 'history_sync');
            holder.processor.syncChats(history.chats || []);
            await holder.processor.processBatch(history.messages || [], { type: 'history', source: 'history_sync' });
          }, 'messaging-history.set');
        }

        const upsert = events['messages.upsert'];
        if (upsert) {
          await holder.processor.enqueue(() => holder.processor.processBatch(upsert.messages || [], {
            type: upsert.type,
            requestId: upsert.requestId || null,
            source: upsert.requestId ? 'placeholder_resend' : 'messages_upsert',
          }), 'messages.upsert');
        }

        if (events['messages.update']) {
          await holder.processor.enqueue(() => holder.processor.processUpdates(events['messages.update']), 'messages.update');
        }

        const update = events['connection.update'];
        if (update) await this.handleConnectionUpdate(holder, update, { version, isLatest });
      } catch (error) {
        sessionLogger.error({ error, eventNames: Object.keys(events) }, 'falha ao processar eventos do WhatsApp');
      }
    });

    holder.disposeEvents = () => {
      socket.ev.off('creds.update', onCredsUpdate);
      disposeProcess?.();
    };

    sessionLogger.info({ version, isLatest, historySync: this.config.historySync, authDirectory, registered: Boolean(state.creds.registered) }, 'socket Baileys criado');
    return holder;
  }

  async handleConnectionUpdate(holder, update, versionInfo) {
    const { userId, socket, store } = holder;
    const sessionLogger = this.logger.child({ userId, component: 'whatsapp-session' });
    const { connection, lastDisconnect, qr, receivedPendingNotifications } = update;

    if (qr) {
      holder.qr = await QRCode.toDataURL(qr);
      holder.status = 'qr';
      await this.saveConnection(userId, { status: 'qr' });
      sessionLogger.info('QR Code do WhatsApp disponível');
    }

    if (connection === 'connecting') {
      holder.status = holder.qr ? 'qr' : 'connecting';
      sessionLogger.info('conectando ao WhatsApp');
    }

    if (connection === 'open') {
      holder.status = 'connected';
      holder.closed = false;
      holder.qr = null;
      holder.phone = digits(socket.user?.id || socket.user?.lid);
      this.reconnectAttempts.delete(userId);
      const timer = this.reconnectTimers.get(userId);
      if (timer) clearTimeout(timer);
      this.reconnectTimers.delete(userId);
      await holder.persistCreds?.('connection-open');
      await this.saveConnection(userId, { status: 'connected', phone: holder.phone });
      sessionLogger.info({ phone: holder.phone, ...versionInfo }, 'WhatsApp conectado e pronto para receber mensagens');
      await holder.processor.enqueue(() => holder.processor.retryPending(), 'pending-on-open');
    }

    if (receivedPendingNotifications) {
      sessionLogger.info('notificações pendentes do WhatsApp recebidas');
      await holder.processor.enqueue(() => holder.processor.retryPending(), 'pending-notifications');
    }

    if (connection === 'close') {
      const code = disconnectCode(lastDisconnect?.error);
      const loggedOut = code === DisconnectReason.loggedOut;
      holder.closed = true;
      holder.status = loggedOut ? 'disconnected' : 'connecting';
      await this.saveConnection(userId, {
        status: holder.status,
        error: `${errorMessage(lastDisconnect?.error)}${code ? ` [${code}]` : ''}`,
      });
      await store.flush().catch(() => {});
      holder.disposeEvents?.();
      this.sessions.delete(userId);
      sessionLogger.warn({ code, loggedOut }, 'conexão do WhatsApp encerrada');
      if (!loggedOut && !holder.stopping) {
        const nextAttempt = (this.reconnectAttempts.get(userId) || 0) + 1;
        this.reconnectAttempts.set(userId, nextAttempt);
        this.scheduleReconnect(userId, nextAttempt);
      }
    }
  }

  async migrateLegacyAuthFiles(directory, authDirectory) {
    const authNames = [
      'creds.json',
      'app-state-sync-key-',
      'app-state-sync-version-',
      'pre-key-',
      'sender-key-',
      'session-',
    ];
    const entries = await fs.readdir(directory, { withFileTypes: true }).catch(() => []);
    const legacyFiles = entries.filter((entry) => entry.isFile() && authNames.some((name) => entry.name === name || entry.name.startsWith(name)));
    if (!legacyFiles.length) return;
    await fs.mkdir(authDirectory, { recursive: true });
    for (const entry of legacyFiles) {
      const source = path.join(directory, entry.name);
      const target = path.join(authDirectory, entry.name);
      await fs.rename(source, target).catch(async (error) => {
        if (error?.code === 'EEXIST') await fs.rm(source, { force: true });
        else throw error;
      });
    }
  }

  scheduleReconnect(userId, attempt) {
    const existingTimer = this.reconnectTimers.get(userId);
    if (existingTimer) clearTimeout(existingTimer);
    const delay = Math.min(this.config.reconnectMaxMs, this.config.reconnectBaseMs * (2 ** Math.min(attempt - 1, 6)));
    const totalDelay = delay + Math.floor(Math.random() * 1000);
    this.logger.warn({ userId, attempt, delay: totalDelay }, 'reconexão agendada');
    const timer = setTimeout(() => {
      this.reconnectTimers.delete(userId);
      this.start(userId).catch((error) => {
        const nextAttempt = attempt + 1;
        this.reconnectAttempts.set(userId, nextAttempt);
        this.logger.error({ error, userId, attempt: nextAttempt }, 'reconexão falhou');
        this.scheduleReconnect(userId, nextAttempt);
      });
    }, totalDelay);
    this.reconnectTimers.set(userId, timer);
    timer.unref?.();
  }

  async stop(userId, { logout = true, removeData = true, updateStatus = true } = {}) {
    const holder = this.sessions.get(userId);
    if (holder) holder.stopping = true;
    const reconnectTimer = this.reconnectTimers.get(userId);
    if (reconnectTimer) clearTimeout(reconnectTimer);
    this.reconnectTimers.delete(userId);
    this.reconnectAttempts.delete(userId);
    try {
      holder?.disposeEvents?.();
      if (logout) await holder?.socket?.logout();
      else holder?.socket?.end?.(new Error('StudioFlow session stopped'));
    } catch (error) {
      this.logger.warn({ error, userId }, 'falha ao encerrar socket');
    }
    await holder?.store?.close().catch(() => {});
    this.sessions.delete(userId);
    if (removeData) await fs.rm(this.sessionPath(userId), { recursive: true, force: true });
    if (updateStatus) await this.saveConnection(userId, { status: 'disconnected' });
  }

  async restoreConnectedSessions() {
    const { data, error } = await this.admin
      .from('whatsapp_connections')
      .select('user_id,status')
      .eq('connection_mode', 'linked_device')
      .in('status', ['connected', 'connecting', 'qr']);
    if (error) throw error;
    const results = await Promise.allSettled((data || []).map((row) => this.start(row.user_id)));
    this.logger.info({
      requested: data?.length || 0,
      restored: results.filter((item) => item.status === 'fulfilled').length,
    }, 'restauração de sessões concluída');
  }

  async shutdown() {
    const holders = [...this.sessions.values()];
    await Promise.allSettled(holders.map((holder) =>
      this.stop(holder.userId, { logout: false, removeData: false, updateStatus: false })));
  }
}
