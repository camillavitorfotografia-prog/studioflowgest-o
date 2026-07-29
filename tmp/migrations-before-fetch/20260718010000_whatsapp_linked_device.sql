alter table public.whatsapp_connections
  add column if not exists connection_mode text not null default 'cloud_api',
  add column if not exists session_id text,
  add column if not exists connector_url text;

alter table public.whatsapp_connections drop constraint if exists whatsapp_connections_user_id_key;
create unique index if not exists whatsapp_connections_user_mode_uidx
  on public.whatsapp_connections(user_id, connection_mode);

alter table public.whatsapp_connections drop constraint if exists whatsapp_connections_status_check;
alter table public.whatsapp_connections add constraint whatsapp_connections_status_check
  check (status in ('connecting','connected','error','disconnected','qr'));

do $$
begin
  alter publication supabase_realtime add table public.whatsapp_conversations;
exception when duplicate_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.whatsapp_messages;
exception when duplicate_object then null;
end $$;
