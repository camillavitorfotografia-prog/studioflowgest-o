import {
  isCurrentMonth,
  parseCurrency,
  parseDate,
} from '../../../utils/formatters';
import { calculateProjectAmounts } from '../../../utils/dbData';
import { buildFinancialLedger, parseLedgerDate } from '../../../utils/financialLedger';

const ACTIVE_LEAD_STATUSES = new Set([
  'novo',
  'orcamento_enviado',
  'aguardando_retorno',
  'em_negociacao',
]);

const WON_LEAD_STATUSES = new Set([
  'aprovado',
  'finalizado',
  'ganho',
  'contrato_assinado',
]);

const FINISHED_PROJECT_STATUSES = new Set([
  'finalizado',
  'entregue',
  'cancelado',
]);

const monthNames = [
  'Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun',
  'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez',
];

const serviceColors = [
  '#c5a059', '#5b8def', '#45b69c', '#d98c4a', '#8c6dd7', '#d85b67',
];

const normalizeStatus = (value) => String(value || '').trim().toLowerCase();

const isExpense = (transaction = {}) => {
  const type = String(
    transaction.tipoGeral
    || transaction.tipo_geral
    || transaction.tipo
    || '',
  ).toLowerCase();

  return type === 'saida' || type === 'fixa' || type === 'variavel';
};

const startOfDay = (date) => new Date(
  date.getFullYear(),
  date.getMonth(),
  date.getDate(),
);

export function buildDashboardMetrics({
  leads = [],
  clients = [],
  projects = [],
  transactions = [],
  documents = [],
  now = new Date(),
  monthlyGoal = 25000,
}) {
  const today = startOfDay(now);
  const weekStart = new Date(today);
  weekStart.setDate(today.getDate() - today.getDay());
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekStart.getDate() + 6);
  weekEnd.setHours(23, 59, 59, 999);

  const activeProjects = projects.filter((project) => (
    !FINISHED_PROJECT_STATUSES.has(normalizeStatus(project.statusProducao || project.status))
  ));

  const overdueProjects = activeProjects.filter((project) => {
    const eventDate = parseDate(project.dataEvento || project.data);
    return eventDate && eventDate < today;
  });

  const futureEvents = projects
    .map((project) => ({
      id: project.id,
      clientId: project.clientId || project.clienteId || '',
      cliente: project.clienteNome || project.cliente?.nome || 'Cliente sem nome',
      tipo: project.tipoServico || project.categoria || 'Evento',
      data: project.dataEvento || project.data,
      horario: project.horario || project.horaInicio || '',
      local: project.local || project.cidade || '',
      status: project.statusProducao || project.status || '',
      valor: parseCurrency(project.valorContratado),
    }))
    .filter((event) => {
      const eventDate = parseDate(event.data);
      return eventDate && eventDate >= today;
    })
    .sort((left, right) => parseDate(left.data) - parseDate(right.data));

  const weeklyEvents = futureEvents.filter((event) => {
    const eventDate = parseDate(event.data);
    return eventDate >= weekStart && eventDate <= weekEnd;
  });

  const ledger = buildFinancialLedger({ projects, transactions });

  const monthlyRevenue = ledger.receipts
    .filter((receipt) => isCurrentMonth(receipt.date, now))
    .reduce((sum, receipt) => sum + parseCurrency(receipt.amount), 0);

  const monthlyExpenses = ledger.expenses
    .filter((expense) => isCurrentMonth(expense.date, now))
    .reduce((sum, expense) => sum + parseCurrency(expense.amount), 0);

  const receivable = projects.reduce((total, project) => {
    const { remaining } = calculateProjectAmounts(project);
    return total + remaining;
  }, 0);

  const upcomingPayments = transactions.reduce((total, transaction) => {
    if (!isExpense(transaction)) return total;
    const date = parseDate(transaction.dataVencimento || transaction.data);
    if (!date || date < today) return total;
    const status = normalizeStatus(transaction.status);
    if (['pago', 'quitado', 'concluido', 'concluído'].includes(status)) return total;
    return total + parseCurrency(transaction.valor);
  }, 0);

  const historicalRevenue = ledger.receipts.reduce(
    (sum, receipt) => sum + parseCurrency(receipt.amount),
    0,
  );

  const historicalExpenses = ledger.expenses.reduce(
    (sum, expense) => sum + parseCurrency(expense.amount),
    0,
  );

  const activeLeads = leads.filter((lead) => ACTIVE_LEAD_STATUSES.has(normalizeStatus(lead.status)));
  const wonLeads = leads.filter((lead) => WON_LEAD_STATUSES.has(normalizeStatus(lead.status)));
  const conversionRate = leads.length ? Math.round((wonLeads.length / leads.length) * 100) : 0;

  const proposals = documents.filter((document) => document.documentType === 'proposal');
  const contracts = documents.filter((document) => document.documentType === 'contract');
  const pendingProposals = proposals.filter((document) => (
    !['approved', 'aprovada', 'rejected', 'recusada', 'expired', 'expirada'].includes(normalizeStatus(document.status))
  ));
  const pendingContracts = contracts.filter((document) => (
    !['signed', 'assinado', 'completed', 'concluido', 'concluído', 'cancelled', 'cancelado'].includes(normalizeStatus(document.status))
  ));

  const monthlyChart = Array.from({ length: 6 }, (_, index) => {
    const date = new Date(now.getFullYear(), now.getMonth() - (5 - index), 1);
    return {
      month: date.getMonth(),
      year: date.getFullYear(),
      mes: monthNames[date.getMonth()],
      receitas: 0,
      despesas: 0,
      eventos: 0,
    };
  });

  ledger.receipts.forEach((receipt) => {
    const date = parseLedgerDate(receipt.date);
    if (!date) return;
    const item = monthlyChart.find((month) => month.month === date.getMonth() && month.year === date.getFullYear());
    if (item) item.receitas += parseCurrency(receipt.amount);
  });

  ledger.expenses.forEach((expense) => {
    const date = parseLedgerDate(expense.date);
    if (!date) return;
    const item = monthlyChart.find((month) => month.month === date.getMonth() && month.year === date.getFullYear());
    if (item) item.despesas += parseCurrency(expense.amount);
  });

  projects.forEach((project) => {
    const date = parseDate(project.dataEvento || project.data);
    if (!date) return;
    const item = monthlyChart.find((month) => month.month === date.getMonth() && month.year === date.getFullYear());
    if (item) item.eventos += 1;
  });

  const services = projects.reduce((accumulator, project) => {
    const name = project.tipoServico || project.categoria || 'Outros';
    accumulator[name] = (accumulator[name] || 0) + 1;
    return accumulator;
  }, {});

  const serviceChart = Object.entries(services)
    .sort((left, right) => right[1] - left[1])
    .map(([name, value], index) => ({
      name,
      value,
      color: serviceColors[index % serviceColors.length],
    }));

  const alerts = [
    overdueProjects.length > 0 && {
      id: 'overdue-projects',
      tone: 'danger',
      title: `${overdueProjects.length} trabalho${overdueProjects.length > 1 ? 's' : ''} atrasado${overdueProjects.length > 1 ? 's' : ''}`,
      description: 'Revise as próximas etapas e os prazos de entrega.',
      path: '/trabalhos',
    },
    activeLeads.length > 0 && {
      id: 'active-leads',
      tone: 'warning',
      title: `${activeLeads.length} lead${activeLeads.length > 1 ? 's' : ''} aguardando atenção`,
      description: 'Há oportunidades abertas no funil comercial.',
      path: '/crm',
    },
    pendingContracts.length > 0 && {
      id: 'pending-contracts',
      tone: 'info',
      title: `${pendingContracts.length} contrato${pendingContracts.length > 1 ? 's' : ''} pendente${pendingContracts.length > 1 ? 's' : ''}`,
      description: 'Acompanhe assinatura, revisão ou envio.',
      path: '/documentos',
    },
    upcomingPayments > 0 && {
      id: 'upcoming-payments',
      tone: 'neutral',
      title: 'Pagamentos programados',
      description: `Existem despesas futuras somando ${upcomingPayments}.`,
      path: '/financeiro',
    },
  ].filter(Boolean);

  return {
    clientsCount: clients.length,
    projectsCount: projects.length,
    activeProjects: activeProjects.length,
    overdueProjects: overdueProjects.length,
    weeklyEvents: weeklyEvents.length,
    monthlyRevenue,
    monthlyExpenses,
    netProfit: monthlyRevenue - monthlyExpenses,
    cashBalance: historicalRevenue - historicalExpenses,
    receivable,
    upcomingPayments,
    activeLeads: activeLeads.length,
    conversionRate,
    pendingProposals: pendingProposals.length,
    pendingContracts: pendingContracts.length,
    monthlyGoal,
    goalProgress: monthlyGoal > 0
      ? Math.min(100, Math.round((monthlyRevenue / monthlyGoal) * 100))
      : 0,
    futureEvents,
    nextWedding: futureEvents.find((event) => normalizeStatus(event.tipo).includes('casamento')) || null,
    monthlyChart,
    serviceChart: serviceChart.length
      ? serviceChart
      : [{ name: 'Sem dados', value: 1, color: '#393941' }],
    alerts,
  };
}
