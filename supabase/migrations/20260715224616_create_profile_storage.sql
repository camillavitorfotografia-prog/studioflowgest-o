create table if not exists public.perfil (
  id text primary key,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  dados jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.perfil enable row level security;

drop policy if exists "perfil_select_own" on public.perfil;
create policy "perfil_select_own" on public.perfil for select using (auth.uid() = user_id);

drop policy if exists "perfil_insert_own" on public.perfil;
create policy "perfil_insert_own" on public.perfil for insert with check (auth.uid() = user_id);

drop policy if exists "perfil_update_own" on public.perfil;
create policy "perfil_update_own" on public.perfil for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "perfil_delete_own" on public.perfil;
create policy "perfil_delete_own" on public.perfil for delete using (auth.uid() = user_id);

create index if not exists perfil_user_id_idx on public.perfil(user_id);;
