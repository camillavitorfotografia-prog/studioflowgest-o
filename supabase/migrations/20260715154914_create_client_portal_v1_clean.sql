create extension if not exists pgcrypto;

create table if not exists public.client_portals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  organization_id uuid null,
  client_id uuid not null references public.clientes(id) on delete cascade,
  project_id uuid null references public.projetos(id) on delete set null,
  name text not null default 'Portal do cliente',
  status text not null default 'active' check (status in ('active', 'disabled')),
  sections jsonb not null default '{"overview":true,"schedule":true,"financial":true,"documents":true,"files":true,"messages":true}'::jsonb,
  welcome_message text not null default '',
  access_token_hash text not null unique,
  access_token_preview text not null default '',
  expires_at timestamptz null,
  last_accessed_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists client_portals_user_id_idx on public.client_portals(user_id);
create index if not exists client_portals_client_id_idx on public.client_portals(client_id);
create index if not exists client_portals_project_id_idx on public.client_portals(project_id);
create index if not exists client_portals_status_idx on public.client_portals(status);

alter table public.client_portals enable row level security;

drop policy if exists client_portals_select_owner on public.client_portals;
create policy client_portals_select_owner on public.client_portals
for select to authenticated
using (auth.uid() = user_id);

drop policy if exists client_portals_insert_owner on public.client_portals;
create policy client_portals_insert_owner on public.client_portals
for insert to authenticated
with check (auth.uid() = user_id);

drop policy if exists client_portals_update_owner on public.client_portals;
create policy client_portals_update_owner on public.client_portals
for update to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists client_portals_delete_owner on public.client_portals;
create policy client_portals_delete_owner on public.client_portals
for delete to authenticated
using (auth.uid() = user_id);

create or replace function public.get_client_portal_by_token(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_portal public.client_portals%rowtype;
  v_result jsonb;
begin
  select * into v_portal
  from public.client_portals
  where access_token_hash = encode(digest(p_token, 'sha256'), 'hex')
    and status = 'active'
    and (expires_at is null or expires_at > now())
  limit 1;

  if v_portal.id is null then
    return null;
  end if;

  update public.client_portals
  set last_accessed_at = now(), updated_at = now()
  where id = v_portal.id;

  select jsonb_build_object(
    'portal', to_jsonb(v_portal) - 'access_token_hash',
    'client', (
      select to_jsonb(c)
      from public.clientes c
      where c.id = v_portal.client_id
    ),
    'projects', coalesce((
      select jsonb_agg(to_jsonb(p) order by p.created_at desc)
      from public.projetos p
      where p.cliente_id = v_portal.client_id
        and (v_portal.project_id is null or p.id = v_portal.project_id)
    ), '[]'::jsonb),
    'documents', coalesce((
      select jsonb_agg(to_jsonb(d) order by d.updated_at desc)
      from public.document_instances d
      where d.user_id = v_portal.user_id
        and d.client_id = v_portal.client_id
        and (v_portal.project_id is null or d.project_id = v_portal.project_id)
    ), '[]'::jsonb)
  ) into v_result;

  return v_result;
end;
$$;

grant execute on function public.get_client_portal_by_token(text) to anon, authenticated;;
