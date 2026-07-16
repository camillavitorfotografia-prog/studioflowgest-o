import {
  isCurrentMonth,
  parseCurrency,
  parseDate,
} from '../../../utils/formatters';
import { calculateProjectAmounts } from '../../../utils/dbData';

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

const getPaymentDate = (payment = {}) => (
  payment.dataPagamento
  || payment.data_pagamento
  || payment.data
  || payment.createdAt
  || payment.created_at
  || ''
);

const getProjectPayments = (project = {}) => (
  project.financeiro?.receitas
  || project.pagamentos
  || project.receitas
  || []
);

const isExpense = (transaction = {}) => {
  const type = String(
    transaction.tipoGeral
    || transaction.tipo_geral
    || transaction.tipo
    || '',
  ).toLowerCase();

  return type === 'saida' || type === 'fixa' || type === 'variavel';
};

const isIncome = (transaction = {}) => {
  const type = String(
    transaction.tipoGeral
    || transaction.tipo_geral
    || transaction.tipo
    || '',
  ).toLowerCase();

  return type === 'entrada' || type === 'receita';
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

  const payments = projects.flatMap((project) => (
    getProjectPayments(project).map((payment) => ({
      ...payment,
      projectId: project.id,
      clientName: project.clienteNome || project.cliente?.nome || 'Cliente',
    }))
  ));

  const monthlyPayments = payments.filter((payment) => (
    isCurrentMonth(getPaymentDate(payment), now)
  ));

  const transactionIncome = transactions.filter((transaction) => (
    isIncome(transaction)
    && isCurrentMonth(transaction.data || transaction.dataVencimento, now)
  ));

  const monthlyRevenue = [
    ...monthlyPayments.map((payment) => parseCurrency(payment.valor)),
    ...transactionIncome.map((transaction) => parseCurrency(transaction.valor)),
  ].reduce((sum, value) => sum + value, 0);

  const monthlyExpenses = transactions.reduce((total, transaction) => {
    if (!isExpense(transaction)) return total;
    if (!isCurrentMonth(transaction.data || transaction.dataVencimento, now)) return total;
    return total + parseCurrency(transaction.valor);
  }, 0);

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

  const historicalRevenue = payments.reduce(
    (sum, payment) => sum + parseCurrency(payment.valor),
    0,
  ) + transactions.filter(isIncome).reduce(
    (sum, transaction) => sum + parseCurrency(transaction.valor),
    0,
  );

  const historicalExpenses = transactions.filter(isExpense).reduce(
    (sum, transaction) => sum + parseCurrency(transaction.valor),
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

  payments.forEach((payment) => {
    const date = parseDate(getPaymentDate(payment));
    if (!date) return;
    const item = monthlyChart.find((month) => month.month === date.getMonth() && month.year === date.getFullYear());
    if (item) item.receitas += parseCurrency(payment.valor);
  });

  transactions.forEach((transaction) => {
    const date = parseDate(transaction.data || transaction.dataVencimento);
    if (!date) return;
    const item = monthlyChart.find((month) => month.month === date.getMonth() && month.year === date.getFullYear());
    if (!item) return;
    if (isExpense(transaction)) item.despesas += parseCurrency(transaction.valor);
    if (isIncome(transaction)) item.receitas += parseCurrency(transaction.valor);
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
