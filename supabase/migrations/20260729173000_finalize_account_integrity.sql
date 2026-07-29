-- StudioFlow: integridade final do isolamento por conta.
-- Esta migration complementa 20260729113857_multitenant_account_isolation.sql.

-- Os payloads de importação também contêm dados privados e precisam ser
-- separados por conta. A chave primária passa a aceitar o mesmo payload_key
-- em contas diferentes.
do $$
declare
  legacy_owner uuid;
begin
  if to_regclass('public.migration_payloads') is null then
    return;
  end if;

  select legacy_owner_id into legacy_owner
  from public.studioflow_tenant_registry
  where singleton = true;

  alter table public.migration_payloads
    add column if not exists user_id uuid references auth.users(id) on delete cascade;

  alter table public.migration_payloads
    alter column user_id set default auth.uid();

  if legacy_owner is not null then
    update public.migration_payloads
    set user_id = legacy_owner
    where user_id is null;
  end if;

  if exists (select 1 from public.migration_payloads where user_id is null) then
    raise exception 'migration_payloads ainda possui registros sem proprietário';
  end if;

  alter table public.migration_payloads alter column user_id set not null;
  alter table public.migration_payloads drop constraint if exists migration_payloads_pkey;
  alter table public.migration_payloads
    add constraint migration_payloads_pkey primary key (user_id, payload_key, seq);

  alter table public.migration_payloads enable row level security;
  alter table public.migration_payloads force row level security;

  drop policy if exists migration_payloads_select_own on public.migration_payloads;
  drop policy if exists migration_payloads_insert_own on public.migration_payloads;
  drop policy if exists migration_payloads_update_own on public.migration_payloads;
  drop policy if exists migration_payloads_delete_own on public.migration_payloads;

  create policy migration_payloads_select_own on public.migration_payloads
    for select to authenticated using (user_id = auth.uid());
  create policy migration_payloads_insert_own on public.migration_payloads
    for insert to authenticated with check (user_id = auth.uid());
  create policy migration_payloads_update_own on public.migration_payloads
    for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
  create policy migration_payloads_delete_own on public.migration_payloads
    for delete to authenticated using (user_id = auth.uid());

  drop trigger if exists studioflow_assign_current_user on public.migration_payloads;
  create trigger studioflow_assign_current_user
    before insert or update of user_id on public.migration_payloads
    for each row execute function public.studioflow_assign_current_user();

  create index if not exists migration_payloads_user_id_idx
    on public.migration_payloads(user_id);
end $$;

-- Impede associações cruzadas entre contas. RLS bloqueia a leitura, mas sem
-- esta validação um registro filho ainda poderia guardar o id de um pai de
-- outra conta por meio de uma operação privilegiada ou fluxo defeituoso.
create or replace function public.studioflow_assert_same_owner_reference()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  local_column text := tg_argv[0];
  parent_table text := tg_argv[1];
  parent_column text := coalesce(nullif(tg_argv[2], ''), 'id');
  reference_value text;
  row_owner uuid;
  parent_owner uuid;
begin
  reference_value := to_jsonb(new) ->> local_column;
  if reference_value is null or btrim(reference_value) = '' then
    return new;
  end if;

  row_owner := nullif(to_jsonb(new) ->> 'user_id', '')::uuid;
  if row_owner is null then
    return new;
  end if;

  execute format(
    'select user_id from public.%I where %I::text = $1 limit 1',
    parent_table,
    parent_column
  ) into parent_owner using reference_value;

  -- A chave estrangeira existente (quando aplicável) trata referências
  -- inexistentes. Aqui validamos somente a propriedade quando o pai existe.
  if parent_owner is not null and parent_owner <> row_owner then
    raise exception using
      errcode = '42501',
      message = format(
        'Associação entre contas bloqueada: public.%s.%s pertence a outro usuário.',
        parent_table,
        parent_column
      );
  end if;

  return new;
end;
$$;

revoke all on function public.studioflow_assert_same_owner_reference() from public;

-- Instala os validadores somente quando tabelas e colunas realmente existem.
do $$
declare
  relation record;
  trigger_name text;
begin
  for relation in
    select * from (values
      ('clientes', 'indicacao_cliente_id', 'clientes', 'id'),
      ('projetos', 'cliente_id', 'clientes', 'id'),
      ('projetos', 'import_batch_id', 'import_batches', 'id'),
      ('financas', 'client_id', 'clientes', 'id'),
      ('financas', 'project_id', 'projetos', 'id'),
      ('document_instances', 'template_id', 'document_templates', 'id'),
      ('document_instances', 'client_id', 'clientes', 'id'),
      ('document_instances', 'project_id', 'projetos', 'id'),
      ('client_portals', 'client_id', 'clientes', 'id'),
      ('client_portals', 'project_id', 'projetos', 'id'),
      ('file_assets', 'folder_id', 'file_folders', 'id'),
      ('file_assets', 'client_id', 'clientes', 'id'),
      ('file_assets', 'project_id', 'projetos', 'id'),
      ('file_folders', 'parent_id', 'file_folders', 'id'),
      ('file_folders', 'client_id', 'clientes', 'id'),
      ('file_folders', 'project_id', 'projetos', 'id'),
      ('galleries', 'client_id', 'clientes', 'id'),
      ('galleries', 'project_id', 'projetos', 'id'),
      ('galleries', 'cover_photo_id', 'gallery_photos', 'id'),
      ('gallery_photos', 'gallery_id', 'galleries', 'id'),
      ('gallery_events', 'gallery_id', 'galleries', 'id'),
      ('gallery_events', 'photo_id', 'gallery_photos', 'id'),
      ('whatsapp_contacts', 'lead_id', 'leads', 'id'),
      ('whatsapp_contacts', 'client_id', 'clientes', 'id'),
      ('whatsapp_contacts', 'project_id', 'projetos', 'id'),
      ('whatsapp_conversations', 'contact_id', 'whatsapp_contacts', 'id'),
      ('whatsapp_conversations', 'lead_id', 'leads', 'id'),
      ('whatsapp_conversations', 'client_id', 'clientes', 'id'),
      ('whatsapp_conversations', 'project_id', 'projetos', 'id'),
      ('whatsapp_messages', 'conversation_id', 'whatsapp_conversations', 'id'),
      ('whatsapp_messages', 'contact_id', 'whatsapp_contacts', 'id')
    ) as refs(child_table, child_column, parent_table, parent_column)
  loop
    if to_regclass(format('public.%I', relation.child_table)) is null
       or to_regclass(format('public.%I', relation.parent_table)) is null
       or not exists (
         select 1 from information_schema.columns
         where table_schema = 'public'
           and table_name = relation.child_table
           and column_name = relation.child_column
       )
       or not exists (
         select 1 from information_schema.columns
         where table_schema = 'public'
           and table_name = relation.child_table
           and column_name = 'user_id'
       )
       or not exists (
         select 1 from information_schema.columns
         where table_schema = 'public'
           and table_name = relation.parent_table
           and column_name = 'user_id'
       ) then
      continue;
    end if;

    trigger_name := left(
      format('zz_studioflow_owner_%s_%s', relation.child_table, relation.child_column),
      63
    );

    execute format(
      'drop trigger if exists %I on public.%I',
      trigger_name,
      relation.child_table
    );
    execute format(
      'create trigger %I before insert or update on public.%I '
      'for each row execute function public.studioflow_assert_same_owner_reference(%L, %L, %L)',
      trigger_name,
      relation.child_table,
      relation.child_column,
      relation.parent_table,
      relation.parent_column
    );
  end loop;
end $$;
