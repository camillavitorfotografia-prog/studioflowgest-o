create table if not exists public.equipamentos (
  id text primary key,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  nome text not null,
  categoria text not null default 'Outro',
  marca text,
  modelo text,
  numero_serie text,
  fornecedor text,
  status text not null default 'Ativo',
  valor numeric not null default 0,
  valor_compra numeric not null default 0,
  data_compra text,
  garantia_ate text,
  proxima_revisao text,
  vida_util_anos numeric not null default 5,
  valor_residual numeric not null default 0,
  metodo_depreciacao text not null default 'linear',
  observacoes text,
  manutencoes jsonb not null default '[]'::jsonb,
  origem text not null default 'manual',
  import_batch_id uuid,
  fingerprint text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists equipamentos_user_id_idx on public.equipamentos(user_id);
create index if not exists equipamentos_fingerprint_idx on public.equipamentos(user_id, fingerprint);

alter table public.equipamentos enable row level security;
drop policy if exists equipamentos_select_own on public.equipamentos;
create policy equipamentos_select_own on public.equipamentos for select using (auth.uid() = user_id);
drop policy if exists equipamentos_insert_own on public.equipamentos;
create policy equipamentos_insert_own on public.equipamentos for insert with check (auth.uid() = user_id);
drop policy if exists equipamentos_update_own on public.equipamentos;
create policy equipamentos_update_own on public.equipamentos for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists equipamentos_delete_own on public.equipamentos;
create policy equipamentos_delete_own on public.equipamentos for delete using (auth.uid() = user_id);

create table if not exists public.import_batches (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  source_name text not null,
  source_type text not null,
  status text not null default 'completed',
  summary jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists import_batches_user_id_idx on public.import_batches(user_id, created_at desc);
alter table public.import_batches enable row level security;
drop policy if exists import_batches_select_own on public.import_batches;
create policy import_batches_select_own on public.import_batches for select using (auth.uid() = user_id);
drop policy if exists import_batches_insert_own on public.import_batches;
create policy import_batches_insert_own on public.import_batches for insert with check (auth.uid() = user_id);
drop policy if exists import_batches_delete_own on public.import_batches;
create policy import_batches_delete_own on public.import_batches for delete using (auth.uid() = user_id);;
