-- StudioFlow: suporte final da sprint de reestruturação.
-- Usa colunas já existentes sempre que possível e adiciona somente metadados compatíveis.
alter table if exists public.clientes
  add column if not exists archived_at timestamptz;

alter table if exists public.projetos
  add column if not exists archived_at timestamptz;

create index if not exists clientes_status_idx on public.clientes(status);
create index if not exists projetos_cliente_id_idx on public.projetos(cliente_id);
