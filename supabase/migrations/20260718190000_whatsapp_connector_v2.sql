-- StudioFlow WhatsApp Connector v2
-- Idempotência por usuário, metadados LID/PN e ingestão transacional sem efeitos duplicados.

alter table public.whatsapp_contacts
  add column if not exists updated_at timestamptz not null default now();

alter table public.whatsapp_messages
  drop constraint if exists whatsapp_messages_whatsapp_message_id_key;

create unique index if not exists whatsapp_messages_user_message_uidx
  on public.whatsapp_messages(user_id, whatsapp_message_id)
  where whatsapp_message_id is not null;

create index if not exists whatsapp_contacts_wa_id_idx
  on public.whatsapp_contacts(user_id, wa_id);

create or replace function public.ingest_whatsapp_message(
  p_phone_number_id text,
  p_wa_id text,
  p_profile_name text,
  p_message_id text,
  p_message_type text,
  p_body text,
  p_timestamp timestamptz,
  p_payload jsonb
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
  v_phone text;
  v_lead_id uuid;
  v_client_id uuid;
  v_project_id uuid;
  v_contact_id uuid;
  v_conversation_id uuid;
  v_history jsonb;
  v_existing_message uuid;
  v_source text;
  v_is_history boolean;
begin
  select user_id into v_user_id
  from public.whatsapp_connections
  where phone_number_id = p_phone_number_id
    and connection_mode = 'linked_device'
    and status in ('connected', 'connecting', 'qr')
  limit 1;

  if v_user_id is null then
    raise exception 'Linked WhatsApp connection not found for phone_number_id %', p_phone_number_id;
  end if;

  if nullif(trim(coalesce(p_message_id, '')), '') is null then
    raise exception 'WhatsApp message id is required';
  end if;

  select id into v_existing_message
  from public.whatsapp_messages
  where user_id = v_user_id and whatsapp_message_id = p_message_id
  limit 1;

  if v_existing_message is not null then
    return jsonb_build_object(
      'user_id', v_user_id,
      'message_id', v_existing_message,
      'duplicate', true
    );
  end if;

  v_phone := regexp_replace(coalesce(p_wa_id, ''), '\D', '', 'g');
  if v_phone = '' then
    raise exception 'Resolved phone number is required';
  end if;

  v_source := coalesce(p_payload #>> '{studioflow,source}', 'linked_device');
  v_is_history := v_source = 'history_sync';

  select id into v_client_id
  from public.clientes
  where user_id = v_user_id
    and regexp_replace(coalesce(whatsapp, telefone, ''), '\D', '', 'g') = v_phone
  order by updated_at desc nulls last, created_at desc
  limit 1;

  select id into v_project_id
  from public.projetos
  where user_id = v_user_id and cliente_id = v_client_id
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
        'automatico', true,
        'source', v_source
      )),
      p_timestamp,
      now()
    ) returning id into v_lead_id;
  elsif v_lead_id is not null and not v_is_history then
    select coalesce(historico, '[]'::jsonb) into v_history
    from public.leads where id = v_lead_id for update;

    update public.leads set
      nome = case
        when trim(coalesce(nome, '')) = '' then coalesce(nullif(trim(p_profile_name), ''), nome)
        else nome
      end,
      data_ultimo_contato = greatest(
        coalesce(data_ultimo_contato, (p_timestamp at time zone 'America/Sao_Paulo')::date),
        (p_timestamp at time zone 'America/Sao_Paulo')::date
      ),
      data_proximo_followup = null,
      historico = v_history || jsonb_build_array(jsonb_build_object(
        'id', gen_random_uuid()::text,
        'tipo', 'whatsapp_recebido',
        'data', p_timestamp,
        'descricao', coalesce(p_body, concat('Mensagem ', p_message_type, ' recebida pelo WhatsApp')),
        'resultado', 'Cliente respondeu',
        'whatsappMessageId', p_message_id,
        'automatico', true,
        'source', v_source
      )),
      updated_at = now()
    where id = v_lead_id;
  end if;

  insert into public.whatsapp_contacts (
    user_id, wa_id, phone_normalized, profile_name, lead_id, client_id, project_id,
    first_message_at, last_message_at, unread_count, metadata, updated_at
  ) values (
    v_user_id, v_phone, v_phone, p_profile_name, v_lead_id, v_client_id, v_project_id,
    p_timestamp, p_timestamp, case when v_is_history then 0 else 1 end,
    jsonb_build_object(
      'source', v_source,
      'lid', p_payload #>> '{studioflow,identity,lid}',
      'phoneJid', p_payload #>> '{studioflow,identity,phoneJid}',
      'addressingMode', p_payload #>> '{key,addressingMode}'
    ),
    now()
  )
  on conflict (user_id, wa_id) do update set
    profile_name = coalesce(nullif(excluded.profile_name, ''), whatsapp_contacts.profile_name),
    phone_normalized = excluded.phone_normalized,
    lead_id = coalesce(excluded.lead_id, whatsapp_contacts.lead_id),
    client_id = coalesce(excluded.client_id, whatsapp_contacts.client_id),
    project_id = coalesce(excluded.project_id, whatsapp_contacts.project_id),
    first_message_at = least(coalesce(whatsapp_contacts.first_message_at, excluded.first_message_at), excluded.first_message_at),
    last_message_at = greatest(coalesce(whatsapp_contacts.last_message_at, excluded.last_message_at), excluded.last_message_at),
    unread_count = whatsapp_contacts.unread_count + case when v_is_history then 0 else 1 end,
    metadata = coalesce(whatsapp_contacts.metadata, '{}'::jsonb) || excluded.metadata,
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
    last_message_preview = case
      when whatsapp_conversations.last_message_at is null or excluded.last_message_at >= whatsapp_conversations.last_message_at
      then excluded.last_message_preview else whatsapp_conversations.last_message_preview end,
    last_message_at = greatest(coalesce(whatsapp_conversations.last_message_at, excluded.last_message_at), excluded.last_message_at),
    updated_at = now()
  returning id into v_conversation_id;

  insert into public.whatsapp_messages (
    user_id, conversation_id, contact_id, whatsapp_message_id, direction,
    message_type, body, media_id, media_mime_type, reply_to_message_id,
    status, sent_at, payload
  ) values (
    v_user_id, v_conversation_id, v_contact_id, p_message_id, 'inbound',
    coalesce(p_message_type, 'unknown'), p_body,
    coalesce(p_payload #>> '{message,imageMessage,url}', p_payload #>> '{message,documentMessage,url}'),
    coalesce(p_payload #>> '{message,imageMessage,mimetype}', p_payload #>> '{message,documentMessage,mimetype}'),
    coalesce(
      p_payload #>> '{message,extendedTextMessage,contextInfo,stanzaId}',
      p_payload #>> '{message,imageMessage,contextInfo,stanzaId}'
    ),
    'received', p_timestamp, p_payload
  ) returning id into v_existing_message;

  update public.whatsapp_connections
  set last_webhook_at = now(), last_error = null, updated_at = now()
  where user_id = v_user_id and connection_mode = 'linked_device';

  return jsonb_build_object(
    'user_id', v_user_id,
    'lead_id', v_lead_id,
    'client_id', v_client_id,
    'project_id', v_project_id,
    'contact_id', v_contact_id,
    'conversation_id', v_conversation_id,
    'message_id', v_existing_message,
    'duplicate', false
  );
exception
  when unique_violation then
    select id into v_existing_message
    from public.whatsapp_messages
    where user_id = v_user_id and whatsapp_message_id = p_message_id
    limit 1;
    return jsonb_build_object(
      'user_id', v_user_id,
      'message_id', v_existing_message,
      'duplicate', true
    );
end;
$$;

revoke all on function public.ingest_whatsapp_message(text,text,text,text,text,text,timestamptz,jsonb) from public;
grant execute on function public.ingest_whatsapp_message(text,text,text,text,text,text,timestamptz,jsonb) to service_role;
