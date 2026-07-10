export const FIXED_EXPENSE_CATEGORIES = [
  'Aluguel',
  'Energia',
  'Agua',
  'Alimentacao',
  'Combustivel',
  'Internet',
  'Conta de celular',
  'Adobe',
  'Google Drive',
  'Canva',
  'ChatGPT',
  'Dominio',
  'Hospedagem',
  'Assinaturas',
  'MEI / Impostos',
  'Contabilidade',
  'Contador',
  'Impostos',
  'Outros',
];

export const VARIABLE_EXPENSE_CATEGORIES = [
  'Transporte',
  'Combustivel',
  'Alimentacao em eventos',
  'Marketing',
  'Assistentes',
  'Hospedagem',
  'Pedagios',
  'Pedagio',
  'Estacionamento',
  'Freelancer',
  'Segundo fotografo',
  'Segundo filmmaker',
  'Drone',
  'Manutencao',
  'Compra de materiais',
  'Equipamentos',
  'Outros',
];

export const PAYMENT_METHODS = [
  'Pix',
  'Cartao de credito',
  'Cartao de debito',
  'Boleto',
  'Dinheiro',
  'Transferencia',
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

export const isConfirmedPayment = (payment = {}) =>
  parseCurrency(payment.valor) > 0 && CONFIRMED_PAYMENT_STATUSES.has(normalizeStatus(payment.status));

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
  if (!value) return 0;
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  const normalized = value.toString().replace(/\D/g, '');
  return normalized ? parseFloat(normalized) / 100 : 0;
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

export const getTransactionDate = (transaction) => transaction?.data || transaction?.dataVencimento || '';

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
  const usefulLifeYears = Number(equipment.vidaUtilAnos || 5);
  const residualValue = Number(equipment.valorResidual || 0);
  const depreciableValue = Math.max(0, purchaseValue - residualValue);
  const usefulLifeMonths = Math.max(1, usefulLifeYears * 12);
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

export const preparePaymentsWithDistribution = (payments = [], config, context = {}) =>
  payments.map((payment) => ({
    ...payment,
    distribuicao: attachPaymentDistribution(payment, config, context),
  }));

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
    const payments = preparePaymentsWithDistribution(currentPayments, config, {
      projectId: project.id,
      clientId: project.clientId || project.clienteId || project.cliente_id || '',
      clientName: project.clienteNome || project.cliente?.nome || '',
      salarySplit: project.financeiro?.divisaoSalarios || DEFAULT_SALARY_SPLIT,
    });
    const changed = JSON.stringify(currentPayments) !== JSON.stringify(payments);
    const nextProject = changed ? {
      ...project,
      pagamentos: payments,
      receitas: payments,
      financeiro: { ...project.financeiro, receitas: payments },
    } : project;

    if (changed) {
      const { error } = await supabase
        .from('projetos')
        .update({ financeiro: nextProject.financeiro })
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
import { isSupabaseConfigured, supabase } from './supabase';
