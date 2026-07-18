-- Separa faturamento operacional de entradas que apenas movimentam caixa.
-- A migration é aditiva e não altera nem apaga lançamentos existentes.
alter table if exists public.financas
  add column if not exists natureza_financeira text,
  add column if not exists origem_recursos text,
  add column if not exists patrimonio_id text,
  add column if not exists documento_referencia text;

update public.financas
set natureza_financeira = case
  when lower(coalesce(categoria, '')) in (
    'aporte do titular',
    'aporte pessoal',
    'aporte pessoal da titular',
    'venda de patrimônio',
    'venda de patrimonio',
    'venda de equipamento',
    'reembolso',
    'empréstimo recebido',
    'emprestimo recebido',
    'entrada não operacional',
    'entrada nao operacional',
    'outras entradas não operacionais',
    'outras entradas nao operacionais'
  ) then 'nao_operacional'
  else 'operacional'
end
where natureza_financeira is null;

create index if not exists financas_natureza_financeira_idx
  on public.financas (natureza_financeira);

create index if not exists financas_patrimonio_id_idx
  on public.financas (patrimonio_id);
