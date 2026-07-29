create extension if not exists pgcrypto with schema extensions;

create table if not exists public.galleries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  organization_id uuid null,
  client_id uuid null references public.clientes(id) on delete set null,
  project_id uuid null references public.projetos(id) on delete set null,
  name text not null,
  status text not null default 'draft' check (status in ('draft','selection','selection_closed','editing','delivery','archived')),
  access_token_hash text not null unique,
  access_token_preview text not null,
  included_photos integer not null default 0 check (included_photos >= 0),
  additional_price numeric(12,2) not null default 0 check (additional_price >= 0),
  selection_deadline timestamptz null,
  expires_at timestamptz null,
  cover_photo_id uuid null,
  watermark_settings jsonb not null default '{"text":"PROTEGIDO","opacity":0.3,"spacing":170,"angle":-28,"grid":true,"showBrand":true,"showClient":false}'::jsonb,
  legal_notice text not null default 'Estas imagens são disponibilizadas exclusivamente para seleção. É proibida a captura, reprodução, download, edição, publicação ou qualquer uso sem autorização expressa do fotógrafo, nos termos da Lei nº 9.610/1998.',
  settings jsonb not null default '{}'::jsonb,
  selection_finalized_at timestamptz null,
  delivery_released_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.gallery_photos (
  id uuid primary key default gen_random_uuid(),
  gallery_id uuid not null references public.galleries(id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  original_name text not null,
  display_name text not null,
  original_path text not null,
  preview_path text not null,
  final_path text null,
  mime_type text not null default 'image/jpeg',
  size_bytes bigint not null default 0,
  width integer null,
  height integer null,
  position integer not null default 0,
  selected boolean not null default false,
  client_comment text not null default '',
  photographer_note text not null default '',
  status text not null default 'active' check (status in ('active','hidden','deleted')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.galleries
  drop constraint if exists galleries_cover_photo_id_fkey;
alter table public.galleries
  add constraint galleries_cover_photo_id_fkey
  foreign key (cover_photo_id) references public.gallery_photos(id) on delete set null;

create table if not exists public.gallery_events (
  id uuid primary key default gen_random_uuid(),
  gallery_id uuid not null references public.galleries(id) on delete cascade,
  photo_id uuid null references public.gallery_photos(id) on delete set null,
  event_type text not null,
  session_id text null,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists galleries_user_id_idx on public.galleries(user_id);
create index if not exists galleries_client_id_idx on public.galleries(client_id);
create index if not exists galleries_project_id_idx on public.galleries(project_id);
create index if not exists galleries_status_idx on public.galleries(status);
create index if not exists gallery_photos_gallery_id_idx on public.gallery_photos(gallery_id);
create index if not exists gallery_photos_position_idx on public.gallery_photos(gallery_id, position);
create index if not exists gallery_photos_selected_idx on public.gallery_photos(gallery_id, selected);
create index if not exists gallery_events_gallery_id_idx on public.gallery_events(gallery_id, created_at desc);

alter table public.galleries enable row level security;
alter table public.gallery_photos enable row level security;
alter table public.gallery_events enable row level security;

drop policy if exists galleries_owner_all on public.galleries;
create policy galleries_owner_all on public.galleries
for all to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

drop policy if exists gallery_photos_owner_all on public.gallery_photos;
create policy gallery_photos_owner_all on public.gallery_photos
for all to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

drop policy if exists gallery_events_owner_select on public.gallery_events;
create policy gallery_events_owner_select on public.gallery_events
for select to authenticated
using (exists (select 1 from public.galleries g where g.id = gallery_id and g.user_id = auth.uid()));

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('gallery-files','gallery-files',false,2147483648,array['image/jpeg','image/png','image/webp','image/heic','image/heif'])
on conflict (id) do update set public = excluded.public, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists gallery_storage_select_owner on storage.objects;
create policy gallery_storage_select_owner on storage.objects
for select to authenticated
using (bucket_id = 'gallery-files' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists gallery_storage_insert_owner on storage.objects;
create policy gallery_storage_insert_owner on storage.objects
for insert to authenticated
with check (bucket_id = 'gallery-files' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists gallery_storage_update_owner on storage.objects;
create policy gallery_storage_update_owner on storage.objects
for update to authenticated
using (bucket_id = 'gallery-files' and (storage.foldername(name))[1] = auth.uid()::text)
with check (bucket_id = 'gallery-files' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists gallery_storage_delete_owner on storage.objects;
create policy gallery_storage_delete_owner on storage.objects
for delete to authenticated
using (bucket_id = 'gallery-files' and (storage.foldername(name))[1] = auth.uid()::text);

create or replace function public.set_gallery_updated_at()
returns trigger language plpgsql set search_path = public as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists galleries_set_updated_at on public.galleries;
create trigger galleries_set_updated_at before update on public.galleries
for each row execute function public.set_gallery_updated_at();

drop trigger if exists gallery_photos_set_updated_at on public.gallery_photos;
create trigger gallery_photos_set_updated_at before update on public.gallery_photos
for each row execute function public.set_gallery_updated_at();

create or replace function public.get_gallery_by_token(p_token text)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare
  v_gallery public.galleries%rowtype;
  v_client jsonb;
  v_project jsonb;
  v_photos jsonb;
begin
  select * into v_gallery from public.galleries
  where access_token_hash = encode(extensions.digest(p_token, 'sha256'), 'hex')
    and status not in ('draft','archived')
    and (expires_at is null or expires_at > now())
  limit 1;
  if v_gallery.id is null then return null; end if;

  select to_jsonb(c) into v_client from public.clientes c where c.id = v_gallery.client_id;
  select to_jsonb(p) into v_project from public.projetos p where p.id = v_gallery.project_id;
  select coalesce(jsonb_agg(jsonb_build_object(
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
  ) order by gp.position, gp.created_at), '[]'::jsonb)
  into v_photos from public.gallery_photos gp
  where gp.gallery_id = v_gallery.id and gp.status = 'active';

  insert into public.gallery_events(gallery_id,event_type,details)
  values(v_gallery.id,'portal_opened',jsonb_build_object('source','public'));

  return jsonb_build_object(
    'gallery', jsonb_build_object(
      'id',v_gallery.id,'name',v_gallery.name,'status',v_gallery.status,
      'includedPhotos',v_gallery.included_photos,'additionalPrice',v_gallery.additional_price,
      'selectionDeadline',v_gallery.selection_deadline,'expiresAt',v_gallery.expires_at,
      'watermarkSettings',v_gallery.watermark_settings,'legalNotice',v_gallery.legal_notice,
      'settings',v_gallery.settings,'selectionFinalizedAt',v_gallery.selection_finalized_at,
      'deliveryReleasedAt',v_gallery.delivery_released_at
    ),
    'client',v_client,'project',v_project,'photos',v_photos
  );
end;
$$;

create or replace function public.accept_gallery_legal_notice(p_token text, p_session_id text default null)
returns boolean language plpgsql security definer set search_path = public, extensions as $$
declare v_gallery_id uuid;
begin
  select id into v_gallery_id from public.galleries
  where access_token_hash = encode(extensions.digest(p_token,'sha256'),'hex')
    and status not in ('draft','archived')
    and (expires_at is null or expires_at > now()) limit 1;
  if v_gallery_id is null then return false; end if;
  insert into public.gallery_events(gallery_id,event_type,session_id,details)
  values(v_gallery_id,'legal_notice_accepted',p_session_id,jsonb_build_object('law','Lei 9.610/1998'));
  return true;
end;
$$;

create or replace function public.toggle_gallery_photo_selection(p_token text, p_photo_id uuid, p_selected boolean, p_comment text default '')
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare v_gallery public.galleries%rowtype; v_count integer;
begin
  select * into v_gallery from public.galleries
  where access_token_hash = encode(extensions.digest(p_token,'sha256'),'hex')
    and status = 'selection'
    and selection_finalized_at is null
    and (selection_deadline is null or selection_deadline > now())
    and (expires_at is null or expires_at > now()) limit 1;
  if v_gallery.id is null then raise exception 'Galeria indisponível para seleção.'; end if;
  update public.gallery_photos set selected = p_selected, client_comment = coalesce(p_comment,'')
  where id = p_photo_id and gallery_id = v_gallery.id and status = 'active';
  select count(*) into v_count from public.gallery_photos where gallery_id = v_gallery.id and selected and status='active';
  insert into public.gallery_events(gallery_id,photo_id,event_type,details)
  values(v_gallery.id,p_photo_id,case when p_selected then 'photo_selected' else 'photo_unselected' end,jsonb_build_object('selectedCount',v_count));
  return jsonb_build_object('selectedCount',v_count,'additionalCount',greatest(0,v_count-v_gallery.included_photos),'additionalTotal',greatest(0,v_count-v_gallery.included_photos)*v_gallery.additional_price);
end;
$$;

create or replace function public.finalize_gallery_selection(p_token text)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare v_gallery public.galleries%rowtype; v_count integer;
begin
  select * into v_gallery from public.galleries
  where access_token_hash = encode(extensions.digest(p_token,'sha256'),'hex')
    and status='selection' and selection_finalized_at is null limit 1;
  if v_gallery.id is null then raise exception 'Galeria indisponível para finalização.'; end if;
  select count(*) into v_count from public.gallery_photos where gallery_id=v_gallery.id and selected and status='active';
  update public.galleries set status='selection_closed',selection_finalized_at=now() where id=v_gallery.id;
  insert into public.gallery_events(gallery_id,event_type,details)
  values(v_gallery.id,'selection_finalized',jsonb_build_object('selectedCount',v_count,'additionalCount',greatest(0,v_count-v_gallery.included_photos),'additionalTotal',greatest(0,v_count-v_gallery.included_photos)*v_gallery.additional_price));
  return jsonb_build_object('selectedCount',v_count,'additionalCount',greatest(0,v_count-v_gallery.included_photos),'additionalTotal',greatest(0,v_count-v_gallery.included_photos)*v_gallery.additional_price);
end;
$$;

revoke all on function public.get_gallery_by_token(text) from public;
revoke all on function public.accept_gallery_legal_notice(text,text) from public;
revoke all on function public.toggle_gallery_photo_selection(text,uuid,boolean,text) from public;
revoke all on function public.finalize_gallery_selection(text) from public;
grant execute on function public.get_gallery_by_token(text) to anon, authenticated;
grant execute on function public.accept_gallery_legal_notice(text,text) to anon, authenticated;
grant execute on function public.toggle_gallery_photo_selection(text,uuid,boolean,text) to anon, authenticated;
grant execute on function public.finalize_gallery_selection(text) to anon, authenticated;;
