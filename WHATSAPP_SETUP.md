# Ativação do WhatsApp oficial no StudioFlow

A implementação usa a WhatsApp Business Platform oficial, Supabase Edge Functions e webhooks.

## Secrets do Supabase

Cadastre no projeto:

- `WHATSAPP_ACCESS_TOKEN`
- `WHATSAPP_PHONE_NUMBER_ID`
- `WHATSAPP_BUSINESS_ACCOUNT_ID`
- `WHATSAPP_VERIFY_TOKEN` — crie uma frase secreta longa
- `WHATSAPP_APP_SECRET`
- `WHATSAPP_GRAPH_API_VERSION` — opcional; o código usa `v23.0` como fallback configurável

Os secrets `SUPABASE_URL`, `SUPABASE_ANON_KEY` e `SUPABASE_SERVICE_ROLE_KEY` já são disponibilizados às Edge Functions do projeto.

## Publicar

1. Aplique a migration `20260717233000_whatsapp_crm_integration.sql`.
2. Publique:
   - `whatsapp-webhook`
   - `whatsapp-connect`
   - `whatsapp-send`
3. No painel da Meta, configure o callback:
   `https://SEU-PROJETO.supabase.co/functions/v1/whatsapp-webhook`
4. Use o mesmo valor de `WHATSAPP_VERIFY_TOKEN` na Meta.
5. Assine o campo `messages` no webhook da conta do WhatsApp Business.
6. No StudioFlow, abra **Configurações > Integrações > WhatsApp Business > Conectar**.

## Comportamento

- Número novo: cria lead em `Novo lead`, origem `WhatsApp`.
- Número já no CRM: atualiza o lead e reinicia a cadência ao limpar o próximo follow-up.
- Número de cliente conhecido: vincula a conversa ao Cliente e ao Trabalho mais recente, sem duplicar lead.
- Todas as mensagens ficam em **Conversas**.
- Status de envio, entrega, leitura e falha são atualizados pelo webhook.

Tokens nunca são gravados no navegador nem no banco do StudioFlow.
