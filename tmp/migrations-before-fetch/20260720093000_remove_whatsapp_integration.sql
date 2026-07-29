-- Remove integralmente a integração automática do WhatsApp do StudioFlow.
-- Preserva os campos de telefone/WhatsApp usados no cadastro manual de leads,
-- clientes, perfil do estúdio e abertura direta do aplicativo.

begin;

-- Remove apenas os registros do antigo provedor, sem afetar outras integrações.
do $$
begin
  if to_regclass('public.integration_logs') is not null then
    delete from public.integration_logs where provider = 'whatsapp';
  end if;

  if to_regclass('public.integration_accounts') is not null then
    delete from public.integration_accounts where provider = 'whatsapp';
  end if;
end;
$$;

-- A função depende das tabelas da integração e não deve permanecer exposta.
drop function if exists public.ingest_whatsapp_message(
  text,
  text,
  text,
  text,
  text,
  text,
  timestamptz,
  jsonb
);

-- Remove as tabelas da publicação realtime antes de excluí-las.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if to_regclass('public.whatsapp_messages') is not null then
      begin
        alter publication supabase_realtime drop table public.whatsapp_messages;
      exception when object_not_in_prerequisite_state then
        null;
      end;
    end if;

    if to_regclass('public.whatsapp_conversations') is not null then
      begin
        alter publication supabase_realtime drop table public.whatsapp_conversations;
      exception when object_not_in_prerequisite_state then
        null;
      end;
    end if;
  end if;
end;
$$;

-- Ordem inversa das dependências por chave estrangeira.
drop table if exists public.whatsapp_messages cascade;
drop table if exists public.whatsapp_conversations cascade;
drop table if exists public.whatsapp_contacts cascade;
drop table if exists public.whatsapp_connections cascade;

commit;
