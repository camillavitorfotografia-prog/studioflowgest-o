const normalize = (value = '') => String(value)
  .trim()
  .toLocaleLowerCase('pt-BR')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '');

export const OPERATIONAL_INCOME_CATEGORIES = [
  'Serviço adicional',
  'Taxa extra',
  'Comissão',
  'Outro serviço',
];

export const NON_OPERATIONAL_INCOME_CATEGORIES = [
  'Aporte pessoal da titular',
  'Venda de patrimônio',
  'Reembolso',
  'Empréstimo recebido',
  'Outras entradas não operacionais',
];

const LEGACY_NON_OPERATIONAL_ALIASES = new Set([
  'aporte do titular',
  'aporte pessoal',
  'aporte pessoal da titular',
  'venda de patrimonio',
  'venda de equipamento',
  'reembolso',
  'emprestimo recebido',
  'entrada nao operacional',
  'outras entradas nao operacionais',
]);

export const isNonOperationalIncome = (transaction = {}) => {
  const nature = normalize(
    transaction.naturezaFinanceira
    || transaction.natureza_financeira
    || transaction.incomeNature
    || transaction.tipoReceita
    || '',
  );

  if (nature === 'nao operacional' || nature === 'nao_operacional') return true;
  if (nature === 'operacional') return false;

  return LEGACY_NON_OPERATIONAL_ALIASES.has(normalize(transaction.categoria));
};

export const isOperationalIncome = (transaction = {}) => !isNonOperationalIncome(transaction);

export const getIncomeNature = (transaction = {}) => (
  isNonOperationalIncome(transaction) ? 'nao_operacional' : 'operacional'
);

export const getIncomeNatureLabel = (transaction = {}) => (
  isNonOperationalIncome(transaction) ? 'Entrada não operacional' : 'Receita operacional'
);
