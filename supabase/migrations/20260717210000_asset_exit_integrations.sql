-- Saídas patrimoniais integradas ao Financeiro.
alter table if exists public.equipamentos add column if not exists tipo_saida text;
alter table if exists public.equipamentos add column if not exists referencia_negociacao text;
alter table if exists public.equipamentos add column if not exists servico_recebido text;
alter table if exists public.equipamentos add column if not exists fornecedor_servico text;
alter table if exists public.equipamentos add column if not exists valor_total_servico numeric(14,2) default 0;
alter table if exists public.equipamentos add column if not exists complemento_dinheiro numeric(14,2) default 0;
alter table if exists public.equipamentos add column if not exists conta_complemento text;
alter table if exists public.equipamentos add column if not exists finance_exit_id text;

create index if not exists idx_equipamentos_tipo_saida on public.equipamentos(tipo_saida);
create index if not exists idx_equipamentos_referencia_negociacao on public.equipamentos(referencia_negociacao);
create index if not exists idx_equipamentos_finance_exit_id on public.equipamentos(finance_exit_id);
