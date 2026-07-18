-- Atualiza a fonte canônica financeira com datas distintas de efetivação e vencimento.
drop view if exists public.finance_ledger_canonical;
create view public.finance_ledger_canonical
with (security_invoker = true)
as
select
  f.id,
  f.user_id,
  f.project_id,
  f.client_id,
  f.descricao,
  f.categoria,
  f.valor::numeric as amount,
  f.tipo as source_type,
  f.tipo_geral as general_type,
  f.status,
  f.forma_pagamento,
  f.conta_origem,
  f.detalhes,
  case
    when lower(coalesce(f.tipo, '')) = 'receita_projeto' then 'ignored_mirror'
    when lower(coalesce(f.tipo, '')) = 'distribuicao_pagamento' then 'operational_allocation'
    when lower(coalesce(f.tipo, '')) = 'transferencia_interna' then 'internal_transfer'
    when lower(coalesce(f.tipo_geral, '')) = 'entrada' and (
      lower(coalesce(f.tipo, '')) = 'entrada_nao_operacional'
      or lower(coalesce(f.categoria, '')) in (
        'aporte pessoal da titular','aporte do titular','venda de patrimônio','venda de patrimonio',
        'reembolso','empréstimo recebido','emprestimo recebido','outras entradas não operacionais',
        'outras entradas nao operacionais','entrada não operacional','entrada nao operacional'
      )
      or lower(coalesce(f.detalhes->>'naturezaFinanceira', '')) = 'nao_operacional'
    ) then 'non_operational_income'
    when lower(coalesce(f.tipo_geral, '')) = 'entrada' then 'operational_income'
    when lower(coalesce(f.tipo_geral, '')) = 'saida' and (
      f.data_pagamento is not null
      or lower(coalesce(f.status, '')) in ('pago','paga','quitado','quitada')
    ) then 'expense_paid'
    when lower(coalesce(f.tipo_geral, '')) = 'saida' then 'expense_pending'
    else 'ignored'
  end as entry_kind,
  case
    when lower(coalesce(f.conta_origem, f.detalhes->>'destino', '')) like '%reserva%' then 'reserva'
    when lower(coalesce(f.conta_origem, f.detalhes->>'destino', '')) like '%salario%'
      or lower(coalesce(f.conta_origem, f.detalhes->>'destino', '')) like '%pessoal%' then 'salario'
    when lower(coalesce(f.conta_origem, f.detalhes->>'destino', '')) like '%empresa%' then 'empresa'
    else 'nao_informada'
  end as account_code,
  coalesce(
    nullif(f.detalhes->>'paymentId',''),
    nullif(f.detalhes->>'externalPaymentId',''),
    f.id
  ) as payment_group_id,
  coalesce(
    f.data_pagamento::date,
    case when coalesce(f.data, '') ~ '^\d{4}-\d{2}-\d{2}' then substring(f.data from 1 for 10)::date end
  ) as effective_date,
  case
    when coalesce(f.data_vencimento, '') ~ '^\d{4}-\d{2}-\d{2}' then substring(f.data_vencimento from 1 for 10)::date
    when f.data_pagamento is null and coalesce(f.data, '') ~ '^\d{4}-\d{2}-\d{2}' then substring(f.data from 1 for 10)::date
  end as due_date,
  f.created_at,
  f.updated_at
from public.financas f;
