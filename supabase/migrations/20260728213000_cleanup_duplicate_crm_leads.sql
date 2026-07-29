-- StudioFlow CRM — índice auxiliar para localizar duplicidades fortes.
--
-- Importante: esta migration NÃO remove nem envia leads para a lixeira.
-- Nome, serviço ou data incompletos não são evidência suficiente para apagar
-- um contato comercial. A confirmação de mesclagem deve ocorrer no aplicativo.

create index if not exists leads_identity_lookup_idx
on public.leads (
  user_id,
  regexp_replace(coalesce(whatsapp, telefone, ''), '\D', '', 'g'),
  lower(trim(coalesce(email, ''))),
  lower(trim(coalesce(tipo_servico, ''))),
  data_evento
)
where coalesce(na_lixeira, false) = false and deleted_at is null;
