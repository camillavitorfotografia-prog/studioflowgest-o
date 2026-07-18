import { calculateDepreciation } from './financeEngine';
import { parseLedgerDate } from './financialLedger';

const normalize = (value = '') => String(value)
  .trim()
  .toLocaleLowerCase('pt-BR')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '');

const money = (value) => Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;
const dateKey = (value) => {
  const date = parseLedgerDate(value);
  return date ? date.toISOString().slice(0, 10) : '';
};
const monthKey = (value) => dateKey(value).slice(0, 7);
const isOnOrBefore = (value, limit) => {
  const key = dateKey(value);
  return Boolean(key && key <= limit);
};

export const canonicalAccount = (value) => {
  const account = normalize(value);
  if (account.includes('reserva')) return 'reserva';
  if (account.includes('salario') || account.includes('pessoal') || account === 'pf' || account.includes('cpf')) return 'salario';
  if (account.includes('empresa') || account === 'pj' || account.includes('cnpj')) return 'empresa';
  return 'nao_informada';
};

const typeOf = (row = {}) => normalize(row.tipo || row.source_type || '');
const generalOf = (row = {}) => normalize(row.tipoGeral || row.tipo_geral || row.general_type || '');
const statusOf = (row = {}) => normalize(row.status || '');
const amountOf = (row = {}) => money(row.valor ?? row.amount ?? 0);
const detailsOf = (row = {}) => row.detalhes || row.details || row.raw_data?.detalhes || {};
const effectiveDateOf = (row = {}) => row.effective_date || row.dataPagamento || row.data_pagamento || row.dataRecebimento || row.data_recebimento || row.data || '';
const dueDateOf = (row = {}) => row.due_date || row.vencimento || row.dataVencimento || row.data_vencimento || '';
const addDaysKey = (date, days) => {
  const next = new Date(date);
  next.setHours(12, 0, 0, 0);
  next.setDate(next.getDate() + days);
  return next.toISOString().slice(0, 10);
};
const accountOf = (row = {}) => row.account_code || row.contaOrigem || row.conta_origem || detailsOf(row).destino || 'empresa';
const paymentGroupOf = (row = {}) => String(
  row.payment_group_id || detailsOf(row).paymentId || detailsOf(row).externalPaymentId || row.paymentId || row.pagamentoId || row.id || '',
).replace(/^payment-/, '');

const isReceived = (row = {}) => {
  const status = statusOf(row);
  return ['recebido', 'recebida', 'pago', 'paga', 'confirmado', 'confirmada', 'quitado', 'quitada'].includes(status)
    || Boolean(row.dataRecebimento || row.data_recebimento || row.dataPagamento || row.data_pagamento);
};

const isPaidExpense = (row = {}) => {
  const status = statusOf(row);
  return ['pago', 'paga', 'quitado', 'quitada'].includes(status)
    || Boolean(row.dataPagamento || row.data_pagamento);
};

const classifyRow = (row = {}) => {
  if (row.entry_kind) return row.entry_kind;
  const type = typeOf(row);
  const general = generalOf(row);
  const category = normalize(row.categoria || row.category || '');
  const nature = normalize(row.naturezaFinanceira || row.natureza_financeira || detailsOf(row).naturezaFinanceira || '');

  if (type === 'receita_projeto') return 'ignored_mirror';
  if (type === 'distribuicao_pagamento') return 'operational_allocation';
  if (type === 'transferencia_interna' || general === 'transferencia') return 'internal_transfer';
  if (general === 'entrada' && (
    type === 'entrada_nao_operacional'
    || nature === 'nao_operacional'
    || ['aporte pessoal da titular', 'aporte do titular', 'venda de patrimonio', 'reembolso', 'emprestimo recebido', 'outras entradas nao operacionais', 'entrada nao operacional'].includes(category)
  )) return 'non_operational_income';
  if (general === 'entrada') return 'operational_income';
  if (general === 'saida' || ['fixa', 'variavel', 'despesa'].includes(type)) return isPaidExpense(row) ? 'expense_paid' : 'expense_pending';
  return 'ignored';
};

const activeForDepreciation = (item = {}, referenceDate = new Date()) => {
  const status = normalize(item.status);
  if (['vendido', 'baixado', 'perdido', 'descartado'].includes(status)) return false;
  const purchaseDate = parseLedgerDate(item.dataCompra || item.data_compra);
  if (purchaseDate && purchaseDate > referenceDate) return false;
  const stopDate = parseLedgerDate(item.depreciacaoEncerradaEm || item.depreciacao_encerrada_em || item.dataVenda || item.data_venda);
  return !stopDate || stopDate > referenceDate;
};


const equipmentIdentityKey = (item = {}) => {
  const name = normalize(item.nome || item.name || '');
  const value = money(item.valorCompra ?? item.valor_compra ?? item.valor ?? 0);
  const purchase = dateKey(item.dataCompra || item.data_compra || '');
  const serial = normalize(item.numeroSerie || item.numero_serie || '');
  if (serial) return `serial:${serial}`;
  return `asset:${name}|${value}|${purchase}`;
};

export const getCanonicalEquipmentForAccounting = (equipment = [], referenceDate = new Date()) => {
  const byIdentity = new Map();

  equipment.forEach((item) => {
    if (!activeForDepreciation(item, referenceDate)) return;
    const purchaseDate = parseLedgerDate(item.dataCompra || item.data_compra);
    // Sem data de compra não existe competência confiável para depreciação.
    if (!purchaseDate) return;

    const depreciation = calculateDepreciation(item, referenceDate);
    if (depreciation.monthsElapsed >= depreciation.usefulLifeMonths) return;
    if (depreciation.currentBookValue <= depreciation.residualValue) return;

    const key = equipmentIdentityKey(item);
    const previous = byIdentity.get(key);
    const updatedAt = parseLedgerDate(item.atualizadoEm || item.updated_at || item.updatedAt || item.criadoEm || item.created_at);
    const previousUpdatedAt = previous
      ? parseLedgerDate(previous.atualizadoEm || previous.updated_at || previous.updatedAt || previous.criadoEm || previous.created_at)
      : null;
    if (!previous || (updatedAt && (!previousUpdatedAt || updatedAt > previousUpdatedAt))) {
      byIdentity.set(key, item);
    }
  });

  return [...byIdentity.values()];
};

export const buildFinancialAccounting = ({
  transactions = [],
  canonicalRows = null,
  equipment = [],
  referenceDate = new Date(),
} = {}) => {
  const rows = Array.isArray(canonicalRows) && canonicalRows.length ? canonicalRows : transactions;
  const today = referenceDate.toISOString().slice(0, 10);
  const month = today.slice(0, 7);
  const next30 = addDaysKey(referenceDate, 30);
  const accounts = { empresa: 0, reserva: 0, salario: 0, nao_informada: 0 };
  const addAccount = (account, value) => {
    const key = canonicalAccount(account);
    accounts[key] = money(accounts[key] + value);
  };

  const operationalGroups = new Map();
  const operationalStandalone = [];
  const nonOperationalEntries = [];
  const paidExpenses = [];
  const pendingExpenses = [];
  const ignoredMirrors = [];
  const futureRows = [];

  rows.forEach((row) => {
    const kind = classifyRow(row);
    const amount = amountOf(row);
    const effectiveDate = effectiveDateOf(row);
    const dueDate = dueDateOf(row);
    if (amount <= 0) return;

    if (kind === 'expense_pending') {
      pendingExpenses.push({ ...row, amount, date: dueDate || effectiveDate, dueDate: dueDate || effectiveDate });
      return;
    }

    if (!isOnOrBefore(effectiveDate, today)) {
      if (dateKey(effectiveDate)) futureRows.push({ ...row, amount, date: effectiveDate });
      return;
    }

    if (kind === 'operational_allocation' && isReceived(row)) {
      const groupId = paymentGroupOf(row);
      const current = operationalGroups.get(groupId) || { id: groupId, date: effectiveDate, amount: 0, rows: [] };
      current.amount = money(current.amount + amount);
      current.rows.push(row);
      if (!current.date || dateKey(effectiveDate) < dateKey(current.date)) current.date = effectiveDate;
      operationalGroups.set(groupId, current);
      addAccount(accountOf(row), amount);
      return;
    }

    if (kind === 'operational_income' && isReceived(row)) {
      operationalStandalone.push({ ...row, amount, date: effectiveDate });
      addAccount(accountOf(row), amount);
      return;
    }

    if (kind === 'non_operational_income' && isReceived(row)) {
      nonOperationalEntries.push({ ...row, amount, date: effectiveDate });
      addAccount(accountOf(row), amount);
      return;
    }

    if (kind === 'expense_paid') {
      paidExpenses.push({ ...row, amount, date: effectiveDate });
      addAccount(accountOf(row), -amount);
      return;
    }

    if (kind === 'ignored_mirror') ignoredMirrors.push(row);
  });

  const operationalReceipts = [
    ...[...operationalGroups.values()].map((group) => ({ ...group, source: 'distribution' })),
    ...operationalStandalone,
  ];

  const operationalReceivedMonth = money(operationalReceipts
    .filter((row) => monthKey(row.date) === month)
    .reduce((sum, row) => sum + amountOf(row), 0));
  const nonOperationalMonth = money(nonOperationalEntries
    .filter((row) => monthKey(row.date) === month)
    .reduce((sum, row) => sum + amountOf(row), 0));
  const paidExpensesMonthRows = paidExpenses.filter((row) => monthKey(row.date) === month);
  const paidExpensesMonth = money(paidExpensesMonthRows.reduce((sum, row) => sum + amountOf(row), 0));

  const paidFixedMonth = money(paidExpensesMonthRows
    .filter((row) => typeOf(row) === 'fixa')
    .reduce((sum, row) => sum + amountOf(row), 0));
  const paidVariableMonth = money(paidExpensesMonthRows
    .filter((row) => typeOf(row) === 'variavel')
    .reduce((sum, row) => sum + amountOf(row), 0));

  const pendingNext30 = pendingExpenses
    .filter((row) => {
      const due = dateKey(row.dueDate || row.date);
      return due && due >= today && due <= next30;
    })
    .sort((a, b) => dateKey(a.dueDate || a.date).localeCompare(dateKey(b.dueDate || b.date)));
  const overdueExpenses = pendingExpenses
    .filter((row) => {
      const due = dateKey(row.dueDate || row.date);
      return due && due < today;
    });
  const payableNext30 = money(pendingNext30.reduce((sum, row) => sum + amountOf(row), 0));

  // Recebimentos futuros só são projetados quando o lançamento é uma entrada real,
  // não um espelho de projeto ou uma distribuição já realizada.
  const receivableNext30Rows = futureRows.filter((row) => {
    const kind = classifyRow(row);
    const date = dateKey(row.date);
    return kind === 'operational_income' && date >= today && date <= next30;
  });
  const receivableNext30 = money(receivableNext30Rows.reduce((sum, row) => sum + amountOf(row), 0));

  const canonicalEquipment = getCanonicalEquipmentForAccounting(equipment, referenceDate);
  const monthlyDepreciation = money(canonicalEquipment
    .reduce((sum, item) => sum + calculateDepreciation(item, referenceDate).monthlyDepreciation, 0));

  const operationalCashResult = money(operationalReceivedMonth - paidExpensesMonth);
  const accountingResult = money(operationalCashResult - monthlyDepreciation);
  const netCashMovement = money(operationalReceivedMonth + nonOperationalMonth - paidExpensesMonth);
  const totalCashBalance = money(Object.values(accounts).reduce((sum, value) => sum + value, 0));
  const projected30 = money(totalCashBalance + receivableNext30 - payableNext30);

  return {
    today,
    next30,
    month,
    operationalReceipts,
    nonOperationalEntries,
    paidExpenses,
    paidExpensesMonthRows,
    pendingExpenses,
    pendingNext30,
    overdueExpenses,
    receivableNext30Rows,
    ignoredMirrors,
    futureRows,
    accounts: {
      empresa: accounts.empresa,
      reserva: accounts.reserva,
      salario: accounts.salario,
      naoInformada: accounts.nao_informada,
    },
    operationalReceivedMonth,
    nonOperationalMonth,
    paidExpensesMonth,
    paidFixedMonth,
    paidVariableMonth,
    receivableNext30,
    payableNext30,
    monthlyDepreciation,
    canonicalEquipment,
    depreciationExcludedCount: Math.max(0, equipment.length - canonicalEquipment.length),
    operationalCashResult,
    accountingResult,
    netCashMovement,
    totalCashBalance,
    projected30,
    currentOperatingCost: money(paidFixedMonth + paidVariableMonth + monthlyDepreciation),
    totals: {
      operationalReceived: money(operationalReceipts.reduce((sum, row) => sum + amountOf(row), 0)),
      nonOperationalReceived: money(nonOperationalEntries.reduce((sum, row) => sum + amountOf(row), 0)),
      paidExpenses: money(paidExpenses.reduce((sum, row) => sum + amountOf(row), 0)),
    },
    reconciliation: [],
    undatedExpenses: pendingExpenses.filter((row) => !dateKey(row.dueDate || row.date)),
    undatedReceipts: [],
  };
};

