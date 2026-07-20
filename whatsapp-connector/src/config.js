const required = [
  'SUPABASE_URL',
  'SUPABASE_ANON_KEY',
  'SUPABASE_SERVICE_ROLE_KEY',
  'WPPCONNECT_URL',
  'WPPCONNECT_SECRET_KEY',
  'CONNECTOR_PUBLIC_URL',
  'WEBHOOK_SECRET',
];

const missing = required.filter((name) => !String(process.env[name] || '').trim());
if (missing.length) throw new Error(`Variáveis obrigatórias ausentes: ${missing.join(', ')}`);

const positiveInteger = (name, fallback) => {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? Math.trunc(value) : fallback;
};

const normalizeUrl = (value) => String(value || '').trim().replace(/\/+$/, '');

export const config = Object.freeze({
  port: positiveInteger('PORT', 3001),
  logLevel: process.env.LOG_LEVEL || 'info',
  allowedOrigins: process.env.ALLOWED_ORIGIN || '*',
  supabaseUrl: normalizeUrl(process.env.SUPABASE_URL),
  supabaseAnonKey: process.env.SUPABASE_ANON_KEY,
  supabaseServiceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
  wppconnectUrl: normalizeUrl(process.env.WPPCONNECT_URL),
  wppconnectSecretKey: process.env.WPPCONNECT_SECRET_KEY,
  connectorPublicUrl: normalizeUrl(process.env.CONNECTOR_PUBLIC_URL),
  webhookSecret: process.env.WEBHOOK_SECRET,
  requestTimeoutMs: positiveInteger('WPPCONNECT_REQUEST_TIMEOUT_MS', 30000),
  statusCacheMs: positiveInteger('WPPCONNECT_STATUS_CACHE_MS', 2500),
});
