import express from 'express';
import cors from 'cors';
import QRCode from 'qrcode';
import pino from 'pino';
import { createClient } from '@supabase/supabase-js';
import makeWASocket, { DisconnectReason, fetchLatestBaileysVersion, useMultiFileAuthState } from '@whiskeysockets/baileys';
import fs from 'node:fs/promises';
import path from 'node:path';

const { SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY, SESSION_DIR='/data/sessions', PORT=3001, ALLOWED_ORIGIN='*' } = process.env;
if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !SUPABASE_SERVICE_ROLE_KEY) throw new Error('Supabase env vars ausentes.');
const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession:false } });
const authClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth: { persistSession:false } });
const logger = pino({ level: process.env.LOG_LEVEL || 'warn' });
const sessions = new Map();
const app = express();
app.use(cors({ origin: ALLOWED_ORIGIN === '*' ? true : ALLOWED_ORIGIN.split(',') }));
app.use(express.json({ limit:'2mb' }));

const authenticate = async (req,res,next) => {
  const token = String(req.headers.authorization || '').replace(/^Bearer\s+/i,'');
  const { data, error } = await authClient.auth.getUser(token);
  if (error || !data.user) return res.status(401).json({ error:'Sessão inválida.' });
  req.user = data.user; next();
};

const sessionPath = (userId) => path.join(SESSION_DIR, userId);
const linkedPhoneId = (userId) => `linked:${userId}`;
const plainText = (message={}) => message.conversation || message.extendedTextMessage?.text || message.imageMessage?.caption || message.videoMessage?.caption || '';
const typeOf = (message={}) => Object.keys(message)[0] || 'unknown';
const jidToPhone = (jid='') => jid.split('@')[0].replace(/\D/g,'');

async function saveConnection(userId, patch={}) {
  await admin.from('whatsapp_connections').upsert({
    user_id:userId, phone_number_id:linkedPhoneId(userId), connection_mode:'linked_device',
    status:patch.status || 'connecting', display_phone_number:patch.phone || null,
    session_id:userId, last_error:patch.error || null, updated_at:new Date().toISOString(),
    connected_at:patch.status === 'connected' ? new Date().toISOString() : undefined,
  }, { onConflict:'user_id,connection_mode' });
  await admin.from('integration_accounts').upsert({
    user_id:userId, provider:'whatsapp_linked', status:patch.status || 'connecting',
    account_name:patch.phone || null, settings:{ mode:'linked_device' },
    last_error:patch.error || null, connected_at:patch.status === 'connected' ? new Date().toISOString() : null,
    last_sync_at:new Date().toISOString(),
  }, { onConflict:'user_id,provider' });
}

async function startSession(userId) {
  if (sessions.get(userId)?.socket) return sessions.get(userId);
  await fs.mkdir(sessionPath(userId), { recursive:true });
  const { state, saveCreds } = await useMultiFileAuthState(sessionPath(userId));
  const { version } = await fetchLatestBaileysVersion();
  const holder = { status:'connecting', qr:null, phone:null, socket:null };
  sessions.set(userId, holder);
  const socket = makeWASocket({ auth:state, version, logger, printQRInTerminal:false, browser:['StudioFlow','Chrome','1.0.0'], syncFullHistory:false, markOnlineOnConnect:false });
  holder.socket = socket;
  socket.ev.on('creds.update', saveCreds);
  socket.ev.on('connection.update', async ({ connection, lastDisconnect, qr }) => {
    if (qr) { holder.qr = await QRCode.toDataURL(qr); holder.status='qr'; await saveConnection(userId,{status:'connecting'}); }
    if (connection === 'open') { holder.status='connected'; holder.qr=null; holder.phone=jidToPhone(socket.user?.id); await saveConnection(userId,{status:'connected',phone:holder.phone}); }
    if (connection === 'close') {
      const code = lastDisconnect?.error?.output?.statusCode;
      const logout = code === DisconnectReason.loggedOut;
      holder.status = logout ? 'disconnected' : 'connecting';
      await saveConnection(userId,{status:holder.status,error:lastDisconnect?.error?.message});
      sessions.delete(userId);
      if (!logout) setTimeout(()=>startSession(userId).catch(()=>{}),3000);
    }
  });
  socket.ev.on('messages.upsert', async ({ messages, type }) => {
    if (type !== 'notify') return;
    for (const item of messages) {
      if (!item.message || item.key.fromMe || item.key.remoteJid?.endsWith('@g.us') || item.key.remoteJid === 'status@broadcast') continue;
      const phone = jidToPhone(item.key.remoteJid);
      const timestamp = new Date(Number(item.messageTimestamp || Date.now()/1000)*1000).toISOString();
      await admin.rpc('ingest_whatsapp_message', {
        p_phone_number_id:linkedPhoneId(userId), p_wa_id:phone,
        p_profile_name:item.pushName || null, p_message_id:item.key.id,
        p_message_type:typeOf(item.message), p_body:plainText(item.message),
        p_timestamp:timestamp, p_payload:item,
      });
    }
  });
  return holder;
}

app.get('/health', (_req,res)=>res.json({ok:true}));
app.use('/api', authenticate);
app.get('/api/session', async (req,res) => {
  let holder=sessions.get(req.user.id);
  if (!holder) {
    const { data } = await admin.from('whatsapp_connections').select('*').eq('user_id',req.user.id).eq('connection_mode','linked_device').maybeSingle();
    if (data?.status === 'connected') holder = await startSession(req.user.id).catch(()=>null);
  }
  res.json(holder ? {status:holder.status,qr:holder.qr,phone:holder.phone} : {status:'disconnected'});
});
app.post('/api/session/start', async (req,res) => {
  const holder=await startSession(req.user.id);
  res.json({status:holder.status,qr:holder.qr,phone:holder.phone});
});
app.delete('/api/session', async (req,res) => {
  const holder=sessions.get(req.user.id);
  try { await holder?.socket?.logout(); } catch {}
  sessions.delete(req.user.id);
  await fs.rm(sessionPath(req.user.id),{recursive:true,force:true});
  await saveConnection(req.user.id,{status:'disconnected'});
  res.json({ok:true});
});
app.post('/api/messages/send', async (req,res) => {
  const holder=sessions.get(req.user.id);
  if (!holder?.socket || holder.status !== 'connected') return res.status(409).json({error:'WhatsApp pelo celular não está conectado.'});
  const { to, text, conversationId, contactId } = req.body || {};
  const phone=String(to||'').replace(/\D/g,'');
  if (!phone || !String(text||'').trim()) return res.status(400).json({error:'Telefone e mensagem são obrigatórios.'});
  const sent=await holder.socket.sendMessage(`${phone}@s.whatsapp.net`,{text:String(text).trim()});
  const now=new Date().toISOString();
  await admin.from('whatsapp_messages').insert({ user_id:req.user.id, conversation_id:conversationId, contact_id:contactId, whatsapp_message_id:sent.key.id, direction:'outbound', message_type:'text', body:String(text).trim(), status:'sent', sent_at:now, payload:sent });
  await admin.from('whatsapp_conversations').update({last_message_preview:String(text).trim().slice(0,240),last_message_at:now,updated_at:now}).eq('id',conversationId).eq('user_id',req.user.id);
  res.json({ok:true,id:sent.key.id});
});

await fs.mkdir(SESSION_DIR,{recursive:true});
app.listen(PORT,()=>logger.info(`StudioFlow WhatsApp connector on ${PORT}`));
