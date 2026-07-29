


SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE EXTENSION IF NOT EXISTS "pg_stat_statements" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "supabase_vault" WITH SCHEMA "vault";






CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA "extensions";






CREATE OR REPLACE FUNCTION "public"."accept_gallery_legal_notice"("p_token" "text", "p_session_id" "text" DEFAULT NULL::"text") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'extensions'
    AS $$
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
$$;


ALTER FUNCTION "public"."accept_gallery_legal_notice"("p_token" "text", "p_session_id" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."finalize_gallery_selection"("p_token" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'extensions'
    AS $$
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
$$;


ALTER FUNCTION "public"."finalize_gallery_selection"("p_token" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_client_portal_by_token"("p_token" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'extensions'
    AS $$
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


ALTER FUNCTION "public"."get_client_portal_by_token"("p_token" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_gallery_by_token"("p_token" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'extensions'
    AS $$
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
$$;


ALTER FUNCTION "public"."get_gallery_by_token"("p_token" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."ingest_whatsapp_message"("p_phone_number_id" "text", "p_wa_id" "text", "p_profile_name" "text", "p_message_id" "text", "p_message_type" "text", "p_body" "text", "p_timestamp" timestamp with time zone, "p_payload" "jsonb") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_user_id uuid;
  v_phone text;
  v_lead_id uuid;
  v_client_id uuid;
  v_project_id uuid;
  v_contact_id uuid;
  v_conversation_id uuid;
  v_history jsonb;
begin
  select user_id into v_user_id
  from public.whatsapp_connections
  where phone_number_id = p_phone_number_id and status = 'connected'
  limit 1;

  if v_user_id is null then
    raise exception 'WhatsApp connection not found for phone_number_id %', p_phone_number_id;
  end if;

  v_phone := regexp_replace(coalesce(p_wa_id, ''), '\D', '', 'g');

  select id into v_client_id
  from public.clientes
  where regexp_replace(coalesce(whatsapp, telefone, ''), '\D', '', 'g') = v_phone
  order by updated_at desc nulls last, created_at desc
  limit 1;

  select id into v_project_id
  from public.projetos
  where cliente_id = v_client_id
  order by case when data is null or data = '' then 1 else 0 end, data desc nulls last
  limit 1;

  select id into v_lead_id
  from public.leads
  where user_id = v_user_id
    and regexp_replace(coalesce(whatsapp, telefone, ''), '\D', '', 'g') = v_phone
    and coalesce(na_lixeira, false) = false
  order by updated_at desc nulls last, created_at desc
  limit 1;

  if v_lead_id is null and v_client_id is null then
    insert into public.leads (
      user_id, nome, telefone, whatsapp, status, origem,
      data_primeiro_contato, data_ultimo_contato, historico, created_at, updated_at
    ) values (
      v_user_id,
      coalesce(nullif(trim(p_profile_name), ''), 'Contato do WhatsApp'),
      v_phone,
      v_phone,
      'novo_lead',
      'WhatsApp',
      (p_timestamp at time zone 'America/Sao_Paulo')::date,
      (p_timestamp at time zone 'America/Sao_Paulo')::date,
      jsonb_build_array(jsonb_build_object(
        'id', gen_random_uuid()::text,
        'tipo', 'whatsapp_recebido',
        'data', p_timestamp,
        'descricao', coalesce(p_body, concat('Mensagem ', p_message_type, ' recebida pelo WhatsApp')),
        'resultado', 'Cliente respondeu',
        'whatsappMessageId', p_message_id,
        'automatico', true
      )),
      p_timestamp,
      now()
    ) returning id into v_lead_id;
  elsif v_lead_id is not null then
    select coalesce(historico, '[]'::jsonb) into v_history from public.leads where id = v_lead_id;
    update public.leads set
      nome = case when trim(coalesce(nome,'')) = '' then coalesce(nullif(trim(p_profile_name), ''), nome) else nome end,
      data_ultimo_contato = (p_timestamp at time zone 'America/Sao_Paulo')::date,
      data_proximo_followup = null,
      historico = v_history || jsonb_build_array(jsonb_build_object(
        'id', gen_random_uuid()::text,
        'tipo', 'whatsapp_recebido',
        'data', p_timestamp,
        'descricao', coalesce(p_body, concat('Mensagem ', p_message_type, ' recebida pelo WhatsApp')),
        'resultado', 'Cliente respondeu',
        'whatsappMessageId', p_message_id,
        'automatico', true
      )),
      updated_at = now()
    where id = v_lead_id;
  end if;

  insert into public.whatsapp_contacts (
    user_id, wa_id, phone_normalized, profile_name, lead_id, client_id, project_id,
    first_message_at, last_message_at, unread_count, metadata
  ) values (
    v_user_id, p_wa_id, v_phone, p_profile_name, v_lead_id, v_client_id, v_project_id,
    p_timestamp, p_timestamp, 1, jsonb_build_object('source', 'whatsapp_cloud_api')
  )
  on conflict (user_id, wa_id) do update set
    profile_name = coalesce(excluded.profile_name, whatsapp_contacts.profile_name),
    lead_id = coalesce(excluded.lead_id, whatsapp_contacts.lead_id),
    client_id = coalesce(excluded.client_id, whatsapp_contacts.client_id),
    project_id = coalesce(excluded.project_id, whatsapp_contacts.project_id),
    last_message_at = excluded.last_message_at,
    unread_count = whatsapp_contacts.unread_count + 1,
    updated_at = now()
  returning id into v_contact_id;

  insert into public.whatsapp_conversations (
    user_id, contact_id, lead_id, client_id, project_id, status,
    last_message_preview, last_message_at, updated_at
  ) values (
    v_user_id, v_contact_id, v_lead_id, v_client_id, v_project_id, 'open',
    left(coalesce(p_body, concat('[', p_message_type, ']')), 240), p_timestamp, now()
  )
  on conflict (user_id, contact_id) do update set
    lead_id = coalesce(excluded.lead_id, whatsapp_conversations.lead_id),
    client_id = coalesce(excluded.client_id, whatsapp_conversations.client_id),
    project_id = coalesce(excluded.project_id, whatsapp_conversations.project_id),
    status = 'open',
    last_message_preview = excluded.last_message_preview,
    last_message_at = excluded.last_message_at,
    updated_at = now()
  returning id into v_conversation_id;

  insert into public.whatsapp_messages (
    user_id, conversation_id, contact_id, whatsapp_message_id, direction,
    message_type, body, media_id, reply_to_message_id, status, sent_at, payload
  ) values (
    v_user_id, v_conversation_id, v_contact_id, p_message_id, 'inbound',
    coalesce(p_message_type, 'unknown'), p_body,
    p_payload #>> '{message,image,id}',
    p_payload #>> '{message,context,id}',
    'received', p_timestamp, p_payload
  ) on conflict (whatsapp_message_id) do nothing;

  update public.whatsapp_connections
  set last_webhook_at = now(), last_error = null, updated_at = now()
  where phone_number_id = p_phone_number_id;

  return jsonb_build_object(
    'user_id', v_user_id,
    'lead_id', v_lead_id,
    'client_id', v_client_id,
    'project_id', v_project_id,
    'contact_id', v_contact_id,
    'conversation_id', v_conversation_id
  );
end;
$$;


ALTER FUNCTION "public"."ingest_whatsapp_message"("p_phone_number_id" "text", "p_wa_id" "text", "p_profile_name" "text", "p_message_id" "text", "p_message_type" "text", "p_body" "text", "p_timestamp" timestamp with time zone, "p_payload" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."record_gallery_privacy_event"("p_token" "text", "p_event_type" "text", "p_details" "jsonb" DEFAULT '{}'::"jsonb") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'extensions'
    AS $$
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


ALTER FUNCTION "public"."record_gallery_privacy_event"("p_token" "text", "p_event_type" "text", "p_details" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_file_library_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
begin
  new.updated_at = now();
  return new;
end;
$$;


ALTER FUNCTION "public"."set_file_library_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_gallery_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
begin
  new.updated_at = now();
  return new;
end;
$$;


ALTER FUNCTION "public"."set_gallery_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
begin
  new.updated_at = now();
  return new;
end;
$$;


ALTER FUNCTION "public"."set_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."sync_gallery_additional_charge"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
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


ALTER FUNCTION "public"."sync_gallery_additional_charge"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."sync_gallery_project_workflow"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
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


ALTER FUNCTION "public"."sync_gallery_project_workflow"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."toggle_gallery_photo_selection"("p_token" "text", "p_photo_id" "uuid", "p_selected" boolean, "p_comment" "text" DEFAULT ''::"text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'extensions'
    AS $$
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
$$;


ALTER FUNCTION "public"."toggle_gallery_photo_selection"("p_token" "text", "p_photo_id" "uuid", "p_selected" boolean, "p_comment" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."touch_integration_accounts_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
begin
  new.updated_at = now();
  return new;
end;
$$;


ALTER FUNCTION "public"."touch_integration_accounts_updated_at"() OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."client_portals" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" DEFAULT "auth"."uid"() NOT NULL,
    "organization_id" "uuid",
    "client_id" "uuid" NOT NULL,
    "project_id" "uuid",
    "name" "text" DEFAULT 'Portal do cliente'::"text" NOT NULL,
    "status" "text" DEFAULT 'active'::"text" NOT NULL,
    "sections" "jsonb" DEFAULT '{"files": true, "messages": true, "overview": true, "schedule": true, "documents": true, "financial": true}'::"jsonb" NOT NULL,
    "welcome_message" "text" DEFAULT ''::"text" NOT NULL,
    "access_token_hash" "text" NOT NULL,
    "access_token_preview" "text" DEFAULT ''::"text" NOT NULL,
    "expires_at" timestamp with time zone,
    "last_accessed_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "client_portals_status_check" CHECK (("status" = ANY (ARRAY['active'::"text", 'disabled'::"text"])))
);


ALTER TABLE "public"."client_portals" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."clientes" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "nome" "text" NOT NULL,
    "whatsapp" "text",
    "telefone" "text",
    "instagram" "text",
    "email" "text",
    "cidade" "text",
    "foto" "text",
    "cliente_desde" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()),
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "cpf_cnpj" "text",
    "endereco" "text",
    "data_nascimento" "date",
    "origem" "text",
    "indicacao" "text",
    "indicacao_cliente_id" "uuid",
    "observacoes" "text",
    "datas_importantes" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "historico_contatos" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "data_primeiro_contato" "date",
    "data_ultimo_contato" "date",
    "data_proximo_retorno" "date",
    "status_comercial" "text" DEFAULT 'novo'::"text" NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);

ALTER TABLE ONLY "public"."clientes" REPLICA IDENTITY FULL;


ALTER TABLE "public"."clientes" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."document_instances" (
    "id" "text" NOT NULL,
    "user_id" "uuid" DEFAULT "auth"."uid"() NOT NULL,
    "organization_id" "uuid",
    "document_type" "text" DEFAULT 'proposal'::"text" NOT NULL,
    "template_id" "text",
    "template_version" integer,
    "status" "text" DEFAULT 'draft'::"text" NOT NULL,
    "lead_id" "text",
    "client_id" "uuid",
    "project_id" "uuid",
    "proposal_id" "text",
    "package_options" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "packages" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "history" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "asset_overrides" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "text_overrides" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "payload" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_by" "uuid",
    "generated_at" timestamp with time zone,
    "sent_at" timestamp with time zone,
    "approved_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "document_instances_document_type_check" CHECK (("document_type" = ANY (ARRAY['proposal'::"text", 'contract'::"text", 'pdf'::"text", 'form'::"text", 'document'::"text", 'certificate'::"text", 'report'::"text", 'receipt'::"text", 'presentation'::"text", 'internal'::"text"])))
);


ALTER TABLE "public"."document_instances" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."document_templates" (
    "id" "text" NOT NULL,
    "user_id" "uuid" DEFAULT "auth"."uid"() NOT NULL,
    "organization_id" "uuid",
    "document_type" "text" DEFAULT 'proposal'::"text" NOT NULL,
    "name" "text" DEFAULT ''::"text" NOT NULL,
    "slug" "text" DEFAULT ''::"text" NOT NULL,
    "category" "text" DEFAULT ''::"text" NOT NULL,
    "version" integer DEFAULT 1 NOT NULL,
    "status" "text" DEFAULT 'draft'::"text" NOT NULL,
    "is_published" boolean DEFAULT false NOT NULL,
    "is_latest" boolean DEFAULT false NOT NULL,
    "base_template_id" "text",
    "pages" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "payload" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "published_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "document_templates_document_type_check" CHECK (("document_type" = ANY (ARRAY['proposal'::"text", 'contract'::"text", 'pdf'::"text", 'form'::"text", 'document'::"text", 'certificate'::"text", 'report'::"text", 'receipt'::"text", 'presentation'::"text", 'internal'::"text"]))),
    CONSTRAINT "document_templates_version_check" CHECK (("version" > 0))
);


ALTER TABLE "public"."document_templates" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."equipamentos" (
    "id" "text" NOT NULL,
    "user_id" "uuid" DEFAULT "auth"."uid"() NOT NULL,
    "nome" "text" NOT NULL,
    "categoria" "text" DEFAULT 'Outro'::"text" NOT NULL,
    "marca" "text",
    "modelo" "text",
    "numero_serie" "text",
    "fornecedor" "text",
    "status" "text" DEFAULT 'Ativo'::"text" NOT NULL,
    "valor" numeric DEFAULT 0 NOT NULL,
    "valor_compra" numeric DEFAULT 0 NOT NULL,
    "data_compra" "text",
    "garantia_ate" "text",
    "proxima_revisao" "text",
    "vida_util_anos" numeric DEFAULT 5 NOT NULL,
    "valor_residual" numeric DEFAULT 0 NOT NULL,
    "metodo_depreciacao" "text" DEFAULT 'linear'::"text" NOT NULL,
    "observacoes" "text",
    "manutencoes" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "origem" "text" DEFAULT 'manual'::"text" NOT NULL,
    "import_batch_id" "uuid",
    "fingerprint" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "comprador" "text",
    "data_venda" "date",
    "valor_venda" numeric(14,2),
    "forma_recebimento" "text",
    "observacoes_venda" "text",
    "valor_contabil_venda" numeric(14,2),
    "resultado_patrimonial_venda" numeric(14,2),
    "depreciacao_encerrada_em" "date",
    "historico" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "tipo_saida" "text",
    "referencia_negociacao" "text",
    "servico_recebido" "text",
    "fornecedor_servico" "text",
    "valor_total_servico" numeric(14,2) DEFAULT 0,
    "complemento_dinheiro" numeric(14,2) DEFAULT 0,
    "conta_complemento" "text",
    "finance_exit_id" "text",
    "origem_recursos_tipo" "text",
    "origem_recursos" "text",
    "entrada_origem_id" "text",
    "composicao_recursos" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL
);


ALTER TABLE "public"."equipamentos" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."file_assets" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" DEFAULT "auth"."uid"() NOT NULL,
    "organization_id" "uuid",
    "name" "text" NOT NULL,
    "original_name" "text" NOT NULL,
    "storage_path" "text" NOT NULL,
    "bucket" "text" DEFAULT 'studioflow-files'::"text" NOT NULL,
    "mime_type" "text" DEFAULT 'application/octet-stream'::"text" NOT NULL,
    "extension" "text" DEFAULT ''::"text" NOT NULL,
    "size_bytes" bigint DEFAULT 0 NOT NULL,
    "folder_id" "uuid",
    "client_id" "uuid",
    "project_id" "uuid",
    "favorite" boolean DEFAULT false NOT NULL,
    "portal_visible" boolean DEFAULT false NOT NULL,
    "status" "text" DEFAULT 'active'::"text" NOT NULL,
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "deleted_at" timestamp with time zone,
    CONSTRAINT "file_assets_size_bytes_check" CHECK (("size_bytes" >= 0)),
    CONSTRAINT "file_assets_status_check" CHECK (("status" = ANY (ARRAY['active'::"text", 'trash'::"text"])))
);


ALTER TABLE "public"."file_assets" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."file_folders" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" DEFAULT "auth"."uid"() NOT NULL,
    "organization_id" "uuid",
    "name" "text" NOT NULL,
    "parent_id" "uuid",
    "client_id" "uuid",
    "project_id" "uuid",
    "color" "text" DEFAULT 'gold'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."file_folders" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."financas" (
    "id" "text" NOT NULL,
    "user_id" "uuid" DEFAULT "auth"."uid"() NOT NULL,
    "project_id" "uuid",
    "client_id" "uuid",
    "descricao" "text",
    "nome" "text",
    "categoria" "text",
    "valor" numeric(14,2) DEFAULT 0 NOT NULL,
    "data" "text",
    "data_vencimento" "text",
    "data_pagamento" timestamp with time zone,
    "tipo" "text",
    "tipo_geral" "text",
    "status" "text",
    "forma_pagamento" "text",
    "conta_origem" "text",
    "fornecedor" "text",
    "evento_relacionado" "text",
    "observacoes" "text",
    "detalhes" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "recurrence_id" "text",
    "recurrence_index" integer,
    "recorrente" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "financas_conta_origem_check" CHECK ((("conta_origem" IS NULL) OR ("conta_origem" = ANY (ARRAY['reserva'::"text", 'empresa'::"text", 'salario'::"text"])))),
    CONSTRAINT "financas_valor_check" CHECK (("valor" >= (0)::numeric))
);


ALTER TABLE "public"."financas" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."finance_ledger_canonical" WITH ("security_invoker"='true') AS
 SELECT "id",
    "user_id",
    "project_id",
    "client_id",
    "descricao",
    "categoria",
    ("valor")::numeric AS "amount",
    "tipo" AS "source_type",
    "tipo_geral" AS "general_type",
    "status",
    "forma_pagamento",
    "conta_origem",
    "detalhes",
        CASE
            WHEN ("lower"(COALESCE("tipo", ''::"text")) = 'receita_projeto'::"text") THEN 'ignored_mirror'::"text"
            WHEN ("lower"(COALESCE("tipo", ''::"text")) = 'distribuicao_pagamento'::"text") THEN 'operational_allocation'::"text"
            WHEN ("lower"(COALESCE("tipo", ''::"text")) = 'transferencia_interna'::"text") THEN 'internal_transfer'::"text"
            WHEN (("lower"(COALESCE("tipo_geral", ''::"text")) = 'entrada'::"text") AND (("lower"(COALESCE("tipo", ''::"text")) = 'entrada_nao_operacional'::"text") OR ("lower"(COALESCE("categoria", ''::"text")) = ANY (ARRAY['aporte pessoal da titular'::"text", 'aporte do titular'::"text", 'venda de patrimônio'::"text", 'venda de patrimonio'::"text", 'reembolso'::"text", 'empréstimo recebido'::"text", 'emprestimo recebido'::"text", 'outras entradas não operacionais'::"text", 'outras entradas nao operacionais'::"text", 'entrada não operacional'::"text", 'entrada nao operacional'::"text"])) OR ("lower"(COALESCE(("detalhes" ->> 'naturezaFinanceira'::"text"), ''::"text")) = 'nao_operacional'::"text"))) THEN 'non_operational_income'::"text"
            WHEN ("lower"(COALESCE("tipo_geral", ''::"text")) = 'entrada'::"text") THEN 'operational_income'::"text"
            WHEN (("lower"(COALESCE("tipo_geral", ''::"text")) = 'saida'::"text") AND (("data_pagamento" IS NOT NULL) OR ("lower"(COALESCE("status", ''::"text")) = ANY (ARRAY['pago'::"text", 'paga'::"text", 'quitado'::"text", 'quitada'::"text"])))) THEN 'expense_paid'::"text"
            WHEN ("lower"(COALESCE("tipo_geral", ''::"text")) = 'saida'::"text") THEN 'expense_pending'::"text"
            ELSE 'ignored'::"text"
        END AS "entry_kind",
        CASE
            WHEN ("lower"(COALESCE("conta_origem", ("detalhes" ->> 'destino'::"text"), ''::"text")) ~~ '%reserva%'::"text") THEN 'reserva'::"text"
            WHEN (("lower"(COALESCE("conta_origem", ("detalhes" ->> 'destino'::"text"), ''::"text")) ~~ '%salario%'::"text") OR ("lower"(COALESCE("conta_origem", ("detalhes" ->> 'destino'::"text"), ''::"text")) ~~ '%pessoal%'::"text")) THEN 'salario'::"text"
            WHEN ("lower"(COALESCE("conta_origem", ("detalhes" ->> 'destino'::"text"), ''::"text")) ~~ '%empresa%'::"text") THEN 'empresa'::"text"
            ELSE 'nao_informada'::"text"
        END AS "account_code",
    COALESCE(NULLIF(("detalhes" ->> 'paymentId'::"text"), ''::"text"), NULLIF(("detalhes" ->> 'externalPaymentId'::"text"), ''::"text"), "id") AS "payment_group_id",
    COALESCE(("data_pagamento")::"date",
        CASE
            WHEN (COALESCE("data", ''::"text") ~ '^\d{4}-\d{2}-\d{2}'::"text") THEN (SUBSTRING("data" FROM 1 FOR 10))::"date"
            ELSE NULL::"date"
        END) AS "effective_date",
        CASE
            WHEN (COALESCE("data_vencimento", ''::"text") ~ '^\d{4}-\d{2}-\d{2}'::"text") THEN (SUBSTRING("data_vencimento" FROM 1 FOR 10))::"date"
            WHEN (("data_pagamento" IS NULL) AND (COALESCE("data", ''::"text") ~ '^\d{4}-\d{2}-\d{2}'::"text")) THEN (SUBSTRING("data" FROM 1 FOR 10))::"date"
            ELSE NULL::"date"
        END AS "due_date",
    "created_at",
    "updated_at"
   FROM "public"."financas" "f";


ALTER VIEW "public"."finance_ledger_canonical" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."galleries" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" DEFAULT "auth"."uid"() NOT NULL,
    "organization_id" "uuid",
    "client_id" "uuid",
    "project_id" "uuid",
    "name" "text" NOT NULL,
    "status" "text" DEFAULT 'draft'::"text" NOT NULL,
    "access_token_hash" "text" NOT NULL,
    "access_token_preview" "text" NOT NULL,
    "included_photos" integer DEFAULT 0 NOT NULL,
    "additional_price" numeric(12,2) DEFAULT 0 NOT NULL,
    "selection_deadline" timestamp with time zone,
    "expires_at" timestamp with time zone,
    "cover_photo_id" "uuid",
    "watermark_settings" "jsonb" DEFAULT '{"grid": true, "text": "PROTEGIDO", "angle": -28, "opacity": 0.3, "spacing": 170, "showBrand": true, "showClient": false}'::"jsonb" NOT NULL,
    "legal_notice" "text" DEFAULT 'Estas imagens são disponibilizadas exclusivamente para seleção. É proibida a captura, reprodução, download, edição, publicação ou qualquer uso sem autorização expressa do fotógrafo, nos termos da Lei nº 9.610/1998.'::"text" NOT NULL,
    "settings" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "selection_finalized_at" timestamp with time zone,
    "delivery_released_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "deleted_at" timestamp with time zone,
    CONSTRAINT "galleries_additional_price_check" CHECK (("additional_price" >= (0)::numeric)),
    CONSTRAINT "galleries_included_photos_check" CHECK (("included_photos" >= 0)),
    CONSTRAINT "galleries_status_check" CHECK (("status" = ANY (ARRAY['draft'::"text", 'selection'::"text", 'selection_closed'::"text", 'editing'::"text", 'delivery'::"text", 'archived'::"text", 'trash'::"text"])))
);


ALTER TABLE "public"."galleries" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."gallery_events" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "gallery_id" "uuid" NOT NULL,
    "photo_id" "uuid",
    "event_type" "text" NOT NULL,
    "session_id" "text",
    "details" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."gallery_events" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."gallery_photos" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "gallery_id" "uuid" NOT NULL,
    "user_id" "uuid" DEFAULT "auth"."uid"() NOT NULL,
    "original_name" "text" NOT NULL,
    "display_name" "text" NOT NULL,
    "original_path" "text" NOT NULL,
    "preview_path" "text" NOT NULL,
    "final_path" "text",
    "mime_type" "text" DEFAULT 'image/jpeg'::"text" NOT NULL,
    "size_bytes" bigint DEFAULT 0 NOT NULL,
    "width" integer,
    "height" integer,
    "position" integer DEFAULT 0 NOT NULL,
    "selected" boolean DEFAULT false NOT NULL,
    "client_comment" "text" DEFAULT ''::"text" NOT NULL,
    "photographer_note" "text" DEFAULT ''::"text" NOT NULL,
    "status" "text" DEFAULT 'active'::"text" NOT NULL,
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "gallery_photos_status_check" CHECK (("status" = ANY (ARRAY['active'::"text", 'hidden'::"text", 'deleted'::"text"])))
);


ALTER TABLE "public"."gallery_photos" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."import_batches" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" DEFAULT "auth"."uid"() NOT NULL,
    "source_name" "text" NOT NULL,
    "source_type" "text" NOT NULL,
    "status" "text" DEFAULT 'completed'::"text" NOT NULL,
    "summary" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."import_batches" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."integration_accounts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "provider" "text" NOT NULL,
    "status" "text" DEFAULT 'not_connected'::"text" NOT NULL,
    "account_email" "text",
    "account_name" "text",
    "scopes" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "settings" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "last_sync_at" timestamp with time zone,
    "last_error" "text",
    "connected_at" timestamp with time zone,
    "expires_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."integration_accounts" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."integration_logs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "provider" "text" NOT NULL,
    "level" "text" DEFAULT 'info'::"text" NOT NULL,
    "action" "text" NOT NULL,
    "message" "text",
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."integration_logs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."integration_oauth_states" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "provider" "text" NOT NULL,
    "return_url" "text" NOT NULL,
    "expires_at" timestamp with time zone DEFAULT ("now"() + '00:10:00'::interval) NOT NULL,
    "used_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."integration_oauth_states" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."integration_resource_links" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "provider" "text" NOT NULL,
    "resource_type" "text" NOT NULL,
    "local_id" "text" NOT NULL,
    "external_id" "text",
    "external_url" "text",
    "checksum" "text",
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "last_synced_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."integration_resource_links" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."integration_tokens" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "provider" "text" NOT NULL,
    "access_token_encrypted" "text",
    "refresh_token_encrypted" "text",
    "token_type" "text",
    "scopes" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "expires_at" timestamp with time zone,
    "account_email" "text",
    "account_name" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."integration_tokens" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."leads" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid",
    "nome" "text" DEFAULT ''::"text" NOT NULL,
    "telefone" "text",
    "whatsapp" "text",
    "email" "text",
    "tipo_servico" "text",
    "status" "text" DEFAULT 'novo_lead'::"text" NOT NULL,
    "origem" "text" DEFAULT 'WhatsApp'::"text" NOT NULL,
    "data_primeiro_contato" "date",
    "data_ultimo_contato" "date",
    "data_proximo_followup" "date",
    "historico" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "observacoes" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "na_lixeira" boolean DEFAULT false NOT NULL,
    "deleted_at" timestamp with time zone
);


ALTER TABLE "public"."leads" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."migration_payloads" (
    "payload_key" "text" NOT NULL,
    "seq" integer NOT NULL,
    "payload" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."migration_payloads" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."perfil" (
    "id" "text" NOT NULL,
    "user_id" "uuid" DEFAULT "auth"."uid"() NOT NULL,
    "dados" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."perfil" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."projetos" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "cliente_id" "uuid",
    "tipo_servico" "text" NOT NULL,
    "data" "text",
    "valor_contratado" numeric DEFAULT 0,
    "valor_recebido" numeric DEFAULT 0,
    "financeiro" "jsonb" DEFAULT '{"receitas": []}'::"jsonb",
    "timeline_completa" "jsonb" DEFAULT '[]'::"jsonb",
    "contrato" "jsonb" DEFAULT '{}'::"jsonb",
    "questionario" "jsonb" DEFAULT '{}'::"jsonb",
    "arquivos" "jsonb" DEFAULT '[]'::"jsonb",
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "cliente_nome_importado" "text",
    "import_batch_id" "uuid",
    "external_id" "text",
    "import_fingerprint" "text"
);

ALTER TABLE ONLY "public"."projetos" REPLICA IDENTITY FULL;


ALTER TABLE "public"."projetos" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."whatsapp_connections" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "phone_number_id" "text" NOT NULL,
    "business_account_id" "text",
    "display_phone_number" "text",
    "verified_name" "text",
    "status" "text" DEFAULT 'connected'::"text" NOT NULL,
    "settings" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "connected_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "last_webhook_at" timestamp with time zone,
    "last_error" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "connection_mode" "text" DEFAULT 'cloud_api'::"text" NOT NULL,
    "session_id" "text",
    "connector_url" "text",
    CONSTRAINT "whatsapp_connections_status_check" CHECK (("status" = ANY (ARRAY['connecting'::"text", 'connected'::"text", 'error'::"text", 'disconnected'::"text", 'qr'::"text"])))
);


ALTER TABLE "public"."whatsapp_connections" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."whatsapp_contacts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "wa_id" "text" NOT NULL,
    "phone_normalized" "text" NOT NULL,
    "profile_name" "text",
    "lead_id" "uuid",
    "client_id" "uuid",
    "project_id" "uuid",
    "first_message_at" timestamp with time zone,
    "last_message_at" timestamp with time zone,
    "unread_count" integer DEFAULT 0 NOT NULL,
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."whatsapp_contacts" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."whatsapp_conversations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "contact_id" "uuid" NOT NULL,
    "lead_id" "uuid",
    "client_id" "uuid",
    "project_id" "uuid",
    "status" "text" DEFAULT 'open'::"text" NOT NULL,
    "last_message_preview" "text",
    "last_message_at" timestamp with time zone,
    "assigned_to" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "whatsapp_conversations_status_check" CHECK (("status" = ANY (ARRAY['open'::"text", 'waiting'::"text", 'closed'::"text", 'archived'::"text"])))
);


ALTER TABLE "public"."whatsapp_conversations" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."whatsapp_messages" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "conversation_id" "uuid" NOT NULL,
    "contact_id" "uuid" NOT NULL,
    "whatsapp_message_id" "text",
    "direction" "text" NOT NULL,
    "message_type" "text" DEFAULT 'text'::"text" NOT NULL,
    "body" "text",
    "media_id" "text",
    "media_mime_type" "text",
    "reply_to_message_id" "text",
    "status" "text" DEFAULT 'received'::"text" NOT NULL,
    "sent_at" timestamp with time zone,
    "delivered_at" timestamp with time zone,
    "read_at" timestamp with time zone,
    "failed_at" timestamp with time zone,
    "error_code" "text",
    "error_message" "text",
    "payload" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "whatsapp_messages_direction_check" CHECK (("direction" = ANY (ARRAY['inbound'::"text", 'outbound'::"text"])))
);


ALTER TABLE "public"."whatsapp_messages" OWNER TO "postgres";


ALTER TABLE ONLY "public"."client_portals"
    ADD CONSTRAINT "client_portals_access_token_hash_key" UNIQUE ("access_token_hash");



ALTER TABLE ONLY "public"."client_portals"
    ADD CONSTRAINT "client_portals_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."clientes"
    ADD CONSTRAINT "clientes_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."document_instances"
    ADD CONSTRAINT "document_instances_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."document_templates"
    ADD CONSTRAINT "document_templates_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."equipamentos"
    ADD CONSTRAINT "equipamentos_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."file_assets"
    ADD CONSTRAINT "file_assets_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."file_assets"
    ADD CONSTRAINT "file_assets_storage_path_key" UNIQUE ("storage_path");



ALTER TABLE ONLY "public"."file_folders"
    ADD CONSTRAINT "file_folders_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."financas"
    ADD CONSTRAINT "financas_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."galleries"
    ADD CONSTRAINT "galleries_access_token_hash_key" UNIQUE ("access_token_hash");



ALTER TABLE ONLY "public"."galleries"
    ADD CONSTRAINT "galleries_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."gallery_events"
    ADD CONSTRAINT "gallery_events_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."gallery_photos"
    ADD CONSTRAINT "gallery_photos_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."import_batches"
    ADD CONSTRAINT "import_batches_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."integration_accounts"
    ADD CONSTRAINT "integration_accounts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."integration_accounts"
    ADD CONSTRAINT "integration_accounts_user_id_provider_key" UNIQUE ("user_id", "provider");



ALTER TABLE ONLY "public"."integration_logs"
    ADD CONSTRAINT "integration_logs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."integration_oauth_states"
    ADD CONSTRAINT "integration_oauth_states_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."integration_resource_links"
    ADD CONSTRAINT "integration_resource_links_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."integration_resource_links"
    ADD CONSTRAINT "integration_resource_links_user_id_provider_resource_type_l_key" UNIQUE ("user_id", "provider", "resource_type", "local_id");



ALTER TABLE ONLY "public"."integration_tokens"
    ADD CONSTRAINT "integration_tokens_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."integration_tokens"
    ADD CONSTRAINT "integration_tokens_user_id_provider_key" UNIQUE ("user_id", "provider");



ALTER TABLE ONLY "public"."leads"
    ADD CONSTRAINT "leads_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."migration_payloads"
    ADD CONSTRAINT "migration_payloads_pkey" PRIMARY KEY ("payload_key", "seq");



ALTER TABLE ONLY "public"."perfil"
    ADD CONSTRAINT "perfil_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."projetos"
    ADD CONSTRAINT "projetos_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."whatsapp_connections"
    ADD CONSTRAINT "whatsapp_connections_phone_number_id_key" UNIQUE ("phone_number_id");



ALTER TABLE ONLY "public"."whatsapp_connections"
    ADD CONSTRAINT "whatsapp_connections_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."whatsapp_contacts"
    ADD CONSTRAINT "whatsapp_contacts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."whatsapp_contacts"
    ADD CONSTRAINT "whatsapp_contacts_user_id_wa_id_key" UNIQUE ("user_id", "wa_id");



ALTER TABLE ONLY "public"."whatsapp_conversations"
    ADD CONSTRAINT "whatsapp_conversations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."whatsapp_conversations"
    ADD CONSTRAINT "whatsapp_conversations_user_id_contact_id_key" UNIQUE ("user_id", "contact_id");



ALTER TABLE ONLY "public"."whatsapp_messages"
    ADD CONSTRAINT "whatsapp_messages_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."whatsapp_messages"
    ADD CONSTRAINT "whatsapp_messages_whatsapp_message_id_key" UNIQUE ("whatsapp_message_id");



CREATE INDEX "client_portals_client_id_idx" ON "public"."client_portals" USING "btree" ("client_id");



CREATE INDEX "client_portals_project_id_idx" ON "public"."client_portals" USING "btree" ("project_id");



CREATE INDEX "client_portals_status_idx" ON "public"."client_portals" USING "btree" ("status");



CREATE INDEX "client_portals_user_id_idx" ON "public"."client_portals" USING "btree" ("user_id");



CREATE INDEX "clientes_cpf_cnpj_idx" ON "public"."clientes" USING "btree" ("cpf_cnpj");



CREATE INDEX "clientes_email_lower_idx" ON "public"."clientes" USING "btree" ("lower"("email"));



CREATE INDEX "clientes_telefone_idx" ON "public"."clientes" USING "btree" ("telefone");



CREATE INDEX "equipamentos_fingerprint_idx" ON "public"."equipamentos" USING "btree" ("user_id", "fingerprint");



CREATE INDEX "equipamentos_user_id_idx" ON "public"."equipamentos" USING "btree" ("user_id");



CREATE INDEX "file_assets_client_id_idx" ON "public"."file_assets" USING "btree" ("client_id");



CREATE INDEX "file_assets_created_at_idx" ON "public"."file_assets" USING "btree" ("created_at" DESC);



CREATE INDEX "file_assets_folder_id_idx" ON "public"."file_assets" USING "btree" ("folder_id");



CREATE INDEX "file_assets_portal_visible_idx" ON "public"."file_assets" USING "btree" ("portal_visible") WHERE ("portal_visible" = true);



CREATE INDEX "file_assets_project_id_idx" ON "public"."file_assets" USING "btree" ("project_id");



CREATE INDEX "file_assets_status_idx" ON "public"."file_assets" USING "btree" ("status");



CREATE INDEX "file_assets_user_id_idx" ON "public"."file_assets" USING "btree" ("user_id");



CREATE INDEX "file_folders_client_id_idx" ON "public"."file_folders" USING "btree" ("client_id");



CREATE INDEX "file_folders_parent_id_idx" ON "public"."file_folders" USING "btree" ("parent_id");



CREATE INDEX "file_folders_project_id_idx" ON "public"."file_folders" USING "btree" ("project_id");



CREATE INDEX "file_folders_user_id_idx" ON "public"."file_folders" USING "btree" ("user_id");



CREATE INDEX "financas_client_id_idx" ON "public"."financas" USING "btree" ("client_id");



CREATE INDEX "financas_data_idx" ON "public"."financas" USING "btree" ("data");



CREATE INDEX "financas_project_id_idx" ON "public"."financas" USING "btree" ("project_id");



CREATE INDEX "financas_tipo_idx" ON "public"."financas" USING "btree" ("tipo");



CREATE INDEX "financas_user_id_idx" ON "public"."financas" USING "btree" ("user_id");



CREATE INDEX "galleries_client_id_idx" ON "public"."galleries" USING "btree" ("client_id");



CREATE INDEX "galleries_project_id_idx" ON "public"."galleries" USING "btree" ("project_id");



CREATE INDEX "galleries_status_idx" ON "public"."galleries" USING "btree" ("status");



CREATE INDEX "galleries_user_deleted_idx" ON "public"."galleries" USING "btree" ("user_id", "deleted_at", "created_at" DESC);



CREATE INDEX "galleries_user_id_idx" ON "public"."galleries" USING "btree" ("user_id");



CREATE INDEX "gallery_events_gallery_id_idx" ON "public"."gallery_events" USING "btree" ("gallery_id", "created_at" DESC);



CREATE INDEX "gallery_photos_gallery_id_idx" ON "public"."gallery_photos" USING "btree" ("gallery_id");



CREATE INDEX "gallery_photos_position_idx" ON "public"."gallery_photos" USING "btree" ("gallery_id", "position");



CREATE INDEX "gallery_photos_selected_idx" ON "public"."gallery_photos" USING "btree" ("gallery_id", "selected");



CREATE INDEX "idx_document_instances_client_id" ON "public"."document_instances" USING "btree" ("client_id");



CREATE INDEX "idx_document_instances_org_id" ON "public"."document_instances" USING "btree" ("organization_id");



CREATE INDEX "idx_document_instances_project_id" ON "public"."document_instances" USING "btree" ("project_id");



CREATE INDEX "idx_document_instances_status" ON "public"."document_instances" USING "btree" ("status");



CREATE INDEX "idx_document_instances_template_id" ON "public"."document_instances" USING "btree" ("template_id");



CREATE INDEX "idx_document_instances_updated_at" ON "public"."document_instances" USING "btree" ("updated_at" DESC);



CREATE INDEX "idx_document_instances_user_id" ON "public"."document_instances" USING "btree" ("user_id");



CREATE INDEX "idx_document_templates_base_version" ON "public"."document_templates" USING "btree" ("base_template_id", "version" DESC);



CREATE INDEX "idx_document_templates_latest" ON "public"."document_templates" USING "btree" ("user_id", "is_latest") WHERE ("is_latest" = true);



CREATE INDEX "idx_document_templates_org_id" ON "public"."document_templates" USING "btree" ("organization_id");



CREATE INDEX "idx_document_templates_type_category" ON "public"."document_templates" USING "btree" ("document_type", "category");



CREATE INDEX "idx_document_templates_updated_at" ON "public"."document_templates" USING "btree" ("updated_at" DESC);



CREATE INDEX "idx_document_templates_user_id" ON "public"."document_templates" USING "btree" ("user_id");



CREATE INDEX "idx_equipamentos_entrada_origem_id" ON "public"."equipamentos" USING "btree" ("entrada_origem_id");



CREATE INDEX "idx_equipamentos_finance_exit_id" ON "public"."equipamentos" USING "btree" ("finance_exit_id");



CREATE INDEX "idx_equipamentos_origem_recursos_tipo" ON "public"."equipamentos" USING "btree" ("origem_recursos_tipo");



CREATE INDEX "idx_equipamentos_referencia_negociacao" ON "public"."equipamentos" USING "btree" ("referencia_negociacao");



CREATE INDEX "idx_equipamentos_tipo_saida" ON "public"."equipamentos" USING "btree" ("tipo_saida");



CREATE INDEX "idx_financas_data_pagamento" ON "public"."financas" USING "btree" ("data_pagamento");



CREATE INDEX "import_batches_user_id_idx" ON "public"."import_batches" USING "btree" ("user_id", "created_at" DESC);



CREATE INDEX "integration_accounts_user_provider_idx" ON "public"."integration_accounts" USING "btree" ("user_id", "provider");



CREATE INDEX "integration_logs_user_provider_created_idx" ON "public"."integration_logs" USING "btree" ("user_id", "provider", "created_at" DESC);



CREATE INDEX "integration_oauth_states_expires_idx" ON "public"."integration_oauth_states" USING "btree" ("expires_at");



CREATE INDEX "integration_resource_links_lookup_idx" ON "public"."integration_resource_links" USING "btree" ("user_id", "provider", "resource_type", "local_id");



CREATE INDEX "integration_tokens_user_provider_idx" ON "public"."integration_tokens" USING "btree" ("user_id", "provider");



CREATE INDEX "leads_whatsapp_normalized_idx" ON "public"."leads" USING "btree" ("user_id", "regexp_replace"(COALESCE("whatsapp", "telefone", ''::"text"), '\D'::"text", ''::"text", 'g'::"text"));



CREATE INDEX "perfil_user_id_idx" ON "public"."perfil" USING "btree" ("user_id");



CREATE INDEX "projetos_import_fingerprint_idx" ON "public"."projetos" USING "btree" ("import_fingerprint") WHERE ("import_fingerprint" IS NOT NULL);



CREATE UNIQUE INDEX "whatsapp_connections_user_mode_uidx" ON "public"."whatsapp_connections" USING "btree" ("user_id", "connection_mode");



CREATE INDEX "whatsapp_contacts_phone_idx" ON "public"."whatsapp_contacts" USING "btree" ("user_id", "phone_normalized");



CREATE INDEX "whatsapp_conversations_last_message_idx" ON "public"."whatsapp_conversations" USING "btree" ("user_id", "last_message_at" DESC);



CREATE INDEX "whatsapp_messages_conversation_idx" ON "public"."whatsapp_messages" USING "btree" ("conversation_id", "created_at" DESC);



CREATE OR REPLACE TRIGGER "file_assets_set_updated_at" BEFORE UPDATE ON "public"."file_assets" FOR EACH ROW EXECUTE FUNCTION "public"."set_file_library_updated_at"();



CREATE OR REPLACE TRIGGER "file_folders_set_updated_at" BEFORE UPDATE ON "public"."file_folders" FOR EACH ROW EXECUTE FUNCTION "public"."set_file_library_updated_at"();



CREATE OR REPLACE TRIGGER "galleries_set_updated_at" BEFORE UPDATE ON "public"."galleries" FOR EACH ROW EXECUTE FUNCTION "public"."set_gallery_updated_at"();



CREATE OR REPLACE TRIGGER "galleries_sync_project_workflow" AFTER UPDATE OF "status" ON "public"."galleries" FOR EACH ROW EXECUTE FUNCTION "public"."sync_gallery_project_workflow"();



CREATE OR REPLACE TRIGGER "gallery_events_sync_additional_charge" AFTER INSERT ON "public"."gallery_events" FOR EACH ROW EXECUTE FUNCTION "public"."sync_gallery_additional_charge"();



CREATE OR REPLACE TRIGGER "gallery_photos_set_updated_at" BEFORE UPDATE ON "public"."gallery_photos" FOR EACH ROW EXECUTE FUNCTION "public"."set_gallery_updated_at"();



CREATE OR REPLACE TRIGGER "trg_document_instances_updated_at" BEFORE UPDATE ON "public"."document_instances" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_document_templates_updated_at" BEFORE UPDATE ON "public"."document_templates" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_touch_integration_accounts" BEFORE UPDATE ON "public"."integration_accounts" FOR EACH ROW EXECUTE FUNCTION "public"."touch_integration_accounts_updated_at"();



ALTER TABLE ONLY "public"."client_portals"
    ADD CONSTRAINT "client_portals_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "public"."clientes"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."client_portals"
    ADD CONSTRAINT "client_portals_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."projetos"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."client_portals"
    ADD CONSTRAINT "client_portals_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."clientes"
    ADD CONSTRAINT "clientes_indicacao_cliente_id_fkey" FOREIGN KEY ("indicacao_cliente_id") REFERENCES "public"."clientes"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."document_instances"
    ADD CONSTRAINT "document_instances_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "public"."clientes"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."document_instances"
    ADD CONSTRAINT "document_instances_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."document_instances"
    ADD CONSTRAINT "document_instances_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."projetos"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."document_instances"
    ADD CONSTRAINT "document_instances_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "public"."document_templates"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."document_instances"
    ADD CONSTRAINT "document_instances_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."document_templates"
    ADD CONSTRAINT "document_templates_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."equipamentos"
    ADD CONSTRAINT "equipamentos_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."file_assets"
    ADD CONSTRAINT "file_assets_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "public"."clientes"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."file_assets"
    ADD CONSTRAINT "file_assets_folder_id_fkey" FOREIGN KEY ("folder_id") REFERENCES "public"."file_folders"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."file_assets"
    ADD CONSTRAINT "file_assets_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."projetos"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."file_assets"
    ADD CONSTRAINT "file_assets_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."file_folders"
    ADD CONSTRAINT "file_folders_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "public"."clientes"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."file_folders"
    ADD CONSTRAINT "file_folders_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "public"."file_folders"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."file_folders"
    ADD CONSTRAINT "file_folders_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."projetos"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."file_folders"
    ADD CONSTRAINT "file_folders_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."financas"
    ADD CONSTRAINT "financas_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "public"."clientes"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."financas"
    ADD CONSTRAINT "financas_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."projetos"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."financas"
    ADD CONSTRAINT "financas_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."galleries"
    ADD CONSTRAINT "galleries_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "public"."clientes"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."galleries"
    ADD CONSTRAINT "galleries_cover_photo_id_fkey" FOREIGN KEY ("cover_photo_id") REFERENCES "public"."gallery_photos"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."galleries"
    ADD CONSTRAINT "galleries_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."projetos"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."galleries"
    ADD CONSTRAINT "galleries_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."gallery_events"
    ADD CONSTRAINT "gallery_events_gallery_id_fkey" FOREIGN KEY ("gallery_id") REFERENCES "public"."galleries"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."gallery_events"
    ADD CONSTRAINT "gallery_events_photo_id_fkey" FOREIGN KEY ("photo_id") REFERENCES "public"."gallery_photos"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."gallery_photos"
    ADD CONSTRAINT "gallery_photos_gallery_id_fkey" FOREIGN KEY ("gallery_id") REFERENCES "public"."galleries"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."gallery_photos"
    ADD CONSTRAINT "gallery_photos_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."import_batches"
    ADD CONSTRAINT "import_batches_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."integration_accounts"
    ADD CONSTRAINT "integration_accounts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."integration_logs"
    ADD CONSTRAINT "integration_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."integration_oauth_states"
    ADD CONSTRAINT "integration_oauth_states_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."integration_resource_links"
    ADD CONSTRAINT "integration_resource_links_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."integration_tokens"
    ADD CONSTRAINT "integration_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."leads"
    ADD CONSTRAINT "leads_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."perfil"
    ADD CONSTRAINT "perfil_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."projetos"
    ADD CONSTRAINT "projetos_cliente_id_fkey" FOREIGN KEY ("cliente_id") REFERENCES "public"."clientes"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."projetos"
    ADD CONSTRAINT "projetos_import_batch_id_fkey" FOREIGN KEY ("import_batch_id") REFERENCES "public"."import_batches"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."whatsapp_connections"
    ADD CONSTRAINT "whatsapp_connections_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."whatsapp_contacts"
    ADD CONSTRAINT "whatsapp_contacts_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "public"."clientes"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."whatsapp_contacts"
    ADD CONSTRAINT "whatsapp_contacts_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."whatsapp_contacts"
    ADD CONSTRAINT "whatsapp_contacts_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."projetos"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."whatsapp_contacts"
    ADD CONSTRAINT "whatsapp_contacts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."whatsapp_conversations"
    ADD CONSTRAINT "whatsapp_conversations_assigned_to_fkey" FOREIGN KEY ("assigned_to") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."whatsapp_conversations"
    ADD CONSTRAINT "whatsapp_conversations_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "public"."clientes"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."whatsapp_conversations"
    ADD CONSTRAINT "whatsapp_conversations_contact_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "public"."whatsapp_contacts"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."whatsapp_conversations"
    ADD CONSTRAINT "whatsapp_conversations_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."whatsapp_conversations"
    ADD CONSTRAINT "whatsapp_conversations_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."projetos"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."whatsapp_conversations"
    ADD CONSTRAINT "whatsapp_conversations_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."whatsapp_messages"
    ADD CONSTRAINT "whatsapp_messages_contact_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "public"."whatsapp_contacts"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."whatsapp_messages"
    ADD CONSTRAINT "whatsapp_messages_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "public"."whatsapp_conversations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."whatsapp_messages"
    ADD CONSTRAINT "whatsapp_messages_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



CREATE POLICY "Permitir leitura e escrita para todos" ON "public"."clientes" USING (true) WITH CHECK (true);



CREATE POLICY "Permitir leitura e escrita para todos" ON "public"."projetos" USING (true) WITH CHECK (true);



ALTER TABLE "public"."client_portals" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "client_portals_delete_owner" ON "public"."client_portals" FOR DELETE TO "authenticated" USING (("auth"."uid"() = "user_id"));



CREATE POLICY "client_portals_insert_owner" ON "public"."client_portals" FOR INSERT TO "authenticated" WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "client_portals_select_owner" ON "public"."client_portals" FOR SELECT TO "authenticated" USING (("auth"."uid"() = "user_id"));



CREATE POLICY "client_portals_update_owner" ON "public"."client_portals" FOR UPDATE TO "authenticated" USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));



ALTER TABLE "public"."clientes" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."document_instances" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "document_instances_delete_owner" ON "public"."document_instances" FOR DELETE TO "authenticated" USING (("auth"."uid"() = "user_id"));



CREATE POLICY "document_instances_insert_owner" ON "public"."document_instances" FOR INSERT TO "authenticated" WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "document_instances_select_owner" ON "public"."document_instances" FOR SELECT TO "authenticated" USING (("auth"."uid"() = "user_id"));



CREATE POLICY "document_instances_update_owner" ON "public"."document_instances" FOR UPDATE TO "authenticated" USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));



ALTER TABLE "public"."document_templates" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "document_templates_delete_owner" ON "public"."document_templates" FOR DELETE TO "authenticated" USING (("auth"."uid"() = "user_id"));



CREATE POLICY "document_templates_insert_owner" ON "public"."document_templates" FOR INSERT TO "authenticated" WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "document_templates_select_owner" ON "public"."document_templates" FOR SELECT TO "authenticated" USING (("auth"."uid"() = "user_id"));



CREATE POLICY "document_templates_update_owner" ON "public"."document_templates" FOR UPDATE TO "authenticated" USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));



ALTER TABLE "public"."equipamentos" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "equipamentos_delete_own" ON "public"."equipamentos" FOR DELETE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "equipamentos_insert_own" ON "public"."equipamentos" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "equipamentos_select_own" ON "public"."equipamentos" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "equipamentos_update_own" ON "public"."equipamentos" FOR UPDATE USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));



ALTER TABLE "public"."file_assets" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "file_assets_delete_owner" ON "public"."file_assets" FOR DELETE TO "authenticated" USING (("auth"."uid"() = "user_id"));



CREATE POLICY "file_assets_insert_owner" ON "public"."file_assets" FOR INSERT TO "authenticated" WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "file_assets_select_owner" ON "public"."file_assets" FOR SELECT TO "authenticated" USING (("auth"."uid"() = "user_id"));



CREATE POLICY "file_assets_update_owner" ON "public"."file_assets" FOR UPDATE TO "authenticated" USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));



ALTER TABLE "public"."file_folders" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "file_folders_delete_owner" ON "public"."file_folders" FOR DELETE TO "authenticated" USING (("auth"."uid"() = "user_id"));



CREATE POLICY "file_folders_insert_owner" ON "public"."file_folders" FOR INSERT TO "authenticated" WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "file_folders_select_owner" ON "public"."file_folders" FOR SELECT TO "authenticated" USING (("auth"."uid"() = "user_id"));



CREATE POLICY "file_folders_update_owner" ON "public"."file_folders" FOR UPDATE TO "authenticated" USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));



ALTER TABLE "public"."financas" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "financas_delete_owner" ON "public"."financas" FOR DELETE TO "authenticated" USING ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "financas_insert_owner" ON "public"."financas" FOR INSERT TO "authenticated" WITH CHECK ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "financas_select_owner" ON "public"."financas" FOR SELECT TO "authenticated" USING ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "financas_update_owner" ON "public"."financas" FOR UPDATE TO "authenticated" USING ((( SELECT "auth"."uid"() AS "uid") = "user_id")) WITH CHECK ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



ALTER TABLE "public"."galleries" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "galleries_owner_all" ON "public"."galleries" TO "authenticated" USING (("user_id" = "auth"."uid"())) WITH CHECK (("user_id" = "auth"."uid"()));



ALTER TABLE "public"."gallery_events" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "gallery_events_owner_select" ON "public"."gallery_events" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."galleries" "g"
  WHERE (("g"."id" = "gallery_events"."gallery_id") AND ("g"."user_id" = "auth"."uid"())))));



ALTER TABLE "public"."gallery_photos" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "gallery_photos_owner_all" ON "public"."gallery_photos" TO "authenticated" USING (("user_id" = "auth"."uid"())) WITH CHECK (("user_id" = "auth"."uid"()));



ALTER TABLE "public"."import_batches" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "import_batches_delete_own" ON "public"."import_batches" FOR DELETE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "import_batches_insert_own" ON "public"."import_batches" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "import_batches_select_own" ON "public"."import_batches" FOR SELECT USING (("auth"."uid"() = "user_id"));



ALTER TABLE "public"."integration_accounts" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "integration_accounts_delete_own" ON "public"."integration_accounts" FOR DELETE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "integration_accounts_insert_own" ON "public"."integration_accounts" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "integration_accounts_select_own" ON "public"."integration_accounts" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "integration_accounts_update_own" ON "public"."integration_accounts" FOR UPDATE USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));



ALTER TABLE "public"."integration_logs" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "integration_logs_insert_own" ON "public"."integration_logs" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "integration_logs_select_own" ON "public"."integration_logs" FOR SELECT USING (("auth"."uid"() = "user_id"));



ALTER TABLE "public"."integration_oauth_states" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."integration_resource_links" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "integration_resource_links_delete_own" ON "public"."integration_resource_links" FOR DELETE TO "authenticated" USING (("auth"."uid"() = "user_id"));



CREATE POLICY "integration_resource_links_insert_own" ON "public"."integration_resource_links" FOR INSERT TO "authenticated" WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "integration_resource_links_select_own" ON "public"."integration_resource_links" FOR SELECT TO "authenticated" USING (("auth"."uid"() = "user_id"));



CREATE POLICY "integration_resource_links_update_own" ON "public"."integration_resource_links" FOR UPDATE TO "authenticated" USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));



ALTER TABLE "public"."integration_tokens" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."migration_payloads" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."perfil" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "perfil_delete_own" ON "public"."perfil" FOR DELETE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "perfil_insert_own" ON "public"."perfil" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "perfil_select_own" ON "public"."perfil" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "perfil_update_own" ON "public"."perfil" FOR UPDATE USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));



ALTER TABLE "public"."projetos" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."whatsapp_connections" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "whatsapp_connections_owner" ON "public"."whatsapp_connections" USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));



ALTER TABLE "public"."whatsapp_contacts" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "whatsapp_contacts_owner" ON "public"."whatsapp_contacts" USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));



ALTER TABLE "public"."whatsapp_conversations" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "whatsapp_conversations_owner" ON "public"."whatsapp_conversations" USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));



ALTER TABLE "public"."whatsapp_messages" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "whatsapp_messages_owner" ON "public"."whatsapp_messages" USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));





ALTER PUBLICATION "supabase_realtime" OWNER TO "postgres";






ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."financas";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."whatsapp_conversations";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."whatsapp_messages";



GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";






















































































































































REVOKE ALL ON FUNCTION "public"."accept_gallery_legal_notice"("p_token" "text", "p_session_id" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."accept_gallery_legal_notice"("p_token" "text", "p_session_id" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."accept_gallery_legal_notice"("p_token" "text", "p_session_id" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."accept_gallery_legal_notice"("p_token" "text", "p_session_id" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."finalize_gallery_selection"("p_token" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."finalize_gallery_selection"("p_token" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."finalize_gallery_selection"("p_token" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."finalize_gallery_selection"("p_token" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_client_portal_by_token"("p_token" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."get_client_portal_by_token"("p_token" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_client_portal_by_token"("p_token" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_gallery_by_token"("p_token" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_gallery_by_token"("p_token" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."get_gallery_by_token"("p_token" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_gallery_by_token"("p_token" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."ingest_whatsapp_message"("p_phone_number_id" "text", "p_wa_id" "text", "p_profile_name" "text", "p_message_id" "text", "p_message_type" "text", "p_body" "text", "p_timestamp" timestamp with time zone, "p_payload" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."ingest_whatsapp_message"("p_phone_number_id" "text", "p_wa_id" "text", "p_profile_name" "text", "p_message_id" "text", "p_message_type" "text", "p_body" "text", "p_timestamp" timestamp with time zone, "p_payload" "jsonb") TO "anon";
GRANT ALL ON FUNCTION "public"."ingest_whatsapp_message"("p_phone_number_id" "text", "p_wa_id" "text", "p_profile_name" "text", "p_message_id" "text", "p_message_type" "text", "p_body" "text", "p_timestamp" timestamp with time zone, "p_payload" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."ingest_whatsapp_message"("p_phone_number_id" "text", "p_wa_id" "text", "p_profile_name" "text", "p_message_id" "text", "p_message_type" "text", "p_body" "text", "p_timestamp" timestamp with time zone, "p_payload" "jsonb") TO "service_role";



REVOKE ALL ON FUNCTION "public"."record_gallery_privacy_event"("p_token" "text", "p_event_type" "text", "p_details" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."record_gallery_privacy_event"("p_token" "text", "p_event_type" "text", "p_details" "jsonb") TO "anon";
GRANT ALL ON FUNCTION "public"."record_gallery_privacy_event"("p_token" "text", "p_event_type" "text", "p_details" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."record_gallery_privacy_event"("p_token" "text", "p_event_type" "text", "p_details" "jsonb") TO "service_role";



GRANT ALL ON FUNCTION "public"."set_file_library_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."set_file_library_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_file_library_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."set_gallery_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."set_gallery_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_gallery_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."set_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."set_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."sync_gallery_additional_charge"() TO "anon";
GRANT ALL ON FUNCTION "public"."sync_gallery_additional_charge"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."sync_gallery_additional_charge"() TO "service_role";



GRANT ALL ON FUNCTION "public"."sync_gallery_project_workflow"() TO "anon";
GRANT ALL ON FUNCTION "public"."sync_gallery_project_workflow"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."sync_gallery_project_workflow"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."toggle_gallery_photo_selection"("p_token" "text", "p_photo_id" "uuid", "p_selected" boolean, "p_comment" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."toggle_gallery_photo_selection"("p_token" "text", "p_photo_id" "uuid", "p_selected" boolean, "p_comment" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."toggle_gallery_photo_selection"("p_token" "text", "p_photo_id" "uuid", "p_selected" boolean, "p_comment" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."toggle_gallery_photo_selection"("p_token" "text", "p_photo_id" "uuid", "p_selected" boolean, "p_comment" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."touch_integration_accounts_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."touch_integration_accounts_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."touch_integration_accounts_updated_at"() TO "service_role";


















GRANT ALL ON TABLE "public"."client_portals" TO "anon";
GRANT ALL ON TABLE "public"."client_portals" TO "authenticated";
GRANT ALL ON TABLE "public"."client_portals" TO "service_role";



GRANT ALL ON TABLE "public"."clientes" TO "anon";
GRANT ALL ON TABLE "public"."clientes" TO "authenticated";
GRANT ALL ON TABLE "public"."clientes" TO "service_role";



GRANT ALL ON TABLE "public"."document_instances" TO "anon";
GRANT ALL ON TABLE "public"."document_instances" TO "authenticated";
GRANT ALL ON TABLE "public"."document_instances" TO "service_role";



GRANT ALL ON TABLE "public"."document_templates" TO "anon";
GRANT ALL ON TABLE "public"."document_templates" TO "authenticated";
GRANT ALL ON TABLE "public"."document_templates" TO "service_role";



GRANT ALL ON TABLE "public"."equipamentos" TO "anon";
GRANT ALL ON TABLE "public"."equipamentos" TO "authenticated";
GRANT ALL ON TABLE "public"."equipamentos" TO "service_role";



GRANT ALL ON TABLE "public"."file_assets" TO "anon";
GRANT ALL ON TABLE "public"."file_assets" TO "authenticated";
GRANT ALL ON TABLE "public"."file_assets" TO "service_role";



GRANT ALL ON TABLE "public"."file_folders" TO "anon";
GRANT ALL ON TABLE "public"."file_folders" TO "authenticated";
GRANT ALL ON TABLE "public"."file_folders" TO "service_role";



GRANT ALL ON TABLE "public"."financas" TO "authenticated";
GRANT ALL ON TABLE "public"."financas" TO "service_role";



GRANT ALL ON TABLE "public"."finance_ledger_canonical" TO "anon";
GRANT ALL ON TABLE "public"."finance_ledger_canonical" TO "authenticated";
GRANT ALL ON TABLE "public"."finance_ledger_canonical" TO "service_role";



GRANT ALL ON TABLE "public"."galleries" TO "anon";
GRANT ALL ON TABLE "public"."galleries" TO "authenticated";
GRANT ALL ON TABLE "public"."galleries" TO "service_role";



GRANT ALL ON TABLE "public"."gallery_events" TO "anon";
GRANT ALL ON TABLE "public"."gallery_events" TO "authenticated";
GRANT ALL ON TABLE "public"."gallery_events" TO "service_role";



GRANT ALL ON TABLE "public"."gallery_photos" TO "anon";
GRANT ALL ON TABLE "public"."gallery_photos" TO "authenticated";
GRANT ALL ON TABLE "public"."gallery_photos" TO "service_role";



GRANT ALL ON TABLE "public"."import_batches" TO "anon";
GRANT ALL ON TABLE "public"."import_batches" TO "authenticated";
GRANT ALL ON TABLE "public"."import_batches" TO "service_role";



GRANT ALL ON TABLE "public"."integration_accounts" TO "anon";
GRANT ALL ON TABLE "public"."integration_accounts" TO "authenticated";
GRANT ALL ON TABLE "public"."integration_accounts" TO "service_role";



GRANT ALL ON TABLE "public"."integration_logs" TO "anon";
GRANT ALL ON TABLE "public"."integration_logs" TO "authenticated";
GRANT ALL ON TABLE "public"."integration_logs" TO "service_role";



GRANT ALL ON TABLE "public"."integration_oauth_states" TO "service_role";



GRANT ALL ON TABLE "public"."integration_resource_links" TO "anon";
GRANT ALL ON TABLE "public"."integration_resource_links" TO "authenticated";
GRANT ALL ON TABLE "public"."integration_resource_links" TO "service_role";



GRANT ALL ON TABLE "public"."integration_tokens" TO "service_role";



GRANT ALL ON TABLE "public"."leads" TO "anon";
GRANT ALL ON TABLE "public"."leads" TO "authenticated";
GRANT ALL ON TABLE "public"."leads" TO "service_role";



GRANT ALL ON TABLE "public"."migration_payloads" TO "anon";
GRANT ALL ON TABLE "public"."migration_payloads" TO "authenticated";
GRANT ALL ON TABLE "public"."migration_payloads" TO "service_role";



GRANT ALL ON TABLE "public"."perfil" TO "anon";
GRANT ALL ON TABLE "public"."perfil" TO "authenticated";
GRANT ALL ON TABLE "public"."perfil" TO "service_role";



GRANT ALL ON TABLE "public"."projetos" TO "anon";
GRANT ALL ON TABLE "public"."projetos" TO "authenticated";
GRANT ALL ON TABLE "public"."projetos" TO "service_role";



GRANT ALL ON TABLE "public"."whatsapp_connections" TO "anon";
GRANT ALL ON TABLE "public"."whatsapp_connections" TO "authenticated";
GRANT ALL ON TABLE "public"."whatsapp_connections" TO "service_role";



GRANT ALL ON TABLE "public"."whatsapp_contacts" TO "anon";
GRANT ALL ON TABLE "public"."whatsapp_contacts" TO "authenticated";
GRANT ALL ON TABLE "public"."whatsapp_contacts" TO "service_role";



GRANT ALL ON TABLE "public"."whatsapp_conversations" TO "anon";
GRANT ALL ON TABLE "public"."whatsapp_conversations" TO "authenticated";
GRANT ALL ON TABLE "public"."whatsapp_conversations" TO "service_role";



GRANT ALL ON TABLE "public"."whatsapp_messages" TO "anon";
GRANT ALL ON TABLE "public"."whatsapp_messages" TO "authenticated";
GRANT ALL ON TABLE "public"."whatsapp_messages" TO "service_role";









ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";































