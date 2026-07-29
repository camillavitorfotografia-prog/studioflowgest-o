create table if not exists public.integration_accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null,
  status text not null default 'not_connected',
  account_email text,
  account_name text,
  scopes text[] not null default '{}',
  settings jsonb not null default '{}'::jsonb,
  last_sync_at timestamptz,
  last_error text,
  connected_at timestamptz,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id, provider)
);

create table if not exists public.integration_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null,
  level text not null default 'info',
  action text not null,
  message text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.integration_accounts enable row level security;
alter table public.integration_logs enable row level security;

create policy "integration_accounts_select_own" on public.integration_accounts for select using (auth.uid() = user_id);
create policy "integration_accounts_insert_own" on public.integration_accounts for insert with check (auth.uid() = user_id);
create policy "integration_accounts_update_own" on public.integration_accounts for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "integration_accounts_delete_own" on public.integration_accounts for delete using (auth.uid() = user_id);

create policy "integration_logs_select_own" on public.integration_logs for select using (auth.uid() = user_id);
create policy "integration_logs_insert_own" on public.integration_logs for insert with check (auth.uid() = user_id);

create index if not exists integration_accounts_user_provider_idx on public.integration_accounts(user_id, provider);
create index if not exists integration_logs_user_provider_created_idx on public.integration_logs(user_id, provider, created_at desc);

create or replace function public.touch_integration_accounts_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_touch_integration_accounts on public.integration_accounts;
create trigger trg_touch_integration_accounts
before update on public.integration_accounts
for each row execute function public.touch_integration_accounts_updated_at();;
