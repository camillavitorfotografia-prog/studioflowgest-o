alter table public.galleries add column if not exists deleted_at timestamptz;

alter table public.galleries drop constraint if exists galleries_status_check;
alter table public.galleries add constraint galleries_status_check check (
  status = any (array[
    'draft'::text,
    'selection'::text,
    'selection_closed'::text,
    'editing'::text,
    'delivery'::text,
    'archived'::text,
    'trash'::text
  ])
);

create index if not exists galleries_user_deleted_idx
  on public.galleries(user_id, deleted_at, created_at desc);

create or replace function public.get_gallery_by_token(p_token text)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'extensions'
as $function$
declare
  v_gallery public.galleries%rowtype;
  v_client jsonb;
  v_project jsonb;
  v_photos jsonb;
begin
  select * into v_gallery
  from public.galleries
  where access_token_hash = encode(extensions.digest(p_token, 'sha256'), 'hex')
    and status not in ('draft', 'archived', 'trash')
    and deleted_at is null
    and (expires_at is null or expires_at > now())
  limit 1;

  if v_gallery.id is null then
    return null;
  end if;

  select to_jsonb(c) into v_client
  from public.clientes c
  where c.id = v_gallery.client_id;

  select to_jsonb(p) into v_project
  from public.projetos p
  where p.id = v_gallery.project_id;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', gp.id,
        'displayName', gp.display_name,
        'originalName', gp.original_name,
        'mimeType', gp.mime_type,
        'width', gp.width,
        'height', gp.height,
        'position', gp.position,
        'selected', gp.selected,
        'clientComment', gp.client_comment,
        'hasFinal', gp.final_path is not null,
        'metadata', gp.metadata
      ) order by gp.position, gp.created_at
    ),
    '[]'::jsonb
  ) into v_photos
  from public.gallery_photos gp
  where gp.gallery_id = v_gallery.id
    and gp.status = 'active';

  insert into public.gallery_events(gallery_id, event_type, details)
  values(v_gallery.id, 'portal_opened', jsonb_build_object('source', 'public'));

  return jsonb_build_object(
    'gallery', jsonb_build_object(
      'id', v_gallery.id,
      'name', v_gallery.name,
      'status', v_gallery.status,
      'includedPhotos', v_gallery.included_photos,
      'additionalPrice', v_gallery.additional_price,
      'selectionDeadline', v_gallery.selection_deadline,
      'expiresAt', v_gallery.expires_at,
      'watermarkSettings', v_gallery.watermark_settings,
      'legalNotice', v_gallery.legal_notice,
      'settings', v_gallery.settings,
      'selectionFinalizedAt', v_gallery.selection_finalized_at,
      'deliveryReleasedAt', v_gallery.delivery_released_at
    ),
    'client', v_client,
    'project', v_project,
    'photos', v_photos
  );
end;
$function$;

create or replace function public.accept_gallery_legal_notice(
  p_token text,
  p_session_id text default null
)
returns boolean
language plpgsql
security definer
set search_path to 'public', 'extensions'
as $function$
declare
  v_gallery_id uuid;
begin
  select id into v_gallery_id
  from public.galleries
  where access_token_hash = encode(extensions.digest(p_token, 'sha256'), 'hex')
    and status not in ('draft', 'archived', 'trash')
    and deleted_at is null
    and (expires_at is null or expires_at > now())
  limit 1;

  if v_gallery_id is null then
    return false;
  end if;

  insert into public.gallery_events(gallery_id, event_type, session_id, details)
  values(
    v_gallery_id,
    'legal_notice_accepted',
    p_session_id,
    jsonb_build_object('law', 'Lei 9.610/1998')
  );

  return true;
end;
$function$;

create or replace function public.toggle_gallery_photo_selection(
  p_token text,
  p_photo_id uuid,
  p_selected boolean,
  p_comment text default ''
)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'extensions'
as $function$
declare
  v_gallery public.galleries%rowtype;
  v_count integer;
begin
  select * into v_gallery
  from public.galleries
  where access_token_hash = encode(extensions.digest(p_token, 'sha256'), 'hex')
    and status = 'selection'
    and deleted_at is null
    and selection_finalized_at is null
    and (selection_deadline is null or selection_deadline > now())
    and (expires_at is null or expires_at > now())
  limit 1;

  if v_gallery.id is null then
    raise exception 'Galeria indisponível para seleção.';
  end if;

  update public.gallery_photos
  set selected = p_selected,
      client_comment = coalesce(p_comment, '')
  where id = p_photo_id
    and gallery_id = v_gallery.id
    and status = 'active';

  select count(*) into v_count
  from public.gallery_photos
  where gallery_id = v_gallery.id
    and selected
    and status = 'active';

  insert into public.gallery_events(gallery_id, photo_id, event_type, details)
  values(
    v_gallery.id,
    p_photo_id,
    case when p_selected then 'photo_selected' else 'photo_unselected' end,
    jsonb_build_object('selectedCount', v_count)
  );

  return jsonb_build_object(
    'selectedCount', v_count,
    'additionalCount', greatest(0, v_count - v_gallery.included_photos),
    'additionalTotal', greatest(0, v_count - v_gallery.included_photos) * v_gallery.additional_price
  );
end;
$function$;

create or replace function public.finalize_gallery_selection(p_token text)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'extensions'
as $function$
declare
  v_gallery public.galleries%rowtype;
  v_count integer;
begin
  select * into v_gallery
  from public.galleries
  where access_token_hash = encode(extensions.digest(p_token, 'sha256'), 'hex')
    and status = 'selection'
    and deleted_at is null
    and selection_finalized_at is null
  limit 1;

  if v_gallery.id is null then
    raise exception 'Galeria indisponível para finalização.';
  end if;

  select count(*) into v_count
  from public.gallery_photos
  where gallery_id = v_gallery.id
    and selected
    and status = 'active';

  update public.galleries
  set status = 'selection_closed',
      selection_finalized_at = now(),
      updated_at = now()
  where id = v_gallery.id;

  insert into public.gallery_events(gallery_id, event_type, details)
  values(
    v_gallery.id,
    'selection_finalized',
    jsonb_build_object(
      'selectedCount', v_count,
      'additionalCount', greatest(0, v_count - v_gallery.included_photos),
      'additionalTotal', greatest(0, v_count - v_gallery.included_photos) * v_gallery.additional_price
    )
  );

  return jsonb_build_object(
    'selectedCount', v_count,
    'additionalCount', greatest(0, v_count - v_gallery.included_photos),
    'additionalTotal', greatest(0, v_count - v_gallery.included_photos) * v_gallery.additional_price
  );
end;
$function$;;
