create or replace function public.record_gallery_privacy_event(p_token text, p_event_type text, p_details jsonb default '{}'::jsonb)
returns boolean language plpgsql security definer set search_path = public, extensions as $$
declare v_gallery_id uuid;
begin
  select id into v_gallery_id from public.galleries
  where access_token_hash = encode(extensions.digest(p_token,'sha256'),'hex')
    and status not in ('draft','archived')
    and (expires_at is null or expires_at > now()) limit 1;
  if v_gallery_id is null then return false; end if;
  insert into public.gallery_events(gallery_id,event_type,details)
  values(v_gallery_id,left(coalesce(p_event_type,'privacy_event'),80),coalesce(p_details,'{}'::jsonb));
  return true;
end;
$$;
revoke all on function public.record_gallery_privacy_event(text,text,jsonb) from public;
grant execute on function public.record_gallery_privacy_event(text,text,jsonb) to anon, authenticated;;
