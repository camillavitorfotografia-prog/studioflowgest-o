# StudioFlow WhatsApp Connector v2

Conector persistente de produção para vincular o WhatsApp Business ao StudioFlow como aparelho conectado.

## Arquitetura

- Sessão Baileys persistida em volume Railway (`/data/sessions/<user_id>`).
- Store local persistente e atômica para mensagens recentes, contatos, chats e mapeamentos LID ↔ número.
- Retry controlado de mensagens placeholder com `getMessage`, caches de retry e `requestPlaceholderResend` nativos do Baileys.
- Processamento unificado de mensagens ao vivo, respostas de placeholder e sincronização de histórico.
- Ingestão idempotente no Supabase por usuário e ID da mensagem.
- Reconexão automática com backoff exponencial e restauração das sessões após reinício do Railway.
- Status, grupos, newsletters e broadcasts são ignorados antes da descriptografia/processamento.

## Requisitos

- Node.js 22
- Railway com volume persistente montado em `/data`
- Projeto Supabase do StudioFlow
- Migração `20260718190000_whatsapp_connector_v2.sql` aplicada

## Variáveis obrigatórias

```env
SUPABASE_URL=https://SEU-PROJETO.supabase.co
SUPABASE_ANON_KEY=SUA_CHAVE_ANON
SUPABASE_SERVICE_ROLE_KEY=SUA_CHAVE_SERVICE_ROLE
ALLOWED_ORIGIN=https://SEU-STUDIOFLOW.vercel.app,http://localhost:5173
SESSION_DIR=/data/sessions
```

## Variáveis operacionais

```env
LOG_LEVEL=info
WHATSAPP_HISTORY_SYNC=true
WHATSAPP_HISTORY_MESSAGE_LIMIT=10000
WHATSAPP_MAX_MESSAGE_RETRIES=5
WHATSAPP_RECONNECT_BASE_MS=3000
WHATSAPP_RECONNECT_MAX_MS=60000
WHATSAPP_STORE_FLUSH_MS=750
```

O Railway fornece `PORT` automaticamente.

## Deploy no Railway

Dentro da pasta `whatsapp-connector`:

```powershell
npm ci
npm run check
railway up
```

Confirme no serviço:

1. `NIXPACKS_NODE_VERSION=22`.
2. Volume persistente montado em `/data`.
3. Domínio público em **Settings → Networking**.
4. Variáveis do Supabase e CORS configuradas.
5. Healthcheck em `/health`.

## Frontend

No Vercel:

```env
VITE_WHATSAPP_CONNECTOR_URL=https://SEU-DOMINIO.up.railway.app
```

## Segurança

A `SUPABASE_SERVICE_ROLE_KEY` pertence somente ao Railway. Nunca deve ser exposta no React, Vercel ou navegador.

## Observação

O conector utiliza o protocolo de aparelho vinculado do WhatsApp Web. A operação depende da compatibilidade contínua do Baileys com mudanças do protocolo do WhatsApp.
