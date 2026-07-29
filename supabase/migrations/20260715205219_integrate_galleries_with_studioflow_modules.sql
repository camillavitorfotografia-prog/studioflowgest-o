create or replace function public.sync_gallery_project_workflow()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status text;
  v_financeiro jsonb;
  v_project_data jsonb;
  v_timeline jsonb;
begin
  if new.project_id is null or new.status is not distinct from old.status then
    return new;
  end if;

  v_status := case new.status
    when 'selection' then 'selecao'
    when 'selection_closed' then 'edicao'
    when 'editing' then 'edicao'
    when 'delivery' then 'entrega'
    else null
  end;

  if v_status is null then
    return new;
  end if;

  select coalesce(financeiro, '{}'::jsonb)
    into v_financeiro
  from public.projetos
  where id = new.project_id;

  if not found then
    return new;
  end if;

  v_project_data := coalesce(v_financeiro->'projectData', '{}'::jsonb);
  v_project_data := jsonb_set(v_project_data, '{statusProducao}', to_jsonb(v_status), true);
  v_project_data := jsonb_set(v_project_data, '{galleryId}', to_jsonb(new.id::text), true);
  v_project_data := jsonb_set(v_project_data, '{galleryStatus}', to_jsonb(new.status), true);
  v_project_data := jsonb_set(v_project_data, '{galleryUpdatedAt}', to_jsonb(now()::text), true);

  v_timeline := coalesce(v_financeiro->'timeline', '[]'::jsonb) || jsonb_build_array(
    jsonb_build_object(
      'id', gen_random_uuid()::text,
      'tipo', 'galeria',
      'titulo', case new.status
        when 'selection' then 'Galeria publicada para seleção'
        when 'selection_closed' then 'Seleção de fotos recebida'
        when 'editing' then 'Fotografias em edição'
        when 'delivery' then 'Galeria liberada para entrega'
        else 'Galeria atualizada'
      end,
      'galleryId', new.id,
      'status', new.status,
      'data', now()
    )
  );

  update public.projetos
  set financeiro = jsonb_set(
    jsonb_set(v_financeiro, '{projectData}', v_project_data, true),
    '{timeline}', v_timeline, true
  )
  where id = new.project_id;

  return new;
end;
$$;

drop trigger if exists galleries_sync_project_workflow on public.galleries;
create trigger galleries_sync_project_workflow
after update of status on public.galleries
for each row execute function public.sync_gallery_project_workflow();

create or replace function public.sync_gallery_additional_charge()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_gallery public.galleries%rowtype;
  v_value numeric;
  v_additional_count integer;
begin
  if new.event_type <> 'selection_finalized' then
    return new;
  end if;

  select * into v_gallery
  from public.galleries
  where id = new.gallery_id;

  if v_gallery.id is null then
    return new;
  end if;

  v_value := coalesce((new.details->>'additionalTotal')::numeric, 0);
  v_additional_count := coalesce((new.details->>'additionalCount')::integer, 0);

  if v_value <= 0 or v_additional_count <= 0 then
    return new;
  end if;

  insert into public.financas (
    id, user_id, project_id, client_id, descricao, nome, categoria,
    valor, data, data_vencimento, tipo, tipo_geral, status,
    conta_origem, detalhes, created_at, updated_at
  ) values (
    'gallery-additional-' || v_gallery.id::text,
    v_gallery.user_id,
    v_gallery.project_id,
    v_gallery.client_id,
    v_additional_count::text || ' foto(s) adicional(is) — ' || v_gallery.name,
    'Fotos adicionais — ' || v_gallery.name,
    'Serviço adicional',
    v_value,
    to_char(current_date, 'YYYY-MM-DD'),
    to_char(current_date, 'YYYY-MM-DD'),
    'receita',
    'Entrada',
    'Pendente',
    'empresa',
    jsonb_build_object(
      'source', 'gallery',
      'galleryId', v_gallery.id,
      'additionalCount', v_additional_count,
      'selectionFinalizedAt', now()
    ),
    now(),
    now()
  )
  on conflict (id) do update set
    valor = excluded.valor,
    descricao = excluded.descricao,
    nome = excluded.nome,
    detalhes = excluded.detalhes,
    updated_at = now();

  return new;
end;
$$;

drop trigger if exists gallery_events_sync_additional_charge on public.gallery_events;
create trigger gallery_events_sync_additional_charge
after insert on public.gallery_events
for each row execute function public.sync_gallery_additional_charge();

create or replace function public.get_client_portal_by_token(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_portal public.client_portals%rowtype;
  v_result jsonb;
begin
  select * into v_portal
  from public.client_portals
  where access_token_hash = encode(extensions.digest(p_token, 'sha256'), 'hex')
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
    ), '[]'::jsonb),
    'files', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', f.id,
        'name', f.name,
        'original_name', f.original_name,
        'mime_type', f.mime_type,
        'extension', f.extension,
        'size_bytes', f.size_bytes,
        'created_at', f.created_at
      ) order by f.created_at desc)
      from public.file_assets f
      where f.user_id = v_portal.user_id
        and f.client_id = v_portal.client_id
        and f.portal_visible = true
        and f.status = 'active'
        and (v_portal.project_id is null or f.project_id = v_portal.project_id)
    ), '[]'::jsonb),
    'galleries', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', g.id,
        'name', g.name,
        'status', g.status,
        'purpose', coalesce(g.settings->>'purpose', 'selection'),
        'publicUrl', g.settings->>'publicUrl',
        'coverPhotoId', coalesce(g.settings->>'coverPhotoId', g.cover_photo_id::text),
        'photoCount', (select count(*) from public.gallery_photos gp where gp.gallery_id = g.id and gp.status = 'active'),
        'selectedCount', (select count(*) from public.gallery_photos gp where gp.gallery_id = g.id and gp.status = 'active' and gp.selected),
        'updatedAt', g.updated_at,
        'expiresAt', g.expires_at
      ) order by g.updated_at desc)
      from public.galleries g
      where g.user_id = v_portal.user_id
        and g.client_id = v_portal.client_id
        and g.deleted_at is null
        and g.status not in ('draft', 'trash', 'archived')
        and nullif(g.settings->>'publicUrl', '') is not null
        and (v_portal.project_id is null or g.project_id = v_portal.project_id)
    ), '[]'::jsonb)
  ) into v_result;

  return v_result;
end;
$$;

grant execute on function public.get_client_portal_by_token(text) to anon, authenticated;;
