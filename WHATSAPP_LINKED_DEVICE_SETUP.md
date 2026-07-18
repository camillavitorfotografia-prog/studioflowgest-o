# WhatsApp pelo celular — StudioFlow

Esta modalidade mantém o WhatsApp Business funcionando no celular e conecta o StudioFlow como aparelho vinculado.

## 1. Banco
Aplique a migration `20260718010000_whatsapp_linked_device.sql`.

## 2. Conector persistente
Publique a pasta `whatsapp-connector` no Railway ou Render. O serviço precisa de volume persistente em `/data`.

Variáveis obrigatórias:
- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `SESSION_DIR=/data/sessions`
- `ALLOWED_ORIGIN=http://localhost:5173,https://SEU_DOMINIO`

## 3. Front-end
Adicione ao `.env` do StudioFlow:
`VITE_WHATSAPP_CONNECTOR_URL=https://URL-DO-CONECTOR`

## 4. Pareamento
Configurações → Integrações → WhatsApp pelo celular → Gerar QR Code.
No telefone: WhatsApp Business → Aparelhos conectados → Conectar aparelho.
