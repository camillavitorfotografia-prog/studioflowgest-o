# StudioFlow WhatsApp Gateway — WPPConnect

Este serviço preserva a API usada pelo frontend do StudioFlow, mas delega QR Code, sessão e WhatsApp Web ao WPPConnect Server.

## Serviços

1. `wppconnect-server`: executa Chromium/WhatsApp Web e persiste a sessão.
2. `studioflow-whatsapp-connector`: autentica usuários do StudioFlow, recebe webhooks, grava no Supabase e envia mensagens pelo WPPConnect.

## Variáveis obrigatórias

Copie `.env.example` para `.env` e preencha todos os valores. `CONNECTOR_PUBLIC_URL` deve ser acessível pelo WPPConnect Server.

## Execução

```bash
npm ci
npm run check
npm test
npm start
```

O frontend continua usando `VITE_WHATSAPP_CONNECTOR_URL` apontando para este gateway.

## Rotas preservadas

- `GET /api/session`
- `POST /api/session/start`
- `DELETE /api/session`
- `POST /api/messages/send`

O webhook interno é `POST /webhooks/wppconnect/:userId` e exige o segredo configurado.
