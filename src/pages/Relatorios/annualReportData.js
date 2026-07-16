import {
  calculateProjectAmounts,
  readPayments,
} from '../../utils/dbData';
import { buildFinancialLedger } from '../../utils/financialLedger';

export const REPORT_MONTH_LABELS = [
  'Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun',
  'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez',
];

export const normalizeReportText = (value = '') => String(value)
  .trim()
  .toLocaleLowerCase('pt-BR')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '');

export const parseReportDate = (value) => {
  if (!value) return null;

  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }

  const text = String(value).trim();
  if (!text) return null;

  const brDate = text.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  const normalized = brDate
    ? `${brDate[3]}-${brDate[2]}-${brDate[1]}`
    : text.slice(0, 10);

  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) return null;

  const date = new Date(`${normalized}T12:00:00`);
  return Number.isNaN(date.getTime()) ? null : date;
};

export const formatReportDate = (value) => {
  const date = parseReportDate(value);
  return date ? date.toLocaleDateString('pt-BR') : '-';
};

const reportYear = (value) => parseReportDate(value)?.getFullYear() || null;

const getProjectDate = (project = {}) => (
  project.data
  || project.dataEvento
  || project.dataTrabalho
  || project.data_trabalho
  || ''
);

const getPaymentDate = (payment = {}) => (
  payment.dataRecebimento
  || payment.data_recebimento
  || payment.dataPagamento
  || payment.data_pagamento
  || payment.data
  || payment.date
  || ''
);

const getTransactionDate = (transaction = {}) => (
  transaction.dataRecebimento
  || transaction.data_recebimento
  || transaction.dataPagamento
  || transaction.data_pagamento
  || transaction.data
  || transaction.dataVencimento
  || transaction.data_vencimento
  || ''
);

const getProjectClientName = (project = {}) => (
  project.clienteNome
  || project.clienteNomeImportado
  || project.cliente_nome_importado
  || project.cliente?.nome
  || 'Cliente sem cadastro'
);

const getProjectService = (project = {}) => (
  project.tipoServico
  || project.tipo_servico
  || project.categoria
  || 'Não informado'
);

const getProjectIdentity = (project = {}) => {
  const externalId = (
    project.externalId
    || project.external_id
    || project.importFingerprint
    || project.import_fingerprint
  );

  if (externalId) return `external:${externalId}`;

  const amounts = calculateProjectAmounts(project);
  return [
    normalizeReportText(getProjectClientName(project)),
    String(getProjectDate(project)).slice(0, 10),
    normalizeReportText(getProjectService(project)),
    amounts.total.toFixed(2),
  ].join('|');
};

export const dedupeReportProjects = (projects = []) => {
  const map = new Map();

  projects.forEach((project) => {
    const key = getProjectIdentity(project);
    const previous = map.get(key);

    if (!previous) {
      map.set(key, project);
      return;
    }

    const previousAmounts = calculateProjectAmounts(previous);
    const currentAmounts = calculateProjectAmounts(project);
    const previousScore = Number(Boolean(previous.clientId || previous.clienteId)) * 10
      + previousAmounts.paid
      + Number(Boolean(getProjectDate(previous)));
    const currentScore = Number(Boolean(project.clientId || project.clienteId)) * 10
      + currentAmounts.paid
      + Number(Boolean(getProjectDate(project)));

    if (currentScore > previousScore) map.set(key, project);
  });

  return [...map.values()];
};

const sortByDate = (a, b) => (
  (parseReportDate(a.date)?.getTime() || 0)
  - (parseReportDate(b.date)?.getTime() || 0)
);

const topEntry = (object, selector = (value) => Number(value || 0)) => (
  Object.entries(object)
    .sort((a, b) => selector(b[1]) - selector(a[1]))[0]
  || null
);

export const getAvailableReportYears = (studio = {}) => {
  const years = new Set([new Date().getFullYear()]);
  const projects = dedupeReportProjects(studio.projects || []);
  const transactions = studio.transactions || [];

  projects.forEach((project) => {
    const projectYear = reportYear(getProjectDate(project));
    if (projectYear) years.add(projectYear);

    readPayments(project).forEach((payment) => {
      const paymentYear = reportYear(getPaymentDate(payment));
      if (paymentYear) years.add(paymentYear);
    });
  });

  transactions.forEach((transaction) => {
    const transactionYear = reportYear(getTransactionDate(transaction));
    if (transactionYear) years.add(transactionYear);
  });

  return [...years]
    .filter((year) => Number.isInteger(year) && year >= 2000 && year <= 2100)
    .sort((a, b) => b - a);
};

export const buildAnnualReport = (studio = {}, selectedYear = new Date().getFullYear()) => {
  const year = Number(selectedYear) || new Date().getFullYear();
  const projects = dedupeReportProjects(studio.projects || []);
  const clientsById = new Map((studio.clients || []).map((client) => [String(client.id), client]));
  const transactions = studio.transactions || [];
  const ledger = buildFinancialLedger({ projects, transactions });

  const annualProjects = projects
    .filter((project) => reportYear(getProjectDate(project)) === year)
    .sort((a, b) => (
      (parseReportDate(getProjectDate(a))?.getTime() || 0)
      - (parseReportDate(getProjectDate(b))?.getTime() || 0)
    ));
  const annualReceipts = ledger.receipts
    .filter((receipt) => reportYear(receipt.date) === year)
    .sort(sortByDate);
  const annualExpenses = ledger.expenses
    .filter((expense) => reportYear(expense.date) === year)
    .sort(sortByDate);

  const monthly = Array.from({ length: 12 }, (_, index) => ({
    month: index,
    label: REPORT_MONTH_LABELS[index],
    received: 0,
    companyReceived: 0,
    expenses: 0,
    result: 0,
  }));

  annualReceipts.forEach((receipt) => {
    const month = parseReportDate(receipt.date)?.getMonth();
    if (month === null || month === undefined) return;
    monthly[month].received += receipt.amount;
    if (receipt.accountType === 'empresa') monthly[month].companyReceived += receipt.amount;
  });

  annualExpenses.forEach((expense) => {
    const month = parseReportDate(expense.date)?.getMonth();
    if (month === null || month === undefined) return;
    monthly[month].expenses += expense.amount;
  });

  monthly.forEach((item) => {
    item.result = item.received - item.expenses;
  });

  const byService = {};
  const byEssay = {};
  const byCity = {};
  const byOrigin = {};
  const byClient = {};
  const byEquipment = {};
  const projectRows = [];
  const profitabilityRows = [];

  let contracted = 0;
  let receivedForAnnualProjects = 0;
  let remaining = 0;

  annualProjects.forEach((project) => {
    const amounts = calculateProjectAmounts(project);
    const client = (
      project.cliente
      || clientsById.get(String(project.clientId || project.clienteId || ''))
      || {}
    );
    const clientName = getProjectClientName(project);
    const service = getProjectService(project);
    const projectId = String(project.id);
    const receiptsInYear = annualReceipts
      .filter((receipt) => String(receipt.projectId || '') === projectId)
      .reduce((sum, receipt) => sum + receipt.amount, 0);
    const expensesInYear = annualExpenses
      .filter((expense) => String(expense.projectId || '') === projectId)
      .reduce((sum, expense) => sum + expense.amount, 0);

    contracted += amounts.total;
    receivedForAnnualProjects += amounts.paid;
    remaining += amounts.remaining;

    byService[service] = (byService[service] || 0) + amounts.total;
    if (/ensaio|gestante|familia|família/i.test(service)) {
      byEssay[service] = byEssay[service] || { count: 0, value: 0 };
      byEssay[service].count += 1;
      byEssay[service].value += amounts.total;
    }

    const city = client.cidade || project.cidade || project.local || 'Não informado';
    const origin = client.origem || project.origem || 'Não informado';
    byCity[city] = (byCity[city] || 0) + amounts.total;
    byOrigin[origin] = (byOrigin[origin] || 0) + 1;
    byClient[clientName] = (byClient[clientName] || 0) + amounts.total;

    const equipmentList = (
      project.equipamentosDetalhados
      || project.equipamentos
      || project.equipmentIds
      || []
    );

    equipmentList.forEach((equipment) => {
      const equipmentName = typeof equipment === 'string'
        ? (studio.equipment || []).find((item) => String(item.id) === String(equipment))?.nome || equipment
        : equipment?.nome;
      if (!equipmentName) return;

      byEquipment[equipmentName] = byEquipment[equipmentName] || { projects: 0, revenue: 0 };
      byEquipment[equipmentName].projects += 1;
      byEquipment[equipmentName].revenue += receiptsInYear;
    });

    projectRows.push({
      id: project.id,
      date: getProjectDate(project),
      clientName,
      service,
      status: project.statusProducao || project.status || 'Não informado',
      contracted: amounts.total,
      receivedTotal: amounts.paid,
      receivedInYear: receiptsInYear,
      remaining: amounts.remaining,
    });

    profitabilityRows.push({
      clientName,
      service,
      received: receiptsInYear,
      expenses: expensesInYear,
      profit: receiptsInYear - expensesInYear,
    });
  });

  const annualReceived = annualReceipts.reduce((sum, receipt) => sum + receipt.amount, 0);
  const companyReceived = annualReceipts
    .filter((receipt) => receipt.accountType === 'empresa')
    .reduce((sum, receipt) => sum + receipt.amount, 0);
  const personalReceived = annualReceipts
    .filter((receipt) => receipt.accountType === 'pessoal')
    .reduce((sum, receipt) => sum + receipt.amount, 0);
  const unclassifiedAccountReceived = annualReceipts
    .filter((receipt) => receipt.accountType === 'nao_informada')
    .reduce((sum, receipt) => sum + receipt.amount, 0);
  const annualExpensesTotal = annualExpenses.reduce((sum, expense) => sum + expense.amount, 0);
  const annualResult = annualReceived - annualExpensesTotal;

  const serviceEntries = Object.entries(byService).sort((a, b) => b[1] - a[1]);
  const equipmentEntries = Object.entries(byEquipment).sort((a, b) => b[1].revenue - a[1].revenue);
  const topEssay = topEntry(byEssay, (value) => value.count);

  return {
    year,
    totals: {
      projects: annualProjects.length,
      contracted,
      receivedForAnnualProjects,
      remaining,
      annualReceived,
      companyReceived,
      personalReceived,
      unclassifiedAccountReceived,
      annualExpenses: annualExpensesTotal,
      annualResult,
      weddings: annualProjects.filter((project) => (
        normalizeReportText(getProjectService(project)).includes('casamento')
      )).length,
    },
    monthly,
    projects: annualProjects,
    projectRows,
    receipts: annualReceipts,
    expenses: annualExpenses,
    profitabilityRows: profitabilityRows.sort((a, b) => b.profit - a.profit),
    mostContractedService: serviceEntries[0] || null,
    mostSoldEssay: topEssay,
    topOrigin: topEntry(byOrigin),
    topCity: topEntry(byCity),
    topClient: topEntry(byClient),
    equipmentMostUsed: Object.entries(byEquipment).sort((a, b) => b[1].projects - a[1].projects)[0] || null,
    equipmentBestReturn: equipmentEntries[0] || null,
    equipmentRows: equipmentEntries.map(([name, data]) => ({
      name,
      frequency: data.projects,
      revenue: data.revenue,
    })),
    warnings: {
      receiptsWithoutDate: ledger.undatedReceipts.length,
      receiptsWithoutDateAmount: ledger.undatedReceipts.reduce((sum, row) => sum + row.amount, 0),
      expensesWithoutDate: ledger.undatedExpenses.length,
      expensesWithoutDateAmount: ledger.undatedExpenses.reduce((sum, row) => sum + row.amount, 0),
      pendingExpenses: ledger.pendingExpenses.length,
      pendingExpensesAmount: ledger.pendingExpenses.reduce((sum, row) => sum + row.amount, 0),
      reconciliationItems: ledger.reconciliation.length,
      reconciliationAmount: ledger.reconciliation.reduce((sum, row) => sum + row.amount, 0),
      projectsWithoutDate: projects.filter((project) => !parseReportDate(getProjectDate(project))).length,
    },
  };
};
