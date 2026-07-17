import { calculateProjectAmounts } from '../../utils/dbData';
import { buildFinancialLedger } from '../../utils/financialLedger';
import { buildOfficialProjectRegistry } from '../../utils/officialProjects';
import {
  consolidateClients,
  consolidateProjects,
  resolveClientForImportedName,
} from '../../utils/dataIntegrity';

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
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;

  const text = String(value).trim();
  if (!text) return null;
  const brDate = text.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  const normalized = brDate ? `${brDate[3]}-${brDate[2]}-${brDate[1]}` : text.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) return null;

  const date = new Date(`${normalized}T12:00:00`);
  return Number.isNaN(date.getTime()) ? null : date;
};

export const formatReportDate = (value) => {
  const date = parseReportDate(value);
  return date ? date.toLocaleDateString('pt-BR') : '-';
};

const yearOf = (value) => parseReportDate(value)?.getFullYear() || null;
const projectDate = (project = {}) => project.data || project.dataEvento || project.dataTrabalho || project.data_trabalho || '';
const transactionDate = (item = {}) => item.dataRecebimento || item.data_recebimento || item.dataPagamento || item.data_pagamento || item.data || item.dataVencimento || item.data_vencimento || '';
const projectService = (project = {}) => project.tipoServico || project.tipo_servico || project.servico || project.categoria || 'Não informado';
const projectClientName = (project = {}, client = {}) => client.nome || project.clienteNome || project.clienteNomeImportado || project.cliente_nome_importado || project.cliente?.nome || 'Cliente sem cadastro';
const canonicalClientId = (project = {}) => String(project.clientId || project.clienteId || project.client_id || project.cliente_id || '').trim();

const isHiddenProject = (project = {}) => Boolean(
  project?.financeiro?.hideFromClients === true
  || project?.financeiro?.ocultarDaListaClientes === true
  || project?.hideFromClients === true
  || project?.ocultarDaListaClientes === true,
);

const topEntry = (object, selector = (value) => Number(value || 0)) => (
  Object.entries(object).sort((a, b) => selector(b[1]) - selector(a[1]))[0] || null
);

const sortByDate = (a, b) => (parseReportDate(a.date)?.getTime() || 0) - (parseReportDate(b.date)?.getTime() || 0);

const attachOnlyToOfficialClients = (projects = [], clients = [], aliases = new Map()) => {
  const clientsById = new Map(clients.map((client) => [String(client.id), client]));
  const accepted = [];
  const orphaned = [];

  projects.forEach((project) => {
    if (isHiddenProject(project)) {
      orphaned.push(project);
      return;
    }

    const rawId = canonicalClientId(project);
    const aliasedId = rawId ? String(aliases.get(rawId) || rawId) : '';
    let client = aliasedId ? clientsById.get(aliasedId) : null;
    if (!client) client = resolveClientForImportedName(projectClientName(project), clients);

    if (!client?.id) {
      orphaned.push(project);
      return;
    }

    const clientId = String(client.id);
    accepted.push({
      ...project,
      clientId,
      clienteId: clientId,
      client_id: clientId,
      cliente_id: clientId,
      cliente: client,
    });
  });

  return { accepted, orphaned };
};

const buildCanonicalBase = (studio = {}) => {
  const clientConsolidation = consolidateClients(studio.clients || []);
  const linked = attachOnlyToOfficialClients(
    studio.projects || [],
    clientConsolidation.clients,
    clientConsolidation.clientIdAliases,
  );
  const projectConsolidation = consolidateProjects(
    linked.accepted,
    clientConsolidation.clients,
    clientConsolidation.clientIdAliases,
  );

  const transactions = (studio.transactions || []).map((transaction) => {
    const rawProjectId = String(transaction.projectId || transaction.project_id || transaction.projeto_id || '');
    const rawClientId = String(transaction.clientId || transaction.client_id || transaction.cliente_id || '');
    const projectId = projectConsolidation.projectIdAliases.get(rawProjectId) || rawProjectId;
    const clientId = clientConsolidation.clientIdAliases.get(rawClientId) || rawClientId;
    return {
      ...transaction,
      projectId,
      project_id: projectId,
      projeto_id: projectId,
      clientId,
      client_id: clientId,
      cliente_id: clientId,
    };
  });

  return {
    clients: clientConsolidation.clients,
    clientAliases: clientConsolidation.clientIdAliases,
    projects: projectConsolidation.projects,
    transactions,
    orphanedProjects: linked.orphaned,
    duplicateClients: clientConsolidation.duplicateCount,
    duplicateProjects: projectConsolidation.duplicateCount,
    excludedProjects: projectConsolidation.excludedCount,
  };
};

export const getAvailableReportYears = (studio = {}) => {
  const years = new Set([new Date().getFullYear()]);
  const base = buildCanonicalBase(studio);

  base.projects.forEach((project) => {
    const value = yearOf(projectDate(project));
    if (value) years.add(value);
  });
  base.transactions.forEach((transaction) => {
    const value = yearOf(transactionDate(transaction));
    if (value) years.add(value);
  });

  const ledger = buildFinancialLedger({ projects: base.projects, transactions: base.transactions });
  [...ledger.receipts, ...ledger.expenses].forEach((row) => {
    const value = yearOf(row.date);
    if (value) years.add(value);
  });

  return [...years]
    .filter((year) => Number.isInteger(year) && year >= 2000 && year <= 2100)
    .sort((a, b) => b - a);
};

export const buildAnnualReport = (studio = {}, selectedYear = new Date().getFullYear()) => {
  const year = Number(selectedYear) || new Date().getFullYear();
  const base = buildCanonicalBase(studio);
  const clientsById = new Map(base.clients.map((client) => [String(client.id), client]));
  const projectsById = new Map(base.projects.map((project) => [String(project.id), project]));
  const ledger = buildFinancialLedger({ projects: base.projects, transactions: base.transactions });

  // Contratos do exercício: cada trabalho único, ativo, vinculado a um cliente
  // oficial e cuja data do evento pertence ao ano selecionado.
  const annualProjects = buildOfficialProjectRegistry({
    projects: studio.projects || [],
    clients: studio.clients || [],
    year,
    includeUndated: false,
    includeCancelled: false,
    includeArchived: false,
  }).sort((a, b) => (
    (parseReportDate(projectDate(a))?.getTime() || 0)
    - (parseReportDate(projectDate(b))?.getTime() || 0)
  ));

  const annualClientIds = new Set(annualProjects.map(canonicalClientId).filter(Boolean));
  const annualReceipts = ledger.receipts.filter((row) => yearOf(row.date) === year).sort(sortByDate);
  const annualExpenses = ledger.expenses.filter((row) => yearOf(row.date) === year).sort(sortByDate);

  // Recebimento acumulado por contrato considera todos os anos, pois o saldo
  // contratual deve refletir tudo que já foi pago, não apenas o caixa do ano.
  const allReceiptsByProject = new Map();
  ledger.receipts.forEach((receipt) => {
    const id = String(receipt.projectId || '');
    if (!id) return;
    allReceiptsByProject.set(id, (allReceiptsByProject.get(id) || 0) + Number(receipt.amount || 0));
  });

  const monthly = REPORT_MONTH_LABELS.map((label, month) => ({
    month, label, received: 0, companyReceived: 0, expenses: 0, result: 0,
  }));
  annualReceipts.forEach((receipt) => {
    const month = parseReportDate(receipt.date)?.getMonth();
    if (month == null) return;
    monthly[month].received += receipt.amount;
    if (receipt.accountType === 'empresa') monthly[month].companyReceived += receipt.amount;
  });
  annualExpenses.forEach((expense) => {
    const month = parseReportDate(expense.date)?.getMonth();
    if (month == null) return;
    monthly[month].expenses += expense.amount;
  });
  monthly.forEach((item) => { item.result = item.received - item.expenses; });

  const byService = {};
  const byEssay = {};
  const byCity = {};
  const byOrigin = {};
  const byClient = {};
  const byEquipment = {};
  const expensesByCategory = {};
  const receiptsByMethod = {};
  const receiptsByAccount = {};
  const projectRows = [];
  const profitabilityRows = [];

  annualReceipts.forEach((receipt) => {
    const method = receipt.method || 'Não informado';
    const account = receipt.account || (receipt.accountType === 'empresa' ? 'Empresa / CNPJ' : receipt.accountType === 'pessoal' ? 'Pessoal / CPF' : 'Não informada');
    receiptsByMethod[method] = (receiptsByMethod[method] || 0) + receipt.amount;
    receiptsByAccount[account] = (receiptsByAccount[account] || 0) + receipt.amount;
  });
  annualExpenses.forEach((expense) => {
    const category = expense.category || 'Outras';
    expensesByCategory[category] = (expensesByCategory[category] || 0) + expense.amount;
  });

  let contracted = 0;
  let receivedForAnnualProjects = 0;
  let remaining = 0;

  annualProjects.forEach((project) => {
    const amounts = calculateProjectAmounts(project);
    const id = String(project.id || '');
    const client = clientsById.get(canonicalClientId(project)) || project.cliente || {};
    const clientName = projectClientName(project, client);
    const service = projectService(project);
    const ledgerPaid = allReceiptsByProject.get(id) || 0;
    const paidAllTime = Math.max(amounts.paid, ledgerPaid);
    const projectRemaining = Math.max(0, amounts.total - paidAllTime);
    const receiptsInYear = annualReceipts.filter((row) => String(row.projectId || '') === id).reduce((sum, row) => sum + row.amount, 0);
    const expensesInYear = annualExpenses.filter((row) => String(row.projectId || '') === id).reduce((sum, row) => sum + row.amount, 0);

    contracted += amounts.total;
    receivedForAnnualProjects += Math.min(amounts.total, paidAllTime);
    remaining += projectRemaining;

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

    const equipmentList = project.equipamentosDetalhados || project.equipamentos || project.equipmentIds || [];
    equipmentList.forEach((equipment) => {
      const name = typeof equipment === 'string'
        ? (studio.equipment || []).find((item) => String(item.id) === String(equipment))?.nome || equipment
        : equipment?.nome;
      if (!name) return;
      byEquipment[name] = byEquipment[name] || { projects: 0, revenue: 0 };
      byEquipment[name].projects += 1;
      byEquipment[name].revenue += receiptsInYear;
    });

    projectRows.push({
      id: project.id,
      date: projectDate(project),
      clientName,
      service,
      status: project.statusProducao || project.status || 'Não informado',
      contracted: amounts.total,
      receivedTotal: paidAllTime,
      receivedInYear: receiptsInYear,
      remaining: projectRemaining,
    });
    profitabilityRows.push({ clientName, service, received: receiptsInYear, expenses: expensesInYear, profit: receiptsInYear - expensesInYear });
  });

  const annualReceived = annualReceipts.reduce((sum, row) => sum + row.amount, 0);
  const annualExpensesTotal = annualExpenses.reduce((sum, row) => sum + row.amount, 0);
  const companyReceived = annualReceipts.filter((row) => row.accountType === 'empresa').reduce((sum, row) => sum + row.amount, 0);
  const personalReceived = annualReceipts.filter((row) => row.accountType === 'pessoal').reduce((sum, row) => sum + row.amount, 0);
  const unclassifiedAccountReceived = annualReceived - companyReceived - personalReceived;

  const receiptOriginTotals = annualReceipts.reduce((totals, receipt) => {
    const linked = projectsById.get(String(receipt.projectId || '')) || receipt.project;
    const linkedYear = linked ? yearOf(projectDate(linked)) : null;
    if (!linkedYear) totals.unlinked += receipt.amount;
    else if (linkedYear === year) totals.currentYearContracts += receipt.amount;
    else if (linkedYear < year) totals.previousYearContracts += receipt.amount;
    else totals.futureYearContracts += receipt.amount;
    return totals;
  }, { currentYearContracts: 0, previousYearContracts: 0, futureYearContracts: 0, unlinked: 0 });

  const expenseCategoryRows = Object.entries(expensesByCategory).sort((a, b) => b[1] - a[1]).map(([category, amount]) => ({ category, amount }));
  const receiptMethodRows = Object.entries(receiptsByMethod).sort((a, b) => b[1] - a[1]).map(([method, amount]) => ({ method, amount }));
  const receiptAccountRows = Object.entries(receiptsByAccount).sort((a, b) => b[1] - a[1]).map(([account, amount]) => ({ account, amount }));
  const equipmentEntries = Object.entries(byEquipment).sort((a, b) => b[1].revenue - a[1].revenue);

  // Garantias matemáticas: estes valores são derivados das próprias linhas de
  // auditoria e nunca de totais antigos/cacheados.
  const auditedContracted = projectRows.reduce((sum, row) => sum + row.contracted, 0);
  const auditedRemaining = projectRows.reduce((sum, row) => sum + row.remaining, 0);
  const annualResult = annualReceived - annualExpensesTotal;

  return {
    year,
    totals: {
      projects: projectRows.length,
      clients: annualClientIds.size,
      contracted: auditedContracted,
      receivedForAnnualProjects,
      remaining: auditedRemaining,
      annualReceived,
      companyReceived,
      personalReceived,
      unclassifiedAccountReceived,
      annualExpenses: annualExpensesTotal,
      annualResult,
      companyResult: companyReceived - annualExpensesTotal,
      taxCashBasisRevenue: annualReceived,
      taxCashBasisExpenses: annualExpensesTotal,
      taxCashBasisResult: annualResult,
      currentYearContractReceipts: receiptOriginTotals.currentYearContracts,
      previousYearContractReceipts: receiptOriginTotals.previousYearContracts,
      futureYearContractReceipts: receiptOriginTotals.futureYearContracts,
      unlinkedReceipts: receiptOriginTotals.unlinked,
      weddings: annualProjects.filter((project) => normalizeReportText(projectService(project)).includes('casamento')).length,
    },
    monthly,
    projects: annualProjects,
    projectRows,
    receipts: annualReceipts,
    expenses: annualExpenses,
    profitabilityRows: profitabilityRows.sort((a, b) => b.profit - a.profit),
    mostContractedService: topEntry(byService),
    mostSoldEssay: topEntry(byEssay, (value) => value.count),
    topOrigin: topEntry(byOrigin),
    topCity: topEntry(byCity),
    topClient: topEntry(byClient),
    equipmentMostUsed: Object.entries(byEquipment).sort((a, b) => b[1].projects - a[1].projects)[0] || null,
    equipmentBestReturn: equipmentEntries[0] || null,
    equipmentRows: equipmentEntries.map(([name, data]) => ({ name, frequency: data.projects, revenue: data.revenue })),
    expenseCategoryRows,
    receiptMethodRows,
    receiptAccountRows,
    ledgerStats: {
      receipts: annualReceipts.length,
      expenses: annualExpenses.length,
      financeReceipts: annualReceipts.filter((row) => row.source === 'financeiro_avulso').length,
      projectReceipts: annualReceipts.filter((row) => row.source === 'cliente').length,
      ignoredFinanceContractReceipts: ledger.ignoredFinanceContractReceipts?.length || 0,
      sourceProjects: (studio.projects || []).length,
      clientBackedProjects: base.projects.length,
      orphanedProjects: base.orphanedProjects.length,
      consolidatedProjects: base.projects.length,
      annualProjects: projectRows.length,
      allAnnualProjects: projectRows.length,
      annualClients: annualClientIds.size,
      duplicateProjectsRemoved: base.duplicateProjects,
      duplicateClientsRemoved: base.duplicateClients,
      hiddenDuplicateProjects: base.orphanedProjects.filter(isHiddenProject).length,
      orphanAnnualProjects: base.orphanedProjects.filter((project) => yearOf(projectDate(project)) === year).length,
      excludedProjects: base.excludedProjects,
    },
    warnings: {
      receiptsWithoutDate: ledger.undatedReceipts.length,
      receiptsWithoutDateAmount: ledger.undatedReceipts.reduce((sum, row) => sum + row.amount, 0),
      expensesWithoutDate: ledger.undatedExpenses.length,
      expensesWithoutDateAmount: ledger.undatedExpenses.reduce((sum, row) => sum + row.amount, 0),
      pendingExpenses: ledger.pendingExpenses.length,
      pendingExpensesAmount: ledger.pendingExpenses.reduce((sum, row) => sum + row.amount, 0),
      reconciliationItems: ledger.reconciliation.length,
      reconciliationAmount: ledger.reconciliation.reduce((sum, row) => sum + row.amount, 0),
      projectsWithoutDate: base.projects.filter((project) => !parseReportDate(projectDate(project))).length,
      duplicateProjectsRemoved: base.duplicateProjects,
      hiddenDuplicateProjects: base.orphanedProjects.filter(isHiddenProject).length,
      orphanAnnualProjects: base.orphanedProjects.filter((project) => yearOf(projectDate(project)) === year).length,
      excludedProjects: base.excludedProjects,
      orphanedProjects: base.orphanedProjects.length,
      previousYearContractReceipts: receiptOriginTotals.previousYearContracts,
      futureYearContractReceipts: receiptOriginTotals.futureYearContracts,
      unlinkedReceipts: receiptOriginTotals.unlinked,
      ignoredFinanceContractReceipts: ledger.ignoredFinanceContractReceipts?.length || 0,
    },
  };
};
