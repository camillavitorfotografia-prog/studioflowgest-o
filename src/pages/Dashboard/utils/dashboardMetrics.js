import { parseCurrency, parseDate } from '../../../utils/formatters';
import { calculateProjectAmounts } from '../../../utils/dbData';
import { parseLedgerDate } from '../../../utils/financialLedger';
import { buildFinancialAccounting } from '../../../utils/financialAccounting';

const ACTIVE_LEAD_STATUSES = new Set(['novo', 'orcamento_enviado', 'aguardando_retorno', 'em_negociacao']);
const WON_LEAD_STATUSES = new Set(['aprovado', 'finalizado', 'ganho', 'contrato_assinado']);
const FINISHED_PROJECT_STATUSES = new Set(['finalizado', 'entregue', 'cancelado', 'arquivado']);
const monthNames = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
const serviceColors = ['#c5a059', '#5b8def', '#45b69c', '#d98c4a', '#8c6dd7', '#d85b67'];
const normalizeStatus = (value) => String(value || '').trim().toLowerCase();
const startOfDay = (date) => new Date(date.getFullYear(), date.getMonth(), date.getDate());
const projectDate = (project) => parseDate(project.dataEvento || project.data);
const projectClientId = (project) => project.clientId || project.clienteId || project.cliente_id || '';
const projectStatus = (project) => normalizeStatus(project.statusProducao || project.workflowStatus || project.status);
const isOfficialProject = (project) => Boolean(projectClientId(project));
const isCurrentYearProject = (project, year) => {
  const date = projectDate(project);
  return Boolean(date && date.getFullYear() === year);
};
const amount = (row) => parseCurrency(row.amount ?? row.valor ?? 0);
const rowDate = (row) => parseLedgerDate(row.date || row.effective_date || row.dataPagamento || row.data_pagamento || row.data);

export function buildDashboardMetrics({
  leads = [], clients = [], projects = [], transactions = [], canonicalRows = [], equipment = [], documents = [],
  now = new Date(), monthlyGoal = 30000,
}) {
  const today = startOfDay(now);
  const currentYear = now.getFullYear();
  const weekStart = new Date(today);
  weekStart.setDate(today.getDate() - today.getDay());
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekStart.getDate() + 6);
  weekEnd.setHours(23, 59, 59, 999);

  const accounting = buildFinancialAccounting({ transactions, canonicalRows, equipment, referenceDate: now });
  const officialYearProjects = projects.filter((project) => isOfficialProject(project) && isCurrentYearProject(project, currentYear));
  const activeProjectRows = officialYearProjects.filter((project) => !FINISHED_PROJECT_STATUSES.has(projectStatus(project)));
  const overdueProjects = activeProjectRows.filter((project) => {
    const date = projectDate(project);
    return date && date < today;
  });

  const futureEvents = officialYearProjects.map((project) => ({
    id: project.id,
    clientId: projectClientId(project),
    cliente: project.clienteNome || project.cliente?.nome || 'Cliente sem nome',
    tipo: project.tipoServico || project.categoria || 'Evento',
    data: project.dataEvento || project.data,
    horario: project.horario || project.horaInicio || '',
    local: project.local || project.cidade || '',
    status: project.statusProducao || project.status || '',
    valor: parseCurrency(project.valorContratado),
  })).filter((event) => {
    const date = parseDate(event.data);
    return date && date >= today;
  }).sort((a, b) => parseDate(a.data) - parseDate(b.data));

  const weeklyEvents = futureEvents.filter((event) => {
    const date = parseDate(event.data);
    return date >= weekStart && date <= weekEnd;
  });

  const receivable = officialYearProjects.reduce((total, project) => total + calculateProjectAmounts(project).remaining, 0);
  const activeLeads = leads.filter((lead) => ACTIVE_LEAD_STATUSES.has(normalizeStatus(lead.status)));
  const wonLeads = leads.filter((lead) => WON_LEAD_STATUSES.has(normalizeStatus(lead.status)));
  const conversionRate = leads.length ? Math.round((wonLeads.length / leads.length) * 100) : 0;

  const proposals = documents.filter((document) => document.documentType === 'proposal');
  const contracts = documents.filter((document) => document.documentType === 'contract');
  const pendingProposals = proposals.filter((document) => !['approved', 'aprovada', 'rejected', 'recusada', 'expired', 'expirada'].includes(normalizeStatus(document.status)));
  const pendingContracts = contracts.filter((document) => !['signed', 'assinado', 'completed', 'concluido', 'concluído', 'cancelled', 'cancelado'].includes(normalizeStatus(document.status)));

  const monthlyChart = Array.from({ length: 6 }, (_, index) => {
    const date = new Date(now.getFullYear(), now.getMonth() - (5 - index), 1);
    return { month: date.getMonth(), year: date.getFullYear(), mes: monthNames[date.getMonth()], receitas: 0, despesas: 0, eventos: 0 };
  });
  accounting.operationalReceipts.forEach((receipt) => {
    const date = rowDate(receipt);
    if (!date || date > now) return;
    const item = monthlyChart.find((month) => month.month === date.getMonth() && month.year === date.getFullYear());
    if (item) item.receitas += amount(receipt);
  });
  accounting.paidExpenses.forEach((expense) => {
    const date = rowDate(expense);
    if (!date || date > now) return;
    const item = monthlyChart.find((month) => month.month === date.getMonth() && month.year === date.getFullYear());
    if (item) item.despesas += amount(expense);
  });
  officialYearProjects.forEach((project) => {
    const date = projectDate(project);
    const item = date && monthlyChart.find((month) => month.month === date.getMonth() && month.year === date.getFullYear());
    if (item) item.eventos += 1;
  });

  const services = officialYearProjects.reduce((acc, project) => {
    const name = project.tipoServico || project.categoria || 'Outros';
    acc[name] = (acc[name] || 0) + 1;
    return acc;
  }, {});
  const serviceChart = Object.entries(services).sort((a, b) => b[1] - a[1]).map(([name, value], index) => ({ name, value, color: serviceColors[index % serviceColors.length] }));

  const alerts = [
    overdueProjects.length > 0 && { id: 'overdue-projects', tone: 'danger', title: `${overdueProjects.length} trabalho${overdueProjects.length > 1 ? 's' : ''} atrasado${overdueProjects.length > 1 ? 's' : ''}`, description: 'Revise as próximas etapas e os prazos de entrega.', path: '/trabalhos' },
    activeLeads.length > 0 && { id: 'active-leads', tone: 'warning', title: `${activeLeads.length} lead${activeLeads.length > 1 ? 's' : ''} aguardando atenção`, description: 'Há oportunidades abertas no funil comercial.', path: '/crm' },
    pendingContracts.length > 0 && { id: 'pending-contracts', tone: 'info', title: `${pendingContracts.length} contrato${pendingContracts.length > 1 ? 's' : ''} pendente${pendingContracts.length > 1 ? 's' : ''}`, description: 'Acompanhe assinatura, revisão ou envio.', path: '/documentos' },
    accounting.payableNext30 > 0 && { id: 'upcoming-payments', tone: 'neutral', title: 'Pagamentos nos próximos 30 dias', description: `Despesas previstas: ${accounting.payableNext30.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}.`, path: '/financeiro' },
  ].filter(Boolean);

  return {
    clientsCount: clients.length,
    projectsCount: officialYearProjects.length,
    activeProjects: activeProjectRows.length,
    overdueProjects: overdueProjects.length,
    weeklyEvents: weeklyEvents.length,
    monthlyRevenue: accounting.operationalReceivedMonth,
    monthlyExpenses: accounting.paidExpensesMonth,
    netProfit: accounting.accountingResult,
    operationalCashResult: accounting.operationalCashResult,
    monthlyDepreciation: accounting.monthlyDepreciation,
    cashBalance: accounting.totalCashBalance,
    receivable,
    upcomingPayments: accounting.payableNext30,
    activeLeads: activeLeads.length,
    conversionRate,
    pendingProposals: pendingProposals.length,
    pendingContracts: pendingContracts.length,
    monthlyGoal,
    goalProgress: monthlyGoal > 0 ? Math.min(100, Math.round((accounting.operationalReceivedMonth / monthlyGoal) * 1000) / 10) : 0,
    futureEvents,
    nextWedding: futureEvents.find((event) => normalizeStatus(event.tipo).includes('casamento')) || null,
    monthlyChart,
    serviceChart: serviceChart.length ? serviceChart : [{ name: 'Sem dados', value: 1, color: '#393941' }],
    alerts,
  };
}
