-- StudioFlow — integração oficial com WhatsApp Business Platform.
-- Mantém tokens fora do banco; credenciais ficam em Supabase Secrets.

create table if not exists public.leads (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  nome text not null default '',
  telefone text,
  whatsapp text,
  email text,
  tipo_servico text,
  status text not null default 'novo_lead',
  origem text not null default 'WhatsApp',
  data_primeiro_contato date,
  data_ultimo_contato date,
  data_proximo_followup date,
  historico jsonb not null default '[]'::jsonb,
  observacoes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.leads
  add column if not exists user_id uuid references auth.users(id) on delete cascade,
  add column if not exists whatsapp text,
  add column if not exists origem text default 'WhatsApp',
  add column if not exists data_primeiro_contato date,
  add column if not exists data_ultimo_contato date,
  add column if not exists data_proximo_followup date,
  add column if not exists historico jsonb not null default '[]'::jsonb,
  add column if not exists na_lixeira boolean not null default false,
  add column if not exists deleted_at timestamptz,
  add column if not exists updated_at timestamptz not null default now();

create table if not exists public.whatsapp_connections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  phone_number_id text not null,
  business_account_id text,
  display_phone_number text,
  verified_name text,
  status text not null default 'connected' check (status in ('connecting','connected','error','disconnected')),
  settings jsonb not null default '{}'::jsonb,
  connected_at timestamptz not null default now(),
  last_webhook_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id),
  unique(phone_number_id)
);

create table if not exists public.whatsapp_contacts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  wa_id text not null,
  phone_normalized text not null,
  profile_name text,
  lead_id uuid references public.leads(id) on delete set null,
  client_id uuid references public.clientes(id) on delete set null,
  project_id uuid references public.projetos(id) on delete set null,
  first_message_at timestamptz,
  last_message_at timestamptz,
  unread_count integer not null default 0,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id, wa_id)
);

create table if not exists public.whatsapp_conversations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  contact_id uuid not null references public.whatsapp_contacts(id) on delete cascade,
  lead_id uuid references public.leads(id) on delete set null,
  client_id uuid references public.clientes(id) on delete set null,
  project_id uuid references public.projetos(id) on delete set null,
  status text not null default 'open' check (status in ('open','waiting','closed','archived')),
  last_message_preview text,
  last_message_at timestamptz,
  assigned_to uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id, contact_id)
);

create table if not exists public.whatsapp_messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  conversation_id uuid not null references public.whatsapp_conversations(id) on delete cascade,
  contact_id uuid not null references public.whatsapp_contacts(id) on delete cascade,
  whatsapp_message_id text unique,
  direction text not null check (direction in ('inbound','outbound')),
  message_type text not null default 'text',
  body text,
  media_id text,
  media_mime_type text,
  reply_to_message_id text,
  status text not null default 'received',
  sent_at timestamptz,
  delivered_at timestamptz,
  read_at timestamptz,
  failed_at timestamptz,
  error_code text,
  error_message text,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists whatsapp_contacts_phone_idx on public.whatsapp_contacts(user_id, phone_normalized);
create index if not exists whatsapp_conversations_last_message_idx on public.whatsapp_conversations(user_id, last_message_at desc);
create index if not exists whatsapp_messages_conversation_idx on public.whatsapp_messages(conversation_id, created_at desc);
create index if not exists leads_whatsapp_normalized_idx on public.leads(user_id, regexp_replace(coalesce(whatsapp, telefone, ''), '\\D', '', 'g'));

alter table public.whatsapp_connections enable row level security;
alter table public.whatsapp_contacts enable row level security;
alter table public.whatsapp_conversations enable row level security;
alter table public.whatsapp_messages enable row level security;

create policy "whatsapp_connections_owner" on public.whatsapp_connections
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "whatsapp_contacts_owner" on public.whatsapp_contacts
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "whatsapp_conversations_owner" on public.whatsapp_conversations
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "whatsapp_messages_owner" on public.whatsapp_messages
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

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
begin
  select user_id into v_user_id
  from public.whatsapp_connections
  where phone_number_id = p_phone_number_id and status = 'connected'
  limit 1;

  if v_user_id is null then
    raise exception 'WhatsApp connection not found for phone_number_id %', p_phone_number_id;
  end if;

  v_phone := regexp_replace(coalesce(p_wa_id, ''), '\\D', '', 'g');

  select id into v_client_id
  from public.clientes
  where regexp_replace(coalesce(whatsapp, telefone, ''), '\\D', '', 'g') = v_phone
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
    and regexp_replace(coalesce(whatsapp, telefone, ''), '\\D', '', 'g') = v_phone
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

revoke all on function public.ingest_whatsapp_message(text,text,text,text,text,text,timestamptz,jsonb) from public;
grant execute on function public.ingest_whatsapp_message(text,text,text,text,text,text,timestamptz,jsonb) to service_role;
