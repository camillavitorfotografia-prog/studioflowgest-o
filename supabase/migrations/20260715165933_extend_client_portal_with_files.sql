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
    ), '[]'::jsonb)
  ) into v_result;

  return v_result;
end;
$$;

grant execute on function public.get_client_portal_by_token(text) to anon, authenticated;;
