import path from 'node:path';

const required = ['SUPABASE_URL', 'SUPABASE_ANON_KEY', 'SUPABASE_SERVICE_ROLE_KEY'];
const missing = required.filter((name) => !process.env[name]);

if (missing.length) {
  throw new Error(`Variáveis obrigatórias ausentes: ${missing.join(', ')}`);
}

const integer = (name, fallback) => {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? Math.trunc(value) : fallback;
};

export const config = Object.freeze({
  supabaseUrl: process.env.SUPABASE_URL,
  supabaseAnonKey: process.env.SUPABASE_ANON_KEY,
  supabaseServiceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
  sessionDir: path.resolve(process.env.SESSION_DIR || '/data/sessions'),
  port: integer('PORT', 3001),
  allowedOrigins: process.env.ALLOWED_ORIGIN || '*',
  logLevel: process.env.LOG_LEVEL || 'info',
  historySync: process.env.WHATSAPP_HISTORY_SYNC !== 'false',
  historyMessageLimit: integer('WHATSAPP_HISTORY_MESSAGE_LIMIT', 10000),
  reconnectBaseMs: integer('WHATSAPP_RECONNECT_BASE_MS', 3000),
  reconnectMaxMs: integer('WHATSAPP_RECONNECT_MAX_MS', 60000),
  maxMessageRetries: integer('WHATSAPP_MAX_MESSAGE_RETRIES', 5),
  storeFlushMs: integer('WHATSAPP_STORE_FLUSH_MS', 750),
});
