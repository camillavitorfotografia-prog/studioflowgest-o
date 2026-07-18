import { calculateProjectAmounts } from '../../utils/dbData';
import { buildOfficialProjectRegistry } from '../../utils/officialProjects';
import { consolidateClients, consolidateProjects, resolveClientForImportedName } from '../../utils/dataIntegrity';

export const REPORT_MONTH_LABELS = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];

export const normalizeReportText = (value = '') => String(value)
  .trim().toLocaleLowerCase('pt-BR').normalize('NFD').replace(/[\u0300-\u036f]/g, '');

export const parseReportDate = (value) => {
  if (!value) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  const text = String(value).trim();
  const br = text.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  const iso = br ? `${br[3]}-${br[2]}-${br[1]}` : text.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null;
  const date = new Date(`${iso}T12:00:00`);
  return Number.isNaN(date.getTime()) ? null : date;
};

export const formatReportDate = (value) => parseReportDate(value)?.toLocaleDateString('pt-BR') || '-';
const yearOf = (value) => parseReportDate(value)?.getFullYear() || null;
const money = (value) => Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;
const projectDate = (p = {}) => p.data || p.dataEvento || p.dataTrabalho || p.data_trabalho || '';
const projectService = (p = {}) => p.tipoServico || p.tipo_servico || p.servico || p.categoria || 'Não informado';
const projectClientId = (p = {}) => String(p.clientId || p.clienteId || p.client_id || p.cliente_id || '').trim();
const projectClientName = (p = {}, c = {}) => c.nome || p.clienteNome || p.cliente_nome_importado || p.clienteNomeImportado || p.cliente?.nome || 'Cliente sem cadastro';
const rowDate = (r = {}) => r.effective_date || r.due_date || r.data_pagamento || r.data || '';
const rowAmount = (r = {}) => money(r.amount ?? r.valor ?? 0);
const rowDescription = (r = {}) => r.descricao || r.description || 'Sem descrição';
const rowCategory = (r = {}) => r.categoria || r.category || 'Não informada';
const rowMethod = (r = {}) => r.forma_pagamento || r.method || 'Não informada';
const accountLabel = (code) => code === 'empresa' ? 'Empresa / CNPJ' : code === 'salario' ? 'Conta pessoal / CPF' : code === 'reserva' ? 'Reserva' : 'Não informada';
const topEntry = (object, selector = (v) => Number(v || 0)) => Object.entries(object).sort((a,b) => selector(b[1]) - selector(a[1]))[0] || null;

const canonicalBase = (studio = {}) => {
  const clientConsolidation = consolidateClients(studio.clients || []);
  const clients = clientConsolidation.clients;
  const byId = new Map(clients.map((c) => [String(c.id), c]));
  const accepted = [];
  const orphaned = [];
  (studio.projects || []).forEach((project) => {
    const rawId = projectClientId(project);
    const aliased = rawId ? String(clientConsolidation.clientIdAliases.get(rawId) || rawId) : '';
    let client = aliased ? byId.get(aliased) : null;
    if (!client) client = resolveClientForImportedName(projectClientName(project), clients);
    if (!client?.id) { orphaned.push(project); return; }
    accepted.push({ ...project, clientId: String(client.id), clienteId: String(client.id), cliente: client });
  });
  const projectConsolidation = consolidateProjects(accepted, clients, clientConsolidation.clientIdAliases);
  return {
    clients,
    projects: projectConsolidation.projects,
    orphanedProjects: orphaned,
    duplicateProjects: projectConsolidation.duplicateCount,
    duplicateClients: clientConsolidation.duplicateCount,
    excludedProjects: projectConsolidation.excludedCount,
  };
};

export const getAvailableReportYears = (studio = {}) => {
  const years = new Set([new Date().getFullYear()]);
  const base = canonicalBase(studio);
  base.projects.forEach((p) => { const y = yearOf(projectDate(p)); if (y) years.add(y); });
  (studio.canonicalFinanceRows || []).forEach((r) => { const y = yearOf(rowDate(r)); if (y) years.add(y); });
  return [...years].filter((y) => y >= 2000 && y <= 2100).sort((a,b) => b-a);
};

export const buildAnnualReport = (studio = {}, selectedYear = new Date().getFullYear()) => {
  const year = Number(selectedYear) || new Date().getFullYear();
  const base = canonicalBase(studio);
  const clientsById = new Map(base.clients.map((c) => [String(c.id), c]));
  const projectsById = new Map(base.projects.map((p) => [String(p.id), p]));
  const rows = Array.isArray(studio.canonicalFinanceRows) ? studio.canonicalFinanceRows : [];

  const todayKey = new Date().toISOString().slice(0, 10);
  const annualRows = rows.filter((r) => yearOf(rowDate(r)) === year);
  const isRealized = (r) => {
    const key = parseReportDate(r.effective_date || r.data_pagamento || r.data)?.toISOString().slice(0, 10) || '';
    return Boolean(key && key <= todayKey);
  };
  const realizedAnnualRows = annualRows.filter(isRealized);
  const futureAnnualRows = annualRows.filter((r) => !isRealized(r));
  const allocations = realizedAnnualRows.filter((r) => r.entry_kind === 'operational_allocation');
  const standalone = realizedAnnualRows.filter((r) => r.entry_kind === 'operational_income');
  const expenses = realizedAnnualRows.filter((r) => r.entry_kind === 'expense_paid');
  const pendingExpenses = annualRows.filter((r) => r.entry_kind === 'expense_pending');
  const nonOperationalEntries = realizedAnnualRows.filter((r) => r.entry_kind === 'non_operational_income');
  const ignoredMirrors = annualRows.filter((r) => r.entry_kind === 'ignored_mirror');
  const futureIncomeRows = futureAnnualRows.filter((r) => ['operational_allocation','operational_income'].includes(r.entry_kind));

  const groups = new Map();
  allocations.forEach((r) => {
    const id = String(r.payment_group_id || r.id);
    const g = groups.get(id) || { id, date: r.effective_date, amount: 0, projectId: r.project_id, clientId: r.client_id, rows: [] };
    g.amount += rowAmount(r); g.rows.push(r); groups.set(id, g);
  });
  const receipts = [
    ...[...groups.values()].map((g) => {
      const project = projectsById.get(String(g.projectId || ''));
      const client = clientsById.get(String(g.clientId || projectClientId(project) || ''));
      return { date: g.date, amount: money(g.amount), projectId: g.projectId, clientName: projectClientName(project || {}, client || {}), description: project ? projectService(project) : 'Recebimento de cliente', source: 'cliente', account: 'Distribuído entre contas', method: 'Distribuição automática' };
    }),
    ...standalone.map((r) => ({ date: r.effective_date, amount: rowAmount(r), projectId: r.project_id, clientName: rowDescription(r), description: rowDescription(r), source: 'financeiro', account: accountLabel(r.account_code), method: rowMethod(r) })),
  ];

  const annualRevenue = money(receipts.reduce((s,r) => s + r.amount, 0));
  const annualExpenses = money(expenses.reduce((s,r) => s + rowAmount(r), 0));
  const annualNonOperational = money(nonOperationalEntries.reduce((s,r) => s + rowAmount(r), 0));

  const accountTotals = { empresa: 0, salario: 0, reserva: 0, nao_informada: 0 };
  allocations.forEach((r) => { accountTotals[r.account_code || 'nao_informada'] += rowAmount(r); });
  standalone.forEach((r) => { accountTotals[r.account_code || 'nao_informada'] += rowAmount(r); });

  const annualProjects = buildOfficialProjectRegistry({
    projects: studio.projects || [], clients: studio.clients || [], year,
    includeUndated: false, includeCancelled: false, includeArchived: false,
  }).sort((a,b) => (parseReportDate(projectDate(a))?.getTime() || 0) - (parseReportDate(projectDate(b))?.getTime() || 0));

  const projectRows = annualProjects.map((project) => {
    const client = clientsById.get(projectClientId(project)) || project.cliente || {};
    const amounts = calculateProjectAmounts(project);
    return { id: project.id, date: projectDate(project), clientName: projectClientName(project, client), service: projectService(project), status: project.statusProducao || project.status || 'Não informado', contracted: money(amounts.total), receivedTotal: money(amounts.paid), receivedInYear: money(receipts.filter((r) => String(r.projectId || '') === String(project.id)).reduce((s,r) => s+r.amount,0)), remaining: money(Math.max(0, amounts.total - amounts.paid)) };
  });
  const annualClientIds = new Set(annualProjects.map(projectClientId).filter(Boolean));
  const contracted = money(projectRows.reduce((s,r) => s+r.contracted,0));
  const remaining = money(projectRows.reduce((s,r) => s+r.remaining,0));

  const monthly = REPORT_MONTH_LABELS.map((label, month) => ({ month, label, received:0, forecastReceived:0, companyReceived:0, expenses:0, forecastExpenses:0, result:0 }));
  receipts.forEach((r) => { const m = parseReportDate(r.date)?.getMonth(); if (m != null) monthly[m].received += r.amount; });
  allocations.filter((r) => r.account_code === 'empresa').forEach((r) => { const m = parseReportDate(r.effective_date)?.getMonth(); if (m != null) monthly[m].companyReceived += rowAmount(r); });
  expenses.forEach((r) => { const m = parseReportDate(r.effective_date)?.getMonth(); if (m != null) monthly[m].expenses += rowAmount(r); });
  futureIncomeRows.forEach((r) => { const m = parseReportDate(r.effective_date || r.data)?.getMonth(); if (m != null) monthly[m].forecastReceived += rowAmount(r); });
  pendingExpenses.forEach((r) => { const m = parseReportDate(r.due_date || r.effective_date)?.getMonth(); if (m != null) monthly[m].forecastExpenses += rowAmount(r); });
  monthly.forEach((m) => { m.received=money(m.received); m.forecastReceived=money(m.forecastReceived); m.companyReceived=money(m.companyReceived); m.expenses=money(m.expenses); m.forecastExpenses=money(m.forecastExpenses); m.result=money(m.received-m.expenses); });

  const expensesByCategory = {}; expenses.forEach((r) => { const k=rowCategory(r); expensesByCategory[k]=(expensesByCategory[k]||0)+rowAmount(r); });
  const receiptsByMethod = {}; receipts.forEach((r) => { receiptsByMethod[r.method]=(receiptsByMethod[r.method]||0)+r.amount; });
  const receiptsByAccount = { 'Empresa / CNPJ': money(accountTotals.empresa), 'Conta pessoal / CPF': money(accountTotals.salario), 'Reserva': money(accountTotals.reserva), 'Não informada': money(accountTotals.nao_informada) };

  const byService={}, byEssay={}, byCity={}, byOrigin={}, byClient={};
  annualProjects.forEach((p) => {
    const client=clientsById.get(projectClientId(p))||p.cliente||{}; const amounts=calculateProjectAmounts(p); const service=projectService(p); const name=projectClientName(p,client);
    byService[service]=(byService[service]||0)+Number(amounts.total||0);
    if (/ensaio|gestante|familia|família/i.test(service)) { byEssay[service]=byEssay[service]||{count:0,value:0}; byEssay[service].count+=1; byEssay[service].value+=Number(amounts.total||0); }
    const city=client.cidade||p.cidade||p.local||'Não informado'; byCity[city]=(byCity[city]||0)+Number(amounts.total||0);
    const origin=client.origem||p.origem||'Não informado'; byOrigin[origin]=(byOrigin[origin]||0)+1;
    byClient[name]=(byClient[name]||0)+Number(amounts.total||0);
  });

  const currentYearContractReceipts = money(receipts.filter((r) => yearOf(projectDate(projectsById.get(String(r.projectId||''))||{})) === year).reduce((s,r)=>s+r.amount,0));
  const previousYearContractReceipts = money(receipts.filter((r) => { const y=yearOf(projectDate(projectsById.get(String(r.projectId||''))||{})); return y && y < year; }).reduce((s,r)=>s+r.amount,0));
  const futureYearContractReceipts = money(receipts.filter((r) => { const y=yearOf(projectDate(projectsById.get(String(r.projectId||''))||{})); return y && y > year; }).reduce((s,r)=>s+r.amount,0));
  const unlinkedReceipts = money(Math.max(0, annualRevenue-currentYearContractReceipts-previousYearContractReceipts-futureYearContractReceipts));

  const projectsWithoutDateRows = base.projects.filter((p)=>!parseReportDate(projectDate(p))).map((p)=>({clientName:projectClientName(p),service:projectService(p),date:''}));
  const orphanAnnualProjectRows = base.orphanedProjects.filter((p)=>yearOf(projectDate(p))===year).map((p)=>({clientName:projectClientName(p),service:projectService(p),date:projectDate(p)}));
  const undatedExpenses = rows.filter((r)=>r.entry_kind==='expense_paid' && !r.effective_date).map((r)=>({description:rowDescription(r),category:rowCategory(r),amount:rowAmount(r)}));
  const reconciliation = [];

  return {
    year,
    totals: {
      projects: projectRows.length, clients: annualClientIds.size, contracted, remaining,
      receivedForAnnualProjects: money(projectRows.reduce((s,r)=>s+r.receivedTotal,0)),
      annualReceived: annualRevenue, companyReceived: money(accountTotals.empresa), personalReceived: money(accountTotals.salario), reserveReceived: money(accountTotals.reserva), unclassifiedAccountReceived: money(accountTotals.nao_informada),
      annualExpenses, annualResult: money(annualRevenue-annualExpenses), companyResult: money(accountTotals.empresa-annualExpenses),
      taxCashBasisRevenue: annualRevenue, taxCashBasisExpenses: annualExpenses, taxCashBasisResult: money(annualRevenue-annualExpenses),
      nonOperationalEntries: annualNonOperational, totalCashInflows: money(annualRevenue+annualNonOperational),
      currentYearContractReceipts, previousYearContractReceipts, futureYearContractReceipts, unlinkedReceipts,
      weddings: annualProjects.filter((p)=>normalizeReportText(projectService(p)).includes('casamento')).length,
    },
    monthly, projects: annualProjects, projectRows, receipts,
    expenses: expenses.map((r)=>({date:r.effective_date,description:rowDescription(r),category:rowCategory(r),amount:rowAmount(r)})),
    nonOperationalEntries: nonOperationalEntries.map((r)=>({date:r.effective_date,description:rowDescription(r),category:rowCategory(r),account:accountLabel(r.account_code),amount:rowAmount(r)})),
    pendingExpenses: pendingExpenses.map((r)=>({date:r.due_date||r.effective_date,description:rowDescription(r),category:rowCategory(r),amount:rowAmount(r)})),
    undatedExpenses, reconciliation, projectsWithoutDateRows, orphanAnnualProjectRows,
    profitabilityRows: projectRows.map((r)=>({clientName:r.clientName,service:r.service,received:r.receivedInYear,expenses:0,profit:r.receivedInYear})).sort((a,b)=>b.profit-a.profit),
    mostContractedService: topEntry(byService), mostSoldEssay: topEntry(byEssay,(v)=>v.count), topOrigin:topEntry(byOrigin), topCity:topEntry(byCity), topClient:topEntry(byClient),
    equipmentMostUsed:null, equipmentBestReturn:null, equipmentRows:[],
    expenseCategoryRows:Object.entries(expensesByCategory).sort((a,b)=>b[1]-a[1]).map(([category,amount])=>({category,amount:money(amount)})),
    receiptMethodRows:Object.entries(receiptsByMethod).sort((a,b)=>b[1]-a[1]).map(([method,amount])=>({method,amount:money(amount)})),
    receiptAccountRows:Object.entries(receiptsByAccount).filter(([,amount])=>amount>0).map(([account,amount])=>({account,amount})),
    ledgerStats: {
      receipts: groups.size + standalone.length, expenses: expenses.length, financeReceipts: standalone.length, projectReceipts: groups.size,
      ignoredFinanceContractReceipts: ignoredMirrors.length, nonOperationalEntries: nonOperationalEntries.length,
      sourceProjects:(studio.projects||[]).length, clientBackedProjects:base.projects.length, orphanedProjects:base.orphanedProjects.length, consolidatedProjects:base.projects.length,
      annualProjects:projectRows.length, allAnnualProjects:projectRows.length, annualClients:annualClientIds.size,
      duplicateProjectsRemoved:base.duplicateProjects, duplicateClientsRemoved:base.duplicateClients, hiddenDuplicateProjects:0, orphanAnnualProjects:orphanAnnualProjectRows.length, excludedProjects:base.excludedProjects,
    },
    warnings: {
      receiptsWithoutDate: rows.filter((r)=>['operational_allocation','operational_income'].includes(r.entry_kind)&&!r.effective_date).length,
      expensesWithoutDate:undatedExpenses.length, pendingExpenses:pendingExpenses.length, pendingExpensesAmount:money(pendingExpenses.reduce((s,r)=>s+rowAmount(r),0)),
      reconciliationItems:0, projectsWithoutDate:projectsWithoutDateRows.length, duplicateProjectsRemoved:base.duplicateProjects, hiddenDuplicateProjects:0,
      orphanAnnualProjects:orphanAnnualProjectRows.length, excludedProjects:base.excludedProjects, orphanedProjects:base.orphanedProjects.length,
      previousYearContractReceipts, futureYearContractReceipts, unlinkedReceipts, ignoredFinanceContractReceipts:ignoredMirrors.length, nonOperationalEntries:nonOperationalEntries.length,
    },
  };
};
