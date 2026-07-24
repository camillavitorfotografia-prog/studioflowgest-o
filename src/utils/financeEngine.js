import { isNonOperationalIncome } from './incomeClassification';
export const FIXED_EXPENSE_CATEGORIES = [
  'Aluguel',
  'Energia',
  'Água',
  'Alimentação',
  'Combustível',
  'Internet',
  'Celular',
  'Assinaturas',
  'MEI',
  'Contador',
  'Seguros',
  'Outras',
];

export const VARIABLE_EXPENSE_CATEGORIES = [
  'Equipamentos',
  'Manutenção',
  'Freelancer',
  'Transporte',
  'Hospedagem',
  'Alimentação em trabalho',
  'Impressão',
  'Álbum',
  'Publicidade',
  'Anúncios',
  'Cursos',
  'Softwares',
  'Materiais',
  'Taxas',
  'Impostos',
  'Outras',
];

export {
  OPERATIONAL_INCOME_CATEGORIES,
  NON_OPERATIONAL_INCOME_CATEGORIES,
  isOperationalIncome,
  isNonOperationalIncome,
} from './incomeClassification';

export const AVULSA_INCOME_CATEGORIES = [
  'Serviço adicional',
  'Taxa extra',
  'Comissão',
  'Outro serviço',
  'Aporte pessoal da titular',
  'Venda de patrimônio',
  'Reembolso',
  'Empréstimo recebido',
  'Outras entradas não operacionais',
];

export const PAYMENT_METHODS = [
  'Pix',
  'Cartão de crédito',
  'Cartão de débito',
  'Boleto',
  'Dinheiro',
  'Transferência',
  'Outro',
];

export const EQUIPMENT_KEYWORDS = [
  'camera',
  'cameras',
  'lente',
  'lentes',
  'flash',
  'led',
  'tripe',
  'tripé',
  'computador',
  'notebook',
  'drone',
  'monitor',
  'hd',
  'ssd',
  'cartao de memoria',
  'cartão de memória',
  'mochila',
  'estabilizador',
  'microfone',
  'gravador',
  'bateria',
  'carregador',
  'equipamento fotografico',
  'equipamento fotográfico',
];

export const FINANCE_STORAGE_KEYS = {
  transactions: 'cv_studio_financas',
  audit: 'studioflow_finance_audit_log',
  balances: 'cv_finance_saldos',
  config: 'cv_finance_config',
  replacement: 'cv_finance_reposicao',
  equipment: 'cv_studio_equipamentos',
  pricing: 'cv_studio_precificacao',
  pricingConfig: 'cv_studio_precificacao_config',
  calendarSync: 'cv_studio_calendar_sync',
  distributionLedger: 'cv_finance_distribution_ledger',
};

export const DISTRIBUTION_CONFIG_ROW_TYPE = 'configuracao_distribuicao';
export const PAYMENT_DISTRIBUTION_ROW_TYPE = 'distribuicao_pagamento';
export const FINANCIAL_DESTINATIONS = ['reserva', 'empresa', 'salario'];
export const DEFAULT_SALARY_SPLIT = { camilla: 50, junior: 50 };

const CONFIRMED_PAYMENT_STATUSES = new Set(['recebido', 'recebida', 'pago', 'paga', 'confirmado', 'confirmada', 'quitado', 'quitada']);
const normalizeStatus = (value) => String(value || '').trim().toLowerCase();
const roundMoney = (value) => Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;


export const isInternalTransfer = (transaction = {}) => (
  transaction.tipo === 'transferencia_interna'
  || transaction.tipoGeral === 'Transferencia'
  || transaction.tipoGeral === 'Transferência'
  || Boolean(transaction.transferId)
);

export const getTransactionCompetence = (transaction = {}) => {
  const explicitCompetence = String(
    transaction.competencia
    || transaction.competence
    || '',
  ).slice(0, 7);

  if (/^\d{4}-\d{2}$/.test(explicitCompetence)) {
    return explicitCompetence;
  }

  const referenceDate = (
    transaction.vencimento
    || transaction.dataVencimento
    || transaction.data_vencimento
    || transaction.data
    || transaction.dataPagamento
    || transaction.dataRecebimento
    || ''
  );

  return /^\d{4}-\d{2}/.test(String(referenceDate))
    ? String(referenceDate).slice(0, 7)
    : '';
};

export const appendFinancialAudit = ({
  action,
  entity = 'finance',
  entityId = '',
  before = null,
  after = null,
  details = {},
}) => {
  if (typeof localStorage === 'undefined') return null;

  let current = [];

  try {
    const saved = JSON.parse(
      localStorage.getItem(FINANCE_STORAGE_KEYS.audit) || '[]',
    );

    current = Array.isArray(saved) ? saved : [];
  } catch {
    current = [];
  }

  const entry = {
    id: `finance-audit-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    action,
    entity,
    entityId: String(entityId || ''),
    before,
    after,
    details,
    createdAt: new Date().toISOString(),
  };

  localStorage.setItem(
    FINANCE_STORAGE_KEYS.audit,
    JSON.stringify([entry, ...current].slice(0, 2000)),
  );

  return entry;
};

export const isConfirmedPayment = (payment = {}) => {
  const value = parseCurrency(payment.valor ?? payment.amount ?? 0);
  const status = normalizeStatus(payment.status);

  // Backups legados (como o FotoGestion) registram apenas valor, data e forma
  // de pagamento. A ausência de status nesses arquivos significa pagamento
  // efetivamente recebido, não parcela pendente.
  return value > 0 && (!status || CONFIRMED_PAYMENT_STATUSES.has(status));
};

export const isDistributionConfigValid = (config = {}) => {
  const values = FINANCIAL_DESTINATIONS.map((key) => Number(config[key]));
  return values.every((value) => Number.isFinite(value) && value >= 0 && value <= 100)
    && Math.abs(values.reduce((sum, value) => sum + value, 0) - 100) < 0.001;
};

export const isSalarySplitValid = (config = {}) => {
  const camilla = Number(config.camilla);
  const junior = Number(config.junior);
  return Number.isFinite(camilla) && Number.isFinite(junior)
    && camilla >= 0 && junior >= 0
    && camilla <= 100 && junior <= 100
    && Math.abs(camilla + junior - 100) < 0.001;
};

export const normalizeSalarySplit = (config = {}) => {
  if (isSalarySplitValid(config)) return { camilla: Number(config.camilla), junior: Number(config.junior) };
  const camilla = Math.max(0, Number(config.camilla ?? DEFAULT_SALARY_SPLIT.camilla));
  const junior = Math.max(0, Number(config.junior ?? DEFAULT_SALARY_SPLIT.junior));
  const total = camilla + junior;
  if (total <= 0) return { ...DEFAULT_SALARY_SPLIT };
  return { camilla: (camilla / total) * 100, junior: (junior / total) * 100 };
};

export const parseCurrency = (value) => {
  if (value === null || value === undefined || value === '') {
    return 0;
  }

  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : 0;
  }

  const rawValue = String(value).trim();

  if (!rawValue) {
    return 0;
  }

  const hasBrazilianDecimal = rawValue.includes(',');
  const hasCurrencyFormatting = /R\$|\s/.test(rawValue);

  if (hasBrazilianDecimal || hasCurrencyFormatting) {
    const normalized = rawValue
      .replace(/R\$/gi, '')
      .replace(/\s/g, '')
      .replace(/\./g, '')
      .replace(',', '.')
      .replace(/[^\d.-]/g, '');

    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  const normalized = rawValue.replace(/[^\d.-]/g, '');
  const parsed = Number(normalized);

  return Number.isFinite(parsed) ? parsed : 0;
};

export const formatCurrency = (value) =>
  Number(value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

export const toDate = (value) => {
  if (!value) return null;
  if (value instanceof Date) return value;
  const [datePart] = value.toString().split('T');
  const [year, month, day] = datePart.split('-').map(Number);
  if (!year || !month || !day) return null;
  return new Date(year, month - 1, day);
};

export const monthKey = (value = new Date()) => {
  const date = value instanceof Date ? value : toDate(value);
  if (!date) return '';
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
};

export const addByFrequency = (date, frequency, customDays = 30) => {
  const next = new Date(date);
  if (frequency === 'semanal') next.setDate(next.getDate() + 7);
  else if (frequency === 'anual') next.setFullYear(next.getFullYear() + 1);
  else if (frequency === 'personalizada') next.setDate(next.getDate() + Number(customDays || 30));
  else next.setMonth(next.getMonth() + 1);
  return next;
};

export const dateToInput = (date) => {
  if (!date) return '';
  const parsed = date instanceof Date ? date : toDate(date);
  if (!parsed) return '';
  return parsed.toISOString().slice(0, 10);
};

export const getTransactionValue = (transaction) => parseCurrency(transaction?.valor);

export const getTransactionDate = (transaction = {}) => (
  transaction.data
  || transaction.dataVencimento
  || transaction.vencimento
  || transaction.data_vencimento
  || ''
);

export const getTransactionStatus = (transaction) => {
  if (transaction?.status) return transaction.status;
  if (transaction?.tipo === 'fixa') {
    const dueDate = toDate(getTransactionDate(transaction));
    if (dueDate && dueDate < new Date()) return 'Atrasado';
    return 'Pendente';
  }
  return 'Pago';
};

export const isExpense = (transaction) =>
  transaction?.tipoGeral === 'Saida' || transaction?.tipo === 'fixa' || transaction?.tipo === 'variavel';

export const isIncome = (transaction) =>
  transaction?.tipoGeral === 'Entrada' || transaction?.tipo === 'Entrada' || transaction?.tipoGeral === 'Receita';

export const getMonthlyTotals = (transactions = [], targetDate = new Date()) => {
  const targetKey = monthKey(targetDate);
  return transactions.reduce(
    (acc, transaction) => {
      if (monthKey(getTransactionDate(transaction)) !== targetKey) return acc;
      const value = getTransactionValue(transaction);
      if (isIncome(transaction)) acc.income += value;
      if (isExpense(transaction) && transaction.tipo === 'fixa') acc.fixed += value;
      if (isExpense(transaction) && transaction.tipo === 'variavel') acc.variable += value;
      return acc;
    },
    { income: 0, fixed: 0, variable: 0 },
  );
};

export const getAverageVariableExpenses = (transactions = [], months = 6) => {
  const variable = transactions.filter((item) => isExpense(item) && item.tipo === 'variavel');
  if (!variable.length) return 0;
  const totals = {};
  variable.forEach((item) => {
    const key = monthKey(getTransactionDate(item));
    if (!key) return;
    totals[key] = (totals[key] || 0) + getTransactionValue(item);
  });
  const values = Object.values(totals).slice(-months);
  if (!values.length) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
};

export const groupBySum = (items = [], getKey, getValue = getTransactionValue) =>
  items.reduce((acc, item) => {
    const key = getKey(item) || 'Nao informado';
    acc[key] = (acc[key] || 0) + getValue(item);
    return acc;
  }, {});

export const hasEquipmentKeyword = (expense) => {
  const text = `${expense?.descricao || ''} ${expense?.nome || ''} ${expense?.categoria || ''}`.toLowerCase();
  return EQUIPMENT_KEYWORDS.some((keyword) => text.includes(keyword.toLowerCase()));
};

export const calculateDepreciation = (equipment = {}, referenceDate = new Date()) => {
  const purchaseValue = Number(equipment.valorCompra ?? equipment.valor ?? 0);
  const configuredUsefulLifeMonths = Number(
    equipment.vidaUtilMeses
    ?? equipment.vida_util_meses
    ?? 0,
  );
  const usefulLifeYears = Number(
    equipment.vidaUtilAnos
    ?? equipment.vida_util_anos
    ?? 5,
  );
  const residualValue = Number(equipment.valorResidual || 0);
  const depreciableValue = Math.max(0, purchaseValue - residualValue);
  const usefulLifeMonths = Math.max(
    1,
    configuredUsefulLifeMonths > 0
      ? configuredUsefulLifeMonths
      : usefulLifeYears * 12,
  );
  const purchaseDate = toDate(equipment.dataCompra) || referenceDate;
  const monthsElapsed = Math.max(
    0,
    (referenceDate.getFullYear() - purchaseDate.getFullYear()) * 12 +
      (referenceDate.getMonth() - purchaseDate.getMonth()),
  );
  const monthlyDepreciation = depreciableValue / usefulLifeMonths;
  const annualDepreciation = monthlyDepreciation * 12;
  const depreciatedValue = Math.min(depreciableValue, monthlyDepreciation * monthsElapsed);
  const currentBookValue = Math.max(residualValue, purchaseValue - depreciatedValue);

  return {
    purchaseValue,
    usefulLifeYears,
    residualValue,
    monthlyDepreciation,
    annualDepreciation,
    depreciatedValue,
    currentBookValue,
    monthsElapsed,
    usefulLifeMonths,
  };
};

export const buildDepreciationChart = (equipment = {}) => {
  const depreciation = calculateDepreciation(equipment);
  const points = [];
  const purchaseDate = toDate(equipment.dataCompra) || new Date();

  for (let month = 0; month <= depreciation.usefulLifeMonths; month += 6) {
    const pointDate = new Date(purchaseDate);
    pointDate.setMonth(pointDate.getMonth() + month);
    const value = Math.max(
      depreciation.residualValue,
      depreciation.purchaseValue - depreciation.monthlyDepreciation * month,
    );
    points.push({
      name: `${pointDate.getMonth() + 1}/${pointDate.getFullYear()}`,
      valor: Number(value.toFixed(2)),
    });
  }

  return points;
};

export const getEquipmentMonthlyDepreciation = (equipment = []) =>
  equipment.reduce((sum, item) => sum + calculateDepreciation(item).monthlyDepreciation, 0);

export const createEquipmentFromExpense = (expense) => ({
  id: Date.now() + 1,
  nome: expense.descricao || expense.nome || 'Equipamento',
  valor: getTransactionValue(expense),
  valorCompra: getTransactionValue(expense),
  dataCompra: expense.data || expense.dataVencimento || dateToInput(new Date()),
  garantiaAte: expense.garantiaAte || '',
  vidaUtilAnos: Number(expense.vidaUtilAnos || 5),
  valorResidual: Number(expense.valorResidual || 0),
  metodoDepreciacao: 'linear',
  origemFinanceiraId: expense.id,
  manutencoes: [],
});

export const gerarLancamentosRecorrentes = (baseExpense) => {
  const dueDate = toDate(baseExpense.dataVencimento || baseExpense.data);
  if (!dueDate || baseExpense.frequencia === 'unica') return [baseExpense];

  const countByFrequency = {
    semanal: 8,
    mensal: 12,
    anual: 3,
    personalizada: 6,
  };

  const count = countByFrequency[baseExpense.frequencia] || 12;
  const recurrenceId = baseExpense.recurrenceId || `rec-${Date.now()}`;
  const result = [];
  let currentDate = dueDate;

  for (let index = 0; index < count; index += 1) {
    result.push({
      ...baseExpense,
      id: index === 0 ? baseExpense.id : Date.now() + index,
      data: dateToInput(currentDate),
      dataVencimento: dateToInput(currentDate),
      recurrenceId,
      recurrenceIndex: index,
      recorrente: true,
      status: index === 0 ? baseExpense.status : 'Pendente',
    });
    currentDate = addByFrequency(currentDate, baseExpense.frequencia, baseExpense.intervaloPersonalizado);
  }

  return result;
};

export const normalizeDistributionConfig = (config = {}) => {
  const base = {
    salario: Number(config.salario ?? 35),
    empresa: Number(config.empresa ?? 45),
    reserva: Number(config.reserva ?? 20),
  };
  const total = base.salario + base.empresa + base.reserva;
  if (total === 100) return base;
  if (total <= 0) return { salario: 35, empresa: 45, reserva: 20 };
  return {
    salario: (base.salario / total) * 100,
    empresa: (base.empresa / total) * 100,
    reserva: (base.reserva / total) * 100,
  };
};

export const loadDistributionConfig = async () => {
  const localConfig = normalizeDistributionConfig(JSON.parse(
    localStorage.getItem(FINANCE_STORAGE_KEYS.config) || '{"salario":35,"empresa":45,"reserva":20}',
  ));
  if (!isSupabaseConfigured) return localConfig;
  const { data: authData } = await supabase.auth.getUser();
  if (!authData?.user?.id) return localConfig;

  const { data, error } = await supabase
    .from('financas')
    .select('detalhes')
    .eq('tipo', DISTRIBUTION_CONFIG_ROW_TYPE)
    .limit(1)
    .maybeSingle();
  if (error) {
    console.error('Erro ao carregar configuracao financeira:', error.message);
    return localConfig;
  }

  const databaseConfig = data?.detalhes?.percentuais || data?.detalhes;
  const config = isDistributionConfigValid(databaseConfig) ? databaseConfig : localConfig;
  localStorage.setItem(FINANCE_STORAGE_KEYS.config, JSON.stringify(config));
  return config;
};

export const saveDistributionConfig = async (config) => {
  if (!isDistributionConfigValid(config)) {
    throw new Error('A soma dos percentuais deve ser exatamente 100%.');
  }
  const normalized = Object.fromEntries(FINANCIAL_DESTINATIONS.map((key) => [key, Number(config[key])]));
  localStorage.setItem(FINANCE_STORAGE_KEYS.config, JSON.stringify(normalized));
  if (!isSupabaseConfigured) return normalized;

  const { data: authData } = await supabase.auth.getUser();
  if (!authData?.user?.id) return normalized;
  const now = new Date().toISOString();
  const { error } = await supabase.from('financas').upsert([{
    id: `finance-config-${authData.user.id}`,
    user_id: authData.user.id,
    descricao: 'Configuracao da distribuicao financeira',
    tipo: DISTRIBUTION_CONFIG_ROW_TYPE,
    tipo_geral: 'Configuracao',
    status: 'Ativo',
    valor: 0,
    data: now.slice(0, 10),
    detalhes: { percentuais: normalized },
    updated_at: now,
  }], { onConflict: 'id' });
  if (error) throw error;
  return normalized;
};

export const attachPaymentDistribution = (payment, config, context = {}) => {
  const existing = payment.distribuicao && typeof payment.distribuicao === 'object'
    ? payment.distribuicao
    : null;
  if (!isConfirmedPayment(payment)) {
    if (existing && existing.aplicada === false) return existing;
    return existing ? {
      ...existing,
      aplicada: false,
      revertidaEm: new Date().toISOString(),
    } : null;
  }

  const storedPercentages = existing?.percentuais;
  const percentages = isDistributionConfigValid(storedPercentages)
    ? storedPercentages
    : normalizeDistributionConfig(config);
  const baseValue = roundMoney(parseCurrency(payment.valor));
  const reserva = roundMoney(baseValue * (Number(percentages.reserva) / 100));
  const salario = roundMoney(baseValue * (Number(percentages.salario) / 100));
  const empresa = roundMoney(baseValue - reserva - salario);
  const storedSalarySplit = existing?.salarios?.percentuais;
  const salarySplit = isSalarySplitValid(storedSalarySplit)
    ? storedSalarySplit
    : normalizeSalarySplit(context.salarySplit);
  const camillaSalary = roundMoney(salario * (Number(salarySplit.camilla) / 100));
  const juniorSalary = roundMoney(salario - camillaSalary);

  const nextCore = {
    aplicada: true,
    projectId: context.projectId || existing?.projectId || '',
    clientId: context.clientId || existing?.clientId || '',
    clienteNome: context.clientName || existing?.clienteNome || '',
    valorBase: baseValue,
    percentuais: {
      reserva: Number(percentages.reserva),
      empresa: Number(percentages.empresa),
      salario: Number(percentages.salario),
    },
    valores: { reserva, empresa, salario },
    salarios: {
      percentuais: { camilla: Number(salarySplit.camilla), junior: Number(salarySplit.junior) },
      valores: { camilla: camillaSalary, junior: juniorSalary },
    },
    dataPagamento: payment.data || null,
  };
  if (existing && JSON.stringify({
    aplicada: existing.aplicada,
    projectId: existing.projectId || '',
    clientId: existing.clientId || '',
    clienteNome: existing.clienteNome || '',
    valorBase: Number(existing.valorBase || 0),
    percentuais: existing.percentuais,
    valores: existing.valores,
    salarios: existing.salarios,
    dataPagamento: existing.dataPagamento || null,
  }) === JSON.stringify(nextCore)) return existing;

  return {
    id: existing?.id || `distribution-${payment.id}`,
    ...nextCore,
    paymentId: payment.id,
    aplicadaEm: existing?.aplicadaEm || new Date().toISOString(),
    atualizadaEm: new Date().toISOString(),
  };
};

export const uniquePaymentsById = (payments = []) => {
  const unique = new Map();
  payments.forEach((payment, index) => {
    const id = payment?.id || `legacy-payment-${index}`;
    unique.set(id, { ...payment, id });
  });
  return [...unique.values()];
};

export const preparePaymentsWithDistribution = (payments = [], config, context = {}) =>
  uniquePaymentsById(payments).map((payment) => ({
    ...payment,
    distribuicao: attachPaymentDistribution(payment, config, context),
  }));

export const calculateProjectFinancialState = ({ project = {}, payments, config, context = {} } = {}) => {
  const preparedPayments = preparePaymentsWithDistribution(
    payments || project.financeiro?.receitas || project.pagamentos || [],
    config,
    {
      projectId: project.id || context.projectId || '',
      clientId: project.clientId || project.clienteId || project.cliente_id || context.clientId || '',
      clientName: project.clienteNome || project.cliente?.nome || context.clientName || '',
      salarySplit: project.financeiro?.divisaoSalarios || context.salarySplit || DEFAULT_SALARY_SPLIT,
    },
  );
  const valorContratado = Number(project.valor_contratado ?? project.valorContratado ?? 0);
  const valorRecebido = roundMoney(preparedPayments.reduce(
    (sum, payment) => sum + (isConfirmedPayment(payment) ? parseCurrency(payment.valor) : 0),
    0,
  ));
  const saldoRestante = roundMoney(Math.max(0, valorContratado - valorRecebido));
  const statusFinanceiro = saldoRestante <= 0 && valorContratado > 0 ? 'Quitado' : 'Pendente';
  const financeiro = {
    ...(project.financeiro && typeof project.financeiro === 'object' ? project.financeiro : {}),
    receitas: preparedPayments,
    valorContratado,
    valorRecebido,
    saldoRestante,
    statusFinanceiro,
  };

  return {
    pagamentos: preparedPayments,
    valorContratado,
    valorRecebido,
    saldoRestante,
    statusFinanceiro,
    financeiro,
  };
};

export const calculateClientSalarySummary = (payments = [], withdrawals = []) => {
  const accumulated = { camilla: 0, junior: 0 };
  payments.forEach((payment) => {
    if (!isConfirmedPayment(payment) || !payment.distribuicao?.aplicada) return;
    accumulated.camilla += Number(payment.distribuicao.salarios?.valores?.camilla || 0);
    accumulated.junior += Number(payment.distribuicao.salarios?.valores?.junior || 0);
  });

  const withdrawn = { camilla: 0, junior: 0 };
  withdrawals.forEach((withdrawal) => {
    const status = normalizeStatus(withdrawal.status || 'confirmada');
    if (['cancelado', 'cancelada', 'estornado', 'estornada'].includes(status)) return;
    const person = normalizeStatus(withdrawal.pessoa);
    if (!(person in withdrawn)) return;
    withdrawn[person] += parseCurrency(withdrawal.valor);
  });

  return {
    camilla: {
      acumulado: roundMoney(accumulated.camilla),
      retirado: roundMoney(withdrawn.camilla),
      disponivel: roundMoney(accumulated.camilla - withdrawn.camilla),
    },
    junior: {
      acumulado: roundMoney(accumulated.junior),
      retirado: roundMoney(withdrawn.junior),
      disponivel: roundMoney(accumulated.junior - withdrawn.junior),
    },
  };
};

const distributionRowsFromPayments = ({ payments = [], projectId, clientId, clientName }) =>
  payments.flatMap((payment) => {
    const distribution = payment.distribuicao;
    if (!isConfirmedPayment(payment) || !distribution?.aplicada) return [];
    return FINANCIAL_DESTINATIONS.map((destination) => ({
      id: `payment-distribution-${payment.id}-${destination}`,
      project_id: projectId,
      client_id: clientId || null,
      descricao: `Distribuicao de pagamento - ${clientName || 'Cliente'}`,
      nome: clientName || 'Cliente',
      categoria: destination,
      valor: roundMoney(distribution.valores?.[destination]),
      data: payment.data || new Date().toISOString().slice(0, 10),
      data_vencimento: payment.data || null,
      tipo: PAYMENT_DISTRIBUTION_ROW_TYPE,
      tipo_geral: 'Entrada',
      status: 'Confirmado',
      conta_origem: destination,
      detalhes: {
        natureza: 'entrada',
        destino: destination,
        paymentId: payment.id,
        projectId,
        clientId,
        clienteNome: clientName || '',
        percentual: Number(distribution.percentuais?.[destination] || 0),
        valorRecebido: Number(distribution.valorBase || 0),
        divisaoSalarios: destination === 'salario' ? distribution.salarios : undefined,
      },
      updated_at: new Date().toISOString(),
    }));
  });

export const buildPaymentDistributionLedger = (projects = []) =>
  projects.flatMap((project) => distributionRowsFromPayments({
    payments: project.financeiro?.receitas || project.pagamentos || [],
    projectId: project.id,
    clientId: project.clientId || project.clienteId || project.cliente_id || '',
    clientName: project.clienteNome || project.cliente?.nome || '',
  }));

export const syncProjectDistributionLedger = async ({ payments = [], projectId, clientId, clientName }) => {
  if (!isSupabaseConfigured || !projectId) return;
  const { data: authData } = await supabase.auth.getUser();
  if (!authData?.user?.id) return;
  const rows = distributionRowsFromPayments({ payments, projectId, clientId, clientName });
  const { data: existingRows, error: lookupError } = await supabase
    .from('financas')
    .select('id, valor, categoria, data, detalhes')
    .eq('tipo', PAYMENT_DISTRIBUTION_ROW_TYPE)
    .eq('project_id', projectId);
  if (lookupError) throw lookupError;

  const activeIds = new Set(rows.map((row) => row.id));
  const staleIds = (existingRows || []).map((row) => row.id).filter((id) => !activeIds.has(id));
  if (staleIds.length) {
    const { error } = await supabase.from('financas').delete().in('id', staleIds);
    if (error) throw error;
  }

  const existingById = new Map((existingRows || []).map((row) => [row.id, row]));
  const changedRows = rows.filter((row) => {
    const current = existingById.get(row.id);
    if (!current) return true;
    return Number(current.valor) !== Number(row.valor)
      || current.categoria !== row.categoria
      || current.data !== row.data
      || JSON.stringify(current.detalhes || {}) !== JSON.stringify(row.detalhes || {});
  });
  if (changedRows.length) {
    const { error } = await supabase.from('financas').upsert(changedRows, { onConflict: 'id' });
    if (error) throw error;
  }
};

export const reconcileProjectPaymentDistributions = async (projects = [], config) => {
  if (!isSupabaseConfigured) return projects;

  const reconciled = [];
  for (const project of projects) {
    const currentPayments = project.financeiro?.receitas || project.pagamentos || [];
    const financialState = calculateProjectFinancialState({
      project,
      payments: currentPayments,
      config,
    });
    const payments = financialState.pagamentos;
    const changed = JSON.stringify(currentPayments) !== JSON.stringify(payments)
      || Number(project.valor_recebido ?? project.valorRecebido ?? 0) !== financialState.valorRecebido
      || Number(project.financeiro?.saldoRestante ?? 0) !== financialState.saldoRestante
      || project.financeiro?.statusFinanceiro !== financialState.statusFinanceiro;
    const nextProject = changed ? {
      ...project,
      pagamentos: payments,
      receitas: payments,
      valorRecebido: financialState.valorRecebido,
      saldoRestante: financialState.saldoRestante,
      financeiro: financialState.financeiro,
    } : project;

    if (changed) {
      const { error } = await supabase
        .from('projetos')
        .update({
          valor_recebido: financialState.valorRecebido,
          financeiro: financialState.financeiro,
        })
        .eq('id', project.id);
      if (error) throw error;
    }
    await syncProjectDistributionLedger({
      payments,
      projectId: project.id,
      clientId: project.clientId || project.clienteId || project.cliente_id || '',
      clientName: project.clienteNome || project.cliente?.nome || '',
    });
    reconciled.push(nextProject);
  }
  return reconciled;
};

export const getFinancialAccountsSummary = (transactions = []) => {
  const accounts = Object.fromEntries(FINANCIAL_DESTINATIONS.map((destination) => [destination, {
    entradas: 0,
    saidas: 0,
    saldo: 0,
    movimentos: [],
  }]));

  transactions.forEach((transaction) => {
    if (transaction.tipo === PAYMENT_DISTRIBUTION_ROW_TYPE) {
      const destination = transaction.detalhes?.destino || transaction.categoria;
      if (!accounts[destination]) return;
      const value = getTransactionValue(transaction);
      accounts[destination].entradas += value;
      accounts[destination].movimentos.push({ ...transaction, natureza: 'entrada' });
      return;
    }

    if (!isExpense(transaction) || getTransactionStatus(transaction) !== 'Pago') return;
    const destination = transaction.contaOrigem || transaction.conta_origem || 'empresa';
    if (!accounts[destination]) return;
    const value = getTransactionValue(transaction);
    accounts[destination].saidas += value;
    accounts[destination].movimentos.push({ ...transaction, natureza: 'saida' });
  });

  FINANCIAL_DESTINATIONS.forEach((destination) => {
    accounts[destination].entradas = roundMoney(accounts[destination].entradas);
    accounts[destination].saidas = roundMoney(accounts[destination].saidas);
    accounts[destination].saldo = roundMoney(accounts[destination].entradas - accounts[destination].saidas);
  });
  return accounts;
};

export const buildFinanceSnapshot = ({
  clients = [],
  transactions = [],
  equipment = [],
  balances = { salario: 0, empresa: 0, reserva: 0 },
  config = { salario: 35, empresa: 45, reserva: 20 },
  referenceDate = new Date(),
} = {}) => {
  const currentMonth = monthKey(referenceDate);
  const monthlyTotals = getMonthlyTotals(transactions, referenceDate);
  const fixedMonthly = monthlyTotals.fixed;
  const variableMonthly = monthlyTotals.variable;
  const variableAverage = getAverageVariableExpenses(transactions);
  const equipmentDepreciation = getEquipmentMonthlyDepreciation(equipment);

  const revenue = clients.reduce((total, client) => {
    const payments = client.pagamentos || [];
    const paidThisMonth = payments.reduce((sum, payment) => {
      if (!isConfirmedPayment(payment) || monthKey(payment.data) !== currentMonth) return sum;
      return sum + parseCurrency(payment.valor);
    }, 0);
    return total + paidThisMonth;
  }, monthlyTotals.income);

  const pendingRevenue = clients.reduce((total, client) => {
    const totalValue = parseCurrency(client.valorTotal);
    const paid = (client.pagamentos || []).reduce(
      (sum, payment) => sum + (isConfirmedPayment(payment) ? parseCurrency(payment.valor) : 0),
      0,
    );
    return total + Math.max(0, totalValue - paid);
  }, 0);

  const cashFlow = revenue - fixedMonthly - variableMonthly;
  const monthlyProfit = revenue - fixedMonthly - variableMonthly - equipmentDepreciation;
  const distribution = normalizeDistributionConfig(config);
  const projectedDistribution = {
    salario: revenue * (distribution.salario / 100),
    empresa: revenue * (distribution.empresa / 100),
    reserva: revenue * (distribution.reserva / 100),
  };

  return {
    revenue,
    pendingRevenue,
    fixedMonthly,
    variableMonthly,
    variableAverage,
    equipmentDepreciation,
    operationalCost: fixedMonthly + variableAverage + equipmentDepreciation,
    cashFlow,
    monthlyProfit,
    profitMargin: revenue > 0 ? (monthlyProfit / revenue) * 100 : 0,
    forecast: cashFlow + pendingRevenue,
    balances,
    distribution,
    projectedDistribution,
  };
};

import { derivedInstallmentStatus, effectiveContractValue } from './contractEngine.js';

export const adaptInstallmentToIncome = (installment, contract = {}, clientName = '') => {
  const status = derivedInstallmentStatus(installment);
  let adaptedStatus = 'pendente';
  if (status === 'cancelada') adaptedStatus = 'cancelada';
  else if (status === 'recebida') adaptedStatus = 'recebida';
  else if (status === 'vencida') adaptedStatus = 'vencida';
  else if (installment.vencimento && installment.vencimento < new Date().toISOString().slice(0, 10)) adaptedStatus = 'vencida';
  else adaptedStatus = 'prevista';

  return {
    id: installment.id,
    descricao: `${contract.titulo || 'Contrato'} - ${installment.descricao || 'Parcela'}`,
    categoria: 'contrato',
    valor: installment.valor || 0,
    vencimento: installment.vencimento || '',
    dataRecebimento: installment.dataPagamento || '',
    status: adaptedStatus,
    clienteId: installment.clienteId || contract.clienteId || '',
    clienteNome: clientName,
    trabalhoId: installment.trabalhoId || contract.trabalhoId || '',
    formaPagamento: installment.formaPagamento || contract.formaPagamentoPadrao || 'Pix',
    observacoes: installment.observacoes || '',
    tipo: 'receita_contrato',
    tipoGeral: 'Entrada',
    contratoId: contract.id,
    criadoEm: installment.criadoEm || contract.dataCriacao || '',
    atualizadoEm: installment.atualizadoEm || contract.dataCriacao || '',
  };
};

export const deriveFinancialStatus = (item, today = new Date().toISOString().slice(0, 10)) => {
  if (item.status === 'cancelada' || item.status === 'cancelado') return 'cancelada';
  
  const isIncome = item.tipoGeral === 'Entrada' || item.tipo === 'receita_avulsa' || item.tipo === 'receita_contrato' || item.tipo === 'avulsa';
  
  if (isIncome) {
    if (item.dataRecebimento || item.status === 'recebida' || item.status === 'recebido') return 'recebida';
    if (item.vencimento && item.vencimento < today) return 'vencida';
    return item.status === 'prevista' ? 'prevista' : 'pendente';
  } else {
    if (item.dataPagamento || item.status === 'paga' || item.status === 'pago') return 'paga';
    if (item.vencimento && item.vencimento < today) return 'vencida';
    return item.status === 'prevista' ? 'prevista' : 'pendente';
  }
};

const monthDiff = (date1, date2) => {
  const d1 = new Date(date1 + '-01T12:00:00');
  const d2 = new Date(date2 + '-01T12:00:00');
  return (d2.getFullYear() - d1.getFullYear()) * 12 + d2.getMonth() - d1.getMonth();
};

export const shouldRecurOnCompetence = (recurrence, competence) => {
  if (!recurrence.ativo) return false;
  const startMonth = (recurrence.criadoEm || new Date().toISOString()).slice(0, 7);
  if (competence < startMonth) return false;

  const diff = monthDiff(startMonth, competence);
  if (diff < 0) return false;

  const freq = recurrence.frequencia;
  if (freq === 'mensal') return true;
  if (freq === 'bimestral') return diff % 2 === 0;
  if (freq === 'trimestral') return diff % 3 === 0;
  if (freq === 'semestral') return diff % 6 === 0;
  if (freq === 'anual') return diff % 12 === 0;
  return false;
};

const getVencimentoForCompetence = (competence, targetDay) => {
  const [year, month] = competence.split('-').map(Number);
  const date = new Date(year, month, 0);
  const maxDay = date.getDate();
  const day = Math.min(targetDay, maxDay);
  return `${competence}-${String(day).padStart(2, '0')}`;
};

export const generateRecurrentExpenses = (recurrences = [], transactions = [], referenceDate = new Date()) => {
  const currentMonth = monthKey(referenceDate);
  const competences = [];
  const baseDate = new Date(referenceDate.getFullYear(), referenceDate.getMonth(), 1);
  for (let i = 0; i <= 3; i++) {
    const d = new Date(baseDate.getFullYear(), baseDate.getMonth() + i, 1);
    competences.push(monthKey(d));
  }

  const generated = [];
  const existingSet = new Set(
    transactions
      .map((transaction) => {
        const recurrenceId = transaction.recorrenciaId || transaction.recurrenceId || transaction.recurrence_id || '';
        const competence = transaction.competencia
          || String(transaction.vencimento || transaction.dataVencimento || transaction.data_vencimento || transaction.data || '').slice(0, 7);
        return recurrenceId && competence ? `${recurrenceId}-${competence}` : '';
      })
      .filter(Boolean)
  );

  recurrences.forEach((recurrence) => {
    if (!recurrence.ativo) return;
    const excludedCompetences = new Set(
      Array.isArray(recurrence.competenciasExcluidas)
        ? recurrence.competenciasExcluidas
        : (Array.isArray(recurrence.excludedCompetences) ? recurrence.excludedCompetences : [])
    );
    competences.forEach((competence) => {
      if (excludedCompetences.has(competence)) return;
      if (shouldRecurOnCompetence(recurrence, competence)) {
        const key = `${recurrence.id}-${competence}`;
        if (!existingSet.has(key)) {
          const id = `despesa-rec-${recurrence.id}-${competence}`;
          const vencimento = getVencimentoForCompetence(competence, recurrence.diaVencimento || 1);
          generated.push({
            id,
            recorrenciaId: recurrence.id,
            competencia: competence,
            descricao: recurrence.descricao,
            categoria: recurrence.categoria || 'Aluguel',
            valor: recurrence.valor || 0,
            vencimento,
            status: 'Pendente',
            tipo: 'fixa',
            tipoGeral: 'Saida',
            contaOrigem: recurrence.contaOrigem || 'empresa',
            formaPagamento: recurrence.formaPagamento || 'Pix',
            fornecedor: recurrence.fornecedor || '',
            observacoes: recurrence.observacoes || '',
            criadoEm: new Date().toISOString(),
            atualizadoEm: new Date().toISOString(),
          });
        }
      }
    });
  });

  return generated;
};


const normalizeFinancialText = (value) => String(value || '')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, ' ')
  .trim();

const deduplicateEquipmentExpenses = (expenses = []) => {
  const selected = new Map();
  const passthrough = [];

  expenses.forEach((expense) => {
    if (normalizeFinancialText(expense?.categoria) !== 'equipamentos') {
      passthrough.push(expense);
      return;
    }

    const details = expense?.detalhes || {};
    const linkedAsset = expense.patrimonioId || expense.patrimonio_id || details.patrimonioId || details.patrimonio_id || '';
    const description = normalizeFinancialText(expense.descricao || expense.nome);
    const value = Math.round(Number(expense.valor || 0) * 100);
    const account = normalizeFinancialText(expense.contaOrigem || expense.conta_origem || 'empresa');
    const date = String(expense.dataPagamento || expense.data_pagamento || expense.dataCompra || expense.data || expense.vencimento || '').slice(0, 10);
    const key = linkedAsset
      ? `asset:${linkedAsset}`
      : `equipment:${description}:${value}:${account}:${date}`;

    const current = selected.get(key);
    if (!current) {
      selected.set(key, expense);
      return;
    }

    const currentRecovered = String(current.id || '').startsWith('recovered-equipment-expense-') || Boolean(current.recuperadoDoPatrimonio || current.detalhes?.recuperadoDoPatrimonio);
    const candidateRecovered = String(expense.id || '').startsWith('recovered-equipment-expense-') || Boolean(expense.recuperadoDoPatrimonio || expense.detalhes?.recuperadoDoPatrimonio);
    const currentCreated = String(current.criadoEm || current.created_at || '');
    const candidateCreated = String(expense.criadoEm || expense.created_at || '');

    if ((currentRecovered && !candidateRecovered) || (currentRecovered === candidateRecovered && candidateCreated && (!currentCreated || candidateCreated < currentCreated))) {
      selected.set(key, expense);
    }
  });

  return [...passthrough, ...selected.values()];
};

export const getConsolidatedFinances = ({ contracts = [], transactions = [], clients = [] }) => {
  const adaptedIncomes = [];
  const clientMap = new Map(clients.map((c) => [c.id, c.nome || c.name || 'Cliente']));

  contracts.forEach((contract) => {
    if (contract.status === 'cancelado') return;
    const clientName = clientMap.get(contract.clienteId) || '';
    (contract.parcelas || []).forEach((installment) => {
      adaptedIncomes.push(adaptInstallmentToIncome(installment, contract, clientName));
    });
  });

  const avulsas = [];
  const despesas = [];

  transactions.forEach((t) => {
    if (t.tipo === PAYMENT_DISTRIBUTION_ROW_TYPE) return;
    
    if (t.tipo === 'receita_avulsa' || t.tipo === 'avulsa') {
      avulsas.push({
        ...t,
        clienteNome: clientMap.get(t.clienteId) || ''
      });
    } else if (['fixa', 'variavel'].includes(t.tipo)) {
      despesas.push(t);
    }
  });

  const receitasOperacionaisAvulsas = avulsas.filter((item) => !isNonOperationalIncome(item));
  const entradasNaoOperacionais = avulsas.filter(isNonOperationalIncome);
  const despesasConsolidadas = deduplicateEquipmentExpenses(despesas);

  return {
    receitasContratuais: adaptedIncomes,
    receitasAvulsas: receitasOperacionaisAvulsas,
    entradasNaoOperacionais,
    despesas: despesasConsolidadas,
    todasReceitas: [...adaptedIncomes, ...receitasOperacionaisAvulsas],
    todasEntradasCaixa: [...adaptedIncomes, ...receitasOperacionaisAvulsas, ...entradasNaoOperacionais],
  };
};

export const calculateFinancialIndicators = ({
  receitasContratuais = [],
  receitasAvulsas = [],
  despesas = [],
  referenceDate = new Date()
}) => {
  const targetMonth = monthKey(referenceDate);
  const today = new Date().toISOString().slice(0, 10);

  const todasReceitas = [...receitasContratuais, ...receitasAvulsas];
  
  let receitasPrevistasMes = 0;
  let receitasRecebidasMes = 0;
  let despesasPrevistasMes = 0;
  let despesasPagasMes = 0;
  
  let totalAReceber = 0;
  let totalAPagar = 0;
  let receitasVencidas = 0;
  let despesasVencidas = 0;

  todasReceitas.forEach((r) => {
    if (r.status === 'cancelada') return;

    const val = r.valor || 0;
    const statusDerivado = deriveFinancialStatus(r, today);

    if (statusDerivado !== 'recebida') {
      totalAReceber += val;
      if (statusDerivado === 'vencida') {
        receitasVencidas += val;
      }
    }

    const mesVencimento = getTransactionCompetence(r);
    const mesRecebimento = r.dataRecebimento
      ? r.dataRecebimento.slice(0, 7)
      : '';

    if (statusDerivado === 'recebida' && mesRecebimento === targetMonth) {
      receitasRecebidasMes += val;
    }
    
    if (mesVencimento === targetMonth) {
      receitasPrevistasMes += val;
    }
  });

  despesas.forEach((d) => {
    if (d.status === 'cancelada') return;

    const val = d.valor || 0;
    const statusDerivado = deriveFinancialStatus(d, today);

    if (statusDerivado !== 'paga') {
      totalAPagar += val;
      if (statusDerivado === 'vencida') {
        despesasVencidas += val;
      }
    }

    const mesVencimento = getTransactionCompetence(d);
    const mesPagamento = d.dataPagamento
      ? d.dataPagamento.slice(0, 7)
      : '';

    if (statusDerivado === 'paga' && mesPagamento === targetMonth) {
      despesasPagasMes += val;
    }

    if (mesVencimento === targetMonth) {
      despesasPrevistasMes += val;
    }
  });

  return {
    receitasPrevistasMes,
    receitasRecebidasMes,
    despesasPrevistasMes,
    despesasPagasMes,
    saldoPrevistoMes: receitasPrevistasMes - despesasPrevistasMes,
    saldoRealizadoMes: receitasRecebidasMes - despesasPagasMes,
    totalAReceber,
    totalAPagar,
    receitasVencidas,
    despesasVencidas,
  };
};

export const calculateProjectFinancials = ({
  project = {},
  contracts = [],
  receitasAvulsas = [],
  despesas = [],
  today = new Date().toISOString().slice(0, 10)
}) => {
  const projectId = project.id;
  
  const projectExpenses = despesas.filter((d) => String(d.trabalhoId || d.projectId) === String(projectId) && d.status !== 'cancelada');
  const custoEstimado = projectExpenses
    .filter((d) => ['pendente', 'prevista', 'vencida'].includes(deriveFinancialStatus(d, today)))
    .reduce((sum, d) => sum + (d.valor || 0), 0);
  const custoReal = projectExpenses
    .filter((d) => deriveFinancialStatus(d, today) === 'paga')
    .reduce((sum, d) => sum + (d.valor || 0), 0);

  const projectContracts = contracts.filter((c) => String(c.trabalhoId || c.projectId) === String(projectId) && c.status !== 'cancelado');
  const receitaContratada = projectContracts.reduce((sum, c) => sum + effectiveContractValue(c), 0);

  const projectAvulsas = receitasAvulsas.filter((r) => String(r.trabalhoId || r.projectId) === String(projectId) && r.status !== 'cancelada');
  const receitaAvulsaRecebida = projectAvulsas
    .filter((r) => deriveFinancialStatus(r, today) === 'recebida')
    .reduce((sum, r) => sum + (r.valor || 0), 0);
  const receitaAvulsaPrevista = projectAvulsas
    .filter((r) => ['pendente', 'prevista', 'vencida'].includes(deriveFinancialStatus(r, today)))
    .reduce((sum, r) => sum + (r.valor || 0), 0);

  const parcelasRecebidas = projectContracts
    .flatMap((contract) => contract.parcelas || [])
    .reduce((sum, installment) => {
      const paidValue = Number(
        installment.valorPago
        ?? installment.valor_pago
        ?? (
          ['recebida', 'recebido', 'paga', 'pago'].includes(
            normalizeStatus(installment.status),
          )
            ? installment.valor
            : 0
        )
        ?? 0,
      );

      return sum + (
        Number.isFinite(paidValue)
          ? Math.max(0, paidValue)
          : 0
      );
    }, 0);
  const receitaRecebida = parcelasRecebidas + receitaAvulsaRecebida;

  const lucroEstimado = receitaContratada + receitaAvulsaPrevista - custoEstimado;
  const lucroReal = receitaRecebida - custoReal;

  return {
    custoEstimado,
    custoReal,
    receitaContratada,
    receitaRecebida,
    lucroEstimado,
    lucroReal,
    receitaAvulsaPrevista,
    receitaAvulsaRecebida,
    parcelasRecebidas
  };
};

import { isSupabaseConfigured, supabase } from './supabase';
