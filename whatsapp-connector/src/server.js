import fs from 'node:fs/promises';
import express from 'express';
import cors from 'cors';
import pino from 'pino';
import { createClient } from '@supabase/supabase-js';
import { config } from './config.js';
import { SessionManager } from './session-manager.js';

const logger = pino({ level: config.logLevel });
const admin = createClient(config.supabaseUrl, config.supabaseServiceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const authClient = createClient(config.supabaseUrl, config.supabaseAnonKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const app = express();
app.disable('x-powered-by');
app.use(cors({
  origin: config.allowedOrigins === '*'
    ? true
    : config.allowedOrigins.split(',').map((item) => item.trim()).filter(Boolean),
}));
app.use(express.json({ limit: '2mb' }));

const authenticate = async (req, res, next) => {
  try {
    const token = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
    if (!token) return res.status(401).json({ error: 'Token de acesso ausente.' });
    const { data, error } = await authClient.auth.getUser(token);
    if (error || !data.user) return res.status(401).json({ error: 'Sessão inválida.' });
    req.user = data.user;
    return next();
  } catch (error) {
    logger.warn({ error }, 'falha ao autenticar requisição');
    return res.status(401).json({ error: 'Não foi possível validar a sessão.' });
  }
};

const saveConnection = async (userId, patch = {}) => {
  const now = new Date().toISOString();
  const status = patch.status || 'connecting';
  const connectionPayload = {
    user_id: userId,
    phone_number_id: `linked:${userId}`,
    connection_mode: 'linked_device',
    status,
    session_id: userId,
    last_error: patch.error || null,
    updated_at: now,
  };
  if (patch.phone !== undefined) connectionPayload.display_phone_number = patch.phone || null;
  if (status === 'connected') connectionPayload.connected_at = now;

  const { error: connectionError } = await admin
    .from('whatsapp_connections')
    .upsert(connectionPayload, { onConflict: 'user_id,connection_mode' });
  if (connectionError) logger.error({ error: connectionError, userId }, 'falha ao atualizar whatsapp_connections');

  const accountPayload = {
    user_id: userId,
    provider: 'whatsapp_linked',
    status,
    settings: { mode: 'linked_device' },
    last_error: patch.error || null,
    last_sync_at: now,
    updated_at: now,
  };
  if (patch.phone !== undefined) accountPayload.account_name = patch.phone || null;
  if (status === 'connected') accountPayload.connected_at = now;

  const { error: integrationError } = await admin
    .from('integration_accounts')
    .upsert(accountPayload, { onConflict: 'user_id,provider' });
  if (integrationError) logger.error({ error: integrationError, userId }, 'falha ao atualizar integration_accounts');
};

const sessionManager = new SessionManager({ config, admin, logger, saveConnection });

app.get('/health', (_req, res) => res.json({
  ok: true,
  service: 'studioflow-whatsapp-connector',
  node: process.version,
  activeSessions: sessionManager.size(),
  timestamp: new Date().toISOString(),
}));

app.use('/api', authenticate);

app.get('/api/session', async (req, res, next) => {
  try {
    let holder = sessionManager.get(req.user.id);
    if (!holder) {
      const { data, error } = await admin
        .from('whatsapp_connections')
        .select('status,display_phone_number,last_error')
        .eq('user_id', req.user.id)
        .eq('connection_mode', 'linked_device')
        .maybeSingle();
      if (error) throw error;
      if (['connected', 'connecting', 'qr'].includes(data?.status)) {
        holder = await sessionManager.start(req.user.id);
      } else {
        return res.json({
          status: data?.status || 'disconnected',
          phone: data?.display_phone_number || null,
          error: data?.last_error || null,
        });
      }
    }
    return res.json({ status: holder.status, qr: holder.qr, phone: holder.phone });
  } catch (error) { return next(error); }
});

app.post('/api/session/start', async (req, res, next) => {
  try {
    const holder = await sessionManager.start(req.user.id);
    return res.json({ status: holder.status, qr: holder.qr, phone: holder.phone });
  } catch (error) { return next(error); }
});

app.delete('/api/session', async (req, res, next) => {
  try {
    await sessionManager.stop(req.user.id, { logout: true, removeData: true });
    return res.json({ ok: true });
  } catch (error) { return next(error); }
});

app.post('/api/messages/send', async (req, res, next) => {
  try {
    const holder = sessionManager.get(req.user.id);
    if (!holder?.socket || holder.status !== 'connected') {
      return res.status(409).json({ error: 'WhatsApp pelo celular não está conectado.' });
    }

    const { to, text, conversationId, contactId } = req.body || {};
    const phone = String(to || '').replace(/\D/g, '');
    const cleanText = String(text || '').trim();
    if (!phone || !cleanText || !conversationId || !contactId) {
      return res.status(400).json({ error: 'Telefone, mensagem, conversa e contato são obrigatórios.' });
    }

    const sent = await holder.socket.sendMessage(`${phone}@s.whatsapp.net`, { text: cleanText });
    holder.store.rememberMessage(sent);
    const now = new Date().toISOString();
    const payload = JSON.parse(JSON.stringify(sent, (_key, value) => typeof value === 'bigint' ? value.toString() : value));

    const { error: messageError } = await admin.from('whatsapp_messages').upsert({
      user_id: req.user.id,
      conversation_id: conversationId,
      contact_id: contactId,
      whatsapp_message_id: sent.key.id,
      direction: 'outbound',
      message_type: 'text',
      body: cleanText,
      status: 'sent',
      sent_at: now,
      payload,
    }, { onConflict: 'user_id,whatsapp_message_id', ignoreDuplicates: true });
    if (messageError) throw messageError;

    const { error: conversationError } = await admin
      .from('whatsapp_conversations')
      .update({ last_message_preview: cleanText.slice(0, 240), last_message_at: now, updated_at: now })
      .eq('id', conversationId)
      .eq('user_id', req.user.id);
    if (conversationError) throw conversationError;

    return res.json({ ok: true, id: sent.key.id });
  } catch (error) { return next(error); }
});

app.use((error, req, res, _next) => {
  logger.error({ error, method: req.method, path: req.path, userId: req.user?.id }, 'erro na API do conector');
  res.status(500).json({ error: error?.message || 'Erro interno do conector WhatsApp.' });
});

await fs.mkdir(config.sessionDir, { recursive: true });
const server = app.listen(config.port, () => {
  logger.info({ port: config.port, node: process.version, sessionDir: config.sessionDir }, 'StudioFlow WhatsApp connector iniciado');
});

sessionManager.restoreConnectedSessions().catch((error) => logger.error({ error }, 'falha ao restaurar sessões na inicialização'));

const shutdown = async (signal) => {
  logger.info({ signal }, 'encerrando conector');
  server.close();
  await sessionManager.shutdown();
  process.exit(0);
};
process.once('SIGTERM', () => shutdown('SIGTERM'));
process.once('SIGINT', () => shutdown('SIGINT'));
