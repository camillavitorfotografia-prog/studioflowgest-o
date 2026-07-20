const encode = (value) => encodeURIComponent(String(value));

const extractToken = (payload) => {
  const raw = payload?.full || payload?.token || payload?.data?.full || payload?.data?.token;
  return String(raw || '').replace(/^wppconnect:/i, '');
};

const findQr = (payload) => {
  const candidates = [
    payload?.qrcode,
    payload?.qrCode,
    payload?.qr,
    payload?.base64,
    payload?.data?.qrcode,
    payload?.data?.qrCode,
    payload?.data?.qr,
    payload?.data?.base64,
  ];
  const value = candidates.find((item) => typeof item === 'string' && item.length > 20);
  if (!value) return null;
  return value.startsWith('data:image/') ? value : `data:image/png;base64,${value.replace(/^data:image\/\w+;base64,/, '')}`;
};

const statusText = (payload) => String(
  payload?.status || payload?.state || payload?.session?.status || payload?.data?.status || payload?.data?.state || '',
).toUpperCase();

export class WppConnectClient {
  constructor({ baseUrl, secretKey, timeoutMs, logger, fetchImpl = fetch }) {
    this.baseUrl = baseUrl;
    this.secretKey = secretKey;
    this.timeoutMs = timeoutMs;
    this.logger = logger;
    this.fetch = fetchImpl;
    this.tokens = new Map();
  }

  async raw(path, options = {}) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await this.fetch(`${this.baseUrl}${path}`, {
        ...options,
        signal: controller.signal,
        headers: { Accept: 'application/json', ...(options.body ? { 'Content-Type': 'application/json' } : {}), ...(options.headers || {}) },
      });
      const text = await response.text();
      let payload = {};
      try { payload = text ? JSON.parse(text) : {}; } catch { payload = { raw: text }; }
      if (!response.ok) {
        const message = payload?.message || payload?.error || payload?.raw || `WPPConnect respondeu HTTP ${response.status}`;
        const error = new Error(String(message));
        error.status = response.status;
        error.payload = payload;
        throw error;
      }
      return payload;
    } finally {
      clearTimeout(timer);
    }
  }

  async token(session, { force = false } = {}) {
    if (!force && this.tokens.has(session)) return this.tokens.get(session);
    const payload = await this.raw(`/api/${encode(session)}/${encode(this.secretKey)}/generate-token`, { method: 'POST' });
    const token = extractToken(payload);
    if (!token) throw new Error('O WPPConnect não retornou um token de sessão válido.');
    this.tokens.set(session, token);
    return token;
  }

  async request(session, path, options = {}, retry = true) {
    const token = await this.token(session);
    try {
      return await this.raw(`/api/${encode(session)}${path}`, {
        ...options,
        headers: { Authorization: `Bearer ${token}`, ...(options.headers || {}) },
      });
    } catch (error) {
      if (retry && error.status === 401) {
        this.tokens.delete(session);
        await this.token(session, { force: true });
        return this.request(session, path, options, false);
      }
      throw error;
    }
  }

  async startSession(session, webhookUrl) {
    const payload = await this.request(session, '/start-session', {
      method: 'POST',
      body: JSON.stringify({ webhook: webhookUrl, waitQrCode: true }),
    });
    return { payload, qr: findQr(payload), status: statusText(payload) };
  }

  async getQr(session) {
    const payload = await this.request(session, '/qrcode-session');
    return { payload, qr: findQr(payload), status: statusText(payload) };
  }

  async getStatus(session) {
    const attempts = ['/check-connection-session', '/status-session'];
    let lastError;
    for (const path of attempts) {
      try {
        const payload = await this.request(session, path);
        return { payload, status: statusText(payload) };
      } catch (error) { lastError = error; }
    }
    throw lastError;
  }

  async sendText(session, phone, message) {
    return this.request(session, '/send-message', {
      method: 'POST',
      body: JSON.stringify({ phone, isGroup: false, isNewsletter: false, isLid: false, message }),
    });
  }

  async logout(session) {
    try { return await this.request(session, '/logout-session', { method: 'POST' }); }
    finally { this.tokens.delete(session); }
  }

  async health() {
    return this.raw('/healthz');
  }
}

export const normalizeWppStatus = (raw) => {
  const status = String(raw || '').toUpperCase();
  if (['CONNECTED', 'ISLOGGED', 'LOGGED', 'INCHAT'].some((item) => status.includes(item))) return 'connected';
  if (['QRCODE', 'QR', 'UNPAIRED', 'NOTLOGGED'].some((item) => status.includes(item))) return 'qr';
  if (['INITIALIZING', 'OPENING', 'PAIRING', 'CONNECTING', 'SYNCING'].some((item) => status.includes(item))) return 'connecting';
  if (['CLOSED', 'DISCONNECTED', 'UNLAUNCHED', 'TIMEOUT'].some((item) => status.includes(item))) return 'disconnected';
  if (['CONFLICT', 'DEPRECATED', 'BLOCK', 'ERROR'].some((item) => status.includes(item))) return 'error';
  return 'connecting';
};
