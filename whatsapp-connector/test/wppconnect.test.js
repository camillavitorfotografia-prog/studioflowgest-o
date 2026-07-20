import test from 'node:test';
import assert from 'node:assert/strict';
import { WppConnectClient, normalizeWppStatus } from '../src/wppconnect-client.js';
import { WppWebhookProcessor } from '../src/webhook-processor.js';

test('normaliza estados do WPPConnect', () => {
  assert.equal(normalizeWppStatus('CONNECTED'), 'connected');
  assert.equal(normalizeWppStatus('isLogged'), 'connected');
  assert.equal(normalizeWppStatus('UNPAIRED'), 'qr');
  assert.equal(normalizeWppStatus('INITIALIZING'), 'connecting');
});

test('gera token, inicia sessão e envia texto pelo contrato oficial', async () => {
  const calls = [];
  const fetchImpl = async (url, options = {}) => {
    calls.push({ url, options });
    const body = url.includes('generate-token') ? { token: 'abc' }
      : url.includes('start-session') ? { status: 'QRCODE', qrcode: 'A'.repeat(40) }
        : { response: { id: 'msg-1' } };
    return new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });
  };
  const client = new WppConnectClient({ baseUrl: 'http://wpp', secretKey: 'secret', timeoutMs: 1000, logger: console, fetchImpl });
  const started = await client.startSession('studioflow-user', 'http://gateway/webhook');
  assert.equal(started.status, 'QRCODE');
  assert.match(started.qr, /^data:image\/png;base64,/);
  await client.sendText('studioflow-user', '5573999999999', 'Teste');
  assert.ok(calls.some((call) => call.url.endsWith('/send-message')));
});

test('ingere mensagem recebida e ignora grupo', async () => {
  const rpcCalls = [];
  const processor = new WppWebhookProcessor({
    admin: { rpc: async (name, args) => { rpcCalls.push({ name, args }); return { data: { duplicate: false }, error: null }; } },
    logger: { info() {}, warn() {} },
    saveConnection: async () => {},
  });
  await processor.process('user-1', { event: 'onmessage', id: 'false_5573999999999@c.us_A', from: '5573999999999@c.us', body: 'Olá', type: 'chat', timestamp: 1784500000, sender: { pushname: 'Cliente' } });
  assert.equal(rpcCalls.length, 1);
  assert.equal(rpcCalls[0].args.p_wa_id, '5573999999999');
  await processor.process('user-1', { event: 'onmessage', id: 'x', from: '123@g.us', isGroupMsg: true, body: 'grupo' });
  assert.equal(rpcCalls.length, 1);
});
