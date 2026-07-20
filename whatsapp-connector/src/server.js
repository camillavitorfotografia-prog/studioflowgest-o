import express from 'express';
import cors from 'cors';
import pino from 'pino';
import { createClient } from '@supabase/supabase-js';
import { config } from './config.js';
import { WppConnectClient } from './wppconnect-client.js';
import { WppWebhookProcessor } from './webhook-processor.js';
import { SessionManager } from './session-manager.js';

const logger = pino({ level: config.logLevel, redact: ['req.headers.authorization', 'secret', '*.token'] });
const admin = createClient(config.supabaseUrl, config.supabaseServiceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
const authClient = createClient(config.supabaseUrl, config.supabaseAnonKey, { auth: { persistSession: false, autoRefreshToken: false } });

const app = express();
app.disable('x-powered-by');
app.use(cors({ origin: config.allowedOrigins === '*' ? true : config.allowedOrigins.split(',').map((v) => v.trim()).filter(Boolean) }));
app.use(express.json({ limit: '10mb' }));

const saveConnection = async (userId, patch = {}) => {
  const now = new Date().toISOString();
  const status = patch.status || 'connecting';
  const common = { status, last_error: patch.error || null, updated_at: now };
  const connection = {
    user_id: userId, phone_number_id: `linked:${userId}`, connection_mode: 'linked_device', session_id: userId, ...common,
  };
  if (patch.phone !== undefined) connection.display_phone_number = patch.phone || null;
  if (status === 'connected') connection.connected_at = now;
  const { error } = await admin.from('whatsapp_connections').upsert(connection, { onConflict: 'user_id,connection_mode' });
  if (error) throw error;

  const integration = { user_id: userId, provider: 'whatsapp_linked', settings: { mode: 'linked_device', engine: 'wppconnect' }, last_sync_at: now, ...common };
  if (patch.phone !== undefined) integration.account_name = patch.phone || null;
  if (status === 'connected') integration.connected_at = now;
  const { error: integrationError } = await admin.from('integration_accounts').upsert(integration, { onConflict: 'user_id,provider' });
  if (integrationError) logger.warn({ error: integrationError, userId }, 'falha ao atualizar integration_accounts');
};

const client = new WppConnectClient({ baseUrl: config.wppconnectUrl, secretKey: config.wppconnectSecretKey, timeoutMs: config.requestTimeoutMs, logger });
const sessions = new SessionManager({ config, client, admin, logger, saveConnection });
const webhookProcessor = new WppWebhookProcessor({ admin, logger, saveConnection });

app.get('/health', async (_req, res) => {
  try {
    await client.health();
    res.json({ ok: true, service: 'studioflow-whatsapp-gateway', engine: 'wppconnect', upstream: 'ok', node: process.version, activeSessions: sessions.size(), timestamp: new Date().toISOString() });
  } catch (error) {
    res.status(503).json({ ok: false, service: 'studioflow-whatsapp-gateway', engine: 'wppconnect', upstream: 'unavailable', error: error.message });
  }
});

app.post('/webhooks/wppconnect/:userId', async (req, res, next) => {
  try {
    if (req.query.secret !== config.webhookSecret) return res.status(401).json({ error: 'Webhook não autorizado.' });
    const result = await webhookProcessor.process(req.params.userId, req.body || {});
    return res.status(200).json(result);
  } catch (error) { return next(error); }
});

const authenticate = async (req, res, next) => {
  try {
    const token = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
    if (!token) return res.status(401).json({ error: 'Token de acesso ausente.' });
    const { data, error } = await authClient.auth.getUser(token);
    if (error || !data.user) return res.status(401).json({ error: 'Sessão inválida.' });
    req.user = data.user;
    return next();
  } catch { return res.status(401).json({ error: 'Não foi possível validar a sessão.' }); }
};
app.use('/api', authenticate);

app.get('/api/session', async (req, res, next) => {
  try {
    let holder = await sessions.refresh(req.user.id);
    if (!holder) {
      const { data, error } = await admin.from('whatsapp_connections').select('status,display_phone_number,last_error').eq('user_id', req.user.id).eq('connection_mode', 'linked_device').maybeSingle();
      if (error) throw error;
      return res.json({ status: data?.status || 'disconnected', phone: data?.display_phone_number || null, error: data?.last_error || null });
    }
    return res.json({ status: holder.status, qr: holder.qr, phone: holder.phone, engine: 'wppconnect' });
  } catch (error) { return next(error); }
});

app.post('/api/session/start', async (req, res, next) => {
  try {
    const holder = await sessions.start(req.user.id);
    return res.json({ status: holder.status, qr: holder.qr, phone: holder.phone, engine: 'wppconnect' });
  } catch (error) { return next(error); }
});

app.delete('/api/session', async (req, res, next) => {
  try { await sessions.stop(req.user.id); return res.json({ ok: true }); }
  catch (error) { return next(error); }
});

app.post('/api/messages/send', async (req, res, next) => {
  try {
    const holder = await sessions.refresh(req.user.id, { force: true });
    if (!holder || holder.status !== 'connected') return res.status(409).json({ error: 'WhatsApp pelo celular não está conectado.' });
    const { to, text, conversationId, contactId } = req.body || {};
    const phone = String(to || '').replace(/\D/g, '');
    const cleanText = String(text || '').trim();
    if (!phone || !cleanText || !conversationId || !contactId) return res.status(400).json({ error: 'Telefone, mensagem, conversa e contato são obrigatórios.' });

    const sent = await client.sendText(holder.session, phone, cleanText);
    const id = String(sent?.response?.id?._serialized || sent?.response?.id || sent?.id?._serialized || sent?.id || `wpp-${Date.now()}`);
    const now = new Date().toISOString();
    const { error } = await admin.from('whatsapp_messages').upsert({
      user_id: req.user.id, conversation_id: conversationId, contact_id: contactId, whatsapp_message_id: id,
      direction: 'outbound', message_type: 'text', body: cleanText, status: 'sent', sent_at: now, payload: sent,
    }, { onConflict: 'user_id,whatsapp_message_id', ignoreDuplicates: true });
    if (error) throw error;
    await admin.from('whatsapp_conversations').update({ last_message_preview: cleanText.slice(0, 240), last_message_at: now, updated_at: now }).eq('id', conversationId).eq('user_id', req.user.id);
    return res.json({ ok: true, id });
  } catch (error) { return next(error); }
});

app.use((error, req, res, _next) => {
  logger.error({ error, method: req.method, path: req.path, userId: req.user?.id }, 'erro no gateway WPPConnect');
  res.status(error.status && error.status < 500 ? error.status : 500).json({ error: error.message || 'Erro interno do conector WhatsApp.' });
});

const server = app.listen(config.port, () => logger.info({ port: config.port, engine: 'wppconnect', upstream: config.wppconnectUrl }, 'StudioFlow WhatsApp gateway iniciado'));
sessions.restoreConnectedSessions().catch((error) => logger.error({ error }, 'falha ao restaurar sessões WPPConnect'));

const shutdown = (signal) => { logger.info({ signal }, 'encerrando gateway'); server.close(() => process.exit(0)); };
process.once('SIGTERM', () => shutdown('SIGTERM'));
process.once('SIGINT', () => shutdown('SIGINT'));
