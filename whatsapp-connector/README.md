# StudioFlow WhatsApp Connector
Backend persistente para parear o WhatsApp Business como aparelho conectado.

## Implantação
1. Publique esta pasta como serviço Node.js no Railway ou Render.
2. Configure as variáveis do `.env.example`.
3. Adicione um volume persistente montado em `/data`.
4. Copie a URL pública para `VITE_WHATSAPP_CONNECTOR_URL` no StudioFlow.
5. Faça um novo deploy do front-end.

## Observação
Este conector usa o protocolo do WhatsApp Web. Pode exigir novo pareamento após mudanças do WhatsApp e não possui as mesmas garantias da Cloud API oficial.
