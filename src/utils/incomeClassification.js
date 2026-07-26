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

export const PERSONAL_EXTERNAL_INCOME_CATEGORIES = [
  'Trabalho ou serviço fora da fotografia',
  'Salário, benefício ou pró-labore externo',
  'Aluguel recebido',
  'Rendimento financeiro',
  'Venda de bem pessoal',
  'Outros rendimentos pessoais',
];

export const NON_OPERATIONAL_INCOME_CATEGORIES = [
  'Aporte pessoal da titular',
  'Venda de patrimônio da empresa',
  'Reembolso',
  'Empréstimo recebido',
  'Outras entradas não operacionais',
];

const PERSONAL_EXTERNAL_ALIASES = new Set([
  'receita pessoal externa',
  'trabalho ou servico fora da fotografia',
  'salario, beneficio ou pro-labore externo',
  'aluguel recebido',
  'rendimento financeiro',
  'venda de bem pessoal',
  'outros rendimentos pessoais',
]);

const LEGACY_NON_OPERATIONAL_ALIASES = new Set([
  'aporte do titular',
  'aporte pessoal',
  'aporte pessoal da titular',
  'venda de patrimonio',
  'venda de equipamento',
  'venda de patrimonio da empresa',
  'reembolso',
  'emprestimo recebido',
  'entrada nao operacional',
  'outras entradas nao operacionais',
]);

const detailsOf = (transaction = {}) => (
  transaction.detalhes && typeof transaction.detalhes === 'object'
    ? transaction.detalhes
    : transaction.details && typeof transaction.details === 'object'
      ? transaction.details
      : {}
);

export const isPersonalExternalIncome = (transaction = {}) => {
  const details = detailsOf(transaction);
  const description = normalize(transaction.descricao || transaction.nome || details.descricao || '');
  // Benefícios pessoais conhecidos não podem ser tratados como aporte ou faturamento da empresa.
  if (description.includes('salario maternidade') || description.includes('salario-maternidade')) return true;
  const nature = normalize(
    transaction.naturezaFinanceira
    || transaction.natureza_financeira
    || transaction.incomeNature
    || transaction.tipoReceita
    || details.naturezaFinanceira
    || details.incomeNature
    || '',
  );

  if (['pessoal externa', 'pessoal_externa', 'receita pessoal externa'].includes(nature)) return true;
  return PERSONAL_EXTERNAL_ALIASES.has(normalize(transaction.categoria || details.categoria));
};

export const isNonOperationalIncome = (transaction = {}) => {
  if (isPersonalExternalIncome(transaction)) return true;
  const details = detailsOf(transaction);
  const nature = normalize(
    transaction.naturezaFinanceira
    || transaction.natureza_financeira
    || transaction.incomeNature
    || transaction.tipoReceita
    || details.naturezaFinanceira
    || details.incomeNature
    || '',
  );

  if (nature === 'nao operacional' || nature === 'nao_operacional') return true;
  if (nature === 'operacional') return false;

  return LEGACY_NON_OPERATIONAL_ALIASES.has(normalize(transaction.categoria || details.categoria));
};

export const isOperationalIncome = (transaction = {}) => !isNonOperationalIncome(transaction);

export const getIncomeNature = (transaction = {}) => (
  isPersonalExternalIncome(transaction)
    ? 'pessoal_externa'
    : isNonOperationalIncome(transaction)
      ? 'nao_operacional'
      : 'operacional'
);

export const getIncomeNatureLabel = (transaction = {}) => (
  isPersonalExternalIncome(transaction)
    ? 'Receita pessoal externa'
    : isNonOperationalIncome(transaction)
      ? 'Entrada não operacional'
      : 'Receita operacional'
);

export const IR_CLASSIFICATIONS = [
  { value: 'tributavel', label: 'Rendimento tributável' },
  { value: 'isento', label: 'Rendimento isento ou não tributável' },
  { value: 'exclusivo', label: 'Tributação exclusiva ou definitiva' },
  { value: 'nao_classificado', label: 'Ainda não classificado' },
];
