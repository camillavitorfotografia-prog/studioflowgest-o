export const FIXED_EXPENSE_CATEGORIES = [
  'Aluguel',
  'Energia',
  'Agua',
  'Alimentacao',
  'Combustivel',
  'Internet',
  'Conta de celular',
  'Assinaturas',
  'MEI / Impostos',
  'Contabilidade',
  'Outros',
];

export const VARIABLE_EXPENSE_CATEGORIES = [
  'Transporte',
  'Alimentacao em eventos',
  'Marketing',
  'Assistentes',
  'Hospedagem',
  'Pedagios',
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

export const distribuirRecebimento = (valorTotal) => {
  const config = JSON.parse(
    localStorage.getItem(FINANCE_STORAGE_KEYS.config) || '{"salario": 35, "empresa": 45, "reserva": 20}',
  );
  const saldos = JSON.parse(
    localStorage.getItem(FINANCE_STORAGE_KEYS.balances) || '{"salario": 0, "empresa": 0, "reserva": 0}',
  );

  const distribuicao = {
    salario: valorTotal * (config.salario / 100),
    empresa: valorTotal * (config.empresa / 100),
    reserva: valorTotal * (config.reserva / 100),
  };

  const novosSaldos = {
    salario: saldos.salario + distribuicao.salario,
    empresa: saldos.empresa + distribuicao.empresa,
    reserva: saldos.reserva + distribuicao.reserva,
  };

  localStorage.setItem(FINANCE_STORAGE_KEYS.balances, JSON.stringify(novosSaldos));

  const historico = JSON.parse(localStorage.getItem(FINANCE_STORAGE_KEYS.transactions) || '[]');
  historico.push({
    id: Date.now(),
    descricao: 'Distribuicao Automatica',
    valor: valorTotal,
    tipo: 'Entrada',
    tipoGeral: 'Entrada',
    detalhes: distribuicao,
    data: dateToInput(new Date()),
  });
  localStorage.setItem(FINANCE_STORAGE_KEYS.transactions, JSON.stringify(historico));

  return novosSaldos;
};
