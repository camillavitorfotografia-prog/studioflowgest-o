-- Composição das fontes usadas na aquisição de patrimônio.
-- Migration aditiva: não remove nem transforma dados existentes.
alter table if exists public.equipamentos add column if not exists origem_recursos_tipo text;
alter table if exists public.equipamentos add column if not exists origem_recursos text;
alter table if exists public.equipamentos add column if not exists entrada_origem_id text;
alter table if exists public.equipamentos add column if not exists composicao_recursos jsonb not null default '[]'::jsonb;

create index if not exists idx_equipamentos_origem_recursos_tipo on public.equipamentos(origem_recursos_tipo);
create index if not exists idx_equipamentos_entrada_origem_id on public.equipamentos(entrada_origem_id);
