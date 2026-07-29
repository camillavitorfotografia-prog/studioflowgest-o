-- StudioFlow CRM — consolida duplicidades óbvias já existentes sem apagar o
-- registro mais recente. O aplicativo também faz a consolidação em tempo real.
-- Esta migração é segura para instalações antigas: ela apenas envia as cópias
-- excedentes para a lixeira e cria um índice auxiliar de busca.

with normalized as (
  select
    id,
    user_id,
    updated_at,
    created_at,
    coalesce(
      nullif(regexp_replace(coalesce(whatsapp, telefone, ''), '\D', '', 'g'), ''),
      nullif(lower(trim(coalesce(email, ''))), ''),
      nullif(lower(trim(coalesce(nome, ''))), '')
    ) as contact_key,
    lower(trim(coalesce(tipo_servico, ''))) as service_key,
    coalesce(data_evento::text, '') as event_key
  from public.leads
  where coalesce(na_lixeira, false) = false
    and deleted_at is null
), ranked as (
  select
    id,
    row_number() over (
      partition by user_id, contact_key, service_key, event_key
      order by updated_at desc nulls last, created_at desc nulls last, id desc
    ) as duplicate_rank
  from normalized
  where contact_key is not null
)
update public.leads as lead
set
  na_lixeira = true,
  deleted_at = now(),
  updated_at = now()
from ranked
where lead.id = ranked.id
  and ranked.duplicate_rank > 1;

create index if not exists leads_identity_lookup_idx
on public.leads (
  user_id,
  regexp_replace(coalesce(whatsapp, telefone, ''), '\D', '', 'g'),
  lower(trim(coalesce(email, ''))),
  lower(trim(coalesce(nome, ''))),
  lower(trim(coalesce(tipo_servico, ''))),
  data_evento
)
where coalesce(na_lixeira, false) = false and deleted_at is null;
