-- Já aplicada ao projeto Supabase nxceoqjbzekystekxaav.
-- Mantida no pacote para versionamento local.
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
