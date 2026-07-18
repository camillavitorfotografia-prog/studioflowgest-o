# StudioFlow WhatsApp Connector

Backend persistente para parear o WhatsApp Business como aparelho conectado, mantendo o aplicativo funcionando no celular.

## Requisitos

- Node.js 22
- Serviço persistente no Railway ou Render
- Volume persistente montado em `/data`
- Projeto Supabase do StudioFlow

## Variáveis obrigatórias

```env
SUPABASE_URL=https://SEU-PROJETO.supabase.co
SUPABASE_ANON_KEY=SUA_CHAVE_ANON
SUPABASE_SERVICE_ROLE_KEY=SUA_SECRET_KEY_DO_BACKEND
ALLOWED_ORIGIN=https://SEU-STUDIOFLOW.vercel.app,http://localhost:5173
SESSION_DIR=/data/sessions
```

O Railway fornece `PORT` automaticamente.

## Publicação no Railway

Dentro da pasta `whatsapp-connector`:

```powershell
railway up
```

No Railway, confirme:

1. `NIXPACKS_NODE_VERSION=22`.
2. Um volume persistente montado em `/data`.
3. Um domínio público em **Settings → Networking**.
4. Todas as variáveis acima configuradas no mesmo serviço.

Depois teste:

```text
https://SEU-DOMINIO.up.railway.app/health
```

A resposta deve conter `"ok": true` e uma versão `v22` do Node.

## Configuração do frontend

No projeto Vercel do StudioFlow:

```env
VITE_WHATSAPP_CONNECTOR_URL=https://SEU-DOMINIO.up.railway.app
```

Faça novo deploy do frontend após alterar essa variável.

## Segurança

- Nunca coloque a chave `service_role` ou `sb_secret_...` no React.
- Não envie `railway variable list` em capturas de tela, pois os valores podem aparecer.
- Use uma Secret key exclusiva para este conector e faça rotação caso ela seja exposta.

## Observação técnica

Este conector usa o protocolo de aparelho vinculado do WhatsApp Web. Ele pode exigir novo pareamento após mudanças do WhatsApp e não possui as mesmas garantias da Cloud API oficial.
