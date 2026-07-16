-- Backend seguro para OAuth Google. Tokens ficam inacessíveis ao frontend.
create table if not exists public.integration_oauth_states (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null,
  return_url text not null,
  expires_at timestamptz not null default (now() + interval '10 minutes'),
  used_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.integration_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null,
  access_token_encrypted text,
  refresh_token_encrypted text,
  token_type text,
  scopes text[] not null default '{}',
  expires_at timestamptz,
  account_email text,
  account_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id, provider)
);

alter table public.integration_oauth_states enable row level security;
alter table public.integration_tokens enable row level security;

-- Sem policies para anon/authenticated: somente service_role nas Edge Functions.
revoke all on public.integration_oauth_states from anon, authenticated;
revoke all on public.integration_tokens from anon, authenticated;

create index if not exists integration_oauth_states_expires_idx
  on public.integration_oauth_states (expires_at);
create index if not exists integration_tokens_user_provider_idx
  on public.integration_tokens (user_id, provider);
