alter table public.clientes
  add column if not exists cpf_cnpj text,
  add column if not exists endereco text,
  add column if not exists data_nascimento date,
  add column if not exists origem text,
  add column if not exists indicacao text,
  add column if not exists indicacao_cliente_id uuid references public.clientes(id) on delete set null,
  add column if not exists observacoes text,
  add column if not exists datas_importantes jsonb not null default '[]'::jsonb,
  add column if not exists historico_contatos jsonb not null default '[]'::jsonb,
  add column if not exists data_primeiro_contato date,
  add column if not exists data_ultimo_contato date,
  add column if not exists data_proximo_retorno date,
  add column if not exists status_comercial text not null default 'novo',
  add column if not exists status text not null default 'ativo',
  add column if not exists cliente_desde timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

create index if not exists clientes_cpf_cnpj_idx on public.clientes (cpf_cnpj);
create index if not exists clientes_email_lower_idx on public.clientes (lower(email));
create index if not exists clientes_telefone_idx on public.clientes (telefone);
