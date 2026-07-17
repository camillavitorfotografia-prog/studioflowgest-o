create table if not exists public.integration_resource_links (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null,
  resource_type text not null,
  local_id text not null,
  external_id text,
  external_url text,
  checksum text,
  metadata jsonb not null default '{}'::jsonb,
  last_synced_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id, provider, resource_type, local_id)
);

alter table public.integration_resource_links enable row level security;

create policy "integration_resource_links_select_own"
on public.integration_resource_links for select
to authenticated using (auth.uid() = user_id);

create policy "integration_resource_links_insert_own"
on public.integration_resource_links for insert
to authenticated with check (auth.uid() = user_id);

create policy "integration_resource_links_update_own"
on public.integration_resource_links for update
to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "integration_resource_links_delete_own"
on public.integration_resource_links for delete
to authenticated using (auth.uid() = user_id);

create index if not exists integration_resource_links_lookup_idx
on public.integration_resource_links(user_id, provider, resource_type, local_id);
