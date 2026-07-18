-- StudioFlow: despesas variáveis, patrimônio e relatórios anuais.
-- Migration aditiva e idempotente; nenhum dado existente é removido.

alter table if exists public.financas
  add column if not exists situacao text,
  add column if not exists grupo_parcelamento_id text,
  add column if not exists parcela_numero integer,
  add column if not exists total_parcelas integer,
  add column if not exists valor_total numeric(14,2),
  add column if not exists profissional text,
  add column if not exists servico_realizado text,
  add column if not exists data_servico date,
  add column if not exists cliente_id text,
  add column if not exists quantidade numeric(12,2),
  add column if not exists previsao_entrega date,
  add column if not exists status_pedido text,
  add column if not exists local_despesa text,
  add column if not exists reembolsavel boolean default false,
  add column if not exists origem_recursos text;

alter table if exists public.equipamentos
  add column if not exists status text default 'Ativo',
  add column if not exists comprador text,
  add column if not exists data_venda date,
  add column if not exists valor_venda numeric(14,2),
  add column if not exists forma_recebimento text,
  add column if not exists observacoes_venda text,
  add column if not exists valor_contabil_venda numeric(14,2),
  add column if not exists resultado_patrimonial_venda numeric(14,2),
  add column if not exists depreciacao_encerrada_em date,
  add column if not exists finance_expense_id text,
  add column if not exists origem_recursos text,
  add column if not exists historico jsonb default '[]'::jsonb;

create index if not exists idx_financas_grupo_parcelamento
  on public.financas (grupo_parcelamento_id)
  where grupo_parcelamento_id is not null;

create unique index if not exists idx_equipamentos_finance_expense_unique
  on public.equipamentos (finance_expense_id)
  where finance_expense_id is not null and finance_expense_id <> '';
