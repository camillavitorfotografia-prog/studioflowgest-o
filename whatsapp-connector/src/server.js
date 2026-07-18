import express from 'express';
import cors from 'cors';
import QRCode from 'qrcode';
import pino from 'pino';
import { createClient } from '@supabase/supabase-js';
import makeWASocket, {
  DisconnectReason,
  fetchLatestBaileysVersion,
  useMultiFileAuthState,
} from '@whiskeysockets/baileys';
import fs from 'node:fs/promises';
import path from 'node:path';

const {
  SUPABASE_URL,
  SUPABASE_ANON_KEY,
  SUPABASE_SERVICE_ROLE_KEY,
  SESSION_DIR = '/data/sessions',
  PORT = 3001,
  ALLOWED_ORIGIN = '*',
} = process.env;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error('Supabase env vars ausentes.');
}

const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
  realtime: { params: { eventsPerSecond: 1 } },
});
const authClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
  realtime: { params: { eventsPerSecond: 1 } },
});
const logger = pino({ level: process.env.LOG_LEVEL || 'info' });
const sessions = new Map();
const app = express();

const allowedOrigins = ALLOWED_ORIGIN === '*'
  ? true
  : ALLOWED_ORIGIN.split(',').map((origin) => origin.trim()).filter(Boolean);

app.use(cors({ origin: allowedOrigins, credentials: false }));
app.use(express.json({ limit: '2mb' }));

const asyncRoute = (handler) => (req, res, next) => {
  Promise.resolve(handler(req, res, next)).catch(next);
};

const authenticate = asyncRoute(async (req, res, next) => {
  const token = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (!token) return res.status(401).json({ error: 'Sessão não informada.' });

  const { data, error } = await authClient.auth.getUser(token);
  if (error || !data.user) return res.status(401).json({ error: 'Sessão inválida.' });

  req.user = data.user;
  return next();
});

const sessionPath = (userId) => path.join(SESSION_DIR, userId);
const linkedPhoneId = (userId) => `linked:${userId}`;
const plainText = (message = {}) => (
  message.conversation
  || message.extendedTextMessage?.text
  || message.imageMessage?.caption
  || message.videoMessage?.caption
  || message.documentMessage?.caption
  || ''
);
const typeOf = (message = {}) => Object.keys(message)[0] || 'unknown';
const jidToPhone = (jid = '') => jid.split('@')[0].split(':')[0].replace(/\D/g, '');

const toIsoTimestamp = (value) => {
  const numeric = Number(value?.toNumber?.() ?? value ?? Date.now() / 1000);
  const milliseconds = Number.isFinite(numeric) ? numeric * 1000 : Date.now();
  return new Date(milliseconds).toISOString();
};

const safePayload = (value) => {
  try {
    return JSON.parse(JSON.stringify(value, (_key, item) => {
      if (typeof item === 'bigint') return item.toString();
      if (Buffer.isBuffer(item) || item instanceof Uint8Array) {
        return { type: 'bytes', length: item.length };
      }
      return item;
    }));
  } catch (error) {
    logger.warn({ err: error }, 'Não foi possível serializar o payload completo da mensagem.');
    return {};
  }
};

async function saveConnection(userId, patch = {}) {
  const status = patch.status || 'connecting';
  const now = new Date().toISOString();
  const connectionRow = {
    user_id: userId,
    phone_number_id: linkedPhoneId(userId),
    connection_mode: 'linked_device',
    status,
    display_phone_number: patch.phone || null,
    session_id: userId,
    last_error: patch.error || null,
    updated_at: now,
  };

  if (status === 'connected') connectionRow.connected_at = now;

  const { error: connectionError } = await admin
    .from('whatsapp_connections')
    .upsert(connectionRow, { onConflict: 'user_id,connection_mode' });

  if (connectionError) throw connectionError;

  const integrationStatus = status === 'qr' ? 'connecting' : status;
  const { error: integrationError } = await admin
    .from('integration_accounts')
    .upsert({
      user_id: userId,
      provider: 'whatsapp_linked',
      status: integrationStatus,
      account_name: patch.phone || null,
      settings: { mode: 'linked_device' },
      last_error: patch.error || null,
      connected_at: status === 'connected' ? now : null,
      last_sync_at: now,
    }, { onConflict: 'user_id,provider' });

  if (integrationError) logger.warn({ err: integrationError }, 'Falha ao atualizar integration_accounts.');
}

async function startSession(userId) {
  const existing = sessions.get(userId);
  if (existing?.socket && ['connecting', 'qr', 'connected'].includes(existing.status)) return existing;

  await fs.mkdir(sessionPath(userId), { recursive: true });
  const { state, saveCreds } = await useMultiFileAuthState(sessionPath(userId));
  const { version } = await fetchLatestBaileysVersion();
  const holder = {
    status: 'connecting',
    qr: null,
    phone: null,
    socket: null,
    startedAt: new Date().toISOString(),
  };
  sessions.set(userId, holder);
  await saveConnection(userId, { status: 'connecting' });

  const socket = makeWASocket({
    auth: state,
    version,
    logger,
    printQRInTerminal: false,
    browser: ['StudioFlow', 'Chrome', '1.0.0'],
    syncFullHistory: false,
    markOnlineOnConnect: false,
    generateHighQualityLinkPreview: false,
  });
  holder.socket = socket;

  socket.ev.on('creds.update', saveCreds);

  socket.ev.on('connection.update', async ({ connection, lastDisconnect, qr }) => {
    try {
      if (qr) {
        holder.qr = await QRCode.toDataURL(qr, { margin: 2, width: 420 });
        holder.status = 'qr';
        await saveConnection(userId, { status: 'qr' });
      }

      if (connection === 'open') {
        holder.status = 'connected';
        holder.qr = null;
        holder.phone = jidToPhone(socket.user?.id);
        await saveConnection(userId, { status: 'connected', phone: holder.phone });
        logger.info({ userId, phone: holder.phone }, 'WhatsApp conectado.');
      }

      if (connection === 'close') {
        const code = lastDisconnect?.error?.output?.statusCode;
        const logout = code === DisconnectReason.loggedOut;
        holder.status = logout ? 'disconnected' : 'connecting';
        holder.qr = null;
        await saveConnection(userId, {
          status: holder.status,
          error: lastDisconnect?.error?.message || null,
        });
        sessions.delete(userId);

        if (!logout) {
          setTimeout(() => {
            startSession(userId).catch((error) => {
              logger.error({ err: error, userId }, 'Falha na reconexão automática.');
            });
          }, 3000);
        }
      }
    } catch (error) {
      logger.error({ err: error, userId }, 'Falha ao processar atualização da conexão.');
      holder.status = 'error';
      await saveConnection(userId, { status: 'error', error: error.message }).catch(() => {});
    }
  });

  socket.ev.on('messages.upsert', async ({ messages, type }) => {
    if (type !== 'notify') return;

    for (const item of messages) {
      if (
        !item.message
        || item.key.fromMe
        || item.key.remoteJid?.endsWith('@g.us')
        || item.key.remoteJid === 'status@broadcast'
      ) continue;

      try {
        const phone = jidToPhone(item.key.remoteJid);
        if (!phone) continue;

        const { error } = await admin.rpc('ingest_whatsapp_message', {
          p_phone_number_id: linkedPhoneId(userId),
          p_wa_id: phone,
          p_profile_name: item.pushName || null,
          p_message_id: item.key.id,
          p_message_type: typeOf(item.message),
          p_body: plainText(item.message),
          p_timestamp: toIsoTimestamp(item.messageTimestamp),
          p_payload: safePayload(item),
        });

        if (error) throw error;
      } catch (error) {
        logger.error({ err: error, userId }, 'Falha ao registrar mensagem recebida no StudioFlow.');
        await saveConnection(userId, { status: holder.status, error: error.message }).catch(() => {});
      }
    }
  });

  return holder;
}

app.get('/health', (_req, res) => res.json({
  ok: true,
  service: 'studioflow-whatsapp-connector',
  node: process.version,
  activeSessions: sessions.size,
  timestamp: new Date().toISOString(),
}));

app.use('/api', authenticate);

app.get('/api/session', asyncRoute(async (req, res) => {
  let holder = sessions.get(req.user.id);

  if (!holder) {
    const { data, error } = await admin
      .from('whatsapp_connections')
      .select('status,display_phone_number,last_error')
      .eq('user_id', req.user.id)
      .eq('connection_mode', 'linked_device')
      .maybeSingle();

    if (error) throw error;

    if (data?.status === 'connected') {
      holder = await startSession(req.user.id).catch((error) => {
        logger.error({ err: error, userId: req.user.id }, 'Falha ao restaurar sessão.');
        return null;
      });
    }

    if (!holder && data) {
      return res.json({
        status: data.status || 'disconnected',
        phone: data.display_phone_number || null,
        error: data.last_error || null,
      });
    }
  }

  return res.json(holder
    ? { status: holder.status, qr: holder.qr, phone: holder.phone }
    : { status: 'disconnected' });
}));

app.post('/api/session/start', asyncRoute(async (req, res) => {
  const holder = await startSession(req.user.id);
  return res.json({ status: holder.status, qr: holder.qr, phone: holder.phone });
}));

app.delete('/api/session', asyncRoute(async (req, res) => {
  const holder = sessions.get(req.user.id);
  try {
    await holder?.socket?.logout();
  } catch (error) {
    logger.warn({ err: error, userId: req.user.id }, 'Logout remoto não foi concluído.');
  }

  sessions.delete(req.user.id);
  await fs.rm(sessionPath(req.user.id), { recursive: true, force: true });
  await saveConnection(req.user.id, { status: 'disconnected' });
  return res.json({ ok: true });
}));

app.post('/api/messages/send', asyncRoute(async (req, res) => {
  const holder = sessions.get(req.user.id);
  if (!holder?.socket || holder.status !== 'connected') {
    return res.status(409).json({ error: 'WhatsApp pelo celular não está conectado.' });
  }

  const { to, text, conversationId, contactId } = req.body || {};
  const phone = String(to || '').replace(/\D/g, '');
  const body = String(text || '').trim();

  if (!phone || !body) {
    return res.status(400).json({ error: 'Telefone e mensagem são obrigatórios.' });
  }
  if (!conversationId || !contactId) {
    return res.status(400).json({ error: 'Conversa e contato são obrigatórios.' });
  }

  const sent = await holder.socket.sendMessage(`${phone}@s.whatsapp.net`, { text: body });
  const now = new Date().toISOString();

  const { error: messageError } = await admin.from('whatsapp_messages').insert({
    user_id: req.user.id,
    conversation_id: conversationId,
    contact_id: contactId,
    whatsapp_message_id: sent.key.id,
    direction: 'outbound',
    message_type: 'text',
    body,
    status: 'sent',
    sent_at: now,
    payload: safePayload(sent),
  });
  if (messageError) throw messageError;

  const { error: conversationError } = await admin
    .from('whatsapp_conversations')
    .update({
      last_message_preview: body.slice(0, 240),
      last_message_at: now,
      updated_at: now,
    })
    .eq('id', conversationId)
    .eq('user_id', req.user.id);
  if (conversationError) throw conversationError;

  return res.json({ ok: true, id: sent.key.id });
}));

app.use((error, _req, res, _next) => {
  logger.error({ err: error }, 'Erro não tratado na requisição do conector.');
  if (res.headersSent) return;
  res.status(500).json({ error: error?.message || 'Erro interno no conector do WhatsApp.' });
});

await fs.mkdir(SESSION_DIR, { recursive: true });
app.listen(Number(PORT), () => {
  logger.info({ port: Number(PORT), node: process.version }, 'StudioFlow WhatsApp connector iniciado.');
});
