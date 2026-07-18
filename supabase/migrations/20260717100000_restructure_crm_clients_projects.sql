-- StudioFlow ERP: vínculos, lixeira e suporte definitivo a trabalhos sem data.
alter table if exists public.leads
  add column if not exists deleted_at timestamptz,
  add column if not exists na_lixeira boolean not null default false,
  add column if not exists convertido_cliente_id uuid references public.clientes(id) on delete set null,
  add column if not exists convertido_projeto_id uuid references public.projetos(id) on delete set null,
  add column if not exists data_ultimo_contato date,
  add column if not exists data_proximo_followup date,
  add column if not exists historico jsonb not null default '[]'::jsonb;

alter table if exists public.projetos
  alter column data drop not null,
  add column if not exists lead_id uuid references public.leads(id) on delete set null,
  add column if not exists arquivado boolean not null default false,
  add column if not exists updated_at timestamptz not null default now();

alter table if exists public.clientes
  add column if not exists arquivado boolean not null default false,
  add column if not exists archived_at timestamptz;

create index if not exists leads_lixeira_idx on public.leads (na_lixeira, deleted_at);
create index if not exists leads_proximo_followup_idx on public.leads (data_proximo_followup);
create index if not exists projetos_cliente_id_idx on public.projetos (cliente_id);
create index if not exists projetos_lead_id_idx on public.projetos (lead_id);
