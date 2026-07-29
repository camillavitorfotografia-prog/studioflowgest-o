-- StudioFlow: isolamento definitivo de dados por conta autenticada.
-- Registros legados sem proprietário são atribuídos à conta mais antiga,
-- preservando os dados existentes e mantendo contas novas completamente vazias.

create table if not exists public.studioflow_tenant_registry (
  singleton boolean primary key default true check (singleton),
  legacy_owner_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.studioflow_tenant_registry (singleton, legacy_owner_id)
select true, u.id
from auth.users u
order by u.created_at asc, u.id asc
limit 1
on conflict (singleton) do nothing;

update public.studioflow_tenant_registry registry
set legacy_owner_id = owner.id,
    updated_at = now()
from (
  select id
  from auth.users
  order by created_at asc, id asc
  limit 1
) owner
where registry.singleton = true
  and registry.legacy_owner_id is null;

create or replace function public.studioflow_legacy_owner_id()
returns uuid
language sql
stable
security definer
set search_path = public, auth
as $$
  select legacy_owner_id
  from public.studioflow_tenant_registry
  where singleton = true
  limit 1;
$$;

grant execute on function public.studioflow_legacy_owner_id() to authenticated;
revoke all on public.studioflow_tenant_registry from anon, authenticated;

-- Distingue arquivos legados sem pasta de usuário de arquivos pertencentes a
-- outra conta. Isso preserva os uploads antigos da conta principal sem dar a
-- ela acesso aos caminhos UUID de fotógrafos cadastrados futuramente.
create or replace function public.studioflow_storage_path_is_legacy(object_name text)
returns boolean
language sql
stable
security definer
set search_path = public, storage, auth
as $$
  select not exists (
    select 1
    from auth.users account
    where account.id::text = (storage.foldername(object_name))[1]
  );
$$;

revoke all on function public.studioflow_storage_path_is_legacy(text) from public;
grant execute on function public.studioflow_storage_path_is_legacy(text) to authenticated;

-- Adiciona user_id a todas as estruturas privadas existentes.
do $$
declare
  table_name text;
  legacy_owner uuid;
  tables text[] := array[
    'leads',
    'clientes',
    'projetos',
    'financas',
    'equipamentos',
    'perfil',
    'galleries',
    'gallery_photos',
    'gallery_events',
    'client_portals',
    'file_assets',
    'file_folders',
    'document_templates',
    'document_instances',
    'document_versions',
    'contracts',
    'contract_templates',
    'proposals',
    'proposal_templates',
    'gallery_selections',
    'gallery_comments',
    'client_portal_messages',
    'import_batches',
    'integration_accounts',
    'integration_logs',
    'integration_oauth_states',
    'integration_tokens',
    'integration_resource_links',
    'whatsapp_connections',
    'whatsapp_contacts',
    'whatsapp_conversations',
    'whatsapp_messages'
  ];
begin
  select legacy_owner_id into legacy_owner
  from public.studioflow_tenant_registry
  where singleton = true;

  foreach table_name in array tables loop
    if to_regclass(format('public.%I', table_name)) is null then
      continue;
    end if;

    execute format(
      'alter table public.%I add column if not exists user_id uuid references auth.users(id) on delete cascade',
      table_name
    );

    execute format(
      'alter table public.%I alter column user_id set default auth.uid()',
      table_name
    );

    if legacy_owner is not null then
      execute format(
        'update public.%I set user_id = $1 where user_id is null',
        table_name
      ) using legacy_owner;
    end if;
  end loop;
end $$;

-- Filhos herdam o proprietário do registro pai quando possível.
do $$
begin
  if to_regclass('public.gallery_photos') is not null
     and to_regclass('public.galleries') is not null then
    update public.gallery_photos photo
    set user_id = gallery.user_id
    from public.galleries gallery
    where photo.gallery_id = gallery.id
      and photo.user_id is distinct from gallery.user_id;
  end if;

  if to_regclass('public.gallery_events') is not null
     and to_regclass('public.galleries') is not null then
    update public.gallery_events event
    set user_id = gallery.user_id
    from public.galleries gallery
    where event.gallery_id = gallery.id
      and event.user_id is distinct from gallery.user_id;
  end if;
end $$;

create or replace function public.studioflow_assign_current_user()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if new.user_id is null then
    new.user_id := auth.uid();
  end if;

  if auth.uid() is not null and new.user_id is distinct from auth.uid() then
    raise exception 'Registro pertence a outra conta.' using errcode = '42501';
  end if;

  return new;
end;
$$;

create or replace function public.studioflow_assign_gallery_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.user_id is null and new.gallery_id is not null then
    select user_id into new.user_id
    from public.galleries
    where id = new.gallery_id;
  end if;

  if new.user_id is null then
    new.user_id := auth.uid();
  end if;

  return new;
end;
$$;

-- Remove políticas permissivas antigas e cria políticas exclusivas por proprietário.
do $$
declare
  table_name text;
  policy_record record;
  tables text[] := array[
    'leads',
    'clientes',
    'projetos',
    'financas',
    'equipamentos',
    'perfil',
    'galleries',
    'gallery_photos',
    'gallery_events',
    'client_portals',
    'file_assets',
    'file_folders',
    'document_templates',
    'document_instances',
    'document_versions',
    'contracts',
    'contract_templates',
    'proposals',
    'proposal_templates',
    'gallery_selections',
    'gallery_comments',
    'client_portal_messages',
    'import_batches',
    'integration_accounts',
    'integration_logs',
    'integration_oauth_states',
    'integration_tokens',
    'integration_resource_links',
    'whatsapp_connections',
    'whatsapp_contacts',
    'whatsapp_conversations',
    'whatsapp_messages'
  ];
begin
  foreach table_name in array tables loop
    if to_regclass(format('public.%I', table_name)) is null then
      continue;
    end if;

    execute format('alter table public.%I enable row level security', table_name);
    execute format('alter table public.%I force row level security', table_name);

    for policy_record in
      select policyname
      from pg_policies
      where schemaname = 'public' and tablename = table_name
    loop
      execute format(
        'drop policy if exists %I on public.%I',
        policy_record.policyname,
        table_name
      );
    end loop;

    execute format(
      'create policy %I on public.%I for select to authenticated using (user_id = auth.uid())',
      table_name || '_select_own',
      table_name
    );
    execute format(
      'create policy %I on public.%I for insert to authenticated with check (user_id = auth.uid())',
      table_name || '_insert_own',
      table_name
    );
    execute format(
      'create policy %I on public.%I for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid())',
      table_name || '_update_own',
      table_name
    );
    execute format(
      'create policy %I on public.%I for delete to authenticated using (user_id = auth.uid())',
      table_name || '_delete_own',
      table_name
    );

    execute format('drop trigger if exists studioflow_assign_current_user on public.%I', table_name);
    execute format(
      'create trigger studioflow_assign_current_user before insert or update of user_id on public.%I for each row execute function public.studioflow_assign_current_user()',
      table_name
    );

    execute format(
      'create index if not exists %I on public.%I(user_id)',
      table_name || '_user_id_idx',
      table_name
    );
  end loop;
end $$;

-- Eventos e fotos de galeria também podem ser criados por funções públicas seguras.
do $$
begin
  if to_regclass('public.gallery_photos') is not null then
    drop trigger if exists studioflow_assign_gallery_user on public.gallery_photos;
    create trigger studioflow_assign_gallery_user
      before insert or update of gallery_id, user_id on public.gallery_photos
      for each row execute function public.studioflow_assign_gallery_user();
  end if;

  if to_regclass('public.gallery_events') is not null then
    drop trigger if exists studioflow_assign_gallery_user on public.gallery_events;
    create trigger studioflow_assign_gallery_user
      before insert or update of gallery_id, user_id on public.gallery_events
      for each row execute function public.studioflow_assign_gallery_user();
  end if;
end $$;

-- As views financeiras devem respeitar as políticas das tabelas de origem.
do $$
begin
  if to_regclass('public.finance_ledger_canonical') is not null then
    execute 'alter view public.finance_ledger_canonical set (security_invoker = true)';
  end if;
end $$;

-- Storage: contas novas só acessam caminhos iniciados pelo próprio UUID.
-- A conta legada mantém acesso aos arquivos antigos sem prefixo para não perder dados.
do $$
declare
  policy_record record;
begin
  if to_regclass('storage.objects') is not null then
    for policy_record in
      select policyname
      from pg_policies
      where schemaname = 'storage'
        and tablename = 'objects'
        and (
          policyname like 'studioflow_private_%'
          or coalesce(qual, '') ilike '%studioflow-files%'
          or coalesce(qual, '') ilike '%gallery-files%'
          or coalesce(with_check, '') ilike '%studioflow-files%'
          or coalesce(with_check, '') ilike '%gallery-files%'
        )
    loop
      execute format('drop policy if exists %I on storage.objects', policy_record.policyname);
    end loop;

    create policy studioflow_private_select
    on storage.objects
    for select
    to authenticated
    using (
      bucket_id in ('studioflow-files', 'gallery-files')
      and (
        (storage.foldername(name))[1] = auth.uid()::text
        or (
          auth.uid() = public.studioflow_legacy_owner_id()
          and public.studioflow_storage_path_is_legacy(name)
        )
      )
    );

  create policy studioflow_private_insert
    on storage.objects
    for insert
    to authenticated
    with check (
      bucket_id in ('studioflow-files', 'gallery-files')
      and (storage.foldername(name))[1] = auth.uid()::text
    );

  create policy studioflow_private_update
    on storage.objects
    for update
    to authenticated
    using (
      bucket_id in ('studioflow-files', 'gallery-files')
      and (
        (storage.foldername(name))[1] = auth.uid()::text
        or (
          auth.uid() = public.studioflow_legacy_owner_id()
          and public.studioflow_storage_path_is_legacy(name)
        )
      )
    )
    with check (
      bucket_id in ('studioflow-files', 'gallery-files')
      and (storage.foldername(name))[1] = auth.uid()::text
    );

    create policy studioflow_private_delete
      on storage.objects
      for delete
      to authenticated
      using (
        bucket_id in ('studioflow-files', 'gallery-files')
        and (
          (storage.foldername(name))[1] = auth.uid()::text
          or (
            auth.uid() = public.studioflow_legacy_owner_id()
            and public.studioflow_storage_path_is_legacy(name)
          )
        )
      );
  end if;
end $$;
