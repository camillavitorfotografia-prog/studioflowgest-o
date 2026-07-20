import { normalizeWppStatus } from './wppconnect-client.js';

export class SessionManager {
  constructor({ config, client, admin, logger, saveConnection }) {
    this.config = config;
    this.client = client;
    this.admin = admin;
    this.logger = logger;
    this.saveConnection = saveConnection;
    this.sessions = new Map();
  }

  sessionName(userId) { return `studioflow-${String(userId).replace(/[^a-zA-Z0-9_-]/g, '')}`; }
  webhookUrl(userId) {
    return `${this.config.connectorPublicUrl}/webhooks/wppconnect/${encodeURIComponent(userId)}?secret=${encodeURIComponent(this.config.webhookSecret)}`;
  }

  get(userId) { return this.sessions.get(userId) || null; }
  size() { return this.sessions.size; }

  async refresh(userId, { force = false } = {}) {
    const current = this.sessions.get(userId);
    if (!force && current && Date.now() - current.checkedAt < this.config.statusCacheMs) return current;
    const session = current?.session || this.sessionName(userId);
    try {
      const statusResult = await this.client.getStatus(session);
      const status = normalizeWppStatus(statusResult.status);
      let qr = current?.qr || null;
      if (status === 'qr') {
        try { qr = (await this.client.getQr(session)).qr || qr; } catch (error) { this.logger.debug({ error, userId }, 'QR ainda não disponível'); }
      } else if (status === 'connected') qr = null;
      const holder = { session, status, qr, phone: current?.phone || null, checkedAt: Date.now() };
      this.sessions.set(userId, holder);
      await this.saveConnection(userId, { status, phone: holder.phone });
      return holder;
    } catch (error) {
      if (!current) return null;
      const holder = { ...current, status: 'error', error: error.message, checkedAt: Date.now() };
      this.sessions.set(userId, holder);
      await this.saveConnection(userId, { status: 'error', error: error.message });
      return holder;
    }
  }

  async start(userId) {
    const session = this.sessionName(userId);
    await this.saveConnection(userId, { status: 'connecting' });
    try {
      const started = await this.client.startSession(session, this.webhookUrl(userId));
      let status = normalizeWppStatus(started.status);
      let qr = started.qr;
      if (!qr && status !== 'connected') {
        try { qr = (await this.client.getQr(session)).qr; } catch (error) { this.logger.debug({ error, userId }, 'QR não retornado imediatamente'); }
      }
      if (qr) status = 'qr';
      const holder = { session, status, qr: qr || null, phone: null, checkedAt: Date.now() };
      this.sessions.set(userId, holder);
      await this.saveConnection(userId, { status });
      return holder;
    } catch (error) {
      await this.saveConnection(userId, { status: 'error', error: error.message });
      throw error;
    }
  }

  async stop(userId) {
    const session = this.sessions.get(userId)?.session || this.sessionName(userId);
    try { await this.client.logout(session); }
    catch (error) { this.logger.warn({ error, userId }, 'WPPConnect não confirmou logout'); }
    this.sessions.delete(userId);
    await this.saveConnection(userId, { status: 'disconnected', phone: null });
  }

  async restoreConnectedSessions() {
    const { data, error } = await this.admin.from('whatsapp_connections')
      .select('user_id,status')
      .eq('connection_mode', 'linked_device')
      .in('status', ['connected', 'connecting', 'qr']);
    if (error) throw error;
    for (const row of data || []) {
      try { await this.refresh(row.user_id, { force: true }); }
      catch (restoreError) { this.logger.warn({ error: restoreError, userId: row.user_id }, 'falha ao restaurar sessão WPPConnect'); }
    }
  }
}
